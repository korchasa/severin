/**
 * Main application entry point
 * Initializes all components and starts the Telegram bot
 */

import { Bot } from "grammy";
import { loadConfig } from "./config/load.ts";
import { toJSONWithoutPII } from "./config/utils.ts";
import { createAuthMiddleware, createLoggingMiddleware } from "./telegram/middlewares.ts";
import { initializeLogger, log } from "./utils/logger.ts";
import { MainAgent } from "./agent/main-agent.ts";
import { CommandRouter } from "./telegram/router.ts";
import { healthScheduler } from "./scheduler/scheduler.ts";
import { createHistoryResetCommand } from "./telegram/handlers/command-reset-handler.ts";
import { createTextMessageHandler } from "./telegram/handlers/text-message-handler.ts";
import { collectSystemInfo } from "./system-info/info-collector.ts";
import { createAuditTask } from "./agent/audit-task.ts";
import { ConversationHistory } from "./agent/history/service.ts";
import { createOpenAI } from "@ai-sdk/openai";
import { createDiagnoseTask } from "./agent/diagnose-task.ts";
import { createTerminalTool } from "./agent/tools/terminal.ts";
import { createFactsStorage } from "./agent/facts/storage.ts";
// LLM adapter encapsulated within agent

/**
 * Initializes and starts the Telegram bot agent
 */
export async function startAgent(): Promise<void> {
  // Load and validate basic configuration (without system info)
  const basicConfig = loadConfig();

  // Initialize logger with configured format
  initializeLogger(basicConfig.logging.format);

  // Collect system information
  log({ mod: "boot", event: "collecting_system_info" });
  const systemInfo = await collectSystemInfo();
  const formattedSystemInfo = systemInfo.toMarkdown();

  // Log collected system information
  log({
    mod: "boot",
    event: "system_info_collected",
    system_info: "\n" + formattedSystemInfo,
  });

  // Load configuration with system information included in system prompt
  const config = loadConfig(formattedSystemInfo);

  // Log startup configuration (mask sensitive data)
  log({
    mod: "boot",
    event: "config_loaded",
    system_info_collected: !!formattedSystemInfo,
    config: toJSONWithoutPII(config),
  });

  // Data directory is configured but not used in PoC (in-history storage only)
  const terminalTool = createTerminalTool(
    config.agent.terminal.timeoutMs,
    config.agent.terminal.maxCommandOutputSize,
    config.agent.terminal.maxLLMInputLength,
  );

  // Initialize facts storage
  const factsStorage = createFactsStorage(config.agent.dataDir);

  // Initialize agent (encapsulates LLM, history, tools)
  const llmProvider = createOpenAI({ apiKey: config.agent.llm.apiKey });
  const llmModel = llmProvider(config.agent.llm.model);
  const conversationHistory = new ConversationHistory();
  const mainAgent = new MainAgent({
    llmModel,
    llmTemperature: config.agent.llm.temperature,
    basePrompt: config.agent.llm.basePrompt,
    terminalTool,
    conversationHistory,
    systemInfo,
    factsStorage,
    dataDir: config.agent.dataDir,
  });
  const auditTask = createAuditTask({
    llmModel,
    llmTemperature: config.agent.llm.temperature,
    systemInfo,
    factsStorage,
  });
  const diagnoseTask = createDiagnoseTask({
    llmModel,
    llmTemperature: config.agent.llm.temperature,
    terminalTool,
    systemInfo,
    factsStorage,
  });

  // LLM adapter encapsulated within agent

  // Create bot instance
  const bot = new Bot(config.telegram.botToken);

  // Setup middleware
  bot.use(createAuthMiddleware(config.telegram.ownerIds));
  bot.use(createLoggingMiddleware());

  // Initialize scheduler
  healthScheduler.initialize(bot, config, conversationHistory, auditTask, diagnoseTask);

  // Setup command router
  const router = new CommandRouter();

  // Register commands
  router.registerCommand(createHistoryResetCommand(conversationHistory));

  // Setup command handlers
  router.setupHandlers(bot);

  // Setup text message handler
  const textMessageHandler = createTextMessageHandler(mainAgent, config);
  router.setupTextHandler(bot, textMessageHandler);

  // Start the bot
  bot.start();
  log({ mod: "boot", event: "started", polling: true });

  // Start initial health check
  // healthScheduler.triggerChecks();
}
