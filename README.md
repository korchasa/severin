# Server Agent

Telegram-based Home Server Agent (PoC) - reliable and maintainable bot for server management.

## Features

- **Telegram Control**: Receive commands and send notifications
- **Tools**: Execute terminal commands via AI
- **Health Checks**: Periodically monitor server health and send notifications if issues are
  detected

## Screenshots

![Screenshot 1](documents/1.png)

## Quick Start

```bash
# Run checks (formatting, linting, tests)
./run check

# Install dependencies and start application
./run start

# Compile and run on server and start
./run deploy server.lan:~/server-ai
```

## Configuration

Set environment variables:

### Required

- `TELEGRAM_BOT_TOKEN` - Telegram bot token from [@BotFather](https://t.me/botfather)
- `TELEGRAM_OWNER_IDS` - allowed Telegram user IDs (comma-separated list of numbers)
- `AGENT_LLM_API_KEY` - OpenAI API key for LLM functionality

### Optional

- `AGENT_DATA_DIR` - directory for storing data files (default: "./data")
- `LOGGING_FORMAT` - log output format: "pretty" or "json" (default: "pretty")
- `AGENT_MEMORY_MAX_SYMBOLS` - maximum total symbols in context (default: 20000)
- `AGENT_TERMINAL_TIMEOUT_MS` - terminal tool timeout in milliseconds (default: 30000)
- `AGENT_TERMINAL_MAX_COMMAND_OUTPUT_SIZE` - max stdout size for terminal tool (default: 200000)
- `AGENT_TERMINAL_MAX_LLM_INPUT_LENGTH` - input length limit for terminal tool (default: 2000)
- `RATE_LIMIT_REQUEST_INTERVAL_MS` - minimum interval between user requests in milliseconds
  (default: 5000)
- `SCHEDULER_INTERVAL_HOURS` - hours between health checks (default: 1)
- `SCHEDULER_JITTER_MINUTES` - random jitter for check timing in minutes (default: 5)

## Bot Commands

- `/reset` - reset context

## Architecture

- **Deno runtime** for reliability and security
- **TypeScript strict mode** with domain-organized configuration
- **grammy** for Telegram Bot API
- **zod** for data validation
- **Vercel AI SDK** for LLM integration with tool calls
- **File storage** for simplicity (JSONL)
  - Facts storage module: `src/agent/facts/file.ts`
  - Context building: `src/agent/context/builder.ts` (symbol-limited + prompt templating)
- **AbortController-based timeouts** for terminal tool execution

## Documentation

- [Requirements](documents/requirements.md) - Software Requirements Specification
- [Design](documents/design.md) - Software Design Specification
