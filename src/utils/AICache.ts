import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

/**
 * Cache for AI responses to reduce LLM calls and costs
 */
export class AICache {
    private cache: Map<string, any> = new Map();
    private cacheDir: string;
    private enabled: boolean;

    constructor(cacheDir: string = '.ai-cache', enabled: boolean = true) {
        this.cacheDir = cacheDir;
        this.enabled = enabled;

        if (this.enabled) {
            this.ensureCacheDir();
            this.loadCache();
        }
    }

    /**
     * Get cached response
     */
    get(key: string): any | null {
        if (!this.enabled) return null;

        const cacheKey = this.hashKey(key);
        return this.cache.get(cacheKey) || null;
    }

    /**
     * Set cached response
     */
    set(key: string, value: any): void {
        if (!this.enabled) return;

        const cacheKey = this.hashKey(key);
        this.cache.set(cacheKey, value);
        this.saveCache();
    }

    /**
     * Check if key exists in cache
     */
    has(key: string): boolean {
        if (!this.enabled) return false;

        const cacheKey = this.hashKey(key);
        return this.cache.has(cacheKey);
    }

    /**
     * Clear entire cache
     */
    clear(): void {
        this.cache.clear();
        this.saveCache();
    }

    /**
     * Hash key for consistent lookup
     */
    private hashKey(key: string): string {
        return crypto.createHash('md5').update(key).digest('hex');
    }

    /**
     * Ensure cache directory exists
     */
    private ensureCacheDir(): void {
        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir, { recursive: true });
        }
    }

    /**
     * Load cache from disk
     */
    private loadCache(): void {
        const cacheFile = path.join(this.cacheDir, 'ai-cache.json');

        if (fs.existsSync(cacheFile)) {
            try {
                const data = fs.readFileSync(cacheFile, 'utf-8');
                const parsed = JSON.parse(data);
                this.cache = new Map(Object.entries(parsed));
            } catch (error) {
                console.warn('Failed to load AI cache:', error);
            }
        }
    }

    /**
     * Save cache to disk
     */
    private saveCache(): void {
        const cacheFile = path.join(this.cacheDir, 'ai-cache.json');

        try {
            const data = Object.fromEntries(this.cache);
            fs.writeFileSync(cacheFile, JSON.stringify(data, null, 2));
        } catch (error) {
            console.warn('Failed to save AI cache:', error);
        }
    }
}

/**
 * Selector learning cache - remembers successful selectors
 */
export class SelectorCache {
    private selectors: Map<string, string[]> = new Map();
    private cacheFile: string;

    constructor(cacheDir: string = '.ai-cache') {
        this.cacheFile = path.join(cacheDir, 'selectors.json');
        this.load();
    }

    /**
     * Get learned selectors for a description
     */
    getSelectors(description: string, url: string): string[] {
        const key = this.makeKey(description, url);
        return this.selectors.get(key) || [];
    }

    /**
     * Record a successful selector
     */
    recordSuccess(description: string, url: string, selector: string): void {
        const key = this.makeKey(description, url);
        const existing = this.selectors.get(key) || [];

        // Add to front of list (most recent first)
        if (!existing.includes(selector)) {
            existing.unshift(selector);
            // Keep only top 5 selectors
            this.selectors.set(key, existing.slice(0, 5));
            this.save();
        }
    }

    /**
     * Make cache key from description and URL pattern
     */
    private makeKey(description: string, url: string): string {
        // Extract domain from URL for better caching
        const domain = new URL(url).hostname;
        return `${domain}:${description.toLowerCase().trim()}`;
    }

    /**
     * Load selector cache from disk
     */
    private load(): void {
        if (fs.existsSync(this.cacheFile)) {
            try {
                const data = fs.readFileSync(this.cacheFile, 'utf-8');
                const parsed = JSON.parse(data);
                this.selectors = new Map(Object.entries(parsed));
            } catch (error) {
                console.warn('Failed to load selector cache:', error);
            }
        }
    }

    /**
     * Save selector cache to disk
     */
    private save(): void {
        try {
            const dir = path.dirname(this.cacheFile);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            const data = Object.fromEntries(this.selectors);
            fs.writeFileSync(this.cacheFile, JSON.stringify(data, null, 2));
        } catch (error) {
            console.warn('Failed to save selector cache:', error);
        }
    }
}
