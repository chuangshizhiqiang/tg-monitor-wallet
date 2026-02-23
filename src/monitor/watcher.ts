import cron from 'node-cron';
import { Bot } from 'grammy';
import { BotContext } from '../bot/middleware';
import { getAllWatchAddresses, updateWatchBalance, getUser, isSubscribed } from '../db/queries';
import { getAdapter, ChainName } from '../chains';
import { formatBalanceChange } from '../bot/formatters';
import { CONFIG } from '../config';

export function startWatcher(bot: Bot<BotContext>): void {
  console.log(`[Watcher] Starting monitor, polling every ${CONFIG.POLL_INTERVAL_SECONDS}s`);

  cron.schedule(`*/${CONFIG.POLL_INTERVAL_SECONDS} * * * * *`, async () => {
    try {
      await pollAllAddresses(bot);
    } catch (err) {
      console.error('[Watcher] Poll error:', err);
    }
  });
}

async function pollAllAddresses(bot: Bot<BotContext>): Promise<void> {
  const addresses = getAllWatchAddresses();
  if (addresses.length === 0) return;

  // Process in batches to avoid API rate limits
  const BATCH_SIZE = 5;
  for (let i = 0; i < addresses.length; i += BATCH_SIZE) {
    const batch = addresses.slice(i, i + BATCH_SIZE);

    await Promise.allSettled(batch.map(async (watch) => {
      try {
        const adapter = getAdapter(watch.chain as ChainName);
        const balanceInfo = await adapter.getBalances(watch.address);

        for (const tokenBal of balanceInfo.balances) {
          // Build a composite key for this specific token
          const oldComposite = watch.last_balance || '0';
          const newBalance = tokenBal.balance;

          // For simplicity, compare the primary balance (first token or sum approach)
          // We'll track the main native token balance change
          if (tokenBal.balance !== oldComposite && watch.last_balance !== '0') {
            // Get latest tx hash for reference
            let latestTxHash: string | undefined;
            try {
              const txns = await adapter.getRecentTransactions(watch.address, 1);
              if (txns.length > 0) latestTxHash = txns[0].hash;
            } catch { /* skip */ }

            // Check if user is subscription for priority
            const user = getUser(watch.telegram_id);
            const isSub = user ? isSubscribed(user) : false;

            const msg = formatBalanceChange(
              watch.address,
              watch.chain as ChainName,
              tokenBal.token,
              oldComposite,
              newBalance,
              latestTxHash,
            );

            try {
              await bot.api.sendMessage(watch.telegram_id, msg, { parse_mode: 'Markdown' });
            } catch (sendErr) {
              console.error(`[Watcher] Failed to notify user ${watch.telegram_id}:`, sendErr);
            }
          }

          // Update stored balance (use first token as primary balance)
          updateWatchBalance(watch.id, tokenBal.balance, watch.last_tx_hash);
          break; // Only track the primary (first) token balance
        }
      } catch (err) {
        console.error(`[Watcher] Error checking ${watch.address} on ${watch.chain}:`, err);
      }
    }));

    // Small delay between batches to respect rate limits
    if (i + BATCH_SIZE < addresses.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}
