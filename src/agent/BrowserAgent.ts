import { Page, BrowserContext } from '@playwright/test';
import { BrowserAgent as IBrowserAgent, WaitOptions, AITaskType } from '../types';
import { BaseAIProvider } from '../ai/AIProvider';
import { Logger } from '../utils/Logger';

/**
 * AI-powered browser agent for intelligent UI interactions
 */
export class BrowserAgent implements IBrowserAgent {
    private page: Page;
    private aiProvider: BaseAIProvider;
    private logger: Logger;
    private screenshots: string[] = [];

    constructor(page: Page, _context: BrowserContext, aiProvider: BaseAIProvider, logger: Logger) {
        this.page = page;
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
            // Try learned selectors first (no LLM call)
            const selector = await this.findElementOptimized(target);
            await this.page.click(selector);

            // Wait for potential navigation or network activity
            await this.page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => { });
        } catch (error) {
            throw new Error(`Failed to click element: ${target}. ${error}`);
        }
    }

    /**
     * Fill an input field using natural language description
     */
    async fill(target: string, value: string): Promise<void> {
        this.logger.info(`Filling "${target}" with: ${value}`);

        try {
            const selector = await this.findElementOptimized(target);
            await this.page.fill(selector, value);
        } catch (error) {
            throw new Error(`Failed to fill element: ${target}. ${error}`);
        }
    }

    /**
     * Select an option from a dropdown
     */
    async select(target: string, value: string): Promise<void> {
        this.logger.info(`Selecting "${value}" in: ${target}`);

        try {
            const selector = await this.findElementOptimized(target);
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
            const selector = await this.findElementOptimized(target);
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
            const selector = await this.aiProvider.locateElement(
                this.page,
                target,
                AITaskType.ELEMENT_RESOLUTION
            );
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
    /**
     * Validate an expectation
     * Smartly routes to specific expectation types to reduce AI costs
     */
    async expect(expectation: string): Promise<void> {
        // 1. Check for Navigation (URL/Title)
        if (/(redirect|url|page).*(to|is|contains)/i.test(expectation) || /title/i.test(expectation)) {
            return this.expectNavigation(expectation);
        }

        // 2. Check for Visibility
        const visibilityMatch = expectation.match(/(.*?) should be (visible|hidden|shown|not shown|appear|disappear)/i);
        if (visibilityMatch) {
            const elementDesc = visibilityMatch[1].trim();
            const isVisible = ['visible', 'shown', 'appear'].includes(visibilityMatch[2].toLowerCase());
            return this.expectVisibility(elementDesc, isVisible);
        }

        // 3. Check for Text Content
        const textMatch = expectation.match(/(.*?) should (have|contain|say|be) text ['"](.*?)['"]/i);
        if (textMatch) {
            // e.g. "submit button should have text 'Login'"
            const elementDesc = textMatch[1].trim();
            const text = textMatch[3];
            return this.expectText(text, elementDesc);
        }

        // 4. Default to Visual/AI Expectation (Expensive)
        return this.expectVisual(expectation);
    }

    /**
     * Expect navigation to URL or Title
     */
    async expectNavigation(urlOrTitle: string): Promise<void> {
        this.logger.info(`Expect navigation: ${urlOrTitle}`);
        try {
            if (urlOrTitle.includes('http') || urlOrTitle.includes('/')) {
                // Check URL
                const expectedUrl = urlOrTitle.replace(/should.*to/, '').trim(); // simplistic
                await this.page.waitForURL(url => url.toString().includes(expectedUrl) || url.pathname.includes(expectedUrl), { timeout: 10000 });
            } else {
                // Check Title
                const expectedTitle = urlOrTitle.replace(/.*?title should be/i, '').replace(/['"]/g, '').trim();
                await this.page.waitForFunction(
                    `document.title.includes("${expectedTitle}")`,
                    undefined,
                    { timeout: 10000 }
                );
            }
        } catch (error) {
            // Fallback to AI if simple check fails
            this.logger.warn(`Navigation check failed, falling back to AI: ${error}`);
            await this.expectVisual(urlOrTitle);
        }
    }

    /**
     * Expect element visibility
     */
    async expectVisibility(selector: string, isVisible: boolean = true): Promise<void> {
        this.logger.info(`Expect visibility: "${selector}" should be ${isVisible ? 'visible' : 'hidden'}`);
        try {
            const actualSelector = await this.findElementOptimized(selector);
            if (isVisible) {
                await this.page.waitForSelector(actualSelector, { state: 'visible', timeout: 10000 });
            } else {
                await this.page.waitForSelector(actualSelector, { state: 'hidden', timeout: 10000 });
            }
        } catch (error) {
            throw new Error(`Visibility check failed for ${selector}: ${error}`);
        }
    }

    /**
     * Expect text content
     */
    async expectText(text: string, selector?: string): Promise<void> {
        this.logger.info(`Expect text: "${text}" in ${selector || 'page'}`);
        try {
            if (selector && selector !== 'page' && selector !== 'body') {
                const actualSelector = await this.findElementOptimized(selector);
                const element = this.page.locator(actualSelector);
                await element.waitFor();
                const content = await element.textContent();
                if (!content?.includes(text)) {
                    throw new Error(`Text "${text}" not found in element "${selector}" (Found: "${content}")`);
                }
            } else {
                // Global page text check using locator instead of document
                const body = this.page.locator('body');
                await body.waitFor();
                const content = await body.textContent();
                if (!content?.includes(text)) {
                    throw new Error(`Text "${text}" not found on page`);
                }
            }
        } catch (error) {
            throw new Error(`Text check failed: ${error}`);
        }
    }

    /**
     * Validate an expectation using AI (Visual)
     */
    async expectVisual(expectation: string): Promise<void> {
        this.logger.info(`Validating visual expectation (AI): ${expectation}`);

        // Take screenshot for AI analysis
        const screenshot = await this.takeScreenshot(`expectation-${Date.now()}`);

        // Use AI to validate the expectation
        const isValid = await this.aiProvider.validateExpectation(
            this.page,
            expectation,
            screenshot,
            AITaskType.EXPECTATION_VALIDATION
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
     * Set selector cache for learning
     */
    setSelectorCache(cache: any): void {
        (this as any).selectorCache = cache;
    }

    /**
   * Optimized element finding with caching
   * Priority: 1) Learned selectors, 2) Fallback patterns, 3) AI
   */
    private async findElementOptimized(description: string): Promise<string> {
        const url = this.page.url();

        // 1. Try learned selectors first (no LLM call!)
        const selectorCache = (this as any).selectorCache;
        if (selectorCache) {
            const learnedEntries = selectorCache.getSelectors(description, url);

            // Try selectors in order of confidence
            for (const entry of learnedEntries) {
                try {
                    const selector = typeof entry === 'string' ? entry : entry.selector;
                    const element = await this.page.$(selector);
                    if (element) {
                        this.logger.debug(`Using learned selector (confidence: ${typeof entry === 'object' ? entry.confidence : 'N/A'}): ${selector}`);

                        // Record success to boost confidence
                        if (typeof entry === 'object') {
                            selectorCache.recordSuccess(description, url, selector, entry.source);
                        }

                        return selector;
                    } else {
                        // Selector didn't work, reduce confidence
                        if (typeof entry === 'object') {
                            selectorCache.recordFailure(description, url, selector);
                        }
                    }
                } catch (e) {
                    // Selector failed, try next one
                    if (typeof entry === 'object') {
                        selectorCache.recordFailure(description, url, entry.selector);
                    }
                }
            }
        }

        // 2. Try fallback patterns (no LLM call!)
        const fallbackSelector = await this.tryFallbackSelectors(description);
        if (fallbackSelector) {
            this.logger.debug(`Using fallback selector: ${fallbackSelector}`);

            // Learn this selector for future use
            if (selectorCache) {
                selectorCache.recordSuccess(description, url, fallbackSelector, 'fallback');
            }

            return fallbackSelector;
        }

        // 3. Finally, use AI (LLM call - expensive!)
        this.logger.debug(`Using AI to locate: ${description}`);
        const aiSelector = await this.aiProvider.locateElement(
            this.page,
            description,
            AITaskType.ELEMENT_RESOLUTION
        );

        // Learn this selector for future use
        if (selectorCache) {
            selectorCache.recordSuccess(description, url, aiSelector, 'ai');
        }

        return aiSelector;
    }

    /**
     * Internal method to take and store screenshot
     */
    private async takeScreenshot(_name: string): Promise<string> {
        const screenshot = await this.page.screenshot({ type: 'png' });
        const base64 = screenshot.toString('base64');
        this.screenshots.push(base64);
        return base64;
    }

    /**
     * Fallback method to try common selectors when AI fails
     */
    private async tryFallbackSelectors(description: string): Promise<string | null> {
        // const _lowerDesc = description.toLowerCase();

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
