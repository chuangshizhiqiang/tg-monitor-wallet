import { ChainAdapter, ChainName } from './types';
import { EthereumAdapter } from './ethereum';
import { BscAdapter } from './bsc';
import { TronAdapter } from './tron';
import { BitcoinAdapter } from './bitcoin';

const adapters: Record<ChainName, ChainAdapter> = {
  ethereum: new EthereumAdapter(),
  bsc: new BscAdapter(),
  tron: new TronAdapter(),
  bitcoin: new BitcoinAdapter(),
};

export function getAdapter(chain: ChainName): ChainAdapter {
  return adapters[chain];
}

export function getAllAdapters(): ChainAdapter[] {
  return Object.values(adapters);
}

export const CHAIN_DISPLAY_NAMES: Record<ChainName, string> = {
  ethereum: 'Ethereum',
  bsc: 'BSC',
  tron: 'Tron',
  bitcoin: 'Bitcoin',
};

export { detectChains, detectTxHash } from './detector';
export type { ChainName, Transaction, BalanceInfo, TxHashContext, ChainAdapter } from './types';
