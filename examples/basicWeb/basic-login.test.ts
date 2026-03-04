import { test } from '../../src/fixtures';

/**
 * Example: Basic login flow test
 */
test('User can login successfully', async ({ agent }) => {
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
    await agent.expect('user profile icon should appear in header');
    await agent.expect('user profile icon should appear in header');
});

/**
 * Example: Login with invalid credentials
 */
test('Login fails with invalid credentials', async ({ agent }) => {
    await agent.navigate('https://example.com/login');

    await agent.fill('email input', 'invalid@example.com');
    await agent.fill('password field', 'wrongpassword');
    await agent.click('login button');

    // Expect error message
    await agent.expect('error message should be displayed');
    await agent.expect('user should remain on login page');
    await agent.expect('user should remain on login page');
});

/**
 * Example: Logout functionality
 */
test('User can logout', async ({ agent }) => {
    // Assume user is already logged in
    await agent.navigate('https://example.com/dashboard');

    // Click on user menu
    await agent.click('user profile icon');
    await agent.click('logout button');

    // Validate logout
    await agent.expect('user should be redirected to login page');
    await agent.expect('login form should be visible');
    await agent.expect('login form should be visible');
});
