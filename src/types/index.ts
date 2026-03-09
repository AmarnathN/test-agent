import { Page, BrowserContext } from '@playwright/test';

/**
 * Test case definition
 */
export interface TestCase {
    name: string;
    fn: (context: TestContext) => Promise<void>;
    timeout?: number;
    retries?: number;
    tags?: string[];
}

/**
 * Test context provided to each test
 */
export interface TestContext {
    agent: BrowserAgent;
    page: Page;
    context: BrowserContext;
}

/**
 * AI Task Types for routing
 */
export enum AITaskType {
    ELEMENT_RESOLUTION = 'element_resolution',
    EXPECTATION_VALIDATION = 'expectation_validation',
    FAILURE_ANALYSIS = 'failure_analysis',
    VISUAL_REGRESSION = 'visual_regression',
    HEALING = 'healing',
    FREE_TEXT_REASONING = 'free_text_reasoning'
}

/**
 * Model Tiers for cost/performance trade-offs
 */
export enum ModelTier {
    CHEAP = 'cheap',      // fast, low cost (e.g. gpt-3.5)
    BALANCED = 'balanced',   // good reasoning (e.g. gpt-4)
    PREMIUM = 'premium'     // vision + deep reasoning (e.g. gpt-4-vision)
}

/**
 * Browser agent interface for AI-powered interactions
 */
export interface BrowserAgent {
    navigate(url: string): Promise<void>;
    click(target: string): Promise<void>;
    fill(target: string, value: string): Promise<void>;
    select(target: string, value: string): Promise<void>;
    hover(target: string): Promise<void>;
    press(key: string): Promise<void>;
    wait(milliseconds: number): Promise<void>;
    waitFor(target: string, options?: WaitOptions): Promise<void>;
    expect(expectation: string): Promise<void>;
    expectNavigation(urlOrTitle: string): Promise<void>;
    expectText(text: string, selector?: string): Promise<void>;
    expectVisibility(selector: string, isVisible?: boolean): Promise<void>;
    expectVisual(description: string): Promise<void>;
    screenshot(name?: string): Promise<string>;
    getController(): BrowserController;
}

/**
 * Generic browser controller interface for abstracting automation backends
 * (Playwright, Puppeteer, WebdriverIO, etc.)
 */
export interface BrowserController {
    navigate(url: string): Promise<void>;
    click(selector: string): Promise<void>;
    fill(selector: string, value: string): Promise<void>;
    select(selector: string, value: string): Promise<void>;
    hover(selector: string): Promise<void>;
    press(key: string): Promise<void>;
    waitForSelector(selector: string, options?: WaitOptions): Promise<void>;
    waitForTimeout(milliseconds: number): Promise<void>;
    evaluate<T>(script: (arg: any) => T, arg?: any): Promise<T>;
    takeScreenshot(options?: { fullPage?: boolean }): Promise<Buffer>;
    content(): Promise<string>;
    url(): string;
    title(): Promise<string>;
    locator(selector: string): any; // Generic locator object
}

/**
 * Wait options for element waiting
 */
export interface WaitOptions {
    timeout?: number;
    state?: 'visible' | 'hidden' | 'attached' | 'detached';
}

/**
 * A single recorded step inside a test
 */
export interface TestStep {
    action: string;          // e.g. 'navigate', 'click', 'fill', 'expect'
    description: string;     // human-readable description of what was done
    status: 'passed' | 'failed' | 'running';
    startTime: number;       // Date.now() timestamp
    duration?: number;       // ms
    inputTokens?: number;    // Input tokens consumed during this step
    outputTokens?: number;   // Output tokens consumed during this step
    screenshot?: string;     // base64 PNG taken after this step
    error?: string;
}

/**
 * Test result
 */
export interface TestResult {
    name: string;
    status: 'passed' | 'failed' | 'skipped';
    duration: number;
    error?: Error;
    screenshots: string[];
    steps: TestStep[];       // ordered list of every agent action
    videoPath?: string;
    failureAnalysis?: FailureAnalysis;
    tags?: string[];
}

/**
 * Failure analysis from AI
 */
