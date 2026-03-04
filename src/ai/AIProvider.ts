import { Page } from '@playwright/test';
import { AIProvider, FailureAnalysis } from '../types';

/**
 * Abstract base class for AI providers
 * Implement this interface to add support for custom LLMs
 */
export abstract class BaseAIProvider implements AIProvider {
    protected config: any;

    constructor(config: any) {
        this.config = config;
    }

    abstract locateElement(page: Page, description: string, taskType?: any): Promise<{ selector: string, model: string }>;

    /**
     * Validate expectation against page state
     * @param page - Playwright page object
     * @param expectation - Natural language expectation
     * @param screenshot - Optional base64 encoded screenshot
     * @param taskType - Optional task type for routing
     * @returns true if expectation is met, false otherwise
     */
    abstract validateExpectation(
        page: Page,
        expectation: string,
        screenshot?: string,
        taskType?: any
    ): Promise<boolean>;

    /**
     * Analyze test failure and provide insights
     * @param testName - Name of the failed test
     * @param error - Error object from the test
     * @param screenshot - Optional base64 encoded screenshot
     * @param pageContent - Optional HTML content of the page
     * @param taskType - Optional task type for routing
     * @returns Failure analysis with root cause and suggestions
     */
    abstract analyzeFailure(
        testName: string,
        error: Error,
        screenshot?: string,
        pageContent?: string,
        taskType?: any
    ): Promise<FailureAnalysis>;

    /**
     * Compare screenshots for visual regression testing
     * @param baseline - Base64 encoded baseline screenshot
     * @param current - Base64 encoded current screenshot
     * @param taskType - Optional task type for routing
     * @returns Comparison result with similarity score
     */
    abstract compareScreenshots(
        baseline: string,
        current: string,
        taskType?: any
    ): Promise<{
        similar: boolean;
        difference: number;
        analysis: string;
    }>;

    /**
     * Helper method to extract page context for AI analysis
     */
    protected async getPageContext(page: Page): Promise<{
        url: string;
        title: string;
        html: string;
        visibleText: string;
    }> {
        const url = page.url();
        const title = await page.title();
        const html = await page.content();
        const visibleText = await page.evaluate(() => {
            return document.body.innerText;
        });

        return { url, title, html, visibleText };
    }

    /**
     * Helper method to take screenshot as base64
     */
    protected async takeScreenshot(page: Page): Promise<string> {
        const screenshot = await page.screenshot({ type: 'png' });
        return screenshot.toString('base64');
    }
}
