import axios from 'axios';
import { ChainAdapter, ChainName, Transaction, BalanceInfo, TxHashContext } from './types';

const BLOCKSTREAM_BASE = 'https://blockstream.info/api';

function satsToBtc(sats: number): string {
  return (sats / 1e8).toFixed(8);
}

export class BitcoinAdapter implements ChainAdapter {
  chain: ChainName = 'bitcoin';

  isValidAddress(address: string): boolean {
    return /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(address) || /^bc1[a-zA-HJ-NP-Z0-9]{25,62}$/i.test(address);
  }

  getExplorerTxUrl(hash: string): string {
    return `https://blockstream.info/tx/${hash}`;
  }

  getExplorerAddrUrl(address: string): string {
    return `https://blockstream.info/address/${address}`;
  }

  async getRecentTransactions(address: string, limit: number): Promise<Transaction[]> {
    try {
      const resp = await axios.get(`${BLOCKSTREAM_BASE}/address/${address}/txs`);
      if (!Array.isArray(resp.data)) return [];

      const txns: Transaction[] = [];
      for (const tx of resp.data.slice(0, limit)) {
        const inputSum = tx.vin
          ?.filter((v: any) => v.prevout?.scriptpubkey_address === address)
          .reduce((s: number, v: any) => s + (v.prevout?.value || 0), 0) || 0;

        const outputSum = tx.vout
          ?.filter((v: any) => v.scriptpubkey_address === address)
          .reduce((s: number, v: any) => s + (v.value || 0), 0) || 0;

        const net = outputSum - inputSum;
        const direction: 'in' | 'out' | 'self' = net > 0 ? 'in' : net < 0 ? 'out' : 'self';

        txns.push({
          hash: tx.txid,
          from: direction === 'in'
            ? (tx.vin?.[0]?.prevout?.scriptpubkey_address || 'unknown')
            : address,
          to: direction === 'out'
            ? (tx.vout?.find((v: any) => v.scriptpubkey_address !== address)?.scriptpubkey_address || 'unknown')
            : address,
          value: satsToBtc(Math.abs(net)),
          token: 'BTC',
          timestamp: tx.status?.block_time || 0,
          direction,
          blockNumber: tx.status?.block_height || 0,
        });
      }
      return txns;
    } catch { /* skip */ }
    return [];
  }

  async getBalances(address: string): Promise<BalanceInfo> {
    const balances: BalanceInfo = { address, chain: 'bitcoin', balances: [] };

    try {
      const resp = await axios.get(`${BLOCKSTREAM_BASE}/address/${address}`);
      const data = resp.data;
      const funded = data.chain_stats?.funded_txo_sum || 0;
      const spent = data.chain_stats?.spent_txo_sum || 0;
      const mempoolFunded = data.mempool_stats?.funded_txo_sum || 0;
      const mempoolSpent = data.mempool_stats?.spent_txo_sum || 0;
      const totalSats = funded - spent + mempoolFunded - mempoolSpent;

      balances.balances.push({
        token: 'BTC',
        balance: satsToBtc(totalSats),
        rawBalance: String(totalSats),
      });
    } catch { /* skip */ }

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
}