export interface FailureAnalysis {
    category: 'ui-regression' | 'timing-issue' | 'data-problem' | 'element-not-found' | 'assertion-failed' | 'unknown';
    rootCause: string;
    suggestedFix: string;
    confidence: number;
}

/**
 * Test suite result
 */
export interface TestSuiteResult {
    suiteName: string;
    startTime: Date;
    endTime: Date;
    totalTests: number;
    passed: number;
    failed: number;
    skipped: number;
    results: TestResult[];
}

/**
 * Framework configuration
 */
export interface FrameworkConfig {
    // Browser settings
    browser?: 'chromium' | 'firefox' | 'webkit';
    headless?: boolean;
    slowMo?: number;  // ms delay between each action — useful for debugging
    devtools?: boolean; // open Chrome DevTools automatically
    viewport?: { width: number; height: number };

    // Test execution
    timeout?: number;
    retries?: number;
    parallel?: number;

    // AI Configuration (Redesigned)
    ai?: {
        provider: 'openai' | 'custom';

        // Vendor Config
        openai?: {
            apiKey: string;
            // Map tiers to specific models
            models?: {
                [key in ModelTier]?: string;
            };
        };
        customLLM?: {
            endpoint: string;
            apiKey?: string;
            models?: {
                [key in ModelTier]?: string;
            };
        };

        // Routing Table (Task -> Tier)
        routing?: {
            [key in AITaskType]?: ModelTier;
        };

        // Budget Guards
        budgets?: {
            globalMonthly?: number; // USD
            perRun?: number;        // USD
            perTest?: number;       // USD
        };

        // CI Mode overrides
        ciMode?: {
            enabled?: boolean;     // if undefined, auto-detect
            disableVision?: boolean;
            maxPremiumCallsPerTest?: number;
            readOnlyCache?: boolean;
        };
    };

    // Legacy Support (mapped to new ai structure internally or kept for back-compat)
    aiProvider?: 'openai' | 'custom';
    openai?: {
        apiKey: string;
        model?: string;
        fastModel?: string;
    };
    customLLM?: {
        endpoint: string;
        apiKey?: string;
        model?: string;
        fastModel?: string;
    };
    costControl?: {
        maxCostPerRun?: number;
        maxTokensPerRun?: number;
        warnAtPercent?: number;
        reportCost?: boolean;
    };

    // AI Optimization
    aiOptimization?: {
        enableCache?: boolean;
        cacheDir?: string;
        smartMode?: boolean;
        batchExpectations?: boolean;
        maxCacheAge?: number;
    };

    // Reporting
    reporters?: ('html' | 'junit' | 'json')[];
    outputDir?: string;

    // Screenshots and videos
    screenshot?: 'on' | 'off' | 'only-on-failure';
    video?: 'on' | 'off' | 'only-on-failure';

    // CI/CD
    ci?: boolean;
    deploymentGate?: boolean;
}

/**
 * AI Provider interface
 */
export interface AIProvider {
    /**
     * Locate element using natural language description
     */
    locateElement(controller: BrowserController, description: string, taskType?: AITaskType): Promise<{ selector: string, model: string }>;

    /**
     * Validate expectation against page state
     */
    validateExpectation(controller: BrowserController, expectation: string, screenshot?: string, taskType?: AITaskType): Promise<boolean>;

    /**
     * Analyze test failure
     */
    analyzeFailure(
        testName: string,
        error: Error,
        screenshot?: string,
        pageContent?: string,
        taskType?: AITaskType
    ): Promise<FailureAnalysis>;

    /**
     * Compare screenshots for visual regression
     */
    compareScreenshots(baseline: string, current: string, taskType?: AITaskType): Promise<{
        similar: boolean;
        difference: number;
        analysis: string;
    }>;

    /**
     * Get the total cost spent by this provider
     */
    getSpent(): number;

    /**
     * Get cumulative token usage
     */
    getUsage(): { inputTokens: number; outputTokens: number };
}

/**
 * Reporter interface
 */
export interface Reporter {
    onTestStart(test: TestCase): void;
    onTestEnd(result: TestResult): void;
    onSuiteEnd(suiteResult: TestSuiteResult): Promise<void>;
}
