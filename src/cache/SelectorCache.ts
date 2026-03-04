import * as fs from 'fs';
import * as path from 'path';

export interface SelectorEntry {
    selector: string;
    confidence: number;        // 0.0 – 1.0
    successCount: number;
    failureCount: number;
    lastVerified: number;      // epoch millis
    source: "ai" | "manual";
    selectorType?: 'css' | 'xpath' | 'text' | 'aria';
    aiProvider?: string;
    model?: string;
}

export interface SelectorCacheEntry {
    intent: string;            // e.g. "login button"
    selectors: SelectorEntry[];
}

export interface SelectorCacheFile {
    version: 1;
    updatedAt: number;
    entries: Record<string, SelectorCacheEntry>;
}

/**
 * In-Memory Cache (Fast Path)
 */
export class InMemorySelectorCache {
    private cache = new Map<string, SelectorCacheEntry>();

    get(intent: string): SelectorCacheEntry | undefined {
        return this.cache.get(intent);
    }

    set(entry: SelectorCacheEntry) {
        this.cache.set(entry.intent, entry);
    }

    has(intent: string): boolean {
        return this.cache.has(intent);
    }

    values(): SelectorCacheEntry[] {
        return Array.from(this.cache.values());
    }
}

/**
 * File-Backed Cache (Persistence Layer)
 */
export class FileSelectorCache {
    private filePath: string;

    constructor(baseDir: string) {
        this.filePath = path.join(baseDir, ".ai-test", "selector-cache.json");
    }

    load(): SelectorCacheFile {
        if (!fs.existsSync(this.filePath)) {
            return { version: 1, updatedAt: Date.now(), entries: {} };
        }

        try {
            return JSON.parse(fs.readFileSync(this.filePath, "utf-8"));
        } catch (e) {
            console.warn("Failed to load selector cache, starting fresh:", e);
            return { version: 1, updatedAt: Date.now(), entries: {} };
        }
    }

    save(data: SelectorCacheFile) {
        try {
            fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
            fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2));
        } catch (e) {
            console.warn("Failed to save selector cache:", e);
        }
    }
}

/**
 * Unified Selector Cache (In-Memory + File)
 */
export class SelectorCache {
    private memory = new InMemorySelectorCache();
    private file: FileSelectorCache;
    private fileData: SelectorCacheFile;
    private readOnly: boolean = false;

    constructor(baseDir: string, readOnly: boolean = false) {
        this.file = new FileSelectorCache(baseDir);
        this.readOnly = readOnly;
        this.fileData = this.file.load();

        // Normalise the loaded data in case the file is missing the entries field
        this.fileData.entries = this.fileData.entries ?? {};

        // hydrate memory cache
        Object.values(this.fileData.entries).forEach(e =>
            this.memory.set(e)
        );
    }

    get(intent: string): SelectorCacheEntry | undefined {
        return this.memory.get(intent);
    }

    update(entry: SelectorCacheEntry) {
        this.memory.set(entry);

        if (this.readOnly) return;

        this.fileData.entries[entry.intent] = entry;
        this.fileData.updatedAt = Date.now();
        this.file.save(this.fileData);
    }
}
