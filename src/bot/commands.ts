import { Bot, InlineKeyboard } from 'grammy';
import { BotContext } from './middleware';
import { mainMenuKeyboard, chainSelectKeyboard, backToMenuKeyboard, unwatchListKeyboard } from './keyboards';
import { formatRecentTxns, formatTxContext, formatWatchList, formatUserStatus } from './formatters';
import { CONFIG } from '../config';
import {
  getTodayQueryCount, logQuery, getWatchAddresses, getWatchCount,
  addWatchAddress, removeWatchAddress,
} from '../db/queries';
import { detectChains, detectTxHash, getAdapter, CHAIN_DISPLAY_NAMES, ChainName } from '../chains';

// Track conversation state per user for button-driven flows
const userState = new Map<number, { action: string; chain?: ChainName; address?: string }>();

export function registerCommands(bot: Bot<BotContext>): void {

  // ─── /start ───
  bot.command('start', async (ctx) => {
    const name = ctx.user.first_name || ctx.user.username || 'User';
    await ctx.reply(
      [
        `\u{1F44B} \u4F60\u597D\uFF0C${name}\uFF01`,
        ``,
        `\u6B22\u8FCE\u4F7F\u7528 *Wallet Monitor Bot*`,
        `\u6211\u53EF\u4EE5\u5E2E\u4F60\u76D1\u63A7\u94B1\u5305\u5730\u5740\u4F59\u989D\u53D8\u52A8\u5E76\u67E5\u8BE2\u4EA4\u6613\u8BB0\u5F55\u3002`,
        ``,
        `\u{1F4A1} *\u652F\u6301\u7684\u94FE:* Ethereum | BSC | Tron | Bitcoin`,
        `\u{1F4B0} *\u652F\u6301\u4EE3\u5E01:* ETH, BNB, TRX, BTC, USDT, USDC`,
        ``,
        `\u70B9\u51FB\u4E0B\u65B9\u6309\u94AE\u5F00\u59CB\u4F7F\u7528\uFF0C\u6216\u8F93\u5165 /help \u67E5\u770B\u547D\u4EE4\u5217\u8868\u3002`,
      ].join('\n'),
      { parse_mode: 'Markdown', reply_markup: mainMenuKeyboard() },
    );
  });

  // ─── /help ───
  bot.command('help', async (ctx) => {
    await sendHelp(ctx);
  });

  // ─── /query <address> [chain] ───
  bot.command('query', async (ctx) => {
    const args = (ctx.match as string || '').trim().split(/\s+/);
    const address = args[0];
    if (!address) {
      await ctx.reply('\u{1F50D} \u8BF7\u53D1\u9001\u8981\u67E5\u8BE2\u7684\u94B1\u5305\u5730\u5740\uFF1A', { reply_markup: backToMenuKeyboard() });
      userState.set(ctx.from!.id, { action: 'query_address' });
      return;
    }
    const chainArg = args[1] as ChainName | undefined;
    await handleQuery(ctx, address, chainArg);
  });

  // ─── /tx <address> <txhash> [chain] ───
  bot.command('tx', async (ctx) => {
    const args = (ctx.match as string || '').trim().split(/\s+/);
    if (args.length < 2) {
      await ctx.reply(
        '\u{1F50D} \u8BF7\u53D1\u9001\u8981\u67E5\u8BE2\u7684\u5730\u5740\u548C\u4EA4\u6613\u54C8\u5E0C\uFF0C\u683C\u5F0F\uFF1A\n`/tx <\u5730\u5740> <\u4EA4\u6613hash>`',
        { parse_mode: 'Markdown', reply_markup: backToMenuKeyboard() },
      );
      return;
    }
    const [address, txHash] = args;
    const chainArg = args[2] as ChainName | undefined;
    await handleTxQuery(ctx, address, txHash, chainArg);
  });

  // ─── /watch <address> [chain] ───
  bot.command('watch', async (ctx) => {
    const args = (ctx.match as string || '').trim().split(/\s+/);
    const address = args[0];
    if (!address) {
      await ctx.reply('\u{1F441} \u8BF7\u53D1\u9001\u8981\u76D1\u63A7\u7684\u94B1\u5305\u5730\u5740\uFF1A', { reply_markup: backToMenuKeyboard() });
      userState.set(ctx.from!.id, { action: 'watch_address' });
      return;
    }
    const chainArg = args[1] as ChainName | undefined;
    await handleWatch(ctx, address, chainArg);
  });

  // ─── /unwatch <address> ───
  bot.command('unwatch', async (ctx) => {
    const address = (ctx.match as string || '').trim();
    if (address) {
      const removed = removeWatchAddress(ctx.from!.id, address);
      if (removed) {
        await ctx.reply(`\u2705 \u5DF2\u79FB\u9664\u76D1\u63A7: \`${address}\``, { parse_mode: 'Markdown', reply_markup: mainMenuKeyboard() });
      } else {
        await ctx.reply('\u26A0\uFE0F \u672A\u627E\u5230\u8BE5\u76D1\u63A7\u5730\u5740\u3002', { reply_markup: mainMenuKeyboard() });
      }
      return;
    }
    await showUnwatchList(ctx);
  });

  // ─── /list ───
  bot.command('list', async (ctx) => {
    await showWatchList(ctx);
  });

  // ─── /status ───
  bot.command('status', async (ctx) => {
    await showStatus(ctx);
  });

  // ─── /subscribe ───
  bot.command('subscribe', async (ctx) => {
    await showSubscribeInfo(ctx);
  });

  // ─── Inline Keyboard Callback Handlers ───
  bot.on('callback_query:data', async (ctx) => {
    const data = ctx.callbackQuery.data;
    await ctx.answerCallbackQuery();

    // Main menu
    if (data === 'action:menu') {
      await ctx.editMessageText(
        '\u{1F3E0} *\u4E3B\u83DC\u5355*\n\u8BF7\u9009\u62E9\u64CD\u4F5C\uFF1A',
        { parse_mode: 'Markdown', reply_markup: mainMenuKeyboard() },
      );
      return;
    }

    // Action buttons
    if (data === 'action:query') {
      await ctx.editMessageText('\u{1F50D} \u8BF7\u53D1\u9001\u8981\u67E5\u8BE2\u7684\u94B1\u5305\u5730\u5740\uFF1A', { reply_markup: backToMenuKeyboard() });
      userState.set(ctx.from!.id, { action: 'query_address' });
      return;
    }
    if (data === 'action:txhash') {
      await ctx.editMessageText(
        '\u{1F50D} \u8BF7\u53D1\u9001\u8981\u67E5\u8BE2\u7684\u5730\u5740\u548C\u4EA4\u6613\u54C8\u5E0C\uFF0C\u683C\u5F0F\uFF1A\n`\u5730\u5740 \u4EA4\u6613hash`',
        { parse_mode: 'Markdown', reply_markup: backToMenuKeyboard() },
      );
      userState.set(ctx.from!.id, { action: 'txhash_query' });
      return;
    }
    if (data === 'action:watch') {
      await ctx.editMessageText('\u{1F441} \u8BF7\u53D1\u9001\u8981\u76D1\u63A7\u7684\u94B1\u5305\u5730\u5740\uFF1A', { reply_markup: backToMenuKeyboard() });
      userState.set(ctx.from!.id, { action: 'watch_address' });
      return;
    }
    if (data === 'action:unwatch') {
      await showUnwatchList(ctx);
      return;
    }
    if (data === 'action:list') {
      await showWatchList(ctx);
      return;
    }
    if (data === 'action:status') {
      await showStatus(ctx);
      return;
    }
    if (data === 'action:subscribe') {
      await showSubscribeInfo(ctx);
      return;
    }
    if (data === 'action:help') {
      await sendHelp(ctx);
      return;
    }

    // Chain selection for query
    if (data.startsWith('chainquery:')) {
      const chain = data.split(':')[1] as ChainName;
      const state = userState.get(ctx.from!.id);
      if (state?.address) {
        await handleQuery(ctx, state.address, chain);
        userState.delete(ctx.from!.id);
      }
      return;
    }

    // Chain selection for watch
    if (data.startsWith('chainwatch:')) {
      const chain = data.split(':')[1] as ChainName;
      const state = userState.get(ctx.from!.id);
      if (state?.address) {
        await handleWatch(ctx, state.address, chain);
        userState.delete(ctx.from!.id);
      }
      return;
    }

    // Chain selection for tx hash query
    if (data.startsWith('chaintx:')) {
      const chain = data.split(':')[1] as ChainName;
      const state = userState.get(ctx.from!.id);
      if (state?.address && state?.action) {
        const parts = state.action.split('|');
        const txHash = parts[1];
        if (txHash) {
          await handleTxQuery(ctx, state.address, txHash, chain);
        }
        userState.delete(ctx.from!.id);
      }
      return;
    }

    // Unwatch specific address
    if (data.startsWith('unwatch:')) {
      const parts = data.split(':');
      const address = parts[2];
      const chain = parts[3];
      const removed = removeWatchAddress(ctx.from!.id, address, chain);
      if (removed) {
        await ctx.editMessageText(
          `\u2705 \u5DF2\u79FB\u9664\u76D1\u63A7: \`${address}\` (${chain})`,
          { parse_mode: 'Markdown', reply_markup: mainMenuKeyboard() },
        );
      } else {
        await ctx.editMessageText('\u26A0\uFE0F \u79FB\u9664\u5931\u8D25', { reply_markup: mainMenuKeyboard() });
      }
      return;
    }
  });

  // ─── Plain text message handler (for button-driven flows) ───
  bot.on('message:text', async (ctx) => {
    const text = ctx.message.text.trim();
    const userId = ctx.from!.id;
    const state = userState.get(userId);

    if (!state) {
      // Try auto-detect: if user sends an address directly, query it
      const detection = detectChains(text);
      if (detection.possibleChains.length > 0) {
        await handleQuery(ctx, text);
        return;
      }
      // Not recognized
      await ctx.reply(
        '\u{1F914} \u65E0\u6CD5\u8BC6\u522B\u8F93\u5165\u5185\u5BB9\u3002\u8BF7\u4F7F\u7528\u83DC\u5355\u6216\u8F93\u5165 /help \u67E5\u770B\u5E2E\u52A9\u3002',
        { reply_markup: mainMenuKeyboard() },
      );
      return;
    }

    // Handle conversation states
    if (state.action === 'query_address') {
      userState.delete(userId);
      await handleQuery(ctx, text);
      return;
    }

    if (state.action === 'watch_address') {
      userState.delete(userId);
      await handleWatch(ctx, text);
      return;
    }

    if (state.action === 'txhash_query') {
      userState.delete(userId);
      const parts = text.split(/\s+/);
      if (parts.length < 2) {
        await ctx.reply(
          '\u26A0\uFE0F \u683C\u5F0F\u9519\u8BEF\uFF0C\u8BF7\u53D1\u9001\uFF1A\n`\u5730\u5740 \u4EA4\u6613hash`',
          { parse_mode: 'Markdown', reply_markup: mainMenuKeyboard() },
        );
        return;
      }
      await handleTxQuery(ctx, parts[0], parts[1], parts[2] as ChainName | undefined);
      return;
    }
  });
}

