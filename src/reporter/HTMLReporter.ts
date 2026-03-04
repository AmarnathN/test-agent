import { TestSuiteResult, Reporter, TestCase, TestResult, TestStep } from '../types';
import * as fs from 'fs';
import * as path from 'path';

/**
 * HTML Reporter for generating beautiful test reports
 */
export class HTMLReporter implements Reporter {
  private outputDir: string;
  private testResults: TestResult[] = [];

  constructor(outputDir: string = 'ai-test-results') {
    this.outputDir = outputDir;
    this.ensureOutputDir();
  }

  onTestStart(_test: TestCase): void {
    // Could be used for real-time updates
  }

  onTestEnd(result: TestResult): void {
    this.testResults.push(result);
  }

  async onSuiteEnd(suiteResult: TestSuiteResult): Promise<void> {
    const html = this.generateHTML(suiteResult);
    const reportPath = path.join(this.outputDir, 'index.html');

    fs.writeFileSync(reportPath, html);

    // Save screenshots
    await this.saveScreenshots(suiteResult);

    console.log(`\n📊 HTML Report generated: ${reportPath}`);
    console.log(`   Open with: open ${reportPath}`);
  }

  private generateHTML(suiteResult: TestSuiteResult): string {
    const duration = suiteResult.endTime.getTime() - suiteResult.startTime.getTime();
    const passRate = ((suiteResult.passed / suiteResult.totalTests) * 100).toFixed(1);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI Test Report - ${suiteResult.suiteName}</title>
  <style>
    ${this.getStyles()}
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>🤖 AI Test Automation Report</h1>
      <div class="suite-name">${suiteResult.suiteName}</div>
      <div class="timestamp">${suiteResult.startTime.toLocaleString()}</div>
    </header>

    <div class="summary">
      <div class="stat-card total">
        <div class="stat-value">${suiteResult.totalTests}</div>
        <div class="stat-label">Total Tests</div>
      </div>
      <div class="stat-card passed">
        <div class="stat-value">${suiteResult.passed}</div>
        <div class="stat-label">Passed</div>
      </div>
      <div class="stat-card failed">
        <div class="stat-value">${suiteResult.failed}</div>
        <div class="stat-label">Failed</div>
      </div>
      <div class="stat-card skipped">
        <div class="stat-value">${suiteResult.skipped}</div>
        <div class="stat-label">Skipped</div>
      </div>
      <div class="stat-card duration">
        <div class="stat-value">${(duration / 1000).toFixed(2)}s</div>
        <div class="stat-label">Duration</div>
      </div>
      <div class="stat-card pass-rate">
        <div class="stat-value">${passRate}%</div>
        <div class="stat-label">Pass Rate</div>
      </div>
    </div>

    <div class="tests">
      ${suiteResult.results.map(result => this.generateTestCard(result)).join('\n')}
    </div>
  </div>

  <script>
    ${this.getScript()}
  </script>
</body>
</html>`;
  }

  private generateTestCard(result: TestResult): string {
    const statusIcon = result.status === 'passed' ? '✓' : result.status === 'failed' ? '✗' : '○';
    const statusClass = result.status;

    return `
    <div class="test-card ${statusClass}">
      <div class="test-header" onclick="toggleSteps(this)">
        <span class="status-icon">${statusIcon}</span>
        <span class="test-name">${result.name}</span>
        <span class="test-duration">${result.duration}ms</span>
        <span class="toggle-icon">▼</span>
      </div>
      
      ${result.tags ? `<div class="test-tags">${result.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}</div>` : ''}
      
      <div class="test-body">
        ${this.generateStepsHTML(result.steps)}

        ${result.error ? `
          <div class="error-section">
            <div class="error-title">Error:</div>
            <pre class="error-message">${this.escapeHtml(result.error.message)}</pre>
            ${result.error.stack ? `
              <details>
                <summary>Stack Trace</summary>
                <pre class="stack-trace">${this.escapeHtml(result.error.stack)}</pre>
              </details>
            ` : ''}
          </div>
        ` : ''}
        
        ${result.failureAnalysis ? `
          <div class="ai-analysis">
            <div class="analysis-title">🤖 AI Failure Analysis</div>
            <div class="analysis-content">
              <div class="analysis-row">
                <strong>Category:</strong> 
                <span class="category-badge">${result.failureAnalysis.category}</span>
              </div>
              <div class="analysis-row">
                <strong>Root Cause:</strong> ${result.failureAnalysis.rootCause}
              </div>
              <div class="analysis-row">
                <strong>Suggested Fix:</strong> ${result.failureAnalysis.suggestedFix}
              </div>
              <div class="analysis-row">
                <strong>Confidence:</strong> 
                <div class="confidence-bar">
                  <div class="confidence-fill" style="width: ${result.failureAnalysis.confidence * 100}%"></div>
                </div>
                ${(result.failureAnalysis.confidence * 100).toFixed(0)}%
              </div>
            </div>
          </div>
        ` : ''}
        
        ${result.screenshots.length > 0 ? `
          <div class="screenshots">
            <div class="screenshots-title">Screenshots (${result.screenshots.length})</div>
            <div class="screenshot-grid">
              ${result.screenshots.map((screenshot, index) => `
                <img src="data:image/png;base64,${screenshot}" 
                     alt="Screenshot ${index + 1}" 
                     class="screenshot-thumb"
                     onclick="openModal(this.src)">
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    </div>`;
  }

  private generateStepsHTML(steps: TestStep[]): string {
    if (!steps || steps.length === 0) return '';
    const rows = steps.map((step, i) => {
      const icon = step.status === 'passed' ? '✓' : step.status === 'failed' ? '✗' : '⟳';
      const cls = step.status;
      const dur = step.duration != null ? `${step.duration}ms` : '';
      return `
        <div class="step step-${cls}">
          <span class="step-num">${i + 1}</span>
          <span class="step-icon ${cls}">${icon}</span>
          <span class="step-action">${step.action}</span>
          <span class="step-desc">${this.escapeHtml(step.description)}</span>
          <span class="step-dur">${dur}</span>
          ${step.error ? `<div class="step-error">${this.escapeHtml(step.error)}</div>` : ''}
          ${step.screenshot ? `<img class="step-screenshot" src="data:image/png;base64,${step.screenshot}" onclick="openModal(this.src)" title="Step ${i + 1} screenshot">` : ''}
        </div>`;
    }).join('');
    return `<div class="steps-section"><div class="steps-title">Steps (${steps.length})</div><div class="steps-list">${rows}</div></div>`;
  }

  private getStyles(): string {
    return `
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }

      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        min-height: 100vh;
        padding: 20px;
      }

