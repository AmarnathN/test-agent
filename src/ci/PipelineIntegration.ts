import { TestSuiteResult } from '../types';

/**
 * CI/CD Pipeline integration
 */
export class PipelineIntegration {
    private platform: 'gitlab' | 'github' | 'jenkins' | 'generic';

    constructor() {
        this.platform = this.detectPlatform();
    }

    /**
     * Detect CI/CD platform
     */
    private detectPlatform(): 'gitlab' | 'github' | 'jenkins' | 'generic' {
        if (process.env.GITLAB_CI) return 'gitlab';
        if (process.env.GITHUB_ACTIONS) return 'github';
        if (process.env.JENKINS_HOME) return 'jenkins';
        return 'generic';
    }

    /**
     * Report test results to CI/CD platform
     */
    async reportResults(results: TestSuiteResult): Promise<void> {
        console.log(`\n📊 Reporting to ${this.platform.toUpperCase()} CI/CD...`);

        switch (this.platform) {
            case 'gitlab':
                await this.reportToGitLab(results);
                break;
            case 'github':
                await this.reportToGitHub(results);
                break;
            case 'jenkins':
                await this.reportToJenkins(results);
                break;
            default:
                console.log('Generic CI environment detected');
        }
    }

    /**
     * Report to GitLab CI
     */
    private async reportToGitLab(results: TestSuiteResult): Promise<void> {
        // GitLab CI automatically picks up JUnit XML reports
        // We can also create custom badges and metrics

        const passRate = ((results.passed / results.totalTests) * 100).toFixed(1);

        console.log(`\nGitLab CI Metrics:`);
        console.log(`  Pass Rate: ${passRate}%`);
        console.log(`  Total Tests: ${results.totalTests}`);
        console.log(`  Failed: ${results.failed}`);

        // Create metrics file for GitLab
        const metrics = {
            pass_rate: parseFloat(passRate),
            total_tests: results.totalTests,
            passed: results.passed,
            failed: results.failed,
            skipped: results.skipped,
        };

        // GitLab can display these as custom metrics
        console.log('\nMetrics:', JSON.stringify(metrics));
    }

    /**
     * Report to GitHub Actions
     */
    private async reportToGitHub(results: TestSuiteResult): Promise<void> {
        // GitHub Actions can use annotations and job summaries

        const passRate = ((results.passed / results.totalTests) * 100).toFixed(1);

        // Create job summary
        const summary = this.createGitHubSummary(results);

        // Write to GitHub Actions summary
        if (process.env.GITHUB_STEP_SUMMARY) {
            const fs = require('fs');
            fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
            console.log('✓ GitHub Actions summary created');
        }

        // Create annotations for failures
        for (const result of results.results) {
            if (result.status === 'failed' && result.error) {
                console.log(`::error::Test "${result.name}" failed: ${result.error.message}`);

                if (result.failureAnalysis) {
                    console.log(`::notice::AI Analysis - ${result.failureAnalysis.rootCause}`);
                }
            }
        }
    }

    /**
     * Create GitHub Actions job summary
     */
    private createGitHubSummary(results: TestSuiteResult): string {
        const passRate = ((results.passed / results.totalTests) * 100).toFixed(1);
        const duration = ((results.endTime.getTime() - results.startTime.getTime()) / 1000).toFixed(2);

        let summary = `# 🤖 AI Test Results\n\n`;
        summary += `## Summary\n\n`;
        summary += `| Metric | Value |\n`;
        summary += `|--------|-------|\n`;
        summary += `| Total Tests | ${results.totalTests} |\n`;
        summary += `| ✅ Passed | ${results.passed} |\n`;
        summary += `| ❌ Failed | ${results.failed} |\n`;
        summary += `| ⏭️ Skipped | ${results.skipped} |\n`;
        summary += `| 📊 Pass Rate | ${passRate}% |\n`;
        summary += `| ⏱️ Duration | ${duration}s |\n\n`;

        if (results.failed > 0) {
            summary += `## Failed Tests\n\n`;

            for (const result of results.results) {
                if (result.status === 'failed') {
                    summary += `### ❌ ${result.name}\n\n`;
                    summary += `**Error:** ${result.error?.message}\n\n`;

                    if (result.failureAnalysis) {
                        summary += `**🤖 AI Analysis:**\n`;
                        summary += `- **Category:** ${result.failureAnalysis.category}\n`;
                        summary += `- **Root Cause:** ${result.failureAnalysis.rootCause}\n`;
                        summary += `- **Suggested Fix:** ${result.failureAnalysis.suggestedFix}\n`;
                        summary += `- **Confidence:** ${(result.failureAnalysis.confidence * 100).toFixed(0)}%\n\n`;
                    }
                }
            }
        }

        return summary;
    }

    /**
     * Report to Jenkins
     */
    private async reportToJenkins(results: TestSuiteResult): Promise<void> {
        // Jenkins picks up JUnit XML automatically
        console.log('Jenkins will process JUnit XML report');

        const passRate = ((results.passed / results.totalTests) * 100).toFixed(1);
        console.log(`Pass Rate: ${passRate}%`);
    }

    /**
     * Check if deployment should be blocked
     */
    shouldBlockDeployment(results: TestSuiteResult, threshold: number = 100): boolean {
        const passRate = (results.passed / results.totalTests) * 100;

        if (passRate < threshold) {
            console.log(`\n⛔ Deployment blocked: Pass rate ${passRate.toFixed(1)}% is below threshold ${threshold}%`);
            return true;
        }

        console.log(`\n✅ Deployment approved: Pass rate ${passRate.toFixed(1)}%`);
        return false;
    }
}