// ─── Handler Functions ───

async function handleQuery(ctx: BotContext, address: string, chain?: ChainName): Promise<void> {
  const userId = ctx.from!.id;

  // Detect chain
  const detection = detectChains(address);
  if (detection.possibleChains.length === 0) {
    await ctx.reply('\u26A0\uFE0F \u65E0\u6CD5\u8BC6\u522B\u8BE5\u5730\u5740\u683C\u5F0F\u3002\u8BF7\u68C0\u67E5\u540E\u91CD\u8BD5\u3002', { reply_markup: mainMenuKeyboard() });
    return;
  }

  // If multiple chains possible and none specified, ask user to choose
  if (!chain && detection.possibleChains.length > 1) {
    userState.set(userId, { action: 'query_address', address });
    await ctx.reply(
      `\u{1F4CD} \u8BE5\u5730\u5740\u53EF\u80FD\u5C5E\u4E8E\u591A\u6761\u94FE\uFF0C\u8BF7\u9009\u62E9\uFF1A`,
      { reply_markup: chainSelectKeyboard('chainquery') },
    );
    return;
  }

  const selectedChain = chain || detection.possibleChains[0];

  // Check quota for free users
  if (!ctx.isSub) {
    const used = getTodayQueryCount(userId);
    if (used >= CONFIG.FREE_DAILY_QUERIES) {
      await ctx.reply(
        [
          `\u26A0\uFE0F \u4ECA\u65E5\u514D\u8D39\u67E5\u8BE2\u6B21\u6570\u5DF2\u7528\u5B8C (${used}/${CONFIG.FREE_DAILY_QUERIES})`,
          ``,
          `\u{1F451} \u5347\u7EA7\u8BA2\u9605\u53EF\u89E3\u9501\u65E0\u9650\u67E5\u8BE2\uFF01`,
        ].join('\n'),
        { reply_markup: new InlineKeyboard().text('\u{1F451} \u5347\u7EA7\u8BA2\u9605', 'action:subscribe').text('\u{1F519} \u8FD4\u56DE', 'action:menu') },
      );
      return;
    }
  }

  // Execute query
  await ctx.reply('\u23F3 \u6B63\u5728\u67E5\u8BE2...');
  try {
    const adapter = getAdapter(selectedChain);
    const limit = ctx.isSub ? CONFIG.SUB_TX_LIMIT : CONFIG.FREE_TX_LIMIT;
    const txns = await adapter.getRecentTransactions(address, limit);

    logQuery(userId, address, selectedChain, 'address');
    const used = getTodayQueryCount(userId);
    const remaining = ctx.isSub ? undefined : { used, total: CONFIG.FREE_DAILY_QUERIES };

    const msg = formatRecentTxns(txns, address, selectedChain, remaining);
    await ctx.reply(msg, { parse_mode: 'Markdown', reply_markup: mainMenuKeyboard() });
  } catch (err) {
    await ctx.reply('\u274C \u67E5\u8BE2\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002', { reply_markup: mainMenuKeyboard() });
  }
}

