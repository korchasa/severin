# Software Requirements Specification (SRS)

## 1. Introduction

- **Purpose:** Define functional/non-functional requirements for Telegram-based home server agent in
  TypeScript. Agent communicates with owner via Telegram, performs hourly self-checks, notifies on
  anomalies. Server commands execute only via internal LLM tools (Responses API), not directly by
  user. Maintains lightweight history file (recent messages + base prompt).
- **Scope:** Single service (bot + scheduler + LLM adapter) on home server. Owner sole user via
  Telegram. Provides periodic health checks, notifications, file-based history, internal terminal
  tool exposed only to LLM via Responses API.
- **Audience:** Product owner (server owner), developers, testers, operators.
- **Definitions:**
  - Agent: Backend service processing Telegram updates, running checks.
  - Terminal tool: Safe shell command execution adapter; callable only by LLM via Responses API.
  - Responses API: Internal interface for LLM tool calls (e.g., terminal) with typed I/O.
  - History: File-based storage with base prompt and latest N messages.
  - Owner: Single authorized Telegram user.

## 2. General Description

- **Context:** Telegram ↔ Agent (long polling) ↔ OS/filesystem/scheduler. Messages to Telegram.
- **Assumptions:**
  - Single-user bot (known Telegram IDs).
  - Restricted OS user, minimal privileges.
  - Runtime: Deno (strict TypeScript); no `any`; TDD.
  - No external DB; file-based state in `./data`.
  - Network to Telegram API available.
  - Clock drift ≤5 min; monotonic timers with jitter.

## 3. Functional requirements

### ✅ FR-1 Telegram Bot Interface

- **Description:** Telegram bot as primary UI.
- **Use case:** Owner sends commands and text, receives responses/alerts.
- **Criteria:**
  - `/reset` clears conversation history.
  - Text messages without `/` processed as LLM queries.
  - Authorizes updates; rejects non-owners safely.
  - Long polling only (no webhook).
  - Messages formatted using HTML markup for rich text display.

### ✅ FR-2 Command Routing & Validation

- **Description:** Central `handleUpdate(update)` with typed routing/schema validation.
- **Use case:** Messages routed by command/payload schema.
- **Criteria:**
  - Declarative command registry with argument schemas.
  - Invalid inputs → safe error messages; no internal details exposed.
  - Each update logs `update_id`, `chat_id`, `message_id`, correlation ID.

### ✅ FR-3 LLM Tools via Internal Registry

- **Description:** LLM tools available via internal registry: terminal (command execution), stop
  (conversation termination); users cannot call directly.
- **Use case:** Owner interacts naturally; LLM uses appropriate tools for tasks and conversation
  control.
- **Terminal Tool Criteria:**
  - Interface: `{ command: string, cwd?: string, reason: string }` →
    `{ exitCode, stdout, stderr, truncated, durationMs }`.
  - Shell capabilities: pipes, redirection, variables, conditionals via `sh -c`.
  - Defaults: `timeoutMs=30_000`, `maxOutputBytes=200_000`.
  - Safety: timeout termination, output limits, command validation.
  - Audit: timestamp, command details, execution metrics.
- **Stop Tool Criteria:**
  - Interface: no parameters; terminates conversation when appropriate.
  - Use: LLM decides when conversation should end naturally.
- Tools accessible only via LLM through Vercel AI SDK; no direct user access.

### ✅ FR-4 Periodic Metrics Collection & Analysis Scheduler

- **Description:** Agent collects metrics periodically and analyzes trends for intelligent anomaly
  detection.
- **Use case:** Automated monitoring with contextual analysis of system health changes.
- **Criteria:**
  - Period: ~60 min with jitter; singleflight prevents parallel runs.
  - `/checknow` for manual trigger.
  - Each run: collect all metrics, compare with history, analyze via LLM.
  - Metrics include values, timestamps, and percentage changes from history.
  - Results available via `/status`; notifications only on LLM-detected issues.

### ✅ FR-5 Built-in Baseline Checks

- **Description:** Comprehensive system metrics collection with 28 specialized collectors and
  historical trend analysis. CPU-sensitive metrics collected sequentially to avoid measurement
  distortion.
- **Use case:** Full system monitoring covering CPU, history, disk, network, processes, and system
  services with intelligent anomaly detection.
