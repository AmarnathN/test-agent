import { TestCase, TestContext } from '../types';

/**
 * Global test registry
 */
class TestRegistry {
    private tests: TestCase[] = [];

    register(test: TestCase): void {
        this.tests.push(test);
    }

    getTests(): TestCase[] {
        return this.tests;
    }

    clear(): void {
        this.tests = [];
    }

    filterByTags(tags: string[]): TestCase[] {
        if (tags.length === 0) return this.tests;

        return this.tests.filter(test =>
            test.tags?.some(tag => tags.includes(tag))
        );
    }
}

export const testRegistry = new TestRegistry();

/**
 * DSL function to define a test
 */
export function test(
    name: string,
    fn: (context: TestContext) => Promise<void>,
    options?: {
        timeout?: number;
        retries?: number;
        tags?: string[];
    }
): void {
    testRegistry.register({
        name,
        fn,
        timeout: options?.timeout,
        retries: options?.retries,
        tags: options?.tags,
    });
}

/**
 * DSL function to define a test suite (for organization)
 */
export function describe(suiteName: string, fn: () => void): void {
    // Execute the function to register tests
    fn();
}

/**
 * Skip a test
 */
test.skip = function (
    name: string,
    fn: (context: TestContext) => Promise<void>,
    options?: {
        timeout?: number;
        retries?: number;
        tags?: string[];
    }
): void {
    // Register but mark as skipped
    // This will be handled by the test runner
};

/**
 * Only run this test
 */
test.only = function (
    name: string,
    fn: (context: TestContext) => Promise<void>,
    options?: {
        timeout?: number;
        retries?: number;
        tags?: string[];
    }
): void {
    testRegistry.register({
        name: `[ONLY] ${name}`,
        fn,
        timeout: options?.timeout,
        retries: options?.retries,
        tags: options?.tags,
    });
};