async function handleTxQuery(ctx: BotContext, address: string, txHash: string, chain?: ChainName): Promise<void> {
  const userId = ctx.from!.id;

  const addrDetection = detectChains(address);
  if (addrDetection.possibleChains.length === 0) {
    await ctx.reply('\u26A0\uFE0F \u65E0\u6CD5\u8BC6\u522B\u8BE5\u5730\u5740\u683C\u5F0F\u3002', { reply_markup: mainMenuKeyboard() });
    return;
  }

  if (!chain && addrDetection.possibleChains.length > 1) {
    userState.set(userId, { action: `txhash|${txHash}`, address });
    await ctx.reply(
      `\u{1F4CD} \u8BE5\u5730\u5740\u53EF\u80FD\u5C5E\u4E8E\u591A\u6761\u94FE\uFF0C\u8BF7\u9009\u62E9\uFF1A`,
      { reply_markup: chainSelectKeyboard('chaintx') },
    );
    return;
  }

  const selectedChain = chain || addrDetection.possibleChains[0];

  // Check quota
  if (!ctx.isSub) {
    const used = getTodayQueryCount(userId);
    if (used >= CONFIG.FREE_DAILY_QUERIES) {
      await ctx.reply(
        `\u26A0\uFE0F \u4ECA\u65E5\u514D\u8D39\u67E5\u8BE2\u6B21\u6570\u5DF2\u7528\u5B8C\u3002\n\n\u{1F451} \u5347\u7EA7\u8BA2\u9605\u53EF\u89E3\u9501\u65E0\u9650\u67E5\u8BE2\uFF01`,
        { reply_markup: new InlineKeyboard().text('\u{1F451} \u5347\u7EA7\u8BA2\u9605', 'action:subscribe').text('\u{1F519} \u8FD4\u56DE', 'action:menu') },
      );
      return;
    }
  }

  await ctx.reply('\u23F3 \u6B63\u5728\u67E5\u8BE2\u4EA4\u6613\u4E0A\u4E0B\u6587...');
  try {
    const adapter = getAdapter(selectedChain);
    const range = ctx.isSub ? CONFIG.SUB_TX_HASH_RANGE : CONFIG.FREE_TX_HASH_RANGE;
    const result = await adapter.getTransactionContext(address, txHash, range);

    if (!result) {
      await ctx.reply('\u26A0\uFE0F \u672A\u627E\u5230\u8BE5\u4EA4\u6613\uFF0C\u8BF7\u786E\u8BA4\u5730\u5740\u548C\u4EA4\u6613\u54C8\u5E0C\u662F\u5426\u6B63\u786E\u3002', { reply_markup: mainMenuKeyboard() });
      return;
    }

    logQuery(userId, address, selectedChain, 'txhash');
    const msg = formatTxContext(result, address, selectedChain);
    await ctx.reply(msg, { parse_mode: 'Markdown', reply_markup: mainMenuKeyboard() });
  } catch (err) {
    await ctx.reply('\u274C \u67E5\u8BE2\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002', { reply_markup: mainMenuKeyboard() });
  }
}

