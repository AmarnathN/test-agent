import { Page, BrowserContext } from '@playwright/test';
import { BrowserAgent as IBrowserAgent, WaitOptions } from '../types';
import { BaseAIProvider } from '../ai/AIProvider';
import { Logger } from '../utils/Logger';

/**
 * AI-powered browser agent for intelligent UI interactions
 */
export class BrowserAgent implements IBrowserAgent {
    private page: Page;
    private context: BrowserContext;
    private aiProvider: BaseAIProvider;
    private logger: Logger;
    private screenshots: string[] = [];

    constructor(page: Page, context: BrowserContext, aiProvider: BaseAIProvider, logger: Logger) {
        this.page = page;
        this.context = context;
        this.aiProvider = aiProvider;
        this.logger = logger;
    }

    /**
     * Navigate to a URL
     */
    async navigate(url: string): Promise<void> {
        this.logger.info(`Navigating to: ${url}`);
        await this.page.goto(url, { waitUntil: 'networkidle' });
    }

    /**
     * Click an element using natural language description
     */
    async click(target: string): Promise<void> {
        this.logger.info(`Clicking: ${target}`);

        try {
            // Try to locate element using AI
            const selector = await this.aiProvider.locateElement(this.page, target);
            await this.page.click(selector);

            // Wait for potential navigation or network activity
            await this.page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => { });
        } catch (error) {
            // Fallback: try common selectors
            const fallbackSelector = await this.tryFallbackSelectors(target);
            if (fallbackSelector) {
                await this.page.click(fallbackSelector);
            } else {
                throw new Error(`Failed to click element: ${target}. ${error}`);
            }
        }
    }

    /**
     * Fill an input field using natural language description
     */
    async fill(target: string, value: string): Promise<void> {
        this.logger.info(`Filling "${target}" with: ${value}`);

        try {
            const selector = await this.aiProvider.locateElement(this.page, target);
            await this.page.fill(selector, value);
        } catch (error) {
            const fallbackSelector = await this.tryFallbackSelectors(target);
            if (fallbackSelector) {
                await this.page.fill(fallbackSelector, value);
            } else {
                throw new Error(`Failed to fill element: ${target}. ${error}`);
            }
        }
    }

    /**
     * Select an option from a dropdown
     */
    async select(target: string, value: string): Promise<void> {
        this.logger.info(`Selecting "${value}" in: ${target}`);

        try {
            const selector = await this.aiProvider.locateElement(this.page, target);
            await this.page.selectOption(selector, value);
        } catch (error) {
            throw new Error(`Failed to select option in: ${target}. ${error}`);
        }
    }

    /**
     * Hover over an element
     */
    async hover(target: string): Promise<void> {
        this.logger.info(`Hovering over: ${target}`);

        try {
            const selector = await this.aiProvider.locateElement(this.page, target);
            await this.page.hover(selector);
        } catch (error) {
            throw new Error(`Failed to hover over: ${target}. ${error}`);
        }
    }

    /**
     * Press a keyboard key
     */
    async press(key: string): Promise<void> {
        this.logger.info(`Pressing key: ${key}`);
        await this.page.keyboard.press(key);
    }

    /**
     * Wait for a specified time
     */
    async wait(milliseconds: number): Promise<void> {
        this.logger.info(`Waiting for: ${milliseconds}ms`);
        await this.page.waitForTimeout(milliseconds);
    }

    /**
     * Wait for an element to appear
     */
    async waitFor(target: string, options?: WaitOptions): Promise<void> {
        this.logger.info(`Waiting for: ${target}`);

        try {
            const selector = await this.aiProvider.locateElement(this.page, target);
            await this.page.waitForSelector(selector, {
                timeout: options?.timeout || 30000,
                state: options?.state || 'visible',
            });
        } catch (error) {
            throw new Error(`Timeout waiting for: ${target}. ${error}`);
        }
    }

    /**
     * Validate an expectation using AI
     */
    async expect(expectation: string): Promise<void> {
        this.logger.info(`Validating expectation: ${expectation}`);

        // Take screenshot for AI analysis
        const screenshot = await this.takeScreenshot(`expectation-${Date.now()}`);

        // Use AI to validate the expectation
        const isValid = await this.aiProvider.validateExpectation(
            this.page,
            expectation,
            screenshot
        );

        if (!isValid) {
            throw new Error(`Expectation not met: ${expectation}`);
        }

        this.logger.info(`✓ Expectation met: ${expectation}`);
    }

    /**
     * Take a screenshot
     */
    async screenshot(name?: string): Promise<string> {
        const filename = name || `screenshot-${Date.now()}`;
        return await this.takeScreenshot(filename);
    }

    /**
     * Get the underlying Playwright page object
     */
    getPage(): Page {
        return this.page;
    }

    /**
     * Get all screenshots taken during test
     */
    getScreenshots(): string[] {
        return this.screenshots;
    }

    /**
     * Internal method to take and store screenshot
     */
    private async takeScreenshot(name: string): Promise<string> {
        const screenshot = await this.page.screenshot({ type: 'png' });
        const base64 = screenshot.toString('base64');
        this.screenshots.push(base64);
        return base64;
    }

    /**
     * Fallback method to try common selectors when AI fails
     */
    private async tryFallbackSelectors(description: string): Promise<string | null> {
        const lowerDesc = description.toLowerCase();

        // Try common patterns
        const patterns = [
            `button:has-text("${description}")`,
            `a:has-text("${description}")`,
            `input[placeholder*="${description}" i]`,
            `input[name*="${description}" i]`,
            `[aria-label*="${description}" i]`,
            `[title*="${description}" i]`,
        ];

        for (const pattern of patterns) {
            try {
                const element = await this.page.$(pattern);
                if (element) {
                    this.logger.info(`Found element using fallback selector: ${pattern}`);
                    return pattern;
                }
            } catch (e) {
                // Continue to next pattern
            }
        }

        return null;
    }
}
