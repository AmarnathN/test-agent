export type SupportedFramework = 'playwright' | 'cypress' | 'selenium';

export interface FrameworkRunCommandInput {
    pattern?: string;
    options: {
        headless?: boolean;
        browser?: string;
        timeout?: string;
        config?: string;
    };
}

export interface FrameworkRunCommand {
    bin: string;
    args: string[];
    env: NodeJS.ProcessEnv;
    reportHint: string;
}

export interface FrameworkAdapter {
    framework: SupportedFramework;
    displayName: string;
    buildRunCommand(input: FrameworkRunCommandInput): FrameworkRunCommand;
}

function isSupportedFramework(value: string): value is SupportedFramework {
    return value === 'playwright' || value === 'cypress' || value === 'selenium';
}

export function getFrameworkAdapter(framework: string): FrameworkAdapter {
    if (!isSupportedFramework(framework)) {
        throw new Error(`Unsupported framework "${framework}". Supported frameworks: playwright, cypress, selenium`);
    }

    switch (framework) {
        case 'playwright': {
            const { playwrightAdapter } = require('./playwright/cli') as {
                playwrightAdapter: FrameworkAdapter;
            };
            return playwrightAdapter;
        }
        case 'cypress':
            throw new Error('Cypress adapter is not implemented yet. Add src/adapters/cypress to enable it.');
        case 'selenium':
            throw new Error('Selenium adapter is not implemented yet. Add src/adapters/selenium to enable it.');
    }
}