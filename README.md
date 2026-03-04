# 🤖 AI Test Automation Framework

An AI-powered UI test automation framework for CI/CD pipelines that uses natural language to write and validate tests.

## Features

✨ **AI-Powered Testing**
- Natural language element location
- Intelligent expectation validation
- Automated failure analysis with root cause detection
- Visual regression testing with AI

💰 **Cost Optimized**
- Intelligent selector learning and caching
- 80-95% reduction in LLM API calls
- Persistent cache across test runs
- Smart fallback strategies before AI

🎯 **Developer-Friendly DSL**
- TypeScript-based test syntax
- Intuitive API with autocomplete
- No complex selectors needed

📊 **Comprehensive Reporting**
- Beautiful HTML reports with AI insights
- JUnit XML for CI/CD integration
- Screenshots and video recordings
- Failure analysis with suggested fixes

🔄 **CI/CD Integration**
- GitLab CI and GitHub Actions support
- Deployment gates
- Automated test execution
- Artifact management

🔌 **Flexible AI Provider**
- OpenAI GPT-4 Vision (default)
- Easy integration with custom LLMs
- Abstracted provider interface

## Installation

```bash
npm install web-agentic-ai
```

## Quick Start

### 1. Initialize Project

```bash
npx ai-test init
```

This creates:
- `ai-test.config.js` - Framework configuration
- `examples/` - Example test directory
- `examples/example.test.ts` - Example test file
- `.env.example` - Environment variables template

### 2. Configure API Key

Copy `.env.example` to `.env` and add your OpenAI API key:

```bash
OPENAI_API_KEY=your-api-key-here
```

### 3. Write Your First Test

Create `examples/login.test.ts`:

```typescript
import { test } from 'web-agentic-ai';

test('User can login', async ({ agent }) => {
  await agent.navigate('https://your-app.com/login');
  
  await agent.fill('email input', 'user@example.com');
  await agent.fill('password field', 'password123');
  await agent.click('login button');
  
  await agent.expect('user should be redirected to dashboard');
  await agent.expect('welcome message should be visible');
});
```

### 4. Run Tests

```bash
npx ai-test run
```

View the HTML report in `ai-test-results/index.html`

## Configuration

Edit `ai-test.config.js`:

```javascript
module.exports = {
  // Browser settings
  browser: 'chromium', // 'chromium', 'firefox', or 'webkit'
  headless: true,
  viewport: { width: 1280, height: 720 },

  // Test execution
  timeout: 60000,
  retries: 0,
  parallel: 1,

  // AI Provider
  aiProvider: 'openai',
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4-turbo-preview',
  },

  // AI Optimization (reduces costs by 80-95%)
  aiOptimization: {
    enableCache: true,        // Cache AI responses
    smartMode: true,          // Try fallbacks before AI
    cacheDir: '.ai-cache',
  },

  // Reporting
  reporters: ['html', 'junit'],
  outputDir: 'ai-test-results',

  // Screenshots and videos
  screenshot: 'only-on-failure',
  video: 'only-on-failure',
};
```

## Writing Tests

### Basic Test Structure

```typescript
import { test } from 'web-agentic-ai';

test('Test name', async ({ agent }) => {
  // Your test code
}, {
  tags: ['smoke', 'critical'],
  timeout: 30000,
});
```

### Available Actions

```typescript
// Navigation
await agent.navigate('https://example.com');

// Interactions (using natural language)
await agent.click('submit button');
await agent.fill('email input', 'user@example.com');
await agent.select('country dropdown', 'United States');
await agent.hover('menu item');

// Keyboard
await agent.press('Enter');

// Waiting
await agent.wait(1000); // milliseconds
await agent.waitFor('loading spinner', { state: 'hidden' });

// Expectations (AI-powered validation)
await agent.expect('user should be logged in');
await agent.expect('error message should not be visible');

// Screenshots
await agent.screenshot('checkout-page');

// Access Playwright page directly
const page = agent.getPage();
```

### Test Options

```typescript
test('Test name', async ({ agent }) => {
  // ...
}, {
  tags: ['smoke', 'auth'],      // Organize tests
  timeout: 60000,                // Override default timeout
  retries: 2,                    // Retry failed tests
});
```

## CI/CD Integration

### GitHub Actions

