import { test } from 'web-agentic-ai/playwright/fixtures';

/**
 * Example: Visual regression test for homepage
 */
test('Homepage visual regression', async ({ agent }) => {
    // Navigate to homepage
    await agent.navigate('https://example.com');

    // Wait for page to fully load
    await agent.wait(2000);

    // Take screenshot for comparison
    await agent.screenshot('homepage');

    // AI-powered visual validation
    await agent.expect('homepage layout should match design');
    await agent.expect('all images should be loaded');
    await agent.expect('navigation menu should be visible');
    await agent.expect('footer should be present');
}, {
    tags: ['visual', 'regression'],
});

/**
 * Example: Visual test for responsive design
 */
test('Mobile responsive design', async ({ agent, page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    await agent.navigate('https://example.com');
    await agent.wait(1000);

    // Validate mobile layout
    await agent.expect('mobile menu icon should be visible');
    await agent.expect('content should fit within viewport');
    await agent.expect('no horizontal scrollbar should appear');

    await agent.screenshot('mobile-view');
}, {
    tags: ['visual', 'responsive', 'mobile'],
});

/**
 * Example: Visual test for dark mode
 */
test('Dark mode visual test', async ({ agent }) => {
    await agent.navigate('https://example.com');

    // Enable dark mode
    await agent.click('theme toggle button');
    await agent.wait(500);

    // Validate dark mode
    await agent.expect('background should be dark');
    await agent.expect('text should be light colored');
    await agent.expect('all elements should be visible in dark mode');

    await agent.screenshot('dark-mode');
}, {
    tags: ['visual', 'theme'],
});

/**
 * Example: Compare before and after UI change
 */
test('Button hover state visual test', async ({ agent }) => {
    await agent.navigate('https://example.com');

    // Screenshot before hover
    await agent.screenshot('button-normal');

    // Hover over button
    await agent.hover('primary button');
    await agent.wait(300);

    // Screenshot after hover
    await agent.screenshot('button-hover');

    // AI validates hover effect
    await agent.expect('button should show hover effect');
    await agent.expect('button color should change on hover');
}, {
    tags: ['visual', 'interaction'],
});
