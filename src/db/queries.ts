import { getDb } from './index';

export interface User {
  telegram_id: number;
  username: string | null;
  first_name: string | null;
  tier: 'free' | 'subscription';
  sub_expires: string | null;
  created_at: string;
}

export interface WatchAddress {
  id: number;
  telegram_id: number;
  address: string;
  chain: string;
  label: string;
  last_balance: string;
  last_tx_hash: string;
  created_at: string;
}

// ─── User Operations ───

export function ensureUser(telegramId: number, username?: string, firstName?: string): User {
  const db = getDb();
  db.prepare(`
    INSERT INTO users (telegram_id, username, first_name)
    VALUES (?, ?, ?)
    ON CONFLICT(telegram_id) DO UPDATE SET
      username = COALESCE(excluded.username, users.username),
      first_name = COALESCE(excluded.first_name, users.first_name)
  `).run(telegramId, username || null, firstName || null);

  return db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId) as User;
}

export function getUser(telegramId: number): User | undefined {
  return getDb().prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId) as User | undefined;
}

export function setUserTier(telegramId: number, tier: 'free' | 'subscription', expiresAt?: string): void {
  getDb().prepare(`
    UPDATE users SET tier = ?, sub_expires = ? WHERE telegram_id = ?
  `).run(tier, expiresAt || null, telegramId);
}

export function isSubscribed(user: User): boolean {
  if (user.tier !== 'subscription') return false;
  if (!user.sub_expires) return true;
  return new Date(user.sub_expires) > new Date();
}

// ─── Query Log Operations ───

export function getTodayQueryCount(telegramId: number): number {
  const row = getDb().prepare(`
    SELECT COUNT(*) as cnt FROM query_logs
    WHERE telegram_id = ? AND date(queried_at) = date('now')
  `).get(telegramId) as { cnt: number };
  return row.cnt;
}

export function logQuery(telegramId: number, address: string, chain: string, queryType: string = 'address'): void {
  getDb().prepare(`
    INSERT INTO query_logs (telegram_id, address, chain, query_type)
    VALUES (?, ?, ?, ?)
  `).run(telegramId, address, chain, queryType);
}

// ─── Watch Address Operations ───

export function getWatchAddresses(telegramId: number): WatchAddress[] {
  return getDb().prepare(
    'SELECT * FROM watch_addresses WHERE telegram_id = ? ORDER BY created_at DESC'
  ).all(telegramId) as WatchAddress[];
}

export function getAllWatchAddresses(): WatchAddress[] {
  return getDb().prepare('SELECT * FROM watch_addresses').all() as WatchAddress[];
}

export function getWatchCount(telegramId: number): number {
  const row = getDb().prepare(
    'SELECT COUNT(*) as cnt FROM watch_addresses WHERE telegram_id = ?'
  ).get(telegramId) as { cnt: number };
  return row.cnt;
}

export function addWatchAddress(telegramId: number, address: string, chain: string, label: string = ''): boolean {
  try {
    getDb().prepare(`
      INSERT INTO watch_addresses (telegram_id, address, chain, label)
      VALUES (?, ?, ?, ?)
    `).run(telegramId, address, chain, label);
    return true;
  } catch {
    return false; // duplicate
  }
}

export function removeWatchAddress(telegramId: number, address: string, chain?: string): boolean {
  let result;
  if (chain) {
    result = getDb().prepare(
      'DELETE FROM watch_addresses WHERE telegram_id = ? AND address = ? AND chain = ?'
    ).run(telegramId, address, chain);
  } else {
    result = getDb().prepare(
      'DELETE FROM watch_addresses WHERE telegram_id = ? AND address = ?'
    ).run(telegramId, address);
  }
  return result.changes > 0;
}

export function updateWatchBalance(id: number, balance: string, txHash: string): void {
  getDb().prepare(
    'UPDATE watch_addresses SET last_balance = ?, last_tx_hash = ? WHERE id = ?'
  ).run(balance, txHash, id);
}