async function handleWatch(ctx: BotContext, address: string, chain?: ChainName): Promise<void> {
  const userId = ctx.from!.id;

  const detection = detectChains(address);
  if (detection.possibleChains.length === 0) {
    await ctx.reply('\u26A0\uFE0F \u65E0\u6CD5\u8BC6\u522B\u8BE5\u5730\u5740\u683C\u5F0F\u3002', { reply_markup: mainMenuKeyboard() });
    return;
  }

  if (!chain && detection.possibleChains.length > 1) {
    userState.set(userId, { action: 'watch_address', address });
    await ctx.reply(
      `\u{1F4CD} \u8BE5\u5730\u5740\u53EF\u80FD\u5C5E\u4E8E\u591A\u6761\u94FE\uFF0C\u8BF7\u9009\u62E9\uFF1A`,
      { reply_markup: chainSelectKeyboard('chainwatch') },
    );
    return;
  }

  const selectedChain = chain || detection.possibleChains[0];

  // Check watch quota
  const watchCount = getWatchCount(userId);
  const limit = ctx.isSub ? CONFIG.SUB_WATCH_LIMIT : CONFIG.FREE_WATCH_LIMIT;
  if (watchCount >= limit) {
    const msg = ctx.isSub
      ? `\u26A0\uFE0F \u5DF2\u8FBE\u5230\u76D1\u63A7\u4E0A\u9650 (${limit} \u4E2A\u5730\u5740)\u3002\u8BF7\u5148\u79FB\u9664\u4E0D\u9700\u8981\u7684\u76D1\u63A7\u3002`
      : `\u26A0\uFE0F Free \u7528\u6237\u53EA\u80FD\u76D1\u63A7 ${limit} \u4E2A\u5730\u5740\u3002\n\n\u{1F451} \u5347\u7EA7\u8BA2\u9605\u53EF\u76D1\u63A7\u6700\u591A 100 \u4E2A\u5730\u5740\uFF01`;
    await ctx.reply(msg, {
      reply_markup: ctx.isSub
        ? mainMenuKeyboard()
        : new InlineKeyboard().text('\u{1F451} \u5347\u7EA7\u8BA2\u9605', 'action:subscribe').text('\u{1F519} \u8FD4\u56DE', 'action:menu'),
    });
    return;
  }

  const added = addWatchAddress(userId, address, selectedChain);
  if (added) {
    const chainDisplay = CHAIN_DISPLAY_NAMES[selectedChain];
    await ctx.reply(
      `\u2705 \u5DF2\u6DFB\u52A0\u76D1\u63A7\uFF01\n\n\u{1F4CD} \u94FE: ${chainDisplay}\n\u{1F4EC} \u5730\u5740: \`${address}\`\n\n\u4F59\u989D\u53D8\u52A8\u65F6\u5C06\u81EA\u52A8\u63A8\u9001\u901A\u77E5\u3002`,
      { parse_mode: 'Markdown', reply_markup: mainMenuKeyboard() },
    );
  } else {
    await ctx.reply('\u26A0\uFE0F \u8BE5\u5730\u5740\u5DF2\u5728\u76D1\u63A7\u5217\u8868\u4E2D\u3002', { reply_markup: mainMenuKeyboard() });
  }
}

