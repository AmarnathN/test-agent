import { BaseAIProvider } from './AIProvider';
import { BrowserController, FailureAnalysis } from '../types';
import { CostTracker } from '../utils/CostTracker';

/**
 * Template for custom LLM provider implementation
 * Replace the API calls with your custom LLM endpoint
 */
export class CustomLLMProvider extends BaseAIProvider {
    private endpoint: string;
    private apiKey?: string;
    private model: string;
    private costTracker: CostTracker;
    private inputCostPer1k: number;
    private outputCostPer1k: number;
    private totalInputTokens: number = 0;
    private totalOutputTokens: number = 0;

    constructor(config: {
        endpoint: string;
        apiKey?: string;
        model?: string;
        maxCostPerRun?: number;
        inputCostPer1k?: number;
        outputCostPer1k?: number;
    }) {
        super(config);
        this.endpoint = config.endpoint;
        this.apiKey = config.apiKey;
        this.model = config.model || 'default';
        this.costTracker = new CostTracker(config.maxCostPerRun ?? 5.0);

        // Allow explicit pricing override for non-OpenAI-compatible models.
        this.inputCostPer1k = config.inputCostPer1k ?? this.parseRateFromEnv('CUSTOM_LLM_INPUT_COST_PER_1K', 0.01);
        this.outputCostPer1k = config.outputCostPer1k ?? this.parseRateFromEnv('CUSTOM_LLM_OUTPUT_COST_PER_1K', 0.03);
    }

    /**
     * Locate element using custom LLM
     * TODO: Implement your custom LLM API call here
     */
    async locateElement(controller: BrowserController, description: string, _taskType?: any): Promise<{ selector: string, model: string }> {
        // Get all interactive elements
        const elements = await controller.evaluate(() => {
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
        const prompt = `Identify CSS selector for: "${description}"\nElements: ${JSON.stringify(elements)} `;
        const selector = (await this.callCustomLLM(prompt, 'element-location')).text;

        // Validate selector
        try {
            await controller.waitForSelector(selector, { timeout: 2000 });
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
        controller: BrowserController,
        expectation: string,
        _screenshot?: string,
        _taskType?: any
    ): Promise<boolean> {
        const context = await this.getPageContext(controller);

        // TODO: Replace with your custom LLM API call
        // If your LLM supports vision, include the screenshot
        const prompt = `Page: ${context.url} \nText: ${context.visibleText} \nExpectation: ${expectation} \nIs this met ? `;
        const result = (await this.callCustomLLM(prompt, 'expectation-validation')).text;

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
        const prompt = `Test: ${testName} \nError: ${error.message} \nStack: ${error.stack} \nAnalyze this failure.`;

        // TODO: Replace with your custom LLM API call
        const analysis = (await this.callCustomLLM(prompt, 'failure-analysis')).text;

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
    private async callCustomLLM(
        prompt: string,
        _task: string
    ): Promise<{ text: string; inputTokens: number; outputTokens: number; model: string }> {
        try {
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
            };

            if (this.apiKey) {
                headers['Authorization'] = `Bearer ${this.apiKey} `;
            }

            const response = await fetch(this.endpoint, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    model: this.model,
                    messages: [
                        {
                            role: 'system',
                            content: 'You are a browser automation expert. Return ONLY a standard CSS selector or an XPath selector prefixed with "xpath=". NEVER output jQuery selectors like :contains() or framework-specific selector engines. Return ONLY the selector string, no explanation.',
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
                throw new Error(`Custom LLM API error: ${response.statusText} `);
            }

            const data: any = await response.json();

            const usage = this.extractUsage(data);
            const modelFromResponse = (data.model || this.model || 'custom').toString();
            this.totalInputTokens += usage.inputTokens;
            this.totalOutputTokens += usage.outputTokens;
            const cost = this.estimateCustomCost(modelFromResponse, usage.inputTokens, usage.outputTokens);
            this.costTracker.track(cost);

            // Extract the response text from OpenAI-compatible response format
            return {
                text: data.choices?.[0]?.message?.content || data.response || data.text || '',
                inputTokens: usage.inputTokens,
                outputTokens: usage.outputTokens,
                model: modelFromResponse,
            };

        } catch (error) {
            console.error('Custom LLM API call failed:', error);
            throw new Error(`Failed to call custom LLM: ${error} `);
        }
    }

    private parseRateFromEnv(envVar: string, defaultRate: number): number {
        const raw = process.env[envVar];
        if (!raw) return defaultRate;
        const parsed = Number(raw);
        return Number.isFinite(parsed) && parsed >= 0 ? parsed : defaultRate;
    }

    private extractUsage(data: any): { inputTokens: number; outputTokens: number } {
        // OpenAI-compatible usage
        const promptTokens = Number(data?.usage?.prompt_tokens ?? data?.usage?.input_tokens ?? 0);
        const completionTokens = Number(data?.usage?.completion_tokens ?? data?.usage?.output_tokens ?? 0);

        // Anthropic style usage
        const anthropicInput = Number(data?.usage?.input_tokens ?? 0);
        const anthropicOutput = Number(data?.usage?.output_tokens ?? 0);

        // Gemini style usage metadata
        const geminiInput = Number(data?.usageMetadata?.promptTokenCount ?? 0);
        const geminiOutput = Number(data?.usageMetadata?.candidatesTokenCount ?? 0);

        const inputTokens = Math.max(0, promptTokens, anthropicInput, geminiInput);
        const outputTokens = Math.max(0, completionTokens, anthropicOutput, geminiOutput);

        return { inputTokens, outputTokens };
    }

    private estimateCustomCost(model: string, inputTokens: number, outputTokens: number): number {
        // If model name matches known pricing map, reuse shared estimator.
        const mappedCost = CostTracker.estimateCost(model, inputTokens, outputTokens);

        // estimateCost falls back to GPT-4 pricing; use custom rates when model appears unknown.
        const looksLikeKnownModel = /(gpt-|claude|gemini)/i.test(model);
        if (looksLikeKnownModel) {
            return mappedCost;
        }

        return (this.inputCostPer1k * inputTokens / 1000) + (this.outputCostPer1k * outputTokens / 1000);
    }

    /**
     * Get the total cost spent by this provider
     */
    getSpent(): number {
        return this.costTracker.getSpent();
    }

    getUsage(): { inputTokens: number; outputTokens: number } {
        return {
            inputTokens: this.totalInputTokens,
            outputTokens: this.totalOutputTokens,
        };
    }
}
