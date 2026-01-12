import { Page } from '@playwright/test';
import OpenAI from 'openai';
import { BaseAIProvider } from './AIProvider';
import { FailureAnalysis, AITaskType, ModelTier, FrameworkConfig } from '../types';
import { CostTracker } from '../utils/CostTracker';

/**
 * OpenAI implementation of the AI provider
 * Implements advanced routing and cost control
 */
export class OpenAIProvider extends BaseAIProvider {
    private client: OpenAI;
    protected config: FrameworkConfig['ai'];
    private costTracker: CostTracker;

    // Default Routing Table
    private defaultRouting: Record<AITaskType, ModelTier> = {
        [AITaskType.ELEMENT_RESOLUTION]: ModelTier.CHEAP,
        [AITaskType.EXPECTATION_VALIDATION]: ModelTier.BALANCED,
        [AITaskType.FAILURE_ANALYSIS]: ModelTier.BALANCED,
        [AITaskType.VISUAL_REGRESSION]: ModelTier.PREMIUM,
        [AITaskType.HEALING]: ModelTier.PREMIUM,
        [AITaskType.FREE_TEXT_REASONING]: ModelTier.BALANCED
    };

    constructor(frameworkConfig: FrameworkConfig) {
        // Handle legacy config support by creating a synthetic AI config if missing
        const syntheticConfig = frameworkConfig.ai || {
            provider: 'openai',
            openai: {
                apiKey: frameworkConfig.openai?.apiKey || '',
                models: {
                    [ModelTier.CHEAP]: frameworkConfig.openai?.fastModel || 'gpt-3.5-turbo',
                    [ModelTier.BALANCED]: frameworkConfig.openai?.model || 'gpt-4-turbo-preview',
                    [ModelTier.PREMIUM]: frameworkConfig.openai?.model || 'gpt-4-vision-preview' // fallback to reuse
                }
            },
            costControl: frameworkConfig.costControl // preserve legacy cost control
        };

        super({ apiKey: syntheticConfig.openai?.apiKey || '' });

        this.config = syntheticConfig;
        this.client = new OpenAI({ apiKey: this.config.openai?.apiKey });

        // Initialize Cost Tracker with budget
        const budget = this.config.budgets?.perRun || frameworkConfig.costControl?.maxCostPerRun || 5.0;
        this.costTracker = new CostTracker(budget);
    }

    /**
     * Resolve model based on task type and routing table
     */
    private resolveModel(task: AITaskType): string {
        // 1. Get Tier from Routing Table (Config or Default)
        const routingTable = this.config?.routing || this.defaultRouting;
        const tier = routingTable[task] || ModelTier.BALANCED;

        // 2. Resolve Tier to Model ID
        const models = this.config?.openai?.models;
        let model = models?.[tier];

        // Fallback defaults if config missing
        if (!model) {
            switch (tier) {
                case ModelTier.CHEAP: model = 'gpt-3.5-turbo'; break;
                case ModelTier.BALANCED: model = 'gpt-4-turbo-preview'; break;
                case ModelTier.PREMIUM: model = 'gpt-4-vision-preview'; break;
            }
        }

        return model!;
    }

    /**
     * Track cost for a call
     */
    private trackCost(model: string, inputTokens: number, outputTokens: number) {
        const cost = CostTracker.estimateCost(model, inputTokens, outputTokens);
        this.costTracker.track(cost);
    }

    /**
     * Locate element using AI-powered natural language understanding
     */
    async locateElement(page: Page, description: string, taskType: AITaskType = AITaskType.ELEMENT_RESOLUTION): Promise<string> {
        const model = this.resolveModel(taskType);
        const context = await this.getPageContext(page);

        // Get all interactive elements with their attributes
        const elements = await page.evaluate(() => {
            const interactiveElements = document.querySelectorAll(
                'button, a, input, select, textarea, [role="button"], [onclick], [tabindex]'
            );

            return Array.from(interactiveElements).map((el, index) => {
                const rect = el.getBoundingClientRect();
                return {
                    index,
                    tag: el.tagName.toLowerCase(),
                    id: el.id,
                    class: el.className,
                    text: el.textContent?.trim().substring(0, 100),
                    type: (el as HTMLInputElement).type,
                    placeholder: (el as HTMLInputElement).placeholder,
                    ariaLabel: el.getAttribute('aria-label'),
                    name: (el as HTMLInputElement).name,
                    visible: rect.width > 0 && rect.height > 0,
                };
            }).filter(el => el.visible);
        });

        const prompt = `Given the following page context and interactive elements, identify the best CSS selector for the element described as: "${description}"

Page URL: ${context.url}
Page Title: ${context.title}

Interactive Elements:
${JSON.stringify(elements, null, 2)}

Return ONLY a valid CSS selector that uniquely identifies the element. If you need to use the index, use :nth-of-type() or similar.
Examples of valid responses:
- button.login-btn
- input[type="email"]
- a[href="/dashboard"]
- #submit-button

Response (CSS selector only):`;

        const response = await this.client.chat.completions.create({
            model: model,
            messages: [
                {
                    role: 'system',
                    content: 'You are an expert at identifying web elements. Return only valid CSS selectors, nothing else.',
                },
                {
                    role: 'user',
                    content: prompt,
                },
            ],
            temperature: 0.1,
            max_tokens: 100,
        });

        // Track Cost
        const inputTokens = response.usage?.prompt_tokens || 1000; // heuristic fallback
        const outputTokens = response.usage?.completion_tokens || 50;
        this.trackCost(model, inputTokens, outputTokens);

        const selector = response.choices[0]?.message?.content?.trim() || '';

        try {
            await page.waitForSelector(selector, { timeout: 2000 });
            return selector;
        } catch (error) {
            throw new Error(`AI-generated selector "${selector}" not found on page for description: "${description}"`);
        }
    }

