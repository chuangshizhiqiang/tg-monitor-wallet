import axios from 'axios';
import { ChainAdapter, ChainName, Transaction, BalanceInfo, TxHashContext } from './types';
import { CONFIG } from '../config';

const BSCSCAN_BASE = 'https://api.bscscan.com/api';

const TRACKED_TOKENS: Record<string, { symbol: string; decimals: number; contract: string }> = {
  '0x55d398326f99059ff775485246999027b3197955': { symbol: 'USDT', decimals: 18, contract: '0x55d398326f99059ff775485246999027b3197955' },
  '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d': { symbol: 'USDC', decimals: 18, contract: '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d' },
};

function apiKey(): string {
  return CONFIG.BSCSCAN_API_KEY ? `&apikey=${CONFIG.BSCSCAN_API_KEY}` : '';
}

function weiToBnb(wei: string): string {
  const n = BigInt(wei);
  const whole = n / BigInt(1e18);
  const frac = (n % BigInt(1e18)).toString().padStart(18, '0').slice(0, 6);
  return `${whole}.${frac}`;
}

function tokenAmount(raw: string, decimals: number): string {
  if (!raw || raw === '0') return '0';
  const n = BigInt(raw);
  const divisor = BigInt(10 ** decimals);
  const whole = n / divisor;
  const frac = (n % divisor).toString().padStart(decimals, '0').slice(0, Math.min(decimals, 6));
  return `${whole}.${frac}`;
}

function parseTx(tx: any, address: string, token: string = 'BNB', decimals: number = 18): Transaction {
  const from = (tx.from || '').toLowerCase();
  const to = (tx.to || '').toLowerCase();
  const addr = address.toLowerCase();
  let direction: 'in' | 'out' | 'self' = 'self';
  if (from === addr && to === addr) direction = 'self';
  else if (to === addr) direction = 'in';
  else direction = 'out';

  return {
    hash: tx.hash,
    from: tx.from || '',
    to: tx.to || '',
    value: token === 'BNB' ? weiToBnb(tx.value) : tokenAmount(tx.value, decimals),
    token,
    timestamp: Number(tx.timeStamp),
    direction,
    blockNumber: Number(tx.blockNumber),
  };
}

export class BscAdapter implements ChainAdapter {
  chain: ChainName = 'bsc';

  isValidAddress(address: string): boolean {
    return /^0x[0-9a-fA-F]{40}$/.test(address);
  }

  getExplorerTxUrl(hash: string): string {
    return `https://bscscan.com/tx/${hash}`;
  }

  getExplorerAddrUrl(address: string): string {
    return `https://bscscan.com/address/${address}`;
  }

  async getRecentTransactions(address: string, limit: number): Promise<Transaction[]> {
    const [bnbTxns, tokenTxns] = await Promise.all([
      this.fetchBnbTxns(address, limit),
      this.fetchTokenTxns(address, limit),
    ]);

    const all = [...bnbTxns, ...tokenTxns];
    all.sort((a, b) => b.timestamp - a.timestamp);
    return all.slice(0, limit);
  }

  async getBalances(address: string): Promise<BalanceInfo> {
    const balances: BalanceInfo = { address, chain: 'bsc', balances: [] };

    try {
      const resp = await axios.get(`${BSCSCAN_BASE}?module=account&action=balance&address=${address}&tag=latest${apiKey()}`);
      if (resp.data.status === '1') {
        balances.balances.push({ token: 'BNB', balance: weiToBnb(resp.data.result), rawBalance: resp.data.result });
      }
    } catch { /* skip */ }

    for (const [, info] of Object.entries(TRACKED_TOKENS)) {
      try {
        const resp = await axios.get(
          `${BSCSCAN_BASE}?module=account&action=tokenbalance&contractaddress=${info.contract}&address=${address}&tag=latest${apiKey()}`
        );
        if (resp.data.status === '1' && resp.data.result !== '0') {
          balances.balances.push({ token: info.symbol, balance: tokenAmount(resp.data.result, info.decimals), rawBalance: resp.data.result });
        }
      } catch { /* skip */ }
    }

    return balances;
  }

  async getTransactionContext(address: string, txHash: string, range: number): Promise<TxHashContext | null> {
    const allTxns = await this.getRecentTransactions(address, 200);
    const idx = allTxns.findIndex(t => t.hash.toLowerCase() === txHash.toLowerCase());
    if (idx === -1) return null;

    return {
      target: allTxns[idx],
      after: allTxns.slice(Math.max(0, idx - range), idx),
      before: allTxns.slice(idx + 1, idx + 1 + range),
    };
  }

  private async fetchBnbTxns(address: string, limit: number): Promise<Transaction[]> {
    try {
      const resp = await axios.get(
        `${BSCSCAN_BASE}?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&page=1&offset=${limit}&sort=desc${apiKey()}`
      );
      if (resp.data.status === '1' && Array.isArray(resp.data.result)) {
        return resp.data.result.filter((tx: any) => tx.value !== '0').map((tx: any) => parseTx(tx, address));
      }
    } catch { /* skip */ }
    return [];
  }

  private async fetchTokenTxns(address: string, limit: number): Promise<Transaction[]> {
    try {
      const resp = await axios.get(
        `${BSCSCAN_BASE}?module=account&action=tokentx&address=${address}&page=1&offset=${limit}&sort=desc${apiKey()}`
      );
      if (resp.data.status === '1' && Array.isArray(resp.data.result)) {
        return resp.data.result
          .filter((tx: any) => (tx.contractAddress || '').toLowerCase() in TRACKED_TOKENS)
          .map((tx: any) => {
            const info = TRACKED_TOKENS[(tx.contractAddress || '').toLowerCase()];
            return parseTx(tx, address, info?.symbol || tx.tokenSymbol, info?.decimals || Number(tx.tokenDecimal));
          });
      }
    } catch { /* skip */ }
    return [];
  }
}
