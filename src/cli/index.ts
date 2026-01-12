#!/usr/bin/env node

import { Command } from 'commander';
import { TestRunner } from '../executor/TestRunner';
import { ConfigLoader } from '../config/ConfigLoader';
import { HTMLReporter } from '../reporter/HTMLReporter';
import { JUnitReporter } from '../reporter/JUnitReporter';
import { glob } from 'glob';
import * as path from 'path';
import * as fs from 'fs';
import chalk from 'chalk';

const program = new Command();

program
    .name('ai-test')
    .description('AI-powered UI test automation framework')
    .version('1.0.0');

/**
 * Run tests command
 */
program
    .command('run')
    .description('Run test files')
    .argument('[pattern]', 'Test file pattern', '**/*.test.ts')
    .option('-c, --config <path>', 'Path to config file')
    .option('-h, --headless', 'Run in headless mode')
    .option('-b, --browser <browser>', 'Browser to use (chromium, firefox, webkit)')
    .option('-t, --timeout <ms>', 'Test timeout in milliseconds')
    .option('--tags <tags>', 'Run only tests with specified tags (comma-separated)')
    .action(async (pattern: string, options: any) => {
        try {
            console.log(chalk.blue('🤖 AI Test Framework\n'));

            // Load configuration
            const config = ConfigLoader.load(options.config);

            // Override with CLI options
            if (options.headless) config.headless = true;
            if (options.browser) config.browser = options.browser;
            if (options.timeout) config.timeout = parseInt(options.timeout);

            // Find test files
            const testFiles = await glob(pattern, {
                cwd: process.cwd(),
                absolute: true,
                ignore: ['**/node_modules/**', '**/dist/**'],
            });

            if (testFiles.length === 0) {
                console.log(chalk.yellow(`No test files found matching pattern: ${pattern}`));
                process.exit(0);
            }

            console.log(chalk.gray(`Found ${testFiles.length} test file(s)\n`));

            // Create test runner
            const runner = new TestRunner(config);

            // Run tests
            const results = await runner.runTests(testFiles);

            // Generate reports
            const reporters = [];

            if (config.reporters?.includes('html')) {
                const htmlReporter = new HTMLReporter(config.outputDir);
                await htmlReporter.onSuiteEnd(results);
                reporters.push('HTML');
            }

            if (config.reporters?.includes('junit')) {
                const junitReporter = new JUnitReporter(config.outputDir);
                await junitReporter.onSuiteEnd(results);
                reporters.push('JUnit');
            }

            console.log(chalk.gray(`\nReports generated: ${reporters.join(', ')}`));

            // Exit with appropriate code
            if (results.failed > 0) {
                console.log(chalk.red('\n✗ Tests failed'));
                process.exit(1);
            } else {
                console.log(chalk.green('\n✓ All tests passed'));
                process.exit(0);
            }

        } catch (error) {
            console.error(chalk.red('Error running tests:'), error);
            process.exit(1);
        }
    });

/**
 * Initialize project command
 */
program
    .command('init')
    .description('Initialize a new test project')
    .action(() => {
        console.log(chalk.blue('🤖 Initializing AI Test project...\n'));

        // Create directory structure
        const dirs = ['tests', 'ai-test-results'];
        dirs.forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
                console.log(chalk.green(`✓ Created ${dir}/`));
            }
        });

        // Create example config file
        const configContent = `module.exports = {
  // Browser settings
  browser: 'chromium', // 'chromium', 'firefox', or 'webkit'
  headless: true,
  viewport: { width: 1280, height: 720 },

  // Test execution
  timeout: 60000, // 60 seconds
  retries: 0,
  parallel: 1,

  // AI Provider
  aiProvider: 'openai', // 'openai' or 'custom'
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4-turbo-preview',
  },
  // Uncomment to use custom LLM
  // customLLM: {
  //   endpoint: process.env.CUSTOM_LLM_ENDPOINT,
  //   apiKey: process.env.CUSTOM_LLM_API_KEY,
  //   model: 'your-model',
  // },

  // Reporting
  reporters: ['html', 'junit'],
  outputDir: 'ai-test-results',

  // Screenshots and videos
  screenshot: 'only-on-failure', // 'on', 'off', 'only-on-failure'
  video: 'only-on-failure',

  // CI/CD
  deploymentGate: false,
};
`;

        if (!fs.existsSync('ai-test.config.js')) {
            fs.writeFileSync('ai-test.config.js', configContent);
            console.log(chalk.green('✓ Created ai-test.config.js'));
        }

        // Create example test file
        const exampleTest = `import { test } from '@ai-test/framework';

test('Example Login Test', async ({ agent }) => {
  // Navigate to login page
  await agent.navigate('https://example.com/login');

  // Fill in credentials using natural language
  await agent.fill('email input', 'user@example.com');
  await agent.fill('password field', 'password123');

  // Click login button
  await agent.click('login button');

  // Validate expectations using AI
  await agent.expect('user should be redirected to dashboard');
  await agent.expect('welcome message should be visible');
});

test('Example Search Test', async ({ agent }) => {
  await agent.navigate('https://example.com');
  
  await agent.fill('search box', 'AI testing');
  await agent.press('Enter');
  
  await agent.expect('search results should be displayed');
}, {
  tags: ['search', 'smoke'],
  timeout: 30000,
});
`;

        if (!fs.existsSync('tests/example.test.ts')) {
            fs.writeFileSync('tests/example.test.ts', exampleTest);
            console.log(chalk.green('✓ Created tests/example.test.ts'));
        }

        // Create .env.example
        const envExample = `# OpenAI Configuration
OPENAI_API_KEY=your-api-key-here

# Custom LLM Configuration (optional)
# CUSTOM_LLM_ENDPOINT=https://your-llm-endpoint.com/api
# CUSTOM_LLM_API_KEY=your-custom-llm-key
# CUSTOM_LLM_MODEL=your-model-name

# Test Configuration
AI_TEST_BROWSER=chromium
AI_TEST_HEADLESS=true
AI_TEST_TIMEOUT=60000
`;

        if (!fs.existsSync('.env.example')) {
            fs.writeFileSync('.env.example', envExample);
            console.log(chalk.green('✓ Created .env.example'));
        }

        console.log(chalk.blue('\n✨ Project initialized successfully!'));
        console.log(chalk.gray('\nNext steps:'));
        console.log(chalk.gray('  1. Copy .env.example to .env and add your API keys'));
        console.log(chalk.gray('  2. Run: npm install @ai-test/framework'));
        console.log(chalk.gray('  3. Run your tests: npx ai-test run'));
    });

/**
 * Config command
 */
program
    .command('config')
    .description('Display current configuration')
    .option('-c, --config <path>', 'Path to config file')
    .action((options: any) => {
        try {
            const config = ConfigLoader.load(options.config);
            console.log(chalk.blue('Current Configuration:\n'));
            console.log(JSON.stringify(config, null, 2));
        } catch (error) {
            console.error(chalk.red('Error loading configuration:'), error);
            process.exit(1);
        }
    });

/**
 * Report command
 */
program
    .command('report')
    .description('Open the latest HTML report')
    .option('-o, --output-dir <dir>', 'Output directory', 'ai-test-results')
    .action((options: any) => {
        const reportPath = path.join(options.outputDir, 'index.html');

        if (!fs.existsSync(reportPath)) {
            console.log(chalk.yellow('No report found. Run tests first.'));
            process.exit(1);
        }

        const open = require('open');
        open(reportPath);
        console.log(chalk.green('✓ Opening report in browser'));
    });

program.parse();
