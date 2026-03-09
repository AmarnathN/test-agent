/**
 * Playwright fixture that injects the AI BrowserAgent into every test.
 *
 * Usage in test files:
 *   import { test, expect } from '../src/fixtures';
 *   // or (if path alias is set up) from 'web-agentic-ai/fixtures'
 *
 *   test('my test', async ({ agent }) => {
 *     await agent.navigate('https://example.com');
 *   });
 */

import { test as base, expect } from '@playwright/test';
import { BrowserAgent } from './agent/BrowserAgent';
import { PlaywrightController } from './agent/PlaywrightController';
import { OpenAIProvider } from './ai/OpenAIProvider';
import { CustomLLMProvider } from './ai/CustomLLMProvider';
import { ConfigLoader } from './config/ConfigLoader';
import { Logger } from './utils/Logger';
import { SelectorCache } from './cache/SelectorCache';
import { BaseAIProvider } from './ai/AIProvider';

// Shape of the custom fixtures we add to every test
type AITestFixtures = {
    agent: BrowserAgent;
};

export const test = base.extend<AITestFixtures>({
    agent: async ({ page, context }, use, testInfo) => {
        // Load framework config (reads .env, ai-test.config.js, env vars)
        const config = ConfigLoader.load();

        // Build AI provider
        let aiProvider: BaseAIProvider;
        if (config.aiProvider === 'custom' && config.customLLM) {
            aiProvider = new CustomLLMProvider({
                endpoint: config.customLLM.endpoint,
                apiKey: config.customLLM.apiKey,
                model: config.customLLM.model,
                maxCostPerRun: config.costControl?.maxCostPerRun,
            });
        } else {
            aiProvider = new OpenAIProvider(config);
        }

        // Selector cache (reduces LLM calls across test runs)
        const cacheDir = config.aiOptimization?.cacheDir ?? '.ai-cache';
        const selectorCache = new SelectorCache(cacheDir, false);

        const logger = new Logger(testInfo.title);
        const controller = new PlaywrightController(page);
        const agent = new BrowserAgent(controller, context, aiProvider, logger);
        agent.setSelectorCache(selectorCache);

        // Token usage is tracked by provider during AI calls; capture per-test delta.
        const usageBefore = aiProvider.getUsage();

        // Hand the agent to the test; cleanup happens automatically because
        // Playwright manages the page/context lifecycle.
        await use(agent);

        const usageAfter = aiProvider.getUsage();
        const testInputTokens = Math.max(0, usageAfter.inputTokens - usageBefore.inputTokens);
        const testOutputTokens = Math.max(0, usageAfter.outputTokens - usageBefore.outputTokens);
        logger.info(`AI Tokens: in=${testInputTokens}, out=${testOutputTokens}`);

        // Attach token metadata so it is visible from Playwright HTML report.
        await testInfo.attach('AI Tokens', {
            body: Buffer.from(JSON.stringify({ inputTokens: testInputTokens, outputTokens: testOutputTokens }, null, 2), 'utf-8'),
            contentType: 'application/json',
        });
        testInfo.annotations.push({
            type: 'AI Tokens',
            description: `in=${testInputTokens}, out=${testOutputTokens}`,
        });

        const stepCosts = agent.getSteps().map((step, index) => ({
            step: index + 1,
            action: step.action,
            description: step.description,
            status: step.status,
            durationMs: step.duration ?? null,
            inputTokens: step.inputTokens ?? 0,
            outputTokens: step.outputTokens ?? 0,
        }));

        await testInfo.attach('AI Step Tokens', {
            body: Buffer.from(JSON.stringify(stepCosts, null, 2), 'utf-8'),
            contentType: 'application/json',
        });

        // ── Post-test: attach AI failure analysis when the test failed ──────
        if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
            try {
                const screenshots = agent.getScreenshots();
                const lastScreenshot = screenshots[screenshots.length - 1];

                const analysis = await aiProvider.analyzeFailure(
                    testInfo.title,
                    testInfo.errors[0] as Error ?? new Error('Unknown failure'),
                    lastScreenshot,
                );

                // Format as Markdown so it renders nicely in the report
                const md = [
                    `# 🤖 AI Failure Analysis`,
                    ``,
                    `**Category:** \`${analysis.category}\``,
                    ``,
                    `**Root Cause:** ${analysis.rootCause}`,
                    ``,
                    `**Suggested Fix:** ${analysis.suggestedFix}`,
                    ``,
                    `**Confidence:** ${(analysis.confidence * 100).toFixed(0)}%`,
                ].join('\n');

                // Attach as a file — shows as a clickable link in the HTML report
                await testInfo.attach('AI Failure Analysis', {
                    body: Buffer.from(md, 'utf-8'),
                    contentType: 'text/markdown',
                });

                // Also add as an annotation so it appears in the summary panel
                testInfo.annotations.push({
                    type: 'AI Root Cause',
                    description: analysis.rootCause,
                });
                testInfo.annotations.push({
                    type: 'Suggested Fix',
                    description: analysis.suggestedFix,
                });

            } catch (analysisError) {
                // Don't let analysis failure mask the real test failure
                console.warn('[ai-test] Could not generate failure analysis:', analysisError);
            }
        }
    },
});

// Re-export expect so test files only need one import
export { expect };
