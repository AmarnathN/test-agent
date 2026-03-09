import { FrameworkAdapter, FrameworkRunCommandInput } from '../index';

function buildPlaywrightRunCommand(input: FrameworkRunCommandInput) {
    const args: string[] = ['playwright', 'test'];
    if (input.pattern) args.push(input.pattern);

    const env: NodeJS.ProcessEnv = { ...process.env };
    if (input.options.headless) {
        env['PWHEADLESS'] = 'true';
    }
    if (input.options.browser) args.push('--project', input.options.browser);
    if (input.options.timeout) args.push('--timeout', input.options.timeout);
    if (input.options.config) args.push('--config', input.options.config);

    return {
        bin: 'npx',
        args,
        env,
        reportHint: 'npx playwright show-report',
    };
}

export const playwrightAdapter: FrameworkAdapter = {
    framework: 'playwright',
    displayName: 'Playwright',
    buildRunCommand: buildPlaywrightRunCommand,
};