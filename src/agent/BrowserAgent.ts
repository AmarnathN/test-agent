import { Page, BrowserContext } from '@playwright/test';
import { BrowserAgent as IBrowserAgent, WaitOptions, AITaskType, TestStep } from '../types';
import { BaseAIProvider } from '../ai/AIProvider';
import { Logger } from '../utils/Logger';
import { SelectorCache, SelectorEntry } from '../cache/SelectorCache';

/**
 * AI-powered browser agent for intelligent UI interactions
 */
export class BrowserAgent implements IBrowserAgent {
    private page: Page;
    private aiProvider: BaseAIProvider;
    private logger: Logger;
    private screenshots: string[] = [];
    private selectorCache?: SelectorCache;
    private steps: TestStep[] = [];

    constructor(page: Page, _context: BrowserContext, aiProvider: BaseAIProvider, logger: Logger) {
        this.page = page;
        this.aiProvider = aiProvider;
        this.logger = logger;
    }

    /** Return all recorded steps (called by TestRunner after the test) */
    getSteps(): TestStep[] {
        return this.steps;
    }

    /**
     * Wrap a step: records timing, status, and an optional screenshot on failure.
     */
    private async recordStep<T>(
        action: string,
        description: string,
        fn: () => Promise<T>,
        captureScreenshot = false,
    ): Promise<T> {
        const step: TestStep = { action, description, status: 'running', startTime: Date.now() };
        this.steps.push(step);
        try {
            const result = await fn();
            step.status = 'passed';
            step.duration = Date.now() - step.startTime;
            if (captureScreenshot) {
                step.screenshot = await this.takeScreenshot(`step-${this.steps.length}`);
            }
            return result;
        } catch (err) {
            step.status = 'failed';
            step.duration = Date.now() - step.startTime;
            step.error = String(err);
            try { step.screenshot = await this.takeScreenshot(`step-${this.steps.length}-fail`); } catch { /* ignore */ }
            throw err;
        }
    }

    /**
     * Navigate to a URL
     */
    async navigate(url: string): Promise<void> {
        this.logger.info(`Navigating to: ${url}`);
        await this.recordStep('navigate', `Navigate to ${url}`, async () => {
            await this.page.goto(url, { waitUntil: 'load' });
        }, true);
    }

