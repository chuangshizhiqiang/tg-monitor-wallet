import { Bot } from 'grammy';
import { CONFIG } from './config';
import { getDb } from './db';
import { BotContext, userMiddleware } from './bot/middleware';
import { registerCommands } from './bot/commands';
import { startWatcher } from './monitor/watcher';

async function main() {
  // Validate config
  if (!CONFIG.BOT_TOKEN) {
    console.error('Error: TELEGRAM_BOT_TOKEN or TGBOTTOKEN environment variable is required.');
    process.exit(1);
  }

  // Initialize database
  getDb();
  console.log('[DB] Database initialized');

  // Create bot
  const bot = new Bot<BotContext>(CONFIG.BOT_TOKEN);

  // Register middleware
  bot.use(userMiddleware);

  // Register commands
  registerCommands(bot);

  // Set bot commands menu
  await bot.api.setMyCommands([
    { command: 'start', description: '\u542F\u52A8\u673A\u5668\u4EBA' },
    { command: 'query', description: '\u67E5\u8BE2\u5730\u5740\u6700\u8FD1\u4EA4\u6613' },
    { command: 'tx', description: '\u67E5\u8BE2\u6307\u5B9A\u4EA4\u6613\u524D\u540E\u8BB0\u5F55' },
    { command: 'watch', description: '\u6DFB\u52A0\u5730\u5740\u76D1\u63A7' },
    { command: 'unwatch', description: '\u79FB\u9664\u5730\u5740\u76D1\u63A7' },
    { command: 'list', description: '\u67E5\u770B\u76D1\u63A7\u5217\u8868' },
    { command: 'status', description: '\u67E5\u770B\u8D26\u6237\u72B6\u6001' },
    { command: 'subscribe', description: '\u67E5\u770B\u8BA2\u9605\u65B9\u6848' },
    { command: 'help', description: '\u5E2E\u52A9\u4FE1\u606F' },
  ]);

  // Start balance watcher
  startWatcher(bot);

  // Start bot
  console.log('[Bot] Starting Wallet Monitor Bot...');
  bot.start({
    onStart: (info) => {
      console.log(`[Bot] Running as @${info.username}`);
    },
  });

  // Graceful shutdown
  const shutdown = () => {
    console.log('[Bot] Shutting down...');
    bot.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