- **Criteria:**
  - Core collectors: CPU usage, history usage, disk space, system load, top processes.
  - Advanced collectors: network latency/errors, kernel errors, systemd services, temperature, file
    descriptors, connections, I/O wait, smart status, time sync, swap usage, PSI pressure, route
    quality.
  - Performance monitoring: each collector execution timed and logged with success/error metrics.
  - Robust error handling: invalid JSON lines skipped, graceful degradation on collector failures.
  - Metrics stored with configurable retention (default 1 hour); automatic cleanup of old data.
  - Historical comparison: percentage changes calculated against 5min/30min baselines.
  - Collection strategy: CPU-sensitive collectors (CpuCollector, CpuGeneralCollector,
    CpuQueueCollector) collected sequentially first, then all other metrics collected in parallel to
    prevent CPU metrics from influencing their own measurements.

### ✅ FR-6 Intelligent Anomaly Detection & Notifications

- **Description:** Analyze metrics trends and notify owner only when LLM determines real issues
  exist.
- **Use case:** Owner receives contextual notifications when system health requires attention.
- **Criteria:**
  - Compare current metrics with historical values (5min, 30min ago).
  - Calculate percentage changes and filter significant deviations above threshold.
  - Send metrics and changes to LLM for analysis with specialized prompt.
  - LLM decides if situation is normal ("NO MESSAGE") or requires notification.
  - Send user notification only when LLM identifies actual problems.
  - No fixed thresholds; contextual analysis by LLM.

### ✅ FR-7 Context Builder & In-Memory History

- **Description:** Use `ContextBuilder` to maintain in-memory conversation with symbol-based limits
  and to compose system prompt from template with system info and facts.
- **Use case:** Context evolves on interaction; owner resets via `/reset`; LLM consumes recent
  context.
- **Criteria:**
  - Stores simple/complex messages; limits by total symbols `AGENT_MEMORY_MAX_SYMBOLS` (default
    20000).
  - Appends user messages immediately; appends assistant/tool messages per-step (`onStepFinish`).
  - System prompt generated from template with placeholders replaced: `{{SERVER_INFO}}`,
    `{{FACTS}}`.
  - Reset clears context via `/reset`.

### ✅ FR-8 Configuration & Secrets

- **Description:** All config from environment variables with domain prefixes, validated at startup.
  Auto-loads `.env`.
- **Use case:** Operator sets `.env`/environment for token, owner ID, thresholds, limits.
- **Criteria:**
  - Required: `TELEGRAM_BOT_TOKEN` (string), `TELEGRAM_OWNER_IDS` (CSV numeric), `AGENT_LLM_API_KEY`
    (string).
  - Optional: `AGENT_DATA_DIR` (default `./data`), `LOGGING_FORMAT` (default "pretty", or "json"),
    `AGENT_MEMORY_MAX_SYMBOLS` (default 20000), `AGENT_TERMINAL_TIMEOUT_MS` (default 30_000),
    `AGENT_TERMINAL_MAX_COMMAND_OUTPUT_SIZE` (default 200_000),
    `AGENT_TERMINAL_MAX_LLM_INPUT_LENGTH` (default 2000), `SCHEDULER_INTERVAL_HOURS` (default 1),
    `SCHEDULER_JITTER_MINUTES` (default 5).
  - Auto-loads `.env` from root on startup; environment variables override .env.
  - Secrets not logged; masked in debug output.
  - Configuration organized in domain objects (agent, telegram, logging, scheduler); caching
    prevents repeated parsing.

### ✅ FR-9 LLM Integration via Specialized Tasks

- **Description:** LLM integration through specialized task interfaces: MainAgent for user queries,
  AuditTask for metrics analysis, DiagnoseTask for problem diagnosis.
- **Use case:** Separate LLM workflows for conversations vs automated monitoring with contextual
  system information and specialized prompts.
- **Criteria:**
  - `MainAgent.processUserQuery()` handles user text messages with conversation history.
  - `AuditTask.auditMetrics()` analyzes system metrics for anomaly detection decisions.
  - `DiagnoseTask.diagnose()` determines root causes using terminal tool for investigation.
  - System prompts include server info from startup collection; conversation history maintained
    in-RAM.
  - Tools: terminal (command execution), stop (conversation termination).
  - LLM provider via `AGENT_LLM_API_KEY` ENV with Vercel AI SDK (compatible with OpenAI, Claude,
    etc.).
  - Runtime: Deno; LLM tasks via internal interfaces only.

### ✅ FR-10 Automatic Text Message Processing

- **Description:** Text messages without `/` prefix auto-processed as LLM queries; natural chat
  interface.
- **Use case:** Owner sends text, receives LLM response with tool access; no special commands
  needed.
- **Criteria:**
  - `/`-prefixed messages handled as commands (reset).
  - Non-`/` text sent to LLM with system prompt and conversation history context.
  - <2 char messages ignored to prevent accidental triggers.
  - LLM responses logged and stored in conversation history.
  - Empty LLM responses filtered to prevent Telegram API errors.
  - Full LLM integration with responses/history updates.
  - `/reset` command works normally.

