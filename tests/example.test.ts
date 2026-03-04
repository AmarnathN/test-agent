import { test } from '../src/fixtures';

test('Example Login Pass Test', async ({ agent }) => {
  // Navigate to login page
  await agent.navigate('https://ap-frontend-mu.vercel.app/auth/login');

  // Fill in credentials using natural language
  await agent.fill('email input', 'user@example.com');
  await agent.fill('password field', 'password123');

  // Click login button
  await agent.click('Sign in button');

  // Validate expectations using AI
  // await agent.expect('Login Success alert message');
  await agent.expectVisibility('text "Login Success"');
});



test('Example Login Failure Test', async ({ agent }) => {
  // Navigate to login page
  await agent.navigate('https://ap-frontend-mu.vercel.app/auth/login');

  // Fill in credentials using natural language
  await agent.fill('email input', 'user@example.com');
  await agent.fill('password field', 'password123');

  // Click login button
  await agent.click('Sign in button');

  // Validate expectations using AI
  // await agent.expect('Login failed alert message');
  await agent.expectVisibility('text "Login Failed"');
});
