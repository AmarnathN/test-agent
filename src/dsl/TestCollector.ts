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

// Key under which the singleton lives in the global namespace
const REGISTRY_KEY = Symbol.for('__ai_test_registry__');

declare global {
    // eslint-disable-next-line no-var
    var __ai_test_registry__: TestRegistry | undefined;
}

// Re-use any already-created instance (e.g. from a different module resolution
// path such as src/ vs dist/) to avoid the "tests registered into one instance,
// runner reads from another" split-singleton problem.
export const testRegistry: TestRegistry =
    (global as unknown as Record<symbol, TestRegistry>)[REGISTRY_KEY] ??
    (() => {
        const instance = new TestRegistry();
        (global as unknown as Record<symbol, TestRegistry>)[REGISTRY_KEY] = instance;
        return instance;
    })();

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
export function describe(_suiteName: string, fn: () => void): void {
    // Execute the function to register tests
    fn();
}

/**
 * Skip a test
 */
test.skip = function (
    _name: string,
    _fn: (context: TestContext) => Promise<void>,
    _options?: {
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
