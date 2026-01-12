/**
 * Cost tracking and budget enforcement
 */
export class CostTracker {
    private spent: number = 0;
    private maxCostPerRun: number;

    constructor(maxCostPerRun: number = 5.0) {
        this.maxCostPerRun = maxCostPerRun;
    }

    /**
     * Track usage and enforce limits
     */
    track(cost: number): void {
        this.spent += cost;
        if (this.spent > this.maxCostPerRun) {
            throw new Error(`AI budget exceeded for test run: $${this.spent.toFixed(4)} > $${this.maxCostPerRun.toFixed(2)}`);
        }
    }

    /**
     * Get current spend
     */
    getSpent(): number {
        return this.spent;
    }

    /**
     * Estimate cost for a model call (rough heuristics)
     */
    static estimateCost(model: string, inputTokens: number, outputTokens: number): number {
        // Pricing per 1k tokens (approximate as of 2024)
        const pricing: Record<string, { in: number, out: number }> = {
            'gpt-3.5-turbo': { in: 0.0005, out: 0.0015 },
            'gpt-4-turbo': { in: 0.01, out: 0.03 },
            'gpt-4-vision-preview': { in: 0.01, out: 0.03 }, // Vision has base costs too
            'gpt-4o': { in: 0.005, out: 0.015 },
        };

        // Default to GPT-4 pricing if unknown
        const rate = Object.entries(pricing).find(([key]) => model.includes(key))?.[1] || pricing['gpt-4-turbo'];

        return (rate.in * inputTokens / 1000) + (rate.out * outputTokens / 1000);
    }
}