    /**
     * Validate expectation using AI analysis
     */
    async validateExpectation(
        page: Page,
        expectation: string,
        screenshot?: string,
        taskType: AITaskType = AITaskType.EXPECTATION_VALIDATION
    ): Promise<boolean> {
        const model = this.resolveModel(taskType);
        const context = await this.getPageContext(page);
        const screenshotData = screenshot || (await this.takeScreenshot(page));

        const messages: any[] = [
            {
                role: 'system',
                content: 'You are an expert QA tester. Analyze the page state and determine if the expectation is met. Respond with only "true" or "false".',
            },
            {
                role: 'user',
                content: [
                    {
                        type: 'text',
                        text: `Page URL: ${context.url}
Page Title: ${context.title}

Visible Text:
${context.visibleText.substring(0, 2000)}

Expectation: ${expectation}

Does the current page state meet this expectation? Respond with only "true" or "false".`,
                    },
                    {
                        type: 'image_url',
                        image_url: {
                            url: `data:image/png;base64,${screenshotData}`,
                        },
                    },
                ],
            },
        ];

        const response = await this.client.chat.completions.create({
            model: model,
            messages,
            max_tokens: 10,
            temperature: 0,
        });

        // Track Cost
        const inputTokens = response.usage?.prompt_tokens || 2000;
        const outputTokens = response.usage?.completion_tokens || 10;
        this.trackCost(model, inputTokens, outputTokens);

        const result = response.choices[0]?.message?.content?.trim().toLowerCase();
        return result === 'true';
    }

    /**
     * Analyze test failure using AI
     */
    async analyzeFailure(
        testName: string,
        error: Error,
        screenshot?: string,
        pageContent?: string,
        taskType: AITaskType = AITaskType.FAILURE_ANALYSIS
    ): Promise<FailureAnalysis> {
        const model = this.resolveModel(taskType);

        const messages: any[] = [
            {
                role: 'system',
                content: `You are an expert QA engineer analyzing test failures. Provide structured failure analysis in JSON format with these fields:
- category: one of ["ui-regression", "timing-issue", "data-problem", "element-not-found", "assertion-failed", "unknown"]
- rootCause: brief explanation of what went wrong
- suggestedFix: actionable suggestion to fix the issue
- confidence: number between 0 and 1`,
            },
        ];

        const userContent: any[] = [
            {
                type: 'text',
                text: `Test Name: ${testName}

Error Message: ${error.message}

Stack Trace:
${error.stack}

${pageContent ? `Page Content:\n${pageContent.substring(0, 1000)}` : ''}

Analyze this test failure and provide a JSON response with category, rootCause, suggestedFix, and confidence.`,
            },
        ];

        if (screenshot) {
            userContent.push({
                type: 'image_url',
                image_url: {
                    url: `data:image/png;base64,${screenshot}`,
                },
            });
        }

        messages.push({
            role: 'user',
            content: userContent,
        });

        const response = await this.client.chat.completions.create({
            model: model,
            messages,
            response_format: { type: 'json_object' },
            temperature: 0.3,
        });

        // Track Cost
        const inputTokens = response.usage?.prompt_tokens || 3000;
        const outputTokens = response.usage?.completion_tokens || 150;
        this.trackCost(model, inputTokens, outputTokens);

        const analysis = JSON.parse(response.choices[0]?.message?.content || '{}');

        return {
            category: analysis.category || 'unknown',
            rootCause: analysis.rootCause || 'Unable to determine root cause',
            suggestedFix: analysis.suggestedFix || 'Review test implementation and page state',
            confidence: analysis.confidence || 0.5,
        };
    }

    /**
     * Compare screenshots using AI vision
     */
    async compareScreenshots(
        baseline: string,
        current: string,
        taskType: AITaskType = AITaskType.VISUAL_REGRESSION
    ): Promise<{ similar: boolean; difference: number; analysis: string }> {
        const model = this.resolveModel(taskType);

        const response = await this.client.chat.completions.create({
            model: model,
            messages: [
                {
                    role: 'system',
                    content: 'You are an expert at visual regression testing. Compare two screenshots and provide analysis in JSON format with fields: similar (boolean), difference (0-100), analysis (string).',
                },
                {
                    role: 'user',
                    content: [
                        {
                            type: 'text',
                            text: 'Compare these two screenshots. The first is the baseline, the second is current. Provide JSON with similar, difference (0-100), and analysis.',
                        },
                        {
                            type: 'image_url',
                            image_url: { url: `data:image/png;base64,${baseline}` },
                        },
                        {
                            type: 'image_url',
                            image_url: { url: `data:image/png;base64,${current}` },
                        },
                    ],
                },
            ],
            response_format: { type: 'json_object' },
            temperature: 0.2,
        });

        // Track Cost
        const inputTokens = response.usage?.prompt_tokens || 4000;
        const outputTokens = response.usage?.completion_tokens || 100;
        this.trackCost(model, inputTokens, outputTokens);

        const result = JSON.parse(response.choices[0]?.message?.content || '{}');

        return {
            similar: result.similar || false,
            difference: result.difference || 100,
            analysis: result.analysis || 'Unable to compare screenshots',
        };
    }
}
