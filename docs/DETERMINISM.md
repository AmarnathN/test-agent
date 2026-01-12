# Determinism & Flakiness Prevention

## Problem: LLM Non-Determinism

LLMs are inherently non-deterministic:
- Same input can produce different outputs
- Context-sensitive responses
- Temperature settings introduce randomness

**Impact on CI/CD:**
- ❌ Tests may pass/fail randomly
- ❌ Hard to reproduce failures
- ❌ Breaks CI reliability
- ❌ Team loses confidence in tests

## Solution: Selector Freezing

### Concept: "Once Resolved, Always Frozen"

```
First run:  AI resolves "login button" → button.login-btn
Second run: Use frozen selector button.login-btn (no AI)
Third run:  Use frozen selector button.login-btn (no AI)
...forever: Use frozen selector button.login-btn (no AI)
```

### Implementation

The framework implements **automatic selector freezing** through the `SelectorCache`:

#### 1. **First Resolution (AI)**
```typescript
// Test code
await agent.click('login button');

// Framework behavior:
1. Check cache → empty (first run)
2. Try fallbacks → none match
3. Call AI → returns "button.login-btn"
4. ✅ FREEZE: Save to cache
5. Use selector
```

#### 2. **Subsequent Runs (Frozen)**
```typescript
// Same test code
await agent.click('login button');

// Framework behavior:
1. Check cache → found "button.login-btn"
2. ✅ Use frozen selector (no AI call)
3. Deterministic behavior guaranteed
```

### Cache Structure

**File:** `.ai-cache/selectors.json`

```json
{
  "example.com:login button": [
    "button.login-btn"
  ],
  "example.com:email input": [
    "input[type='email']#email"
  ],
  "example.com:submit form": [
    "form button[type='submit']"
  ]
}
```

**Key Format:** `{domain}:{description}`
- Domain-specific to handle multi-site testing
- Description normalized (lowercase, trimmed)

### Determinism Guarantees

✅ **Same selector every time** - Once cached, never changes
✅ **No AI variance** - Frozen selectors bypass LLM
✅ **Reproducible failures** - Same selector = same behavior
✅ **CI-friendly** - Predictable test execution
✅ **Version controlled** - Cache can be committed to git

## Configuration

### Default Behavior (Recommended)

```javascript
// ai-test.config.js
module.exports = {
  aiOptimization: {
    enableCache: true,    // ✅ Freezing enabled
    smartMode: true,      // ✅ Fallbacks before AI
  },
};
```

### Strict Determinism Mode

For maximum determinism, commit cache to version control:

```bash
# 1. Run tests once to build cache
npx ai-test run

# 2. Commit cache to git
git add .ai-cache/
git commit -m "Freeze selectors for deterministic tests"

# 3. All team members and CI use frozen selectors
```

**Benefits:**
- New developers get frozen selectors immediately
- CI uses exact same selectors as local
- Zero AI calls in CI (100% deterministic)
- Faster CI execution

## Handling UI Changes

### When Selectors Break

If UI changes and frozen selector no longer works:

```typescript
// Frozen selector: button.login-btn
// But UI changed to: button.submit-btn

// Framework behavior:
1. Try frozen selector → fails
2. Remove from cache
3. Try fallbacks → may find new selector
4. Call AI if needed → resolves new selector
5. ✅ FREEZE new selector
```

**Auto-healing:** Framework automatically adapts and re-freezes.

### Manual Cache Invalidation

```bash
# Clear entire cache
rm -rf .ai-cache/

# Clear specific domain
# Edit .ai-cache/selectors.json manually

# Clear and rebuild
rm -rf .ai-cache/ && npx ai-test run
```

## Best Practices

### 1. Commit Cache for Production Tests

✅ **Do this for:**
- Critical path tests
- Regression suites
- CI/CD pipelines
- Smoke tests

```bash
git add .ai-cache/
git commit -m "Freeze selectors for smoke tests"
```

### 2. Use Descriptive, Stable Descriptions

✅ **Good (stable):**
```typescript
await agent.click('primary login button');
await agent.fill('email address input');
```

❌ **Bad (unstable):**
```typescript
await agent.click('button');  // Too generic
await agent.fill('first input');  // Position-dependent
```

### 3. Separate Dev and CI Caches

**Option A:** Different cache directories
```javascript
// ai-test.config.js
module.exports = {
  aiOptimization: {
    cacheDir: process.env.CI ? '.ai-cache-ci' : '.ai-cache-dev',
  },
};
```

**Option B:** Commit only CI cache
```bash
# .gitignore
.ai-cache-dev/
# Commit .ai-cache-ci/
```

### 4. Monitor Cache Staleness

Track when selectors were learned:

```typescript
// Future enhancement
{
  "example.com:login button": {
    "selector": "button.login-btn",
    "learnedAt": "2024-01-12T10:30:00Z",
    "lastUsed": "2024-01-12T14:30:00Z",
    "useCount": 42
  }
}
```

## Comparison: With vs Without Freezing

### Without Freezing (Pure AI)

```
Run 1: "login button" → button.login-btn      ✅ Pass
Run 2: "login button" → button[type="submit"] ✅ Pass
Run 3: "login button" → .btn-primary          ❌ Fail (wrong button)
Run 4: "login button" → button.login-btn      ✅ Pass
```

**Result:** Flaky tests, unpredictable

### With Freezing (Current Implementation)

```
Run 1: "login button" → button.login-btn (AI, freeze)  ✅ Pass
Run 2: "login button" → button.login-btn (frozen)      ✅ Pass
Run 3: "login button" → button.login-btn (frozen)      ✅ Pass
Run 4: "login button" → button.login-btn (frozen)      ✅ Pass
```

**Result:** 100% deterministic, reliable

## Temperature Setting

For AI calls that do occur, use low temperature for consistency:

```typescript
// src/ai/OpenAIProvider.ts
const response = await this.client.chat.completions.create({
  model: this.model,
  messages,
  temperature: 0.1,  // ✅ Low = more deterministic
  max_tokens: 100,
});
```

**Temperature Guide:**
- `0.0` - Most deterministic (but may be too rigid)
- `0.1` - Recommended (good balance)
- `0.5` - More creative (less deterministic)
- `1.0` - Maximum creativity (non-deterministic)

## Verification

### Test Determinism

Run same test multiple times:

```bash
# Run test 10 times
for i in {1..10}; do
  npx ai-test run tests/login.test.ts
done

# All runs should produce identical results
```

### Cache Hit Rate

Monitor logs for cache usage:

```
[INFO] Using learned selector: button.login-btn  ← Deterministic
[INFO] Using fallback selector: input[type="email"]  ← Deterministic
[DEBUG] Using AI to locate: complex dropdown  ← Non-deterministic (first time)
```

**Goal:** 95%+ cache hit rate after first run

## Summary

The framework ensures determinism through:

1. ✅ **Automatic Selector Freezing** - Once resolved, always reused
2. ✅ **Persistent Cache** - Survives across test runs
3. ✅ **Domain-Specific** - Handles multi-site testing
4. ✅ **Version Control Ready** - Cache can be committed
5. ✅ **Auto-Healing** - Adapts when UI changes
6. ✅ **Low Temperature** - AI calls are more consistent
7. ✅ **Fallback Strategies** - Deterministic patterns before AI

**Result:** Tests are as deterministic as traditional selector-based tests, with the convenience of natural language descriptions.

---

**Status:** ✅ Already Implemented
**Enabled:** By default
**CI-Ready:** Yes (commit `.ai-cache/` for 100% determinism)
