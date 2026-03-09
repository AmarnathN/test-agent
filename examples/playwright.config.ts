import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';

dotenv.config();

export default defineConfig({
    // Config file lives in examples/, so use current directory for test discovery.
    testDir: '.',

    /* Timeout per test */
    timeout: 60_000,

    /* Run tests sequentially (AI calls can be expensive) */
    workers: 1,

    /* Reporter: Playwright's built-in HTML reporter */
    reporter: [
        ['html', { open: 'never', outputFolder: 'playwright-report' }],
        ['list'],   // prints pass/fail to terminal
    ],

    use: {
        /* Base URL for agent.navigate() if you use relative paths */
        // baseURL: 'https://ap-frontend-mu.vercel.app',

        /* Collect traces on failure: viewable in the HTML report */
        trace: 'on-first-retry',

        /* Screenshots on failure */
        screenshot: 'only-on-failure',

        /* Video on failure */
        video: 'on-first-retry',

        /* Headed mode — change to true to see the browser */
        headless: false,

        /* Slow down actions so you can watch */
        launchOptions: {
            slowMo: 500,
        },
    },

    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
});
