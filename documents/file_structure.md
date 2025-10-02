# File Structure Map

## Root Directory Structure

```
server-agent/
├── deno.json                 # Deno configuration and dependencies
├── main.ts                   # Application entry point
├── run                       # CLI command runner script
├── README.md                 # Project documentation
├── server-ai                 # AI server component (placeholder)
├── data/                     # Runtime data directory
│   ├── audit/                # Terminal command audit logs
│   ├── memory.jsonl          # LLM conversation history storage
│   ├── offsets/              # Telegram polling offsets
│   └── tmp/                  # Temporary files
├── documents/                # Project documentation
│   ├── design.md             # Software Design Specification
│   ├── file_structure.md     # File structure documentation
│   ├── requirements.md       # Software Requirements Specification
│   └── whiteboard.md         # Development progress and notes
├── src/                      # Source code
│   ├── app.ts                # Main application setup
│   ├── agent/                # Agent facade and LLM integration
│   ├── config/               # Configuration management
│   ├── core/                 # Core types and interfaces
│   ├── system-info/          # System information collection
│   ├── checks/               # System health checks and metrics
│   ├── scheduler/            # Periodic task scheduler
│   ├── telegram/             # Telegram bot integration
│   └── utils/                # Utility functions
└── tests/                    # Test directory (currently empty)
```

## Source Code Structure

```
src/
├── app.ts                   # Application bootstrap and main setup
├── agent/
│   ├── agent.ts             # MainAgent interface and implementation
│   ├── audit-task.ts        # AuditTask for metrics analysis
│   ├── diagnose-task.ts     # DiagnoseTask for problem diagnosis
│   ├── llm.ts               # LLM interface
│   ├── facts/
│   │   ├── file.ts           # Persistent facts storage implementation
│   │   ├── file.test.ts      # Facts storage unit tests
│   │   ├── types.ts          # Facts types and interfaces
│   │   └── mock.ts           # Mock facts storage for tests
│   ├── context/
│   │   ├── builder.ts        # ContextBuilder: symbol-limited context & prompt templating
│   │   └── builder.test.ts
│   └── tools/
│       ├── terminal.ts      # Terminal command execution tool
│       ├── types.ts         # Terminal tool request/response types
│       ├── terminal.test.ts
│       ├── stop.ts          # Stop conversation tool
│       ├── facts.ts           # Facts management tools for LLM
      └── facts.test.ts      # Facts tools unit tests
├── config/
│   ├── config.ts            # Configuration loading and validation
│   ├── config.test.ts       # Configuration unit tests
│   ├── types.ts             # Configuration type definitions
│   ├── load.ts              # Configuration loading utilities
│   └── utils.ts             # Configuration helper functions
├── llm/
│   ├── cost.ts              # CostCalculator implementation (interface + factory) for LLM token pricing and cost calculation
│   └── cost.test.ts         # CostCalculator (interface + factory) unit tests
├── core/
│   └── types.ts             # Common type definitions and interfaces
├── system-info/
│   ├── types.ts                 # SystemInfo class and types
│   └── info-collector.ts        # System information collection at startup
├── checks/
│   ├── all-checks.ts        # Parallel metrics collection orchestrator
│   ├── metrics-analyzer.ts  # Historical metrics analysis and anomaly detection
│   ├── metrics-analyzer.test.ts
│   ├── metrics-service.ts   # Metrics storage and retrieval service
│   ├── metrics-service.test.ts
│   └── metrics/             # Individual metrics collectors (28 total)
│       ├── index.ts         # Collectors registry and exports
│       ├── *-collector.ts   # Individual collector implementations
├── scheduler/
│   └── scheduler.ts         # Periodic health check scheduler with LLM analysis
├── telegram/
│   ├── router.ts            # Command routing and text message handling
│   ├── middlewares.ts       # Telegram middleware and logging
│   ├── telegram-format.ts   # Telegram HTML formatting utilities
│   ├── telegram-format.test.ts
│   ├── utils.ts             # Telegram utility functions for response analysis
│   └── handlers/
│       ├── command-reset-handler.ts    # History reset command handler
│       ├── text-message-handler.ts     # LLM-powered text message processing with real-time notifications
│       └── text-message-handler.test.ts
└── utils/
    ├── logger.ts            # Structured logging with pretty/JSON formats
    └── logger.test.ts
```

## Test Structure

```
tests/                       # Integration and end-to-end tests (currently empty)
```

## File Organization Patterns

### Module Organization

- Feature-based directory structure with clear separation of concerns
- Core business logic separated from infrastructure (adapters pattern)
- Utilities and shared code in dedicated directories

### Naming Conventions

- Files: kebab-case for multi-word names
- Directories: lowercase, singular nouns
- Test files: co-located with implementation (*.test.ts)

### Import Organization

- Relative imports within modules
- No index files for module imports
- Direct imports preferred over barrel exports

### Configuration Management

- Environment-based configuration with validation
- Domain-specific config objects
- Caching prevents repeated parsing
- Secrets masked in logs

### Testing Strategy

- Unit tests co-located with source files
- Integration tests in separate directory
- Behavior-focused test names
- Mock external dependencies
- Agent facade supports dependency injection for testing
- Test doubles for LLM client, conversation history, and prompt renderer

### Real-time Features

- Tool call callbacks for immediate user feedback
- Response debugging with YAML dumps
- Telegram notifications during LLM execution
- Non-blocking notification system