Create `.github/workflows/tests.yml`:

```yaml
name: AI Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
      
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      
      - name: Run tests
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        run: npx ai-test run
      
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: test-results
          path: ai-test-results/
```

### GitLab CI

Create `.gitlab-ci.yml`:

```yaml
stages:
  - test

ai-tests:
  stage: test
  image: mcr.microsoft.com/playwright:v1.40.0-focal
  script:
    - npm ci
    - npx playwright install chromium
    - npx ai-test run
  artifacts:
    when: always
    paths:
      - ai-test-results/
    reports:
      junit: ai-test-results/junit.xml
```

## Custom LLM Integration

To use your own LLM instead of OpenAI:

1. **Update configuration:**

```javascript
module.exports = {
  aiProvider: 'custom',
  customLLM: {
    endpoint: 'https://your-llm-api.com/v1/chat',
    apiKey: process.env.CUSTOM_LLM_API_KEY,
    model: 'your-model-name',
  },
};
```

2. **Implement custom provider:**

Edit `src/ai/CustomLLMProvider.ts` and implement the API calls for your LLM.

## CLI Commands

```bash
# Run tests
npx ai-test run [pattern]
npx ai-test run "examples/**/*.test.ts"
npx ai-test run --headless --browser firefox

# Initialize project
npx ai-test init

# View configuration
npx ai-test config

# Open latest report
npx ai-test report
```

## Examples

See the `examples/` directory for complete test examples:

- `basic-login.test.ts` - Login flow testing
- `e2e-checkout.test.ts` - Complete checkout process
- `visual-regression.test.ts` - Visual testing

## How It Works

1. **Natural Language Processing**: The AI analyzes your natural language descriptions and page content to locate elements
2. **Intelligent Validation**: Expectations are validated using AI vision and page analysis
3. **Failure Analysis**: When tests fail, AI analyzes screenshots and errors to provide root cause and fixes
4. **Reporting**: Results are compiled into beautiful HTML reports with AI insights

## Deployment Gates

Enable deployment gates to block deployments when tests fail:

```javascript
module.exports = {
  deploymentGate: true,
};
```

In your CI/CD pipeline, the framework will exit with code 1 if tests fail, preventing deployment.

## Best Practices

1. **Use descriptive element descriptions**: "primary submit button" instead of "button"
2. **Write clear expectations**: "user should see confirmation message" instead of "message visible"
3. **Tag your tests**: Use tags to organize and run specific test suites
4. **Take screenshots**: Capture important states for debugging and AI analysis
5. **Set appropriate timeouts**: Complex flows may need longer timeouts
6. **Use consistent descriptions**: Same description = cache hit, reducing LLM costs
7. **Commit cache for CI**: For 100% deterministic tests, commit `.ai-cache/` to version control

## Cost Optimization

The framework includes intelligent caching to reduce LLM API costs by **80-95%**:

-   **Selector Learning**: Remembers successful selectors and reuses them
-   **Smart Fallbacks**: Tries common patterns before calling AI
-   **Persistent Cache**: Saves learned selectors to disk (`.ai-cache/`)
-   **Selector Freezing**: Once AI resolves an element, it's frozen for deterministic behavior

**Cost Comparison:**
- Without optimization: ~$0.15-0.30 per test run
- With optimization: ~$0.01-0.05 per test run (after first run)

**Determinism:** Frozen selectors ensure tests are 100% repeatable and CI-friendly.

See [COST_OPTIMIZATION.md](COST_OPTIMIZATION.md) and [docs/DETERMINISM.md](docs/DETERMINISM.md) for detailed information.

## Troubleshooting

### Element not found
- Make the description more specific
- Ensure the element is visible when the action is performed
- Check if the page has fully loaded

### Expectation fails
- Verify the expectation is clear and specific
- Check if the page state matches your expectation
- Review the screenshot in the HTML report

### API rate limits
- Implement retry logic
- Consider using a custom LLM for higher throughput
- Cache AI responses for repeated tests

## Contributing

Contributions are welcome! Please see CONTRIBUTING.md for guidelines.

## License

MIT

## Support

- Documentation: [docs link]
- Issues: [GitHub Issues]
- Discussions: [GitHub Discussions]

---

Built with ❤️ using Playwright and AI
