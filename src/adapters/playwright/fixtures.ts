/**
 * Playwright fixture that injects the AI BrowserAgent into every test.
 */

import { test as base, expect } from '@playwright/test';
import { BrowserAgent } from '../../agent/BrowserAgent';
import { PlaywrightController } from './PlaywrightController';
import { OpenAIProvider } from '../../ai/OpenAIProvider';
import { CustomLLMProvider } from '../../ai/CustomLLMProvider';
import { ConfigLoader } from '../../config/ConfigLoader';
import { Logger } from '../../utils/Logger';
import { SelectorCache } from '../../cache/SelectorCache';
import { BaseAIProvider } from '../../ai/AIProvider';

type AITestFixtures = {
    agent: BrowserAgent;
};

export const test = base.extend<AITestFixtures>({
    agent: async ({ page }, use, testInfo) => {
        const config = ConfigLoader.load();

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

        const cacheDir = config.aiOptimization?.cacheDir ?? '.ai-cache';
        const selectorCache = new SelectorCache(cacheDir, false);

        const logger = new Logger(testInfo.title);
        const controller = new PlaywrightController(page);
        const agent = new BrowserAgent(controller, aiProvider, logger);
        agent.setSelectorCache(selectorCache);

        const usageBefore = aiProvider.getUsage();

        await use(agent);

        const usageAfter = aiProvider.getUsage();
        const testInputTokens = Math.max(0, usageAfter.inputTokens - usageBefore.inputTokens);
        const testOutputTokens = Math.max(0, usageAfter.outputTokens - usageBefore.outputTokens);
        logger.info(`AI Tokens: in=${testInputTokens}, out=${testOutputTokens}`);

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

        if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
            try {
                const screenshots = agent.getScreenshots();
                const lastScreenshot = screenshots[screenshots.length - 1];

                const analysis = await aiProvider.analyzeFailure(
                    testInfo.title,
                    testInfo.errors[0] as Error ?? new Error('Unknown failure'),
                    lastScreenshot,
                );

                const md = [
                    `# AI Failure Analysis`,
                    ``,
                    `**Category:** \`${analysis.category}\``,
                    ``,
                    `**Root Cause:** ${analysis.rootCause}`,
                    ``,
                    `**Suggested Fix:** ${analysis.suggestedFix}`,
                    ``,
                    `**Confidence:** ${(analysis.confidence * 100).toFixed(0)}%`,
                ].join('\n');

                await testInfo.attach('AI Failure Analysis', {
                    body: Buffer.from(md, 'utf-8'),
                    contentType: 'text/markdown',
                });

                testInfo.annotations.push({
                    type: 'AI Root Cause',
                    description: analysis.rootCause,
                });
                testInfo.annotations.push({
                    type: 'Suggested Fix',
                    description: analysis.suggestedFix,
                });
            } catch (analysisError) {
                console.warn('[ai-test] Could not generate failure analysis:', analysisError);
            }
        }
    },
});

export { expect };
