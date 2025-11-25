# History Compression Mechanism Integration Plan

## Overview

Port the history compression mechanism from `reference/history-manager.ts` into the current
project's architecture. Use a unified `HistoryCompactor` interface with two implementations:
`SimpleHistoryCompactor` (simple trimming) and `SummarizingHistoryCompactor` (LLM-powered
compression).

## Problem Statement

Currently, the project uses `SimpleContextCompactor` for simple symbol-based trimming of message
history. The reference implementation provides a more sophisticated approach using LLM-powered
summarization:

- Automatically summarizes old conversation history when token count exceeds a threshold
- Preserves recent messages intact
- Maintains conversation context efficiently without losing information

## Current Architecture

### Message History Management

- **Component:** `ContextBuilder` (src/agent/context/builder.ts)
- **Compaction:** `SimpleContextCompactor` (src/agent/context/compactor.ts)
- **Mechanism:** Symbol-based trimming + tool-call/tool-result consistency validation
- **Limitation:** Deletes old messages instead of summarizing them

### Key Dependencies

- `ModelMessage[]` from Vercel AI SDK
- `SystemInfo` for context enrichment
- `FactsStorage` for persistent facts
- LLM client through existing agent infrastructure

## Reference Implementation Analysis

### Source: `reference/history-manager.ts`

**Key Mechanisms:**

1. **Token Threshold Detection**
   - Tracks token count of messages
   - Configurable `summaryTokenThreshold`
   - If disabled (undefined), no summarization occurs

2. **History Summarization Strategy**
   - Preserves last user-assistant exchange
   - Summarizes everything before that
   - Uses LLM to create compact summaries with structured output:
     - Question: core user intent
     - FinalAnswer: concise bot response
     - Evidence: external references/tool usage

3. **LLM-Based Compression**
   - Specialized summary prompt focused on token efficiency
   - Multi-language support (English output, preserve proper nouns)
   - Time/number normalization (absolute dates, exact values)
   - Streams response from LLM
   - Replaces old messages with assistant message containing summary

4. **Tool-Safe Design**
   - Adds dummy user message before summary if needed
   - Maintains message alternation pattern (user/assistant)
   - Prevents orphaned tool messages

## Integration Plan

### Phase 1: Rename & Consolidate Compactor Interface

**File:** `src/agent/context/compactor.ts`

**Changes:**

- Rename `ContextCompactor` → `HistoryCompactor`
- Rename `SimpleContextCompactor` → `SimpleHistoryCompactor`
- Keep existing implementation intact

**New Interface:**

```typescript
interface HistoryCompactor {
  /**
   * Compacts the context by trimming messages from the beginning (oldest first)
   * to fit within the symbol budget. May use LLM for summarization if configured.
   * Maintains tool-call/tool-result consistency.
   */
  compact(messages: readonly ModelMessage[]): Promise<ModelMessage[]> | ModelMessage[];

  /**
   * Estimate message "weight" by length of JSON representation of content.
   */
  estimateSymbols(message: ModelMessage): number;
}
```

### Phase 2: Create SummarizingHistoryCompactor

**File:** `src/agent/context/compactor.ts` (add new class)

**Responsibility:**

- Implement LLM-powered history compression
- Token threshold configured via immutable constructor parameter
- Fallback to simple trimming on LLM errors

**Implementation:**

```typescript
class SummarizingHistoryCompactor implements HistoryCompactor {
  constructor(
    maxSymbols: number,
    summaryTokenThreshold: number | undefined,
    summaryGenerator: SummaryGenerator,
    logger: Logger,
  ) {/* ... */}

  async compact(messages: readonly ModelMessage[]): Promise<ModelMessage[]> {
    // Check if threshold is set and exceeded
    // If yes: summarize old messages, keep recent ones
    // If no: fallback to simple trimming
  }

  estimateSymbols(message: ModelMessage): number {/* ... */}
}
```

### Phase 3: Create Summary Generator Service

**File:** `src/agent/context/summary-generator.ts`

**Responsibility:**

- Encapsulate LLM call for creating summaries
- Handle streaming response processing
- Format summary prompt with conversation history
- Error handling and cost tracking

**Key Features:**

- Uses existing LLM client pattern
- Specialized summary prompt (adapted from reference)
- Structured output parsing (Question, FinalAnswer, Evidence)
- Streaming response handling
- Cost tracking integration

