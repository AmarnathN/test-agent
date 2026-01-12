import { Page } from '@playwright/test';
import OpenAI from 'openai';
import { BaseAIProvider } from './AIProvider';
import { FailureAnalysis } from '../types';

/**
 * OpenAI implementation of the AI provider
 * Uses GPT-4 Vision for screenshot analysis and GPT-4 for text-based tasks
 */
export class OpenAIProvider extends BaseAIProvider {
    private client: OpenAI;
    private model: string;
    private visionModel: string;

    constructor(config: { apiKey: string; model?: string; visionModel?: string }) {
        super(config);
        this.client = new OpenAI({ apiKey: config.apiKey });
        this.model = config.model || 'gpt-4-turbo-preview';
        this.visionModel = config.visionModel || 'gpt-4-vision-preview';
    }

    /**
     * Locate element using AI-powered natural language understanding
     */
    async locateElement(page: Page, description: string): Promise<string> {
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
            model: this.model,
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

        const selector = response.choices[0]?.message?.content?.trim() || '';

        // Validate that the selector exists on the page
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
        screenshot?: string
    ): Promise<boolean> {
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
            model: this.visionModel,
            messages,
            max_tokens: 10,
            temperature: 0,
        });

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
        pageContent?: string
    ): Promise<FailureAnalysis> {
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
            model: screenshot ? this.visionModel : this.model,
            messages,
            response_format: { type: 'json_object' },
            temperature: 0.3,
        });

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
        current: string
    ): Promise<{ similar: boolean; difference: number; analysis: string }> {
        const response = await this.client.chat.completions.create({
            model: this.visionModel,
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

        const result = JSON.parse(response.choices[0]?.message?.content || '{}');

        return {
            similar: result.similar || false,
            difference: result.difference || 100,
            analysis: result.analysis || 'Unable to compare screenshots',
        };
    }
}
