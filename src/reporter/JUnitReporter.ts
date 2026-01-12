import { TestSuiteResult, Reporter, TestCase, TestResult } from '../types';
import * as fs from 'fs';
import * as path from 'path';

/**
 * JUnit XML Reporter for CI/CD integration
 */
export class JUnitReporter implements Reporter {
    private outputDir: string;
    private testResults: TestResult[] = [];

    constructor(outputDir: string = 'ai-test-results') {
        this.outputDir = outputDir;
        this.ensureOutputDir();
    }

    onTestStart(_test: TestCase): void {
        // Not needed for JUnit
    }

    onTestEnd(result: TestResult): void {
        this.testResults.push(result);
    }

    async onSuiteEnd(suiteResult: TestSuiteResult): Promise<void> {
        const xml = this.generateXML(suiteResult);
        const reportPath = path.join(this.outputDir, 'junit.xml');

        fs.writeFileSync(reportPath, xml);

        console.log(`📋 JUnit Report generated: ${reportPath}`);
    }

    private generateXML(suiteResult: TestSuiteResult): string {
        const duration = (suiteResult.endTime.getTime() - suiteResult.startTime.getTime()) / 1000;

        const testcases = suiteResult.results.map(result => this.generateTestCase(result)).join('\n    ');

        return `<?xml version="1.0" encoding="UTF-8"?>
<testsuites>
  <testsuite 
    name="${this.escapeXml(suiteResult.suiteName)}"
    tests="${suiteResult.totalTests}"
    failures="${suiteResult.failed}"
    skipped="${suiteResult.skipped}"
    time="${duration.toFixed(3)}"
    timestamp="${suiteResult.startTime.toISOString()}">
    ${testcases}
  </testsuite>
</testsuites>`;
    }

    private generateTestCase(result: TestResult): string {
        const duration = (result.duration / 1000).toFixed(3);
        const className = result.tags?.join('.') || 'AITest';

        let testcase = `<testcase name="${this.escapeXml(result.name)}" classname="${className}" time="${duration}">`;

        if (result.status === 'failed' && result.error) {
            testcase += `
      <failure message="${this.escapeXml(result.error.message)}" type="${result.error.name}">
${this.escapeXml(result.error.stack || result.error.message)}
      </failure>`;

            // Add AI analysis as system-out
            if (result.failureAnalysis) {
                testcase += `
      <system-out>
AI Failure Analysis:
Category: ${result.failureAnalysis.category}
Root Cause: ${this.escapeXml(result.failureAnalysis.rootCause)}
Suggested Fix: ${this.escapeXml(result.failureAnalysis.suggestedFix)}
Confidence: ${(result.failureAnalysis.confidence * 100).toFixed(0)}%
      </system-out>`;
            }
        } else if (result.status === 'skipped') {
            testcase += `
      <skipped/>`;
        }

        testcase += `
    </testcase>`;

        return testcase;
    }

    private ensureOutputDir(): void {
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }
    }

    private escapeXml(text: string): string {
        const map: Record<string, string> = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&apos;',
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }
}
