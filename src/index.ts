// Main framework exports
export { test, describe } from './dsl/TestCollector';
export { ConfigLoader } from './config/ConfigLoader';
export { HTMLReporter } from './reporter/HTMLReporter';
export { JUnitReporter } from './reporter/JUnitReporter';
export { PipelineIntegration } from './ci/PipelineIntegration';

// Type exports
export type {
    TestCase,
    TestContext,
    TestResult,
    TestSuiteResult,
    BrowserAgent,
    FrameworkConfig,
    AIProvider,
    FailureAnalysis,
    Reporter,
} from './types';
