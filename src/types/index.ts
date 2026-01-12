import { Page, Browser, BrowserContext } from '@playwright/test';

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
    getPage(): Page;
}

/**
 * Wait options for element waiting
 */
export interface WaitOptions {
    timeout?: number;
    state?: 'visible' | 'hidden' | 'attached' | 'detached';
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
    viewport?: { width: number; height: number };

    // Test execution
    timeout?: number;
    retries?: number;
    parallel?: number;

    // AI Provider
    aiProvider: 'openai' | 'custom';
    openai?: {
        apiKey: string;
        model?: string;
    };
    customLLM?: {
        endpoint: string;
        apiKey?: string;
        model?: string;
    };

    // AI Optimization (NEW)
    aiOptimization?: {
        enableCache?: boolean;           // Cache AI responses (default: true)
        cacheDir?: string;                // Cache directory (default: .ai-cache)
        smartMode?: boolean;              // Use fallbacks before AI (default: true)
        batchExpectations?: boolean;      // Batch multiple expects into one call (default: true)
        maxCacheAge?: number;             // Cache TTL in hours (default: 24)
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
    locateElement(page: Page, description: string): Promise<string>;

    /**
     * Validate expectation against page state
     */
    validateExpectation(page: Page, expectation: string, screenshot?: string): Promise<boolean>;

    /**
     * Analyze test failure
     */
    analyzeFailure(
        testName: string,
        error: Error,
        screenshot?: string,
        pageContent?: string
    ): Promise<FailureAnalysis>;

    /**
     * Compare screenshots for visual regression
     */
    compareScreenshots(baseline: string, current: string): Promise<{
        similar: boolean;
        difference: number;
        analysis: string;
    }>;
}

/**
 * Reporter interface
 */
export interface Reporter {
    onTestStart(test: TestCase): void;
    onTestEnd(result: TestResult): void;
    onSuiteEnd(suiteResult: TestSuiteResult): Promise<void>;
}
