import OpenAI from 'openai';
import { BaseAIProvider } from './AIProvider';
import { BrowserController, FailureAnalysis, AITaskType, ModelTier, FrameworkConfig } from '../types';
import { CostTracker } from '../utils/CostTracker';

/**
 * OpenAI implementation of the AI provider
 * Implements advanced routing and cost control
 */
export class OpenAIProvider extends BaseAIProvider {
    private client: OpenAI;
    protected config: FrameworkConfig['ai'];
    private costTracker: CostTracker;
    private totalInputTokens: number = 0;
    private totalOutputTokens: number = 0;

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
        this.totalInputTokens += inputTokens;
        this.totalOutputTokens += outputTokens;
        const cost = CostTracker.estimateCost(model, inputTokens, outputTokens);
        this.costTracker.track(cost);
    }

    /**
     * Locate element using AI-powered natural language understanding
     */
    async locateElement(controller: BrowserController, description: string, taskType?: AITaskType): Promise<{ selector: string, model: string }> {
        const model = this.resolveModel(taskType || AITaskType.ELEMENT_RESOLUTION);
        const context = await this.getPageContext(controller);

        // 1. Interactive elements (buttons, inputs, links, etc.)
        const interactiveElements = await controller.evaluate(() => {
            const els = document.querySelectorAll(
                'button, a, input, select, textarea, [role="button"], [onclick], [tabindex]'
            );
            return Array.from(els).map((el, index) => {
                const rect = el.getBoundingClientRect();
                return {
                    index,
                    kind: 'interactive',
                    tag: el.tagName.toLowerCase(),
                    id: el.id || undefined,
                    name: (el as HTMLInputElement).name || undefined,
                    type: (el as HTMLInputElement).type || undefined,
                    placeholder: (el as HTMLInputElement).placeholder || undefined,
                    ariaLabel: el.getAttribute('aria-label') || undefined,
                    role: el.getAttribute('role') || undefined,
                    text: el.textContent?.trim().substring(0, 80) || undefined,
                    dataCy: el.getAttribute('data-cy') || undefined,
                    dataTestId: el.getAttribute('data-testid') || undefined,
                    visible: rect.width > 0 && rect.height > 0,
                };
            }).filter(el => el.visible);
        });

        // 2. Display/text elements: toasts, alerts, modals, error banners, etc.
        const displayElements = await controller.evaluate(() => {
            const DISPLAY_SELECTORS = [
                '[role="alert"]',
                '[role="status"]',
                '[role="dialog"]',
                '[role="tooltip"]',
                '[role="log"]',
                '[aria-live]',
                '.toast, .Toastify__toast, [class*="toast"]',
                '.alert, [class*="alert"]',
                '.error, [class*="error"]',
                '.modal, [class*="modal"]',
                '.notification, [class*="notification"]',
                '.banner, [class*="banner"]',
                'p, span, h1, h2, h3, h4, li',   // text nodes — filtered by content below
            ].join(', ');

            const seen = new Set<Element>();
            return Array.from(document.querySelectorAll(DISPLAY_SELECTORS))
                .filter(el => {
                    if (seen.has(el)) return false;
                    seen.add(el);
                    const rect = el.getBoundingClientRect();
                    const text = el.textContent?.trim() ?? '';
                    // Only include elements with meaningful short text content
                    return rect.width > 0 && rect.height > 0 && text.length > 2 && text.length < 300;
                })
                .map((el, index) => {
                    const rect = el.getBoundingClientRect();
                    return {
                        index,
                        kind: 'display',
                        tag: el.tagName.toLowerCase(),
                        id: el.id || undefined,
                        role: el.getAttribute('role') || undefined,
                        ariaLabel: el.getAttribute('aria-label') || undefined,
                        ariaLive: el.getAttribute('aria-live') || undefined,
                        dataTestId: el.getAttribute('data-testid') || undefined,
                        dataCy: el.getAttribute('data-cy') || undefined,
                        className: el.className || undefined,
                        text: el.textContent?.trim().substring(0, 150),
                        visible: rect.width > 0 && rect.height > 0,
                    };
                });
        });

        // Extract any quoted text from the description to build a dynamic per-request constraint
        const quotedInDescription = description.match(/["'""]([^"'""]{2,})["'""]/)?.[1] ?? null;

        const textConstraintBlock = quotedInDescription
            ? `\n⛔ MANDATORY for THIS request: the description explicitly names the text "${quotedInDescription}".\n   Your selector MUST include: has - text("${quotedInDescription}").\n   Example: [role = "alert"]: has - text("${quotedInDescription}") \n   A selector without this text is INCORRECT and will be rejected.\n`
            : '';

        const textConstraintFooter = quotedInDescription
            ? `\nFINAL REMINDER: your selector MUST include: has - text("${quotedInDescription}").Do NOT return [role = "alert"] or any selector that omits this text.`
            : '';

        const prompt = `You are an expert at writing STABLE, NON - FLAKY selectors for Playwright automated testing.
    ${textConstraintBlock}
Your task: return exactly ONE selector that uniquely identifies the element described as: "${description}"

ALLOWED SELECTOR STRATEGIES(in priority order):

--- FOR INTERACTIVE ELEMENTS(buttons, inputs, links)-- -
    1. CSS: [data - testid="..."] or[data - cy= "..."]
2. CSS: #id
3. CSS: input[type = "email"], input[type = "password"], button[type = "submit"]
4. CSS: [name = "fieldname"]
5. CSS: [aria - label="..."]
6. CSS: [placeholder = "..."]

--- FOR DISPLAY ELEMENTS(toasts, alerts, errors, modals, banners)-- -
    1. CSS: [data - testid="..."] or[data - cy= "..."]
2. CSS: [role = "alert"], [role = "status"], [role = "dialog"]
3. CSS: [aria - live="polite"] or[aria - live= "assertive"]
4. CSS + Playwright extension: : has - text("exact text")  — e.g.li: has - text("Login failed")
5. XPath: xpath =//TYPE[contains(text(),'TEXT')]  — e.g. xpath=//div[contains(text(),'Login Failed')]
    6. CSS: [class*= "semantic-class-name"](partial class — only semantic names, not Tailwind utilities)

⚠️  CRITICAL TEXT RULE:
If the description mentions specific text in quotes, you MUST embed that text in the selector.
NEVER return a bare[role = "alert"] — it matches any alert, not the specific one.

    FORBIDDEN — NEVER OUTPUT THESE:
- jQuery selectors: : contains(), : eq(), : first, : last
    - Playwright text engine: text = "..."(use : has - text() or XPath)
        - Positional: li: nth - of - type(n), div: nth - child(n)
            - Long Tailwind class chains: button.w - full.mt - 6.bg - blue - 500
                - Generic structural selectors when specific text was named in the description

EXAMPLES:
  ✓ input[type = "email"]
  ✓ button[type = "submit"]
  ✓[role = "alert"]: has - text("Login Success")
  ✓[role = "alert"]: has - text("Login Failed")
  ✓[data - testid="error-toast"]
  ✓ li: has - text("Invalid credentials")
  ✓ xpath =//div[@role="alert"][contains(text(),'Login Failed')]
  ✗ li: contains("Login failed")
  ✗[role = "alert"]   ← wrong when description specifies text

Page URL: ${context.url}

--- INTERACTIVE ELEMENTS-- -
    ${JSON.stringify(interactiveElements, null, 2)}

--- DISPLAY / TEXT ELEMENTS(toasts, alerts, modals, error messages)-- -
    ${JSON.stringify(displayElements, null, 2)}
${textConstraintFooter}
Respond with ONLY the selector string.No markdown, no explanation, no backticks.`;



        const response = await this.client.chat.completions.create({
            model: model,
            messages: [
                {
                    role: 'system',
                    content: 'You are a Playwright automation expert. Return ONLY a standard CSS selector or an XPath selector prefixed with "xpath=". NEVER output jQuery selectors like :contains() — use :has-text() for CSS or xpath=//tag[contains(text(),"text")] for XPath. Return ONLY the selector string, no explanation.',
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

        let rawSelector = response.choices[0]?.message?.content?.trim() || '';
        // Strip accidental markdown code fences
        rawSelector = rawSelector.replace(/^`+| `+$/g, '').trim();
        // Strip label prefixes the AI sometimes copies from prompt examples
        // e.g. "CSS: input[type='email']" → "input[type='email']"
        //      "XPath: //div[...]"        → "xpath=//div[...]"
        rawSelector = rawSelector.replace(/^(?:✓\s*)?CSS:\s*/i, '');
        rawSelector = rawSelector.replace(/^(?:✓\s*)?XPath:\s*/i, 'xpath=');

        // ── Sanitize: convert jQuery :contains() to Playwright :has-text() ──
        const sanitized = rawSelector
            .replace(/:contains\(['"]([^'"]+)['"]\)/g, ':has-text("$1")');  // li:contains("x") → li:has-text("x")

        // Build a list of candidates to try in order
        const candidates: string[] = [sanitized];

        // If the description itself contains quoted text (e.g. '"Login Failed" alert'),
        // try XPath text-contains as a well-supported fallback (no jQuery, no Playwright-specific engines)
        const quotedTextMatch = description.match(/["']([^"']{2,})["']/);
        if (quotedTextMatch) {
            const txt = quotedTextMatch[1].replace(/'/g, "\\'"); // escape for XPath
            candidates.push(`xpath =//*[contains(text(),'${txt}')]`);
            candidates.push(`:has-text("${txt.replace(/"/g, '')}")`);
        }

        // Also try [role="alert"] as a last-resort for alert/error/toast descriptions
        if (/alert|error|toast|notification|warning|success/i.test(description)) {
            candidates.push('[role="alert"]', '[role="status"]', '[aria-live]');
        }

        for (const candidate of candidates) {
            try {
                await controller.waitForSelector(candidate, { timeout: 2000 });
                return { selector: candidate, model }; // ← first one that works wins
            } catch {
                // try next candidate
            }
        }

        throw new Error(
            `AI-generated selector "${rawSelector}" not found on page for description: "${description}"` +
            (candidates.length > 1 ? ` (also tried: ${candidates.slice(1).join(', ')})` : '')
        );
    }

    /**
     * Validate expectation using AI analysis
     */
    async validateExpectation(
        controller: BrowserController,
        expectation: string,
        screenshot?: string,
        taskType?: AITaskType
    ): Promise<boolean> {
        const model = this.resolveModel(taskType || AITaskType.EXPECTATION_VALIDATION);
        const context = await this.getPageContext(controller);
        const isVisionModel = /gpt-4o|vision|gemini|claude-3/i.test(model);
        const screenshotData = screenshot || (isVisionModel ? await this.takeScreenshot(controller) : undefined);

        const textContent: any = {
            type: 'text',
            text: `Page URL: ${context.url}
Page Title: ${context.title}

Visible Text:
${context.visibleText.substring(0, 2000)}

Expectation: ${expectation}

Does the current page state meet this expectation? Respond with only "true" or "false".`,
        };

        const userMessageContent: any[] = [textContent];
        if (screenshotData && isVisionModel) {
            userMessageContent.push({
                type: 'image_url',
                image_url: { url: `data:image/png;base64,${screenshotData}` },
            });
        }

        const messages: any[] = [
            {
                role: 'system',
                content: 'You are an expert QA tester. Analyze the page state and determine if the expectation is met. Respond with only "true" or "false".',
            },
            { role: 'user', content: userMessageContent },
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

        // Only include screenshot if the model supports vision
        // (gpt-4o, gpt-4-vision-preview, gpt-4-turbo with vision, etc.)
        const isVisionModel = /gpt-4o|vision|gemini|claude-3/i.test(model);
        if (screenshot && isVisionModel) {
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
