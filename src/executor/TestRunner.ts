import { chromium, firefox, webkit, Browser } from '@playwright/test';
import { PlaywrightController } from '../agent/PlaywrightController';
import { TestCase, TestResult, TestSuiteResult, FrameworkConfig, TestContext } from '../types';
import { BrowserAgent } from '../agent/BrowserAgent';
import { OpenAIProvider } from '../ai/OpenAIProvider';
import { CustomLLMProvider } from '../ai/CustomLLMProvider';
import { BaseAIProvider } from '../ai/AIProvider';
import { Logger } from '../utils/Logger';
import { SelectorCache } from '../cache/SelectorCache';
import { testRegistry } from '../dsl/TestCollector';
import * as path from 'path';

/**
 * Main test runner that executes tests and collects results
 */
export class TestRunner {
    private config: FrameworkConfig;
    private browser?: Browser;
    private aiProvider: BaseAIProvider;
    private logger: Logger;
    private selectorCache: SelectorCache;

    constructor(config: FrameworkConfig) {
        this.config = config;
        this.logger = new Logger();

        // Initialize caching (NEW - reduces LLM costs!)
        const cacheEnabled = config.aiOptimization?.enableCache !== false;
        const cacheDir = config.aiOptimization?.cacheDir || '.ai-cache';

        // CI Mode read-only check
        const isReadOnly = config.ai?.ciMode?.readOnlyCache || false;

        this.selectorCache = new SelectorCache(cacheDir, isReadOnly);

        if (cacheEnabled) {
            this.logger.info(`AI caching enabled (ReadOnly: ${isReadOnly}) - this will reduce LLM costs significantly`);
        }

        // Initialize AI provider based on config
        if (config.aiProvider === 'openai' && config.openai) {
            this.aiProvider = new OpenAIProvider(this.config);
        } else if (config.aiProvider === 'custom' && config.customLLM) {
            this.aiProvider = new CustomLLMProvider({
                endpoint: config.customLLM.endpoint,
                apiKey: config.customLLM.apiKey,
                model: config.customLLM.model,
                maxCostPerRun: config.costControl?.maxCostPerRun,
            });
        } else {
            throw new Error('Invalid AI provider configuration');
        }
    }

    /**
     * Run all registered tests
     */
    async runTests(testFiles: string[]): Promise<TestSuiteResult> {
        const startTime = new Date();
        this.logger.info(`Starting test execution for ${testFiles.length} file(s)`);

        // Load test files
        for (const file of testFiles) {
            await this.loadTestFile(file);
        }

        const tests = testRegistry.getTests();
        this.logger.info(`Found ${tests.length} test(s)`);

        // Initialize browser
        await this.initBrowser();

        const results: TestResult[] = [];

        // Run tests
        for (const test of tests) {
            const result = await this.runSingleTest(test);
            results.push(result);
        }

        // Cleanup
        await this.cleanup();

        const endTime = new Date();

        // Calculate statistics
        const passed = results.filter(r => r.status === 'passed').length;
        const failed = results.filter(r => r.status === 'failed').length;
        const skipped = results.filter(r => r.status === 'skipped').length;

        const suiteResult: TestSuiteResult = {
            suiteName: 'Test Suite',
            startTime,
            endTime,
            totalTests: tests.length,
            passed,
            failed,
            skipped,
            results,
        };

        const totalUsage = this.aiProvider.getUsage();

        this.logger.info(`\nTest execution completed:`);
        this.logger.info(`  Total: ${tests.length}`);
        this.logger.info(`  Passed: ${passed}`);
        this.logger.info(`  Failed: ${failed}`);
        this.logger.info(`  Skipped: ${skipped}`);
        this.logger.info(`  Total AI Tokens: in=${totalUsage.inputTokens}, out=${totalUsage.outputTokens}`);

        return suiteResult;
    }

