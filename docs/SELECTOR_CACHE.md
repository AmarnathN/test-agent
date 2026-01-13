# Selector Cache Architecture

This document describes the high-performance, self-healing selector cache system implemented in the WebAgenticAi framework.

## 🧠 Core Philosophy
The cache is designed to minimize AI costs and maximize test speed by making selector resolution **deterministic**.
**"If a selector worked before, try it first."**

## 🏗 Architecture
The system uses a 2-tier cache strategy:
1.  **In-Memory Layer**: HashMap lookup for instant access during test execution.
2.  **File-Backed Persistence**: JSON storage (`.ai-test/selector-cache.json`) to persist learning across test runs.

## 🚀 Key Features

### 1. Verification-First AI
When the AI proposes a new selector, we **do not trust it blindly**.
-   **Immediate Verification**: The agent waits up to 3 seconds for the selector to resolve on the page.
-   **No-Op on Failure**: If verification fails, the selector is returned (to let the test fail naturally) but **NOT cached**.
-   **Conservative Start**: New AI selectors start with `0.85` confidence and `0` success count.

### 2. Auto-Healing & Confidence Scoring
Every selector has a dynamic confidence score (`0.0 - 1.0`).
-   **Success Boost**: +0.01 per success (Capped at 1.0).
-   **Failure Decay**:
    -   Minor penalty (*0.95) for occasional flakes.
    -   Major penalty (*0.80) after 3 failures.
-   **Auto-Eviction**: Selectors dropping below `0.4` confidence are automatically purged.

### 3. Fallback Learning ("Heuristic Graduation")
The agent tries common patterns (e.g., `text="Submit"`, `[aria-label="Submit"]`) before asking AI.
-   **Learning**: If a fallback pattern works, it is **added to the cache** as a `manual` source entry.
-   **Benefit**: Future runs use this specific selector immediately without iterating through all patterns again.

### 4. Smart Batching
To prevent disk I/O thrashing:
-   Cache updates are batched during the loop iteration.
-   The file is written only once per element resolution attempt, regardless of how many selectors were tried.

## 📊 Data Model
```typescript
interface SelectorEntry {
    selector: string;
    confidence: number;      // 0.0 - 1.0
    successCount: number;
    failureCount: number;
    lastVerified: number;    // Epoch timestamp
    source: "ai" | "manual";
    selectorType?: 'css' | 'xpath' | 'text' | 'aria';
}
```

## 🛡 CI Optimization
In CI environments (`config.ai.ciMode.readOnlyCache = true`):
-   The cache is loaded in **read-only mode**.
-   Tests benefit from previous learning (speed/determinism).
-   Flaky CI runs do not pollute the "golden" cache with false failures.
