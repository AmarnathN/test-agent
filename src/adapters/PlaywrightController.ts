import { Page } from '@playwright/test';
import { BrowserController, WaitOptions } from '../types';

/**
 * Adapter implementing BrowserController using Playwright.
 * This class abstracts Playwright-specific interactions behind a generic interface,
 * allowing the core AI reasoning engine to remain framework agnostic.
 */
export class PlaywrightController implements BrowserController {

    constructor(private page: Page) { }

    async navigate(url: string): Promise<void> {
        await this.page.goto(url);
    }

    async click(selector: string): Promise<void> {
        await this.page.click(selector);
    }

    async fill(selector: string, value: string): Promise<void> {
        await this.page.fill(selector, value);
    }

    async select(selector: string, value: string): Promise<void> {
        await this.page.selectOption(selector, value);
    }

    async hover(selector: string): Promise<void> {
        await this.page.hover(selector);
    }

    async press(key: string): Promise<void> {
        await this.page.keyboard.press(key);
    }

    async waitForSelector(selector: string, options?: WaitOptions): Promise<void> {
        await this.page.waitForSelector(selector, {
            state: options?.state || 'visible',
            timeout: options?.timeout || 30000
        });
    }

    async waitForTimeout(milliseconds: number): Promise<void> {
        await this.page.waitForTimeout(milliseconds);
    }

    async evaluate<T>(script: (arg: any) => T, arg?: any): Promise<T> {
        return await this.page.evaluate(script, arg);
    }

    async takeScreenshot(options?: { fullPage?: boolean }): Promise<Buffer> {
        return await this.page.screenshot({ fullPage: options?.fullPage });
    }

    async content(): Promise<string> {
        return await this.page.content();
    }

    url(): string {
        return this.page.url();
    }

    async title(): Promise<string> {
        return await this.page.title();
    }

    // This exposes Playwright's locator for advanced internal scenarios if necessary,
    // though the goal is to rely strictly on the interface methods above.
    locator(selector: string): any {
        return this.page.locator(selector);
    }
}