    /**
     * Run a single test
     */
    private async runSingleTest(test: TestCase): Promise<TestResult> {
        const testLogger = new Logger(test.name);
        testLogger.info(`Starting test: ${test.name}`);

        const startTime = Date.now();
        const startUsage = this.aiProvider.getUsage();
        const screenshots: string[] = [];
        let videoPath: string | undefined;
        let agent: BrowserAgent | undefined;

        try {
            // Create new browser context for test isolation
            const context = await this.browser!.newContext({
                viewport: this.config.viewport,
                recordVideo: this.config.video === 'on' ? { dir: 'ai-test-results/videos' } : undefined,
            });

            const page = await context.newPage();

            // Create browser agent
            const browserController = new PlaywrightController(page);
            agent = new BrowserAgent(browserController, context, this.aiProvider, testLogger);

            // Enable selector learning (NEW - reduces LLM calls!)
            agent.setSelectorCache(this.selectorCache);

            // Create test context
            const testContext: TestContext = {
                agent,
                page,
                context,
            };

            // Run the test with timeout
            const timeout = test.timeout || this.config.timeout || 60000;
            await Promise.race([
                test.fn(testContext),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Test timeout')), timeout)
                ),
            ]);

            // Collect screenshots
            screenshots.push(...agent.getScreenshots());

            // Get video path if recording
            if (this.config.video === 'on') {
                videoPath = await page.video()?.path();
            }

            await context.close();

            const duration = Date.now() - startTime;
            const endUsage = this.aiProvider.getUsage();
            const testInputTokens = Math.max(0, endUsage.inputTokens - startUsage.inputTokens);
            const testOutputTokens = Math.max(0, endUsage.outputTokens - startUsage.outputTokens);
            testLogger.info(`✓ Test passed in ${duration}ms (AI Tokens in=${testInputTokens}, out=${testOutputTokens})`);

            return {
                name: test.name,
                status: 'passed',
                duration,
                screenshots,
                steps: agent.getSteps(),
                videoPath,
                tags: test.tags,
            };

        } catch (error) {
            const duration = Date.now() - startTime;
            const endUsage = this.aiProvider.getUsage();
            const testInputTokens = Math.max(0, endUsage.inputTokens - startUsage.inputTokens);
            const testOutputTokens = Math.max(0, endUsage.outputTokens - startUsage.outputTokens);
            testLogger.error(`✗ Test failed in ${duration}ms (AI Tokens in=${testInputTokens}, out=${testOutputTokens})`, error as Error);

            // Analyze failure using AI
            let failureAnalysis;
            try {
                const screenshot = screenshots[screenshots.length - 1];
                failureAnalysis = await this.aiProvider.analyzeFailure(
                    test.name,
                    error as Error,
                    screenshot
                );
                testLogger.info(`Failure analysis: ${failureAnalysis.rootCause}`);
            } catch (analysisError) {
                testLogger.warn('Failed to analyze test failure');
            }

            return {
                name: test.name,
                status: 'failed',
                duration,
                error: error as Error,
                screenshots,
                steps: agent?.getSteps() ?? [],
                videoPath,
                failureAnalysis,
                tags: test.tags,
            };
        }
    }

    /**
     * Initialize browser
     */
    private async initBrowser(): Promise<void> {
        const browserType = this.config.browser || 'chromium';
        const launchOptions = {
            headless: this.config.headless,
            slowMo: this.config.slowMo,
            devtools: this.config.devtools,
        };

        switch (browserType) {
            case 'chromium':
                this.browser = await chromium.launch(launchOptions);
                break;
            case 'firefox':
                this.browser = await firefox.launch(launchOptions);
                break;
            case 'webkit':
                this.browser = await webkit.launch(launchOptions);
                break;
        }

        this.logger.info(`Browser initialized: ${browserType}`);
    }

    /**
     * Load a test file
     */
    private async loadTestFile(filePath: string): Promise<void> {
        try {
            const absolutePath = path.resolve(filePath);

            // Register ts-node + tsconfig-paths once so we can require() .ts test
            // files directly (with web-agentic-ai path alias resolved).
            const isTs = absolutePath.endsWith('.ts');
            if (isTs) {
                const tsConfigPath = path.resolve(process.cwd(), 'tsconfig.json');
                const { paths, baseUrl } = require(tsConfigPath).compilerOptions ?? {};

                // Register ts-node if not already active
                if (!(process as unknown as Record<symbol, unknown>)[Symbol.for('ts-node.register.instance')]) {
                    require('ts-node').register({
                        project: tsConfigPath,
                        transpileOnly: true,   // skip type-checking for speed
                        compilerOptions: { paths, baseUrl },
                    });
                }

                // Register tsconfig-paths so Node resolves web-agentic-ai → src/index.ts
                const tsconfigPaths = require('tsconfig-paths');
                if (!TestRunner._pathsRegistered) {
                    tsconfigPaths.register({
                        baseUrl: path.resolve(process.cwd(), baseUrl ?? '.'),
                        paths: paths ?? {},
                    });
                    TestRunner._pathsRegistered = true;
                }
            }

            // Clear require cache to allow reloading
            delete require.cache[absolutePath];

            // Load the test file (this will register tests via the DSL)
            require(absolutePath);

            this.logger.info(`Loaded test file: ${filePath}`);
        } catch (error) {
            this.logger.error(`Failed to load test file: ${filePath}`, error as Error);
            throw error;
        }
    }

    private static _pathsRegistered = false;

    /**
     * Cleanup resources
     */
    private async cleanup(): Promise<void> {
        if (this.browser) {
            await this.browser.close();
            this.logger.info('Browser closed');
        }
    }
}
