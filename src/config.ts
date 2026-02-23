import dotenv from 'dotenv';
dotenv.config();

export const CONFIG = {
  // Telegram
  BOT_TOKEN: (process.env.TELEGRAM_BOT_TOKEN || process.env.TGBOTTOKEN || '').trim(),
  ADMIN_ID: Number(process.env.ADMIN_TELEGRAM_ID || 0),

  // API Keys
  ETHERSCAN_API_KEY: process.env.ETHERSCAN_API_KEY || '',
  BSCSCAN_API_KEY: process.env.BSCSCAN_API_KEY || '',
  TRONGRID_API_KEY: process.env.TRONGRID_API_KEY || '',

  // Free tier limits
  FREE_DAILY_QUERIES: 5,
  FREE_TX_LIMIT: 5,
  FREE_WATCH_LIMIT: 1,
  FREE_TX_HASH_RANGE: 3,   // Free: query 3 txns before & after a given hash

  // Subscription tier limits
  SUB_TX_LIMIT: 20,
  SUB_WATCH_LIMIT: 100,
  SUB_TX_HASH_RANGE: 10,   // Subscription: query 10 txns before & after a given hash

  // Monitor polling
  POLL_INTERVAL_SECONDS: 60,

  // Subscription pricing (display only)
  SUB_MONTHLY_PRICE_USD: 9.99,
} as const;
