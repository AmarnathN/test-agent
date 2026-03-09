module.exports = {
  // Adapter selection
  framework: 'playwright', // 'playwright' | 'cypress' | 'selenium'

  // Browser settings
  browser: 'chromium', // 'chromium', 'firefox', or 'webkit'
  headless: false,
  slowMo: 500,       // ms pause between each action — set to 0 for full speed
  devtools: false,   // set to true to open DevTools automatically
  viewport: { width: 1280, height: 720 },

  // Test execution
  timeout: 60000, // 60 seconds
  retries: 0,
  parallel: 1,

  // AI Provider
  aiProvider: 'custom', // 'openai' or 'custom'
  // openai: {
  //   apiKey: process.env.OPENAI_API_KEY,
  //   model: 'gpt-4-turbo-preview',
  // },
  // Uncomment to use custom LLM
  customLLM: {
    endpoint: process.env.CUSTOM_LLM_ENDPOINT,
    apiKey: process.env.CUSTOM_LLM_API_KEY,
    model: process.env.CUSTOM_LLM_MODEL,
  },

  // Reporting
  reporters: ['html', 'junit'],
  outputDir: 'ai-test-results',

  // Screenshots and videos
  screenshot: 'only-on-failure', // 'on', 'off', 'only-on-failure'
  video: 'only-on-failure',

  // CI/CD
  deploymentGate: false,
};
