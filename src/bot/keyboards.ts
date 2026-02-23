import { InlineKeyboard } from 'grammy';

/**
 * Main menu keyboard shown after /start and via "menu" button.
 */
export function mainMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('\u{1F50D} \u67E5\u8BE2\u5730\u5740', 'action:query')
    .text('\u{1F4CB} \u67E5\u8BE2\u4EA4\u6613', 'action:txhash')
    .row()
    .text('\u{1F441} \u6DFB\u52A0\u76D1\u63A7', 'action:watch')
    .text('\u274C \u53D6\u6D88\u76D1\u63A7', 'action:unwatch')
    .row()
    .text('\u{1F4CB} \u76D1\u63A7\u5217\u8868', 'action:list')
    .text('\u{1F464} \u8D26\u6237\u72B6\u6001', 'action:status')
    .row()
    .text('\u{1F451} \u5347\u7EA7\u8BA2\u9605', 'action:subscribe')
    .text('\u2753 \u5E2E\u52A9', 'action:help');
}

/**
 * Chain selection keyboard for query/watch operations.
 */
export function chainSelectKeyboard(callbackPrefix: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('Ethereum', `${callbackPrefix}:ethereum`)
    .text('BSC', `${callbackPrefix}:bsc`)
    .row()
    .text('Tron', `${callbackPrefix}:tron`)
    .text('Bitcoin', `${callbackPrefix}:bitcoin`)
    .row()
    .text('\u{1F519} \u8FD4\u56DE\u4E3B\u83DC\u5355', 'action:menu');
}

/**
 * Back to menu button.
 */
export function backToMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('\u{1F519} \u8FD4\u56DE\u4E3B\u83DC\u5355', 'action:menu');
}

/**
 * Confirm unwatch keyboard listing current addresses.
 */
export function unwatchListKeyboard(addresses: Array<{ address: string; chain: string; id: number }>): InlineKeyboard {
  const kb = new InlineKeyboard();
  addresses.forEach((a, i) => {
    const short = a.address.length > 14 ? `${a.address.slice(0, 6)}...${a.address.slice(-4)}` : a.address;
    kb.text(`\u274C ${short} (${a.chain})`, `unwatch:${a.id}:${a.address}:${a.chain}`);
    if (i < addresses.length - 1) kb.row();
  });
  kb.row().text('\u{1F519} \u8FD4\u56DE\u4E3B\u83DC\u5355', 'action:menu');
  return kb;
}
