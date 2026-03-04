import { test } from '../../src/fixtures';

test('Example web automation test', async ({ agent }) => {
  // Navigate to example page
  await agent.navigate('https://example.com');

  // Validate expectations using AI
  await agent.expect('text "Example Domain" should be visible');

  // Verify click functionality
  await agent.click('More information link');

  // Check that navigation succeeded by looking for standard IANA text
  await agent.expect('text "IANA" should be visible');
});
