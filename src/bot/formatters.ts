import { Transaction, TxHashContext, BalanceInfo, ChainName } from '../chains/types';
import { CHAIN_DISPLAY_NAMES, getAdapter } from '../chains';

function shortAddr(addr: string): string {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatTime(ts: number): string {
  if (!ts) return 'pending';
  return new Date(ts * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

function directionEmoji(d: 'in' | 'out' | 'self'): string {
  if (d === 'in') return '\u2B06\uFE0F';   // up arrow (received)
  if (d === 'out') return '\u2B07\uFE0F';   // down arrow (sent)
  return '\u{1F504}';                        // self
}

function directionSign(d: 'in' | 'out' | 'self'): string {
  if (d === 'in') return '+';
  if (d === 'out') return '-';
  return '';
}

function directionLabel(d: 'in' | 'out' | 'self'): string {
  if (d === 'in') return '\u8F6C\u5165';
  if (d === 'out') return '\u8F6C\u51FA';
  return '\u81EA\u8F6C';
}

function formatTxLine(tx: Transaction, idx: number, adapter: ReturnType<typeof getAdapter>): string {
  const emoji = directionEmoji(tx.direction);
  const sign = directionSign(tx.direction);
  const label = directionLabel(tx.direction);
  const counterparty = tx.direction === 'in'
    ? `\u4ECE: ${shortAddr(tx.from)}`
    : `\u81F3: ${shortAddr(tx.to)}`;

  return [
    `${idx}. ${emoji} ${label} ${sign}${tx.value} ${tx.token}`,
    `   ${counterparty}`,
    `   \u{1F552} ${formatTime(tx.timestamp)}`,
    `   [TX](${adapter.getExplorerTxUrl(tx.hash)})`,
  ].join('\n');
}

export function formatRecentTxns(
  txns: Transaction[],
  address: string,
  chain: ChainName,
  remaining?: { used: number; total: number },
): string {
  const adapter = getAdapter(chain);
  const displayChain = CHAIN_DISPLAY_NAMES[chain];

  if (txns.length === 0) {
    return [
      `\u{1F4CB} *\u6700\u8FD1\u4EA4\u6613\u8BB0\u5F55*`,
      ``,
      `\u{1F4CD} \u94FE: ${displayChain}`,
      `\u{1F4EC} \u5730\u5740: \`${shortAddr(address)}\``,
      ``,
      `\u26A0\uFE0F \u672A\u67E5\u8BE2\u5230\u4EA4\u6613\u8BB0\u5F55`,
    ].join('\n');
  }

  const lines = [
    `\u{1F4CB} *\u6700\u8FD1\u4EA4\u6613\u8BB0\u5F55*`,
    ``,
    `\u{1F4CD} \u94FE: ${displayChain}`,
    `\u{1F4EC} \u5730\u5740: \`${shortAddr(address)}\``,
    `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`,
  ];

  txns.forEach((tx, i) => {
    lines.push(formatTxLine(tx, i + 1, adapter));
    if (i < txns.length - 1) lines.push('');
  });

  lines.push(`\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`);

  if (remaining) {
    lines.push(`\u{1F4CA} \u4ECA\u65E5\u5DF2\u67E5\u8BE2: ${remaining.used}/${remaining.total}`);
  }

  return lines.join('\n');
}

export function formatTxContext(
  ctx: TxHashContext,
  address: string,
  chain: ChainName,
): string {
  const adapter = getAdapter(chain);
  const displayChain = CHAIN_DISPLAY_NAMES[chain];

  const lines = [
    `\u{1F50D} *\u4EA4\u6613\u4E0A\u4E0B\u6587\u67E5\u8BE2*`,
    ``,
    `\u{1F4CD} \u94FE: ${displayChain}`,
    `\u{1F4EC} \u5730\u5740: \`${shortAddr(address)}\``,
  ];

  if (ctx.after.length > 0) {
    lines.push(``, `\u{1F53C} *\u4E4B\u540E\u7684\u4EA4\u6613* (\u66F4\u65B0)`);
    lines.push(`\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`);
    ctx.after.forEach((tx, i) => {
      lines.push(formatTxLine(tx, i + 1, adapter));
      if (i < ctx.after.length - 1) lines.push('');
    });
  }

  lines.push(``, `\u{1F3AF} *\u76EE\u6807\u4EA4\u6613*`);
  lines.push(`\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`);
  lines.push(formatTxLine(ctx.target, 0, adapter));

  if (ctx.before.length > 0) {
    lines.push(``, `\u{1F53D} *\u4E4B\u524D\u7684\u4EA4\u6613* (\u66F4\u65E9)`);
    lines.push(`\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`);
    ctx.before.forEach((tx, i) => {
      lines.push(formatTxLine(tx, i + 1, adapter));
      if (i < ctx.before.length - 1) lines.push('');
    });
  }

  return lines.join('\n');
}

export function formatBalanceChange(
  address: string,
  chain: ChainName,
  token: string,
  oldBalance: string,
  newBalance: string,
  txHash?: string,
): string {
  const adapter = getAdapter(chain);
  const displayChain = CHAIN_DISPLAY_NAMES[chain];
  const oldNum = parseFloat(oldBalance) || 0;
  const newNum = parseFloat(newBalance) || 0;
  const diff = newNum - oldNum;
  const sign = diff >= 0 ? '+' : '';

  const lines = [
    `\u{1F514} *\u4F59\u989D\u53D8\u52A8\u63D0\u9192*`,
    ``,
    `\u{1F4CD} \u94FE: ${displayChain}`,
    `\u{1F4EC} \u5730\u5740: \`${shortAddr(address)}\``,
    `\u{1F4B0} \u53D8\u52A8: ${sign}${diff.toFixed(6)} ${token}`,
    `\u{1F4CA} \u5F53\u524D\u4F59\u989D: ${newBalance} ${token}`,
    `\u{1F552} \u65F6\u95F4: ${formatTime(Math.floor(Date.now() / 1000))}`,
  ];

  if (txHash) {
    lines.push(`\u{1F517} [查看交易](${adapter.getExplorerTxUrl(txHash)})`);
  }

  return lines.join('\n');
}

export function formatWatchList(addresses: Array<{ address: string; chain: string; label: string; last_balance: string }>): string {
  if (addresses.length === 0) {
    return `\u{1F4CB} *\u76D1\u63A7\u5217\u8868*\n\n\u5F53\u524D\u6CA1\u6709\u76D1\u63A7\u7684\u5730\u5740\u3002\n\u4F7F\u7528 /watch \u6216\u70B9\u51FB\u4E0B\u65B9\u6309\u94AE\u6DFB\u52A0\u76D1\u63A7\u3002`;
  }

  const lines = [
    `\u{1F4CB} *\u76D1\u63A7\u5217\u8868* (${addresses.length} \u4E2A\u5730\u5740)`,
    `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`,
  ];

  addresses.forEach((item, i) => {
    const chainDisplay = CHAIN_DISPLAY_NAMES[item.chain as ChainName] || item.chain;
    const label = item.label ? ` (${item.label})` : '';
    lines.push(`${i + 1}. \`${shortAddr(item.address)}\`${label}`);
    lines.push(`   \u{1F4CD} ${chainDisplay} | \u{1F4B0} ${item.last_balance || '未知'}`);
    if (i < addresses.length - 1) lines.push('');
  });

  return lines.join('\n');
}

export function formatUserStatus(
  user: { tier: string; sub_expires: string | null },
  queryCount: number,
  watchCount: number,
  isSub: boolean,
): string {
  const tierEmoji = isSub ? '\u{1F451}' : '\u{1F193}';
  const tierName = isSub ? 'Subscription' : 'Free';

  const lines = [
    `\u{1F464} *\u8D26\u6237\u72B6\u6001*`,
    `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`,
    `${tierEmoji} \u7B49\u7EA7: ${tierName}`,
  ];

  if (isSub && user.sub_expires) {
    lines.push(`\u{1F4C5} \u5230\u671F: ${user.sub_expires}`);
  }

  if (!isSub) {
    lines.push(`\u{1F4CA} \u4ECA\u65E5\u67E5\u8BE2: ${queryCount}/5`);
    lines.push(`\u{1F441} \u76D1\u63A7\u5730\u5740: ${watchCount}/1`);
  } else {
    lines.push(`\u{1F4CA} \u67E5\u8BE2: \u65E0\u9650\u5236`);
    lines.push(`\u{1F441} \u76D1\u63A7\u5730\u5740: ${watchCount}/100`);
  }

  return lines.join('\n');
}