### Phase 4: Update ContextBuilder

**File:** `src/agent/context/builder.ts`

**Changes:**

- Update constructor to accept `HistoryCompactor` (dependency injection)
- Remove internal compactor creation
- Update `getContext()` to be async (to support async compaction)
- Handle both sync and async compact() returns

**Constructor:**

```typescript
class ContextBuilder {
  constructor(
    compactor: HistoryCompactor,
    systemInfo: SystemInfo,
    factsStorage: FactsStorage,
  ) {/* ... */}

  async getContext(
    systemPromptTemplate: string,
  ): Promise<{ systemPrompt: string; messages: ModelMessage[] }> {
    // ... always await compact() which may return Promise or direct result
  }
}
```

### Phase 5: Configuration & Environment Variables

**Files:** `src/config/types.ts` and `src/config/load.ts`

**New Config:**

```typescript
interface AgentConfig {
  agent: {
    history: {
      maxSymbols: number;
      summaryTokenThreshold?: number; // NEW (undefined = disabled)
    };
    // ... rest of agent config
  };
  // ... rest of config
}
```

**Environment Variables:**

- `AGENT_HISTORY_SUMMARY_TOKEN_THRESHOLD` (optional, default undefined)
  - Example: `50000` triggers summarization when message tokens exceed 50k
  - Recommended range: 30,000 - 100,000 tokens

### Phase 6: Integration with MainAgent/Agent Factory

**Files:** `src/agent/main-agent.ts` and agent creation

**Factory Pattern:**

```typescript
export function createMainAgent(config: Config, ...): MainAgent {
  // Create summary generator if summarization enabled
  const summaryGenerator = config.agent.history.summaryTokenThreshold !== undefined
    ? new SummaryGenerator(llmClient, logger)
    : undefined;

  // Create appropriate compactor
  const compactor = config.agent.history.summaryTokenThreshold !== undefined
    ? new SummarizingHistoryCompactor(
        config.agent.history.maxSymbols,
        config.agent.history.summaryTokenThreshold,
        summaryGenerator!, // non-null because threshold is set
        logger
      )
    : new SimpleHistoryCompactor(config.agent.history.maxSymbols);

  // Pass to ContextBuilder
  const contextBuilder = new ContextBuilder(compactor, systemInfo, factsStorage);

  return new MainAgent(contextBuilder, ...);
}
```

### Phase 7: Testing

**Files:**

- `src/agent/context/compactor.test.ts` (update for new names)
- `src/agent/context/summary-generator.test.ts` (new)

**Test Coverage:**

- Token threshold detection
- Summarization trigger logic
- Fallback to simple trimming
- Message preservation (recent messages kept)
- Tool-call/tool-result consistency
- LLM error handling and fallback
- Cost tracking
- Both code paths: with/without summarization

## Design Decisions

### 1. Immutable Constructor Threshold

- `summaryTokenThreshold` passed to constructor, never changed
- Enables dependency injection pattern
- Simplifies testing (mock compactors with different thresholds)
- Follows existing project patterns

### 2. Unified Interface

- Single `HistoryCompactor` interface
- Two implementations: `SimpleHistoryCompactor`, `SummarizingHistoryCompactor`
- Eliminates confusion with two similar names (`ContextCompactor` vs `HistoryCompactor`)

### 3. Async/Sync Hybrid

- `compact()` returns `Promise<ModelMessage[]> | ModelMessage[]`
- Allows both sync and async implementations
- `ContextBuilder.getContext()` always awaits (transparent to callers)
- Works with both implementations seamlessly

### 4. Compactor Selection via Factory

- Agent factory creates appropriate compactor based on config
- `ContextBuilder` receives compactor via constructor (DI)
- Enables clean testing with mock compactors
- Follows Deno project patterns

### 5. Summary Generation Encapsulation

- `SummaryGenerator` handles all LLM interaction
- Reusable service (could be used elsewhere)
- Separate concerns: generation vs. compaction logic

### 6. Token Counting Strategy

- Primary: Use message usage metadata if available (preferred)
- Fallback: Use symbol estimation (length-based)
- Ensures compatibility with all message types

### 7. Error Handling

- If summarization fails, fall back to simple trimming
- Log error for monitoring
- Don't interrupt user interaction
- Preserve history integrity

### 8. Gradual Rollout

- Start with `summaryTokenThreshold` undefined (disabled by default)
- Enable via config for testing
- Monitor costs and quality
- Tune threshold based on actual usage

## Compatibility Considerations

### Existing Code Impact

- **compactor.ts:** Rename `ContextCompactor` → `HistoryCompactor`, `SimpleContextCompactor` →
  `SimpleHistoryCompactor`
- **ContextBuilder:** Constructor signature changes (now receives compactor)
  - Update all instantiation sites to pass compactor
  - `getContext()` becomes async (callers must await)
- **MainAgent/agent creation:** Update to create compactor and pass to ContextBuilder
- **Config:** New optional parameter (no breaking change with default undefined)

### Migration Path

1. Rename `ContextCompactor` interface to `HistoryCompactor`
2. Rename `SimpleContextCompactor` to `SimpleHistoryCompactor`
3. Create `SummaryGenerator` service
4. Create `SummarizingHistoryCompactor` implementation
5. Update `ContextBuilder` constructor to accept `HistoryCompactor`
6. Update agent factory to create/pass compactor
7. Update all calls to `getContext()` to use await
8. Update imports throughout codebase
9. Update configuration loading to support threshold

## File Structure

```
src/agent/context/
├── compactor.ts               # MODIFIED (renamed, new implementation)
│   ├── interface HistoryCompactor
│   ├── class SimpleHistoryCompactor (renamed)
│   └── class SummarizingHistoryCompactor (NEW)
├── builder.ts                 # MODIFIED (inject compactor, async getContext)
├── builder.test.ts            # MODIFIED
└── summary-generator.ts       # NEW

src/config/
├── types.ts                   # MODIFIED (add history config)
└── load.ts                    # MODIFIED (add env var parsing)

src/agent/
└── main-agent.ts              # MODIFIED (create and inject compactor)
```

## Implementation Checklist

- [ ] Phase 1: Rename `ContextCompactor` → `HistoryCompactor`
- [ ] Phase 1: Rename `SimpleContextCompactor` → `SimpleHistoryCompactor`
- [ ] Phase 1: Update all imports
- [ ] Phase 2: Implement token counting in `SummarizingHistoryCompactor`
- [ ] Phase 2: Implement compaction logic with threshold detection
- [ ] Phase 3: Create `SummaryGenerator` service
- [ ] Phase 3: Implement LLM summary prompt
- [ ] Phase 3: Add streaming response handling
- [ ] Phase 4: Update `ContextBuilder` constructor signature
- [ ] Phase 4: Make `getContext()` async
- [ ] Phase 5: Add environment variable support
- [ ] Phase 5: Update config types and loading
- [ ] Phase 6: Update agent factory to create/inject compactor
- [ ] Phase 7: Write comprehensive unit tests
- [ ] Phase 7: Write integration tests
- [ ] Testing: Verify backwards compatibility
- [ ] Testing: Performance benchmarking
- [ ] Documentation: Update SDS with new mechanism

## Success Criteria

1. ✅ Unified interface: Single `HistoryCompactor` interface eliminates confusion
2. ✅ Existing functionality preserved: `SimpleHistoryCompactor` works as before
3. ✅ Token-based summarization: Works when threshold configured
4. ✅ LLM summaries preserve context: Recent messages kept, old ones compressed
5. ✅ Tool-call consistency: Maintained throughout compaction
6. ✅ Async operations: Don't block user interactions
7. ✅ Configuration optional: Graceful degradation when threshold undefined
8. ✅ Cost tracking: Integrated with existing system
9. ✅ All tests pass: Unit + integration
10. ✅ No performance regression: Common case (threshold undefined) unaffected

## References

- Reference implementation: `reference/history-manager.ts`
- Current compactor: `src/agent/context/compactor.ts`
- Current builder: `src/agent/context/builder.ts`
- Config system: `src/config/load.ts`
- MainAgent: `src/agent/main-agent.ts`

## Notes

- Reference implementation uses different architecture (UserDataRepository) - adapt only core
  compression logic
- Focus on incremental integration to minimize risk
- Keep `SimpleHistoryCompactor` as fallback for robustness
- Summary prompt should be tuned for home server agent context