### ✅ FR-11 System Information Collection at Startup

- **Description:** Agent collects comprehensive system information during startup and includes it in
  the LLM system prompt for contextual awareness.
- **Use case:** LLM has full knowledge of the host system (OS, hardware, network, services) for more
  accurate and relevant responses.
- **Criteria:**
  - Collects identification (hostname, OS, kernel, architecture), platform (CPU, history,
    virtualization), storage (block devices, mounts, Docker), network (addresses, DNS, Docker
    interfaces), system (init system, services, firewall, package manager), security (firewall
    status, SELinux/AppArmor), time (timezone), and cloud provider detection.
  - Information formatted as structured markdown included in system prompt.
  - Collection happens during app startup, logged for debugging.
  - Fails gracefully on unavailable data (no blocking startup).
  - No sensitive information exposed to users.

### ✅ FR-14 Specialized Agent Architecture

- **Description:** Specialized agent components for different workflows: MainAgent for
  conversations, AuditTask for metrics analysis, DiagnoseTask for problem diagnosis.
- **Use case:** Clean separation between user interaction and automated monitoring with appropriate
  tooling for each context.
- **Criteria:**
  - `MainAgent` handles user queries with conversation history and general tools.
  - `AuditTask` processes metrics analysis for anomaly detection decisions.
  - `DiagnoseTask` diagnoses root causes using terminal tool for investigation.
  - Factory functions: `createMainAgent()`, `createAuditTask()`, `createDiagnoseTask()`.
  - Components: `ContextBuilder`, Vercel AI SDK agents, specialized prompts with server info and
    facts.
  - Telegram handlers use MainAgent; scheduler uses AuditTask + DiagnoseTask.
  - Conversation history limits and tool orchestration managed per component.

### ✅ FR-15 Persistent Facts Storage and Management

- **Description:** Agent maintains persistent facts storage that can be updated via LLM tools and
  included in system prompts for contextual awareness.
- **Use case:** Agent can remember important information about the system and environment, improving
  contextual relevance of responses and allowing persistent knowledge management.
- **Criteria:**
  - File-based storage in `data/facts.jsonl` using JSONL format.
  - Facts include `id`, `content`, `timestamp` fields.
  - LLM tools: `add_fact`, `update_fact`, `delete_fact`, `get_all_facts`.
  - Facts integrated into system prompt under dedicated "## FACTS" section.
  - Tools available only through LLM; no direct user access.
  - Storage operations are atomic and logged.
  - Facts persist across agent restarts.

### ✅ FR-16 LLM Cost Calculation

- **Description:** Agent calculates and tracks costs of LLM usage based on configurable token prices
  for cost monitoring and optimization.
- **Use case:** Monitor LLM usage costs across different operations (conversations, metrics
  analysis, diagnostics) for budget control and efficiency analysis.
- **Criteria:**
  - Support for all token types from `LanguageModelV2Usage`: `inputTokens`, `outputTokens`,
    `totalTokens`, `reasoningTokens`, `cachedInputTokens`.
  - Pricing configuration via environment variables (`AGENT_LLM_PRICE_*`) in USD per 1M tokens.
  - Pure calculation function without external dependencies (no `@pydantic/genai-prices`).
  - Cost calculation integrated into all LLM operations (MainAgent, AuditTask, DiagnoseTask).
  - Optional token types (reasoning, cached) with configurable pricing.
  - Type-safe implementation with full TypeScript support.
  - Usage tracking added to AuditTask and DiagnoseTask for cost monitoring.
  - Function name: `calcAmount` for cost calculation.

### ✅ FR-17 Real-time Tool Call Notifications

- **Description:** Agent provides real-time notifications to Telegram users about tool calls being
  executed during LLM processing for enhanced transparency and user experience.
- **Use case:** Users receive immediate feedback when LLM executes terminal commands or manages
  facts, providing visibility into agent actions and building trust.
- **Criteria:**
  - Tool call callbacks: `onToolCallRequested` and `onToolCallFinished` for tracking tool execution.
  - Real-time Telegram messages for terminal commands with formatted command and reason.
  - Real-time notifications for facts management operations (add, update, delete).
  - Formatted output using Telegram HTML markup for better readability.
  - Non-blocking notifications that don't interfere with LLM processing.
  - Support for all tool types: terminal, add_fact, update_fact, delete_fact.
  - Integration with existing Telegram message formatting system.

### ✅ FR-18 Agent Response Debugging and Analysis