      .container {
        max-width: 1200px;
        margin: 0 auto;
      }

      header {
        background: white;
        padding: 30px;
        border-radius: 12px;
        box-shadow: 0 4px 6px rgba(0, 4px, 6px, 0.1);
        margin-bottom: 20px;
        text-align: center;
      }

      h1 {
        color: #2d3748;
        font-size: 2.5rem;
        margin-bottom: 10px;
      }

      .suite-name {
        color: #4a5568;
        font-size: 1.2rem;
        margin-bottom: 5px;
      }

      .timestamp {
        color: #718096;
        font-size: 0.9rem;
      }

      .summary {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: 15px;
        margin-bottom: 20px;
      }

      .stat-card {
        background: white;
        padding: 20px;
        border-radius: 12px;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        text-align: center;
      }

      .stat-value {
        font-size: 2rem;
        font-weight: bold;
        margin-bottom: 5px;
      }

      .stat-label {
        color: #718096;
        font-size: 0.9rem;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .stat-card.passed .stat-value { color: #48bb78; }
      .stat-card.failed .stat-value { color: #f56565; }
      .stat-card.skipped .stat-value { color: #ed8936; }
      .stat-card.total .stat-value { color: #4299e1; }
      .stat-card.duration .stat-value { color: #9f7aea; }
      .stat-card.pass-rate .stat-value { color: #38b2ac; }

      .tests {
        display: flex;
        flex-direction: column;
        gap: 15px;
      }

      .test-card {
        background: white;
        border-radius: 12px;
        padding: 20px;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        border-left: 4px solid #cbd5e0;
      }

      .test-card.passed {
        border-left-color: #48bb78;
      }

      .test-card.failed {
        border-left-color: #f56565;
      }

      .test-card.skipped {
        border-left-color: #ed8936;
      }

      .test-header {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 10px;
      }

      .status-icon {
        font-size: 1.5rem;
        font-weight: bold;
      }

      .test-card.passed .status-icon { color: #48bb78; }
      .test-card.failed .status-icon { color: #f56565; }
      .test-card.skipped .status-icon { color: #ed8936; }

      .test-name {
        flex: 1;
        font-size: 1.1rem;
        font-weight: 600;
        color: #2d3748;
      }

      .test-duration {
        color: #718096;
        font-size: 0.9rem;
      }

      .test-tags {
        display: flex;
        gap: 8px;
        margin-bottom: 10px;
        flex-wrap: wrap;
      }

      .tag {
        background: #edf2f7;
        color: #4a5568;
        padding: 4px 12px;
        border-radius: 12px;
        font-size: 0.85rem;
      }

      .error-section {
        background: #fff5f5;
        border: 1px solid #feb2b2;
        border-radius: 8px;
        padding: 15px;
        margin-top: 10px;
      }

      .error-title {
        color: #c53030;
        font-weight: 600;
        margin-bottom: 8px;
      }

      .error-message {
        color: #742a2a;
        font-family: 'Courier New', monospace;
        font-size: 0.9rem;
        white-space: pre-wrap;
        word-break: break-word;
      }

      .stack-trace {
        color: #742a2a;
        font-family: 'Courier New', monospace;
        font-size: 0.85rem;
        white-space: pre-wrap;
        word-break: break-word;
        margin-top: 10px;
      }

      details {
        margin-top: 10px;
        cursor: pointer;
      }

      summary {
        color: #c53030;
        font-weight: 600;
        padding: 5px;
      }

      .ai-analysis {
        background: linear-gradient(135deg, #667eea15 0%, #764ba215 100%);
        border: 1px solid #667eea;
        border-radius: 8px;
        padding: 15px;
        margin-top: 10px;
      }

      .analysis-title {
        font-weight: 600;
        color: #5a67d8;
        margin-bottom: 10px;
        font-size: 1.05rem;
      }

      .analysis-row {
        margin-bottom: 8px;
        color: #2d3748;
      }

      .category-badge {
        background: #667eea;
        color: white;
        padding: 2px 10px;
        border-radius: 12px;
        font-size: 0.85rem;
        text-transform: uppercase;
      }

      .confidence-bar {
        display: inline-block;
        width: 100px;
        height: 8px;
        background: #e2e8f0;
        border-radius: 4px;
        overflow: hidden;
        vertical-align: middle;
        margin: 0 10px;
      }

      .confidence-fill {
        height: 100%;
        background: linear-gradient(90deg, #48bb78, #38b2ac);
        transition: width 0.3s ease;
      }

      .screenshots {
        margin-top: 15px;
      }

      .screenshots-title {
        font-weight: 600;
        color: #2d3748;
        margin-bottom: 10px;
      }

      .screenshot-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: 10px;
      }

      .screenshot-thumb {
        width: 100%;
        height: auto;
        border-radius: 8px;
        cursor: pointer;
        transition: transform 0.2s;
        border: 2px solid #e2e8f0;
      }

      .screenshot-thumb:hover {
        transform: scale(1.05);
        border-color: #667eea;
      }

      .modal {
        display: none;
        position: fixed;
        z-index: 1000;
        left: 0;
        top: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.9);
        justify-content: center;
        align-items: center;
      }

      .modal-content {
        max-width: 90%;
        max-height: 90%;
      }

      .close {
        position: absolute;
        top: 20px;
        right: 40px;
        color: white;
        font-size: 40px;
        font-weight: bold;
        cursor: pointer;
      }

      /* ---- Step timeline ---- */
      .test-header { cursor: pointer; user-select: none; }
      .toggle-icon { margin-left: auto; color: #718096; font-size: 0.8rem; transition: transform 0.2s; }
      .test-header.collapsed .toggle-icon { transform: rotate(-90deg); }
      .test-body { margin-top: 12px; }
      .test-body.hidden { display: none; }

      .steps-section { margin-bottom: 14px; }
      .steps-title { font-weight: 600; color: #2d3748; margin-bottom: 8px; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.5px; }
      .steps-list { display: flex; flex-direction: column; gap: 4px; }
      .step { display: flex; align-items: flex-start; gap: 8px; padding: 6px 10px; border-radius: 6px; font-size: 0.87rem; background: #f7fafc; border-left: 3px solid #cbd5e0; flex-wrap: wrap; }
      .step.step-passed { border-left-color: #48bb78; }
      .step.step-failed { border-left-color: #f56565; background: #fff5f5; }
      .step-num { color: #a0aec0; min-width: 20px; font-weight: 600; }
      .step-icon { font-weight: bold; min-width: 16px; }
      .step-icon.passed { color: #48bb78; }
      .step-icon.failed { color: #f56565; }
      .step-action { background: #edf2f7; color: #4a5568; padding: 1px 7px; border-radius: 10px; font-size: 0.78rem; font-weight: 600; white-space: nowrap; }
      .step-desc { flex: 1; color: #2d3748; }
      .step-dur { color: #a0aec0; font-size: 0.8rem; white-space: nowrap; }
      .step-error { width: 100%; margin-top: 4px; margin-left: 52px; color: #c53030; font-family: monospace; font-size: 0.82rem; white-space: pre-wrap; word-break: break-word; }
      .step-screenshot { width: 80px; height: auto; border-radius: 4px; cursor: pointer; border: 1px solid #e2e8f0; transition: transform 0.15s; }
      .step-screenshot:hover { transform: scale(1.08); }
    `;
  }

  private getScript(): string {
    return `
      function openModal(src) {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.display = 'flex';
        modal.innerHTML = \`
          <span class="close" onclick="this.parentElement.remove()">&times;</span>
          <img class="modal-content" src="\${src}">
        \`;
        modal.onclick = (e) => {
          if (e.target === modal) modal.remove();
        };
        document.body.appendChild(modal);
      }

      function toggleSteps(header) {
        header.classList.toggle('collapsed');
        const body = header.parentElement.querySelector('.test-body');
        if (body) body.classList.toggle('hidden');
      }
    `;
  }

  private async saveScreenshots(_suiteResult: TestSuiteResult): Promise<void> {
    const screenshotsDir = path.join(this.outputDir, 'screenshots');
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }

    // Screenshots are already embedded as base64 in the HTML
    // This method could be used to save them separately if needed
  }

  private ensureOutputDir(): void {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }
}
