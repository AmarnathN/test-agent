import winston from 'winston';
import chalk from 'chalk';

/**
 * Logger utility for the framework
 */
export class Logger {
    private logger: winston.Logger;
    private testName?: string;

    constructor(testName?: string) {
        this.testName = testName;

        this.logger = winston.createLogger({
            level: process.env.LOG_LEVEL || 'info',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.errors({ stack: true }),
                winston.format.printf(({ level, message, timestamp, stack }) => {
                    const prefix = this.testName ? `[${this.testName}]` : '';
                    const coloredLevel = this.colorizeLevel(level);
                    return `${timestamp} ${coloredLevel} ${prefix} ${message}${stack ? '\n' + stack : ''}`;
                })
            ),
            transports: [
                new winston.transports.Console(),
                new winston.transports.File({ filename: 'ai-test-results/test.log' }),
            ],
        });
    }

    info(message: string): void {
        this.logger.info(message);
    }

    warn(message: string): void {
        this.logger.warn(message);
    }

    error(message: string, error?: Error): void {
        this.logger.error(message, { stack: error?.stack });
    }

    debug(message: string): void {
        this.logger.debug(message);
    }

    private colorizeLevel(level: string): string {
        switch (level) {
            case 'info':
                return chalk.blue(level.toUpperCase());
            case 'warn':
                return chalk.yellow(level.toUpperCase());
            case 'error':
                return chalk.red(level.toUpperCase());
            case 'debug':
                return chalk.gray(level.toUpperCase());
            default:
                return level.toUpperCase();
        }
    }
}
