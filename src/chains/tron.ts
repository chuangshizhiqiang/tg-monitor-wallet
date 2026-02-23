import axios from 'axios';
import { ChainAdapter, ChainName, Transaction, BalanceInfo, TxHashContext } from './types';

const TRONGRID_BASE = 'https://api.trongrid.io';

const USDT_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

function sunToTrx(sun: number | string): string {
  const n = Number(sun);
  return (n / 1e6).toFixed(6);
}

function parseTrc20Tx(tx: any, address: string): Transaction {
  const from = tx.from || '';
  const to = tx.to || '';
  const addr = address;
  let direction: 'in' | 'out' | 'self' = 'self';
  if (from === addr && to === addr) direction = 'self';
  else if (to === addr) direction = 'in';
  else direction = 'out';

  const decimals = Number(tx.token_info?.decimals || 6);
  const rawValue = tx.value || '0';
  const n = BigInt(rawValue);
  const divisor = BigInt(10 ** decimals);
  const whole = n / divisor;
  const frac = (n % divisor).toString().padStart(decimals, '0').slice(0, 6);

  return {
    hash: tx.transaction_id,
    from,
    to,
    value: `${whole}.${frac}`,
    token: tx.token_info?.symbol || 'TRC20',
    timestamp: Math.floor((tx.block_timestamp || 0) / 1000),
    direction,
    blockNumber: tx.block || 0,
  };
}

export class TronAdapter implements ChainAdapter {
  chain: ChainName = 'tron';

  isValidAddress(address: string): boolean {
    return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address);
  }

  getExplorerTxUrl(hash: string): string {
    return `https://tronscan.org/#/transaction/${hash}`;
  }

  getExplorerAddrUrl(address: string): string {
    return `https://tronscan.org/#/address/${address}`;
  }

  async getRecentTransactions(address: string, limit: number): Promise<Transaction[]> {
    const [trxTxns, trc20Txns] = await Promise.all([
      this.fetchTrxTxns(address, limit),
      this.fetchTrc20Txns(address, limit),
    ]);

    const all = [...trxTxns, ...trc20Txns];
    all.sort((a, b) => b.timestamp - a.timestamp);
    return all.slice(0, limit);
  }

  async getBalances(address: string): Promise<BalanceInfo> {
    const balances: BalanceInfo = { address, chain: 'tron', balances: [] };

    try {
      const resp = await axios.post(`${TRONGRID_BASE}/wallet/getaccount`, { address, visible: true });
      if (resp.data.balance) {
        balances.balances.push({ token: 'TRX', balance: sunToTrx(resp.data.balance), rawBalance: String(resp.data.balance) });
      }
    } catch { /* skip */ }

    // USDT TRC20
    try {
      const resp = await axios.get(
        `${TRONGRID_BASE}/v1/accounts/${address}/tokens?token_id=${USDT_CONTRACT}&limit=1`
      );
      const data = resp.data?.data?.[0];
      if (data && data.balance) {
        const decimals = data.decimals || 6;
        const n = BigInt(data.balance);
        const divisor = BigInt(10 ** decimals);
        const whole = n / divisor;
        const frac = (n % divisor).toString().padStart(decimals, '0').slice(0, 6);
        balances.balances.push({ token: 'USDT', balance: `${whole}.${frac}`, rawBalance: String(data.balance) });
      }
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

  private async fetchTrxTxns(address: string, limit: number): Promise<Transaction[]> {
    try {
      const resp = await axios.get(
        `${TRONGRID_BASE}/v1/accounts/${address}/transactions?limit=${limit}&order_by=block_timestamp,desc`
      );
      if (resp.data?.data && Array.isArray(resp.data.data)) {
        return resp.data.data
          .filter((tx: any) => {
            const contract = tx.raw_data?.contract?.[0];
            return contract?.type === 'TransferContract';
          })
          .map((tx: any) => {
            const contract = tx.raw_data.contract[0];
            const val = contract.parameter?.value;
            return {
              hash: tx.txID,
              from: val?.owner_address || '',
              to: val?.to_address || '',
              value: sunToTrx(val?.amount || 0),
              token: 'TRX',
              timestamp: Math.floor((tx.block_timestamp || 0) / 1000),
              direction: (val?.to_address === address ? 'in' : 'out') as 'in' | 'out',
              blockNumber: tx.blockNumber || 0,
            };
          });
      }
    } catch { /* skip */ }
    return [];
  }

  private async fetchTrc20Txns(address: string, limit: number): Promise<Transaction[]> {
    try {
      const resp = await axios.get(
        `${TRONGRID_BASE}/v1/accounts/${address}/transactions/trc20?limit=${limit}&order_by=block_timestamp,desc&contract_address=${USDT_CONTRACT}`
      );
      if (resp.data?.data && Array.isArray(resp.data.data)) {
        return resp.data.data.map((tx: any) => parseTrc20Tx(tx, address));
      }
    } catch { /* skip */ }
    return [];
  }
}