    /**
     * Click an element using natural language description
     */
    async click(target: string): Promise<void> {
        this.logger.info(`Clicking: ${target}`);
        await this.recordStep('click', `Click "${target}"`, async () => {
            const selector = await this.findElementOptimized(target);
            await this.page.click(selector);
            await this.page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => { });
        }, true);
    }

    /**
     * Fill an input field using natural language description
     */
    async fill(target: string, value: string): Promise<void> {
        this.logger.info(`Filling "${target}" with: ${value}`);
        await this.recordStep('fill', `Fill "${target}" with "${value}"`, async () => {
            const selector = await this.findElementOptimized(target);
            await this.page.fill(selector, value);
        });
    }

    /**
     * Select an option from a dropdown
     */
    async select(target: string, value: string): Promise<void> {
        this.logger.info(`Selecting "${value}" in: ${target}`);
        await this.recordStep('select', `Select "${value}" in "${target}"`, async () => {
            const selector = await this.findElementOptimized(target);
            await this.page.selectOption(selector, value);
        });
    }

    /**
     * Hover over an element
     */
    async hover(target: string): Promise<void> {
        this.logger.info(`Hovering over: ${target}`);
        await this.recordStep('hover', `Hover over "${target}"`, async () => {
            const selector = await this.findElementOptimized(target);
            await this.page.hover(selector);
        }, true);
    }

    /**
     * Press a keyboard key
     */
    async press(key: string): Promise<void> {
        this.logger.info(`Pressing key: ${key}`);
        await this.recordStep('press', `Press key "${key}"`, () => this.page.keyboard.press(key));
    }

    /**
     * Wait for a specified time
     */
    async wait(milliseconds: number): Promise<void> {
        this.logger.info(`Waiting for: ${milliseconds}ms`);
        await this.recordStep('wait', `Wait ${milliseconds}ms`, () => this.page.waitForTimeout(milliseconds));
    }

    /**
     * Wait for an element to appear
     */
    async waitFor(target: string, options?: WaitOptions): Promise<void> {
        this.logger.info(`Waiting for: ${target}`);
        await this.recordStep('waitFor', `Wait for "${target}"`, async () => {
            const selector = await this.aiProvider.locateElement(this.page, target, AITaskType.ELEMENT_RESOLUTION);
            await this.page.waitForSelector(selector, {
                timeout: options?.timeout || 30000,
                state: options?.state || 'visible',
            });
        });
    }

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
     * Expect text content — polls the live DOM so transient text (toasts,
     * flash messages, alerts) is caught the moment it appears.
     */
    async expectText(text: string, selector?: string, timeout = 10_000): Promise<void> {
        this.logger.info(`Expect text: "${text}" in ${selector || 'page'}`);
        try {
            if (selector && selector !== 'page' && selector !== 'body') {
                // Scoped check: wait for element then assert its text
                const actualSelector = await this.findElementOptimized(selector);
                const element = this.page.locator(actualSelector);
                await element.waitFor({ timeout });
                const content = await element.textContent();
                if (!content?.includes(text)) {
                    throw new Error(`Text "${text}" not found in element "${selector}" (Found: "${content}")`);
                }
            } else {
                // Global page check: poll the live DOM via waitForFunction so
                // transient text (toasts, flash messages) is caught immediately.
                await this.page.waitForFunction(
                    (searchText: string) => document.body?.textContent?.includes(searchText),
                    text,
                    { timeout, polling: 100 },   // poll every 100ms
                );
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
    setSelectorCache(cache: SelectorCache): void {
        this.selectorCache = cache;
    }

    /**
     * Optimized element finding with caching
     */
    private async findElementOptimized(description: string): Promise<string> {
        // Construct localized intent key
        const domain = new URL(this.page.url()).hostname;
        const intent = `${domain}:${description.trim().toLowerCase()}`;

        // 1. Try cached selectors
        if (this.selectorCache) {
            const cached = this.selectorCache.get(intent);

            if (cached && cached.selectors.length > 0) {
                // Sort selectors by confidence and success rate
                const sortedSelectors = [...cached.selectors].sort((a, b) => {
                    // Primary: Confidence
                    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
                    // Secondary: Success Ratio
                    const scoreA = a.successCount - a.failureCount;
                    const scoreB = b.successCount - b.failureCount;
                    return scoreB - scoreA;
                });

                let cacheDirty = false;
                let foundSelector: string | null = null;

                for (const s of sortedSelectors) {
                    try {
                        const el = this.page.locator(s.selector).first();
                        // Short timeout for cached checks to stay fast
                        await el.waitFor({ timeout: 2000, state: 'visible' });

                        this.logger.debug(`Cache hit: "${description}" -> ${s.selector}`);

                        // Update Success Stats
                        s.successCount++;
                        s.lastVerified = Date.now();

                        // Boost confidence slightly on success, cap at 1.0
                        s.confidence = Math.min(1.0, s.confidence + 0.01);

                        cacheDirty = true;
                        foundSelector = s.selector;
                        break;

                    } catch {
                        // Update Failure Stats
                        s.failureCount++;

                        // Decay confidence on failure
                        if (s.failureCount > 3) {
                            s.confidence *= 0.8;
                        } else {
                            s.confidence *= 0.95;
                        }

                        this.logger.debug(`Cache miss (stale): ${s.selector}`);
                        cacheDirty = true;
                    }
                }

                if (cacheDirty) {
                    // Auto-evict low confidence selectors
                    cached.selectors = cached.selectors.filter(s => s.confidence >= 0.4);
                    this.selectorCache.update(cached);
                }

                if (foundSelector) return foundSelector;
            }
        }

        // 2. Fallback Patterns (Fast heuristics before AI)
        const fallbackSelector = await this.tryFallbackSelectors(description);
        if (fallbackSelector) {
            // Learn Fallback
            if (this.selectorCache) {
                const existingEntry = this.selectorCache.get(intent);
                const type = (fallbackSelector.startsWith('//') || fallbackSelector.startsWith('xpath=')) ? 'xpath' : 'css';

                const newEntry: SelectorEntry = {
                    selector: fallbackSelector,
                    confidence: 0.6,
                    successCount: 1,
                    failureCount: 0,
                    lastVerified: Date.now(),
                    source: 'manual',
                    selectorType: type as any
                };

                if (existingEntry) {
                    if (!existingEntry.selectors.find(s => s.selector === fallbackSelector)) {
                        existingEntry.selectors.push(newEntry);
                        this.selectorCache.update(existingEntry);
                    }
                } else {
                    this.selectorCache.update({
                        intent,
                        selectors: [newEntry]
                    });
                }
            }
            return fallbackSelector;
        }

        // 3. AI Resolution (Expensive)
        this.logger.debug(`Using AI to locate: ${description}`);
        const aiSelector = await this.aiProvider.locateElement(
            this.page,
            description,
            AITaskType.ELEMENT_RESOLUTION
        );

        // Verify AI Selector before caching
        try {
            // Immediate validation
            const el = this.page.locator(aiSelector).first();
            await el.waitFor({ timeout: 3000, state: 'visible' });

            // Use AI Selector & Cache it
            if (this.selectorCache) {
                const existingEntry = this.selectorCache.get(intent);
                const type = (aiSelector.startsWith('//') || aiSelector.startsWith('xpath=')) ? 'xpath' : 'css';

                const newSelectorEntry: SelectorEntry = {
                    selector: aiSelector,
                    confidence: 0.85, // Start conservative
                    successCount: 0,  // Verified once but allow history to build
                    failureCount: 0,
                    lastVerified: Date.now(),
                    source: 'ai',
                    selectorType: type as any
                };

                if (existingEntry) {
                    if (!existingEntry.selectors.find(s => s.selector === aiSelector)) {
                        existingEntry.selectors.push(newSelectorEntry);
                        this.selectorCache.update(existingEntry);
                    }
                } else {
                    this.selectorCache.update({
                        intent,
                        selectors: [newSelectorEntry]
                    });
                }
            }
        } catch (e) {
            this.logger.warn(`AI selector "${aiSelector}" failed immediate verification. Not caching.`);
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