async function showUnwatchList(ctx: BotContext): Promise<void> {
  const addresses = getWatchAddresses(ctx.from!.id);
  if (addresses.length === 0) {
    const text = '\u{1F4CB} \u5F53\u524D\u6CA1\u6709\u76D1\u63A7\u7684\u5730\u5740\u3002';
    if (ctx.callbackQuery) {
      await ctx.editMessageText(text, { reply_markup: mainMenuKeyboard() });
    } else {
      await ctx.reply(text, { reply_markup: mainMenuKeyboard() });
    }
    return;
  }
  const kb = unwatchListKeyboard(addresses.map(a => ({ address: a.address, chain: a.chain, id: a.id })));
  const text = '\u274C \u8BF7\u9009\u62E9\u8981\u53D6\u6D88\u76D1\u63A7\u7684\u5730\u5740\uFF1A';
  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { reply_markup: kb });
  } else {
    await ctx.reply(text, { reply_markup: kb });
  }
}

async function showWatchList(ctx: BotContext): Promise<void> {
  const addresses = getWatchAddresses(ctx.from!.id);
  const msg = formatWatchList(addresses);
  if (ctx.callbackQuery) {
    await ctx.editMessageText(msg, { parse_mode: 'Markdown', reply_markup: mainMenuKeyboard() });
  } else {
    await ctx.reply(msg, { parse_mode: 'Markdown', reply_markup: mainMenuKeyboard() });
  }
}

