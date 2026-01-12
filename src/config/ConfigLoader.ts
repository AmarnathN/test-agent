import { FrameworkConfig } from '../types';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Configuration loader for the framework
 */
export class ConfigLoader {
    private static DEFAULT_CONFIG: FrameworkConfig = {
        browser: 'chromium',
        headless: true,
        viewport: { width: 1280, height: 720 },
        timeout: 60000,
        retries: 0,
        parallel: 1,
        aiProvider: 'openai',
        reporters: ['html', 'junit'],
        outputDir: 'ai-test-results',
        screenshot: 'only-on-failure',
        video: 'only-on-failure',
        ci: false,
        deploymentGate: false,
    };

    /**
     * Load configuration from file or environment
     */
    static load(configPath?: string): FrameworkConfig {
        let config = { ...this.DEFAULT_CONFIG };

        // Load from config file if exists
        if (configPath && fs.existsSync(configPath)) {
            const fileConfig = require(path.resolve(configPath));
            config = { ...config, ...fileConfig };
        } else {
            // Try default config file
            const defaultPath = path.join(process.cwd(), 'ai-test.config.js');
            if (fs.existsSync(defaultPath)) {
                const fileConfig = require(defaultPath);
                config = { ...config, ...fileConfig };
            }
        }

        // Override with environment variables
        config = this.loadFromEnv(config);

        // Validate configuration
        this.validate(config);

        return config;
    }

    /**
     * Load configuration from environment variables
     */
    private static loadFromEnv(config: FrameworkConfig): FrameworkConfig {
        if (process.env.AI_TEST_BROWSER) {
            config.browser = process.env.AI_TEST_BROWSER as any;
        }

        if (process.env.AI_TEST_HEADLESS) {
            config.headless = process.env.AI_TEST_HEADLESS === 'true';
        }

        if (process.env.AI_TEST_TIMEOUT) {
            config.timeout = parseInt(process.env.AI_TEST_TIMEOUT);
        }

        if (process.env.OPENAI_API_KEY) {
            config.aiProvider = 'openai';
            config.openai = {
                apiKey: process.env.OPENAI_API_KEY,
                model: process.env.OPENAI_MODEL,
            };
        }

        if (process.env.CUSTOM_LLM_ENDPOINT) {
            config.aiProvider = 'custom';
            config.customLLM = {
                endpoint: process.env.CUSTOM_LLM_ENDPOINT,
                apiKey: process.env.CUSTOM_LLM_API_KEY,
                model: process.env.CUSTOM_LLM_MODEL,
            };
        }

        // Detect CI environment
        if (process.env.CI || process.env.GITLAB_CI || process.env.GITHUB_ACTIONS) {
            config.ci = true;
            config.headless = true;
        }

        return config;
    }

    /**
     * Validate configuration
     */
    private static validate(config: FrameworkConfig): void {
        if (config.aiProvider === 'openai' && !config.openai?.apiKey) {
            throw new Error('OpenAI API key is required. Set OPENAI_API_KEY environment variable or configure in ai-test.config.js');
        }

        if (config.aiProvider === 'custom' && !config.customLLM?.endpoint) {
            throw new Error('Custom LLM endpoint is required when using custom AI provider');
        }

        if (!['chromium', 'firefox', 'webkit'].includes(config.browser || '')) {
            throw new Error(`Invalid browser: ${config.browser}. Must be chromium, firefox, or webkit`);
        }
    }
}
