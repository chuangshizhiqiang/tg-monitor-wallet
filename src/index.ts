import { Bot } from 'grammy';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { CONFIG } from './config';
import { getDb } from './db';
import { BotContext, userMiddleware } from './bot/middleware';
import { registerCommands } from './bot/commands';
import { startWatcher } from './monitor/watcher';

function getProxyUrl(): string | undefined {
  return process.env.HTTPS_PROXY || process.env.https_proxy
    || process.env.HTTP_PROXY || process.env.http_proxy
    || undefined;
}

async function main() {
  // Validate config
  if (!CONFIG.BOT_TOKEN) {
    console.error('Error: TELEGRAM_BOT_TOKEN or TGBOTTOKEN environment variable is required.');
    process.exit(1);
  }

  // Initialize database
  getDb();
  console.log('[DB] Database initialized');

  // Configure proxy if available
  const proxyUrl = getProxyUrl();
  const botConfig: any = {};
  if (proxyUrl) {
    console.log('[Proxy] Using HTTP proxy for Telegram API');
    const agent = new HttpsProxyAgent(proxyUrl);
    botConfig.client = {
      baseFetchConfig: {
        agent,
        compress: true,
      } as any,
    };
  }

  // Create bot
  const bot = new Bot<BotContext>(CONFIG.BOT_TOKEN, botConfig);

  // Register middleware
  bot.use(userMiddleware);

  // Register commands
  registerCommands(bot);

  // Set bot commands menu
  await bot.api.setMyCommands([
    { command: 'start', description: '启动机器人' },
    { command: 'query', description: '查询地址最近交易' },
    { command: 'tx', description: '查询指定交易前后记录' },
    { command: 'watch', description: '添加地址监控' },
    { command: 'unwatch', description: '移除地址监控' },
    { command: 'list', description: '查看监控列表' },
    { command: 'status', description: '查看账户状态' },
    { command: 'subscribe', description: '查看订阅方案' },
    { command: 'help', description: '帮助信息' },
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
