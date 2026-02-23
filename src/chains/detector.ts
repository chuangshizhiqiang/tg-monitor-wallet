import { ChainName } from './types';

export interface DetectionResult {
  address: string;
  possibleChains: ChainName[];
}

/**
 * Auto-detect possible chain(s) from an address format.
 * - 0x (42 chars) -> ethereum, bsc
 * - T (34 chars)  -> tron
 * - 1/3/bc1       -> bitcoin
 */
export function detectChains(address: string): DetectionResult {
  const addr = address.trim();
  const possible: ChainName[] = [];

  // Ethereum / BSC (0x prefix, 42 chars)
  if (/^0x[0-9a-fA-F]{40}$/.test(addr)) {
    possible.push('ethereum', 'bsc');
  }

  // Tron (T prefix, 34 chars base58)
  if (/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(addr)) {
    possible.push('tron');
  }

  // Bitcoin (1/3 prefix for legacy/P2SH, bc1 for bech32)
  if (/^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(addr) || /^bc1[a-zA-HJ-NP-Z0-9]{25,62}$/i.test(addr)) {
    possible.push('bitcoin');
  }

  return { address: addr, possibleChains: possible };
}

/**
 * Detect if a string looks like a transaction hash.
 * - 0x + 64 hex chars -> ethereum/bsc
 * - 64 hex chars (no 0x) -> could be tron or bitcoin
 */
export function detectTxHash(hash: string): { hash: string; possibleChains: ChainName[] } {
  const h = hash.trim();
  const possible: ChainName[] = [];

  if (/^0x[0-9a-fA-F]{64}$/.test(h)) {
    possible.push('ethereum', 'bsc');
  }

  if (/^[0-9a-fA-F]{64}$/.test(h)) {
    possible.push('ethereum', 'bsc', 'tron', 'bitcoin');
  }

  return { hash: h, possibleChains: possible };
}
