import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'wallet_monitor.db');

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    initTables(db);
  }
  return db;
}

function initTables(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      telegram_id   INTEGER PRIMARY KEY,
      username      TEXT,
      first_name    TEXT,
      tier          TEXT DEFAULT 'free' CHECK(tier IN ('free', 'subscription')),
      sub_expires   DATETIME,
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS query_logs (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id   INTEGER NOT NULL,
      address       TEXT NOT NULL,
      chain         TEXT NOT NULL,
      query_type    TEXT DEFAULT 'address',
      queried_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (telegram_id) REFERENCES users(telegram_id)
    );

    CREATE TABLE IF NOT EXISTS watch_addresses (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id   INTEGER NOT NULL,
      address       TEXT NOT NULL,
      chain         TEXT NOT NULL,
      label         TEXT DEFAULT '',
      last_balance  TEXT DEFAULT '0',
      last_tx_hash  TEXT DEFAULT '',
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (telegram_id) REFERENCES users(telegram_id),
      UNIQUE(telegram_id, address, chain)
    );

    CREATE INDEX IF NOT EXISTS idx_query_logs_user_date
      ON query_logs(telegram_id, queried_at);

    CREATE INDEX IF NOT EXISTS idx_watch_addresses_user
      ON watch_addresses(telegram_id);
  `);
}
