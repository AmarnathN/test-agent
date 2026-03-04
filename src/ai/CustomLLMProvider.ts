import { Page } from '@playwright/test';
import { BaseAIProvider } from './AIProvider';
import { FailureAnalysis } from '../types';

/**
 * Template for custom LLM provider implementation
 * Replace the API calls with your custom LLM endpoint
 */
export class CustomLLMProvider extends BaseAIProvider {
    private endpoint: string;
    private apiKey?: string;
    private model: string;

    constructor(config: { endpoint: string; apiKey?: string; model?: string }) {
        super(config);
        this.endpoint = config.endpoint;
        this.apiKey = config.apiKey;
        this.model = config.model || 'default';
    }

    /**
     * Locate element using custom LLM
     * TODO: Implement your custom LLM API call here
     */
    async locateElement(page: Page, description: string, _taskType?: any): Promise<{ selector: string, model: string }> {
        // Unused context for template
        // const _context = await this.getPageContext(page);

        // Get all interactive elements
        const elements = await page.evaluate(() => {
            const interactiveElements = document.querySelectorAll(
                'button, a, input, select, textarea, [role="button"], [onclick]'
            );

            return Array.from(interactiveElements).map((el, index) => ({
                index,
                tag: el.tagName.toLowerCase(),
                id: el.id,
                class: el.className,
                text: el.textContent?.trim().substring(0, 100),
                type: (el as HTMLInputElement).type,
                placeholder: (el as HTMLInputElement).placeholder,
            }));
        });

        // TODO: Replace with your custom LLM API call
        const prompt = `Identify CSS selector for: "${description}"\nElements: ${JSON.stringify(elements)}`;
        const selector = await this.callCustomLLM(prompt, 'element-location');

        // Validate selector
        try {
            await page.waitForSelector(selector, { timeout: 2000 });
            return { selector, model: this.model };
        } catch (error) {
            throw new Error(`Custom LLM selector "${selector}" not found for: "${description}"`);
        }
    }

    /**
     * Validate expectation using custom LLM
     * TODO: Implement your custom LLM API call here
     */
    async validateExpectation(
        page: Page,
        expectation: string,
        _screenshot?: string,
        _taskType?: any
    ): Promise<boolean> {
        const context = await this.getPageContext(page);

        // TODO: Replace with your custom LLM API call
        // If your LLM supports vision, include the screenshot
        const prompt = `Page: ${context.url}\nText: ${context.visibleText}\nExpectation: ${expectation}\nIs this met?`;
        const result = await this.callCustomLLM(prompt, 'expectation-validation');

        return result.toLowerCase().includes('true') || result.toLowerCase().includes('yes');
    }

    /**
     * Analyze failure using custom LLM
     * TODO: Implement your custom LLM API call here
     */
    async analyzeFailure(
        testName: string,
        error: Error,
        _screenshot?: string,
        _pageContent?: string,
        _taskType?: any
    ): Promise<FailureAnalysis> {
        const prompt = `Test: ${testName}\nError: ${error.message}\nStack: ${error.stack}\nAnalyze this failure.`;

        // TODO: Replace with your custom LLM API call
        const analysis = await this.callCustomLLM(prompt, 'failure-analysis');

        // Parse the response and return structured analysis
        return {
            category: 'unknown',
            rootCause: analysis,
            suggestedFix: 'Review the error and page state',
            confidence: 0.5,
        };
    }

    /**
     * Compare screenshots using custom LLM
     * TODO: Implement your custom LLM vision API call here
     */
    async compareScreenshots(
        _baseline: string,
        _current: string,
        _taskType?: any
    ): Promise<{ similar: boolean; difference: number; analysis: string }> {
        // TODO: Replace with your custom LLM vision API call
        // This is a placeholder implementation
        return {
            similar: true,
            difference: 0,
            analysis: 'Custom LLM screenshot comparison not implemented',
        };
    }

    /**
     * Helper method to call your custom LLM API
     * TODO: Implement your actual API call here
     */
    private async callCustomLLM(prompt: string, _task: string): Promise<string> {
        try {
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
            };

            if (this.apiKey) {
                headers['Authorization'] = `Bearer ${this.apiKey}`;
            }

            const response = await fetch(this.endpoint, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    model: this.model,
                    messages: [
                        {
                            role: 'system',
                            content: 'You are a Playwright automation expert. Return ONLY a standard CSS selector or an XPath selector prefixed with "xpath=". NEVER output jQuery selectors like :contains() — use :has-text() for CSS or xpath=//tag[contains(text(),"text")] for XPath. Return ONLY the selector string, no explanation.',
                        },
                        {
                            role: 'user',
                            content: prompt
                        }
                    ],
                    temperature: 0.1,
                    top_p: 1,
                    stream: false
                }),
            });

            if (!response.ok) {
                throw new Error(`Custom LLM API error: ${response.statusText}`);
            }

            const data: any = await response.json();

            // Extract the response text from OpenAI-compatible response format
            return data.choices?.[0]?.message?.content || data.response || data.text || '';

        } catch (error) {
            console.error('Custom LLM API call failed:', error);
            throw new Error(`Failed to call custom LLM: ${error}`);
        }
    }
}
