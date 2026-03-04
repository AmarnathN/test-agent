import { AIProvider, FailureAnalysis, BrowserController } from '../types';

/**
 * Abstract base class for AI providers
 * Implement this interface to add support for custom LLMs
 */
export abstract class BaseAIProvider implements AIProvider {
    protected config: any;

    constructor(config: any) {
        this.config = config;
    }

    abstract locateElement(controller: BrowserController, description: string, taskType?: any): Promise<{ selector: string, model: string }>;

    /**
     * Validate expectation against page state
     * @param controller - Generic browser controller
     * @param expectation - Natural language expectation
     * @param screenshot - Optional base64 encoded screenshot
     * @param taskType - Optional task type for routing
     * @returns true if expectation is met, false otherwise
     */
    abstract validateExpectation(
        controller: BrowserController,
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
    protected async getPageContext(controller: BrowserController): Promise<{
        url: string;
        title: string;
        html: string;
        visibleText: string;
    }> {
        const url = controller.url();
        const title = await controller.title();
        const html = await controller.content();
        const visibleText = await controller.evaluate(() => {
            // Function to recursively extract visible text
            function getVisibleText(el: HTMLElement): string {
                if (!el) return '';
                if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'NOSCRIPT') return '';

                const style = window.getComputedStyle(el);
                if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return '';

                let text = '';
                for (const child of Array.from(el.childNodes)) {
                    if (child.nodeType === Node.TEXT_NODE) {
                        text += child.textContent + ' ';
                    } else if (child.nodeType === Node.ELEMENT_NODE) {
                        text += getVisibleText(child as HTMLElement) + ' ';
                    }
                }
                return text;
            }
            return getVisibleText(document.body).replace(/\s+/g, ' ').trim();
        });

        return { url, title, html, visibleText };
    }

    /**
     * Helper method to take screenshot as base64
     */
    protected async takeScreenshot(controller: BrowserController): Promise<string> {
        const screenshotBuf = await controller.takeScreenshot();
        return screenshotBuf.toString('base64');
    }
}