async function showStatus(ctx: BotContext): Promise<void> {
  const queryCount = getTodayQueryCount(ctx.from!.id);
  const watchCount = getWatchCount(ctx.from!.id);
  const msg = formatUserStatus(ctx.user, queryCount, watchCount, ctx.isSub);
  if (ctx.callbackQuery) {
    await ctx.editMessageText(msg, { parse_mode: 'Markdown', reply_markup: mainMenuKeyboard() });
  } else {
    await ctx.reply(msg, { parse_mode: 'Markdown', reply_markup: mainMenuKeyboard() });
  }
}

async function showSubscribeInfo(ctx: BotContext): Promise<void> {
  const msg = [
    `\u{1F451} *\u8BA2\u9605\u65B9\u6848*`,
    `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`,
    ``,
    `*Free \u514D\u8D39\u7248:*`,
    `  \u2022 \u6BCF\u65E5 5 \u6B21\u5730\u5740\u67E5\u8BE2 (\u6BCF\u6B21 5 \u6761\u8BB0\u5F55)`,
    `  \u2022 \u76D1\u63A7 1 \u4E2A\u5730\u5740`,
    `  \u2022 TX Hash \u67E5\u8BE2\u524D\u540E 3 \u7B14`,
    ``,
    `*Subscription \u8BA2\u9605\u7248:*`,
    `  \u2022 \u65E0\u9650\u67E5\u8BE2\u6B21\u6570 (\u6BCF\u6B21 20 \u6761\u8BB0\u5F55)`,
    `  \u2022 \u76D1\u63A7\u6700\u591A 100 \u4E2A\u5730\u5740`,
    `  \u2022 TX Hash \u67E5\u8BE2\u524D\u540E 10 \u7B14`,
    `  \u2022 \u4F18\u5148\u63A8\u9001\u901A\u77E5`,
    ``,
    `\u{1F4B0} \u4EF7\u683C: $${CONFIG.SUB_MONTHLY_PRICE_USD}/\u6708`,
    ``,
    `\u8BF7\u8054\u7CFB\u7BA1\u7406\u5458\u5F00\u901A\u8BA2\u9605\u3002`,
  ].join('\n');

  if (ctx.callbackQuery) {
    await ctx.editMessageText(msg, { parse_mode: 'Markdown', reply_markup: mainMenuKeyboard() });
  } else {
    await ctx.reply(msg, { parse_mode: 'Markdown', reply_markup: mainMenuKeyboard() });
  }
}

async function sendHelp(ctx: BotContext): Promise<void> {
  const msg = [
    `\u2753 *\u5E2E\u52A9\u4FE1\u606F*`,
    `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`,
    ``,
    `*\u547D\u4EE4\u5217\u8868:*`,
    `/start - \u542F\u52A8\u673A\u5668\u4EBA`,
    `/query <\u5730\u5740> - \u67E5\u8BE2\u6700\u8FD1\u4EA4\u6613`,
    `/tx <\u5730\u5740> <hash> - \u67E5\u8BE2\u6307\u5B9A\u4EA4\u6613\u524D\u540E\u8BB0\u5F55`,
    `/watch <\u5730\u5740> - \u6DFB\u52A0\u5730\u5740\u76D1\u63A7`,
    `/unwatch <\u5730\u5740> - \u79FB\u9664\u5730\u5740\u76D1\u63A7`,
    `/list - \u67E5\u770B\u76D1\u63A7\u5217\u8868`,
    `/status - \u67E5\u770B\u8D26\u6237\u72B6\u6001`,
    `/subscribe - \u67E5\u770B\u8BA2\u9605\u65B9\u6848`,
    ``,
    `*\u5FEB\u6377\u64CD\u4F5C:*`,
    `\u2022 \u76F4\u63A5\u53D1\u9001\u94B1\u5305\u5730\u5740\u5373\u53EF\u67E5\u8BE2`,
    `\u2022 \u6240\u6709\u529F\u80FD\u90FD\u53EF\u901A\u8FC7\u4E0B\u65B9\u6309\u94AE\u64CD\u4F5C`,
    ``,
    `*\u652F\u6301\u7684\u94FE:*`,
    `Ethereum | BSC | Tron | Bitcoin`,
    ``,
    `*\u652F\u6301\u7684\u4EE3\u5E01:*`,
    `ETH, BNB, TRX, BTC, USDT, USDC`,
  ].join('\n');

  if (ctx.callbackQuery) {
    await ctx.editMessageText(msg, { parse_mode: 'Markdown', reply_markup: mainMenuKeyboard() });
  } else {
    await ctx.reply(msg, { parse_mode: 'Markdown', reply_markup: mainMenuKeyboard() });
  }
}