- **Description:** Agent saves detailed response information to files for debugging, analysis, and
  monitoring of LLM interactions.
- **Use case:** Developers and operators can analyze agent behavior, debug issues, and monitor LLM
  performance through structured response dumps.
- **Criteria:**
  - Response dumps saved to `data/main-agent-last-response.yaml` after each interaction.
  - Structured data includes request parameters, message chain, finish reasons, tool calls, and
    usage.
  - YAML format for human-readable analysis and debugging.
  - Integration with logging system for response tracking.
  - Support for both Jest test environment and Deno runtime.
  - Fail-fast approach: errors in serialization are thrown rather than silently ignored.

## 4. Non-Functional Requirements

- **Performance:** Home usage; tool timeouts 30s; metrics collection lightweight.
- **Reliability:** Simple periodic checks; history corruption protection minimal; metrics history
  cleanup.
- **Security:** Owner-only access; terminal tool limits; no secrets in logs; safe LLM analysis.
- **Availability/UX:** Reasonable response times; concise messages; intelligent notifications.

## 5. Interfaces

- **APIs/Integrations:**
  - Telegram Bot API: inbound updates, outbound messages.
  - Responses API: internal LLM tool calls (terminal); not exposed to users. Call:
    `{ toolName: string, input: unknown }`; Response:
    `{ ok: boolean, result?: unknown, error?: { code: string, message: string } }`.
  - LLM Client: internal wrapper around `vercel-ai`; limited text generation/tool calls interface;
    direct `ai` imports prohibited outside adapter.
- **Protocols/Data formats:** JSON payloads (Telegram long polling); typed tool schemas; JSONL
  history files.
- **UI/UX:** Plain text commands; optional inline keyboards; concise messages; long outputs
  summarized with file attachments; rich text formatting via HTML markup.

## 6. Acceptance Criteria

System accepted when:

1. ✅ Owner runs `/reset` for correct response; no other commands available.
2. ✅ Long polling only; non-owner messages rejected safely.
3. ✅ Periodic metrics collection with trend analysis; LLM-based anomaly detection triggers
   contextual notifications.
4. ✅ History as in-RAM storage with symbol limit; reset via `/reset`; base prompt hardcoded.
5. ✅ Terminal tool (LLM-only) executes via `execFile` with timeout/output limits; safe messages on
   errors; command logging; full LLM integration via Agent facade.
6. ✅ System information collected at startup and included in LLM system prompt for contextual
   awareness.
7. ✅ Structured logs include correlation ID for all updates/executions; pretty/JSON formats.
8. ✅ Config via prefixed environment variables (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_OWNER_IDS`,
   `AGENT_LLM_API_KEY`, optional `AGENT_DATA_DIR`, `LOGGING_FORMAT`, `AGENT_MEMORY_MAX_MESSAGES`,
   `AGENT_TERMINAL_TIMEOUT_MS`, `AGENT_TERMINAL_MAX_COMMAND_OUTPUT_SIZE`,
   `AGENT_TERMINAL_MAX_LLM_INPUT_LENGTH`, `AGENT_LLM_PRICE_INPUT_TOKENS`,
   `AGENT_LLM_PRICE_OUTPUT_TOKENS`, etc.); defaults in `createDefaultConfig()`; domain objects;
   caching prevents repeated parsing; secrets masked.
9. ✅ LLM integration via specialized tasks: MainAgent for conversations, AuditTask/DiagnoseTask for
   monitoring; Vercel AI SDK with compatible LLM provider; no direct external API calls; Deno
   runtime.
10. ✅ Non-`/` text messages processed via MainAgent with conversation history; `/reset` clears
    history; short messages filtered; empty responses filtered; system info included in prompts.
11. ✅ Logger supports pretty (default)/JSON formats; pretty with auto color detection.
12. ✅ Specialized agent architecture: MainAgent for user queries, AuditTask for metrics analysis,
    DiagnoseTask for diagnosis; clean separation with appropriate tools per context.
13. ✅ Persistent facts storage with LLM tools: facts stored in `data/facts.jsonl`, managed via
    `add_fact`, `update_fact`, `delete_fact`, `get_all_facts` tools, integrated into system prompts
    using structured markdown formatting.
14. ✅ LLM cost calculation: token pricing configured via environment variables, cost tracking
    integrated into AuditTask and DiagnoseTask, usage aggregated across operations.
15. ✅ Real-time tool call notifications: users receive immediate Telegram notifications when LLM
    executes terminal commands or manages facts, with formatted output and non-blocking delivery.
16. ✅ Agent response debugging: detailed response dumps saved to YAML files for analysis and
    monitoring, with fail-fast serialization and support for both test and production environments.
