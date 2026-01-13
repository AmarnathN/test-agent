import { chromium, firefox, webkit, Browser } from '@playwright/test';
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

        this.logger.info(`\nTest execution completed:`);
        this.logger.info(`  Total: ${tests.length}`);
        this.logger.info(`  Passed: ${passed}`);
        this.logger.info(`  Failed: ${failed}`);
        this.logger.info(`  Skipped: ${skipped}`);

        return suiteResult;
    }

    /**
     * Run a single test
     */
    private async runSingleTest(test: TestCase): Promise<TestResult> {
        const testLogger = new Logger(test.name);
        testLogger.info(`Starting test: ${test.name}`);

        const startTime = Date.now();
        const screenshots: string[] = [];
        let videoPath: string | undefined;

        try {
            // Create new browser context for test isolation
            const context = await this.browser!.newContext({
                viewport: this.config.viewport,
                recordVideo: this.config.video === 'on' ? { dir: 'ai-test-results/videos' } : undefined,
            });

            const page = await context.newPage();

            // Create browser agent
            const agent = new BrowserAgent(page, context, this.aiProvider, testLogger);

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
            testLogger.info(`✓ Test passed in ${duration}ms`);

            return {
                name: test.name,
                status: 'passed',
                duration,
                screenshots,
                videoPath,
                tags: test.tags,
            };

        } catch (error) {
            const duration = Date.now() - startTime;
            testLogger.error(`✗ Test failed in ${duration}ms`, error as Error);

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

        switch (browserType) {
            case 'chromium':
                this.browser = await chromium.launch({ headless: this.config.headless });
                break;
            case 'firefox':
                this.browser = await firefox.launch({ headless: this.config.headless });
                break;
            case 'webkit':
                this.browser = await webkit.launch({ headless: this.config.headless });
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
