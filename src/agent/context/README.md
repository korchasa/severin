# Context Management

Manages conversation history and context for LLM interactions in the server agent.

## Components

### ContextBuilder

Main class for building conversation context with message deduplication and token tracking.

### HistoryCompactor

Interface for history compaction strategies:

- **SimpleHistoryCompactor**: Basic trimming within symbol limits
- **SummarizingHistoryCompactor**: LLM-powered summarization for long conversations

### SummaryGenerator

Service for generating conversation summaries using LLM.

## Key Features

- Message deduplication by content hash
- Tool-call/tool-result consistency preservation
- Symbol-based context limiting
- System prompt templating with server info and facts
- Progressive compaction from simple trimming to summarization

## Testing

Comprehensive tests for deduplication, trimming, and tool consistency.

Run tests: `./run test src/agent/context/`

## Dependencies

- `ai` - ModelMessage types and LLM integration
- `system-info` - Server information
- `facts` - Persistent facts storage
- `logger` - Structured logging
