import { Page } from '@playwright/test';
import { BrowserController } from '../types';

/**
 * Playwright implementation of the BrowserController interface
 * Acts as an adapter between the generic AI framework and Playwright API
 */
export class PlaywrightController implements BrowserController {
    public pageContext: Page;

    constructor(page: Page) {
        this.pageContext = page;
    }

    /**
     * Get the underlying Playwright Page object.
     * Use sparingly to avoid breaking abstraction if shifting to another framework.
     */
    page(): Page {
        return this.pageContext;
    }

    async navigate(url: string): Promise<void> {
        await this.pageContext.goto(url, { waitUntil: 'load' }); // Consistent behavior
    }

    async click(selector: string): Promise<void> {
        await this.pageContext.click(selector);
    }

    async fill(selector: string, value: string): Promise<void> {
        await this.pageContext.fill(selector, value);
    }

    async select(selector: string, value: string): Promise<void> {
        await this.pageContext.selectOption(selector, value);
    }

    async evaluate<R, Arg>(pageFunction: string | ((arg: Arg) => R | Promise<R>), arg?: Arg): Promise<R> {
        // We have to cast here because Playwright's evaluate signature is very complex,
        // but this covers the 99% use case of passing a function and optionally one arg
        return this.pageContext.evaluate(pageFunction as any, arg) as Promise<R>;
    }

    async waitForSelector(selector: string, options?: { timeout?: number }): Promise<void> {
        await this.pageContext.waitForSelector(selector, { timeout: options?.timeout });
    }

    async isVisible(selector: string): Promise<boolean> {
        // Wait briefly just to be sure, then check visibility
        try {
            await this.pageContext.waitForSelector(selector, { state: 'visible', timeout: 500 });
            return true;
        } catch {
            return false;
        }
    }

    async isHidden(selector: string): Promise<boolean> {
        try {
            await this.pageContext.waitForSelector(selector, { state: 'hidden', timeout: 500 });
            return true;
        } catch {
            return false;
        }
    }

    async textContent(selector: string): Promise<string | null> {
        return this.pageContext.textContent(selector);
    }

    async title(): Promise<string> {
        return this.pageContext.title();
    }

    async content(): Promise<string> {
        return this.pageContext.content();
    }

    url(): string {
        return this.pageContext.url();
    }

    async takeScreenshot(): Promise<Buffer> {
        return this.pageContext.screenshot({ timeout: 5000 });
    }

    async keyboardPress(key: string): Promise<void> {
        await this.pageContext.keyboard.press(key);
    }

    async hover(selector: string): Promise<void> {
        await this.pageContext.hover(selector);
    }

    async press(key: string): Promise<void> {
        // Since the interface only passes 'key', we assume it's a global keyboard press
        await this.pageContext.keyboard.press(key);
    }

    async waitForTimeout(timeout: number): Promise<void> {
        await this.pageContext.waitForTimeout(timeout);
    }

    locator(selector: string): any {
        return this.pageContext.locator(selector);
    }
}
