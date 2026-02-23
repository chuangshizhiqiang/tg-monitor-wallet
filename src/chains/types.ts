export type ChainName = 'ethereum' | 'bsc' | 'tron' | 'bitcoin';

export interface Transaction {
  hash: string;
  from: string;
  to: string;
  value: string;          // human-readable amount
  token: string;          // e.g. 'ETH', 'USDT', 'BTC'
  timestamp: number;      // unix seconds
  direction: 'in' | 'out' | 'self';
  blockNumber: number;
}

export interface BalanceInfo {
  address: string;
  chain: ChainName;
  balances: TokenBalance[];
}

export interface TokenBalance {
  token: string;
  balance: string;        // human-readable
  rawBalance: string;     // raw on-chain
}

export interface TxHashContext {
  target: Transaction;
  before: Transaction[];  // older txns
  after: Transaction[];   // newer txns
}

export interface ChainAdapter {
  chain: ChainName;
  getRecentTransactions(address: string, limit: number): Promise<Transaction[]>;
  getBalances(address: string): Promise<BalanceInfo>;
  getTransactionContext(address: string, txHash: string, range: number): Promise<TxHashContext | null>;
  isValidAddress(address: string): boolean;
  getExplorerTxUrl(hash: string): string;
  getExplorerAddrUrl(address: string): string;
}
