import axios from 'axios';
import { ChainAdapter, ChainName, Transaction, BalanceInfo, TxHashContext } from './types';
import { CONFIG } from '../config';

const ETHERSCAN_BASE = 'https://api.etherscan.io/api';

// Well-known ERC20 tokens on Ethereum
const TRACKED_TOKENS: Record<string, { symbol: string; decimals: number; contract: string }> = {
  '0xdac17f958d2ee523a2206206994597c13d831ec7': { symbol: 'USDT', decimals: 6, contract: '0xdac17f958d2ee523a2206206994597c13d831ec7' },
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': { symbol: 'USDC', decimals: 6, contract: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' },
};

function apiKey(): string {
  return CONFIG.ETHERSCAN_API_KEY ? `&apikey=${CONFIG.ETHERSCAN_API_KEY}` : '';
}

function weiToEth(wei: string): string {
  const n = BigInt(wei);
  const whole = n / BigInt(1e18);
  const frac = n % BigInt(1e18);
  const fracStr = frac.toString().padStart(18, '0').slice(0, 6);
  return `${whole}.${fracStr}`;
}

function tokenAmount(raw: string, decimals: number): string {
  if (!raw || raw === '0') return '0';
  const n = BigInt(raw);
  const divisor = BigInt(10 ** decimals);
  const whole = n / divisor;
  const frac = (n % divisor).toString().padStart(decimals, '0').slice(0, Math.min(decimals, 6));
  return `${whole}.${frac}`;
}

function parseTx(tx: any, address: string, token: string = 'ETH', decimals: number = 18): Transaction {
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
    value: token === 'ETH' ? weiToEth(tx.value) : tokenAmount(tx.value, decimals),
    token,
    timestamp: Number(tx.timeStamp),
    direction,
    blockNumber: Number(tx.blockNumber),
  };
}

export class EthereumAdapter implements ChainAdapter {
  chain: ChainName = 'ethereum';

  isValidAddress(address: string): boolean {
    return /^0x[0-9a-fA-F]{40}$/.test(address);
  }

  getExplorerTxUrl(hash: string): string {
    return `https://etherscan.io/tx/${hash}`;
  }

  getExplorerAddrUrl(address: string): string {
    return `https://etherscan.io/address/${address}`;
  }

  async getRecentTransactions(address: string, limit: number): Promise<Transaction[]> {
    const [ethTxns, tokenTxns] = await Promise.all([
      this.fetchEthTxns(address, limit),
      this.fetchTokenTxns(address, limit),
    ]);

    const all = [...ethTxns, ...tokenTxns];
    all.sort((a, b) => b.timestamp - a.timestamp);
    return all.slice(0, limit);
  }

  async getBalances(address: string): Promise<BalanceInfo> {
    const balances: BalanceInfo = { address, chain: 'ethereum', balances: [] };

    // ETH balance
    try {
      const resp = await axios.get(`${ETHERSCAN_BASE}?module=account&action=balance&address=${address}&tag=latest${apiKey()}`);
      if (resp.data.status === '1') {
        balances.balances.push({
          token: 'ETH',
          balance: weiToEth(resp.data.result),
          rawBalance: resp.data.result,
        });
      }
    } catch { /* skip */ }

    // ERC20 balances
    for (const [, info] of Object.entries(TRACKED_TOKENS)) {
      try {
        const resp = await axios.get(
          `${ETHERSCAN_BASE}?module=account&action=tokenbalance&contractaddress=${info.contract}&address=${address}&tag=latest${apiKey()}`
        );
        if (resp.data.status === '1' && resp.data.result !== '0') {
          balances.balances.push({
            token: info.symbol,
            balance: tokenAmount(resp.data.result, info.decimals),
            rawBalance: resp.data.result,
          });
        }
      } catch { /* skip */ }
    }

    return balances;
  }

  async getTransactionContext(address: string, txHash: string, range: number): Promise<TxHashContext | null> {
    const allTxns = await this.getRecentTransactions(address, 200);
    const idx = allTxns.findIndex(t => t.hash.toLowerCase() === txHash.toLowerCase());
    if (idx === -1) return null;

    const target = allTxns[idx];
    // allTxns is sorted newest first: items before idx are newer, items after idx are older
    const after = allTxns.slice(Math.max(0, idx - range), idx);    // newer txns
    const before = allTxns.slice(idx + 1, idx + 1 + range);       // older txns

    return { target, before, after };
  }

  private async fetchEthTxns(address: string, limit: number): Promise<Transaction[]> {
    try {
      const resp = await axios.get(
        `${ETHERSCAN_BASE}?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&page=1&offset=${limit}&sort=desc${apiKey()}`
      );
      if (resp.data.status === '1' && Array.isArray(resp.data.result)) {
        return resp.data.result
          .filter((tx: any) => tx.value !== '0')
          .map((tx: any) => parseTx(tx, address));
      }
    } catch { /* skip */ }
    return [];
  }

  private async fetchTokenTxns(address: string, limit: number): Promise<Transaction[]> {
    try {
      const resp = await axios.get(
        `${ETHERSCAN_BASE}?module=account&action=tokentx&address=${address}&page=1&offset=${limit}&sort=desc${apiKey()}`
      );
      if (resp.data.status === '1' && Array.isArray(resp.data.result)) {
        return resp.data.result
          .filter((tx: any) => {
            const contract = (tx.contractAddress || '').toLowerCase();
            return contract in TRACKED_TOKENS;
          })
          .map((tx: any) => {
            const contract = (tx.contractAddress || '').toLowerCase();
            const info = TRACKED_TOKENS[contract];
            return parseTx(tx, address, info?.symbol || tx.tokenSymbol, info?.decimals || Number(tx.tokenDecimal));
          });
      }
    } catch { /* skip */ }
    return [];
  }
}
