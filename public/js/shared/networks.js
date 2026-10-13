// Crypto networks per coin: confirmations, withdrawal minimum and fee (in
// coin units) and the address format each network expects. Play money only.
const EVM = '^0x[0-9a-fA-F]{40}$';
const TRON = '^T[1-9A-HJ-NP-Za-km-z]{33}$';
const SOL = '^[1-9A-HJ-NP-Za-km-z]{32,44}$';

export const NETWORKS = {
  BTC: [{ id: 'bitcoin', label: 'Bitcoin', confirmations: 2, withdrawMin: 0.00002504, withdrawFee: 0.00001571, depositMin: 0.00001, address: '^(bc1[a-z0-9]{25,59}|[13][1-9A-HJ-NP-Za-km-z]{25,34})$' }],
  ETH: [
    { id: 'erc20', label: 'Ethereum (ERC20)', confirmations: 6, withdrawMin: 0.001, withdrawFee: 0.00067447, depositMin: 0.0005, address: EVM },
    { id: 'bep20', label: 'BNB Smart Chain (BEP20)', confirmations: 15, withdrawMin: 0.0005, withdrawFee: 0.00008, depositMin: 0.0002, address: EVM },
  ],
  USDT: [
    { id: 'erc20', label: 'Ethereum (ERC20)', confirmations: 6, withdrawMin: 2.5, withdrawFee: 1, depositMin: 1, address: EVM },
    { id: 'trc20', label: 'Tron (TRC20)', confirmations: 3, withdrawMin: 1, withdrawFee: 0.5, depositMin: 1, address: TRON },
    { id: 'bep20', label: 'BNB Smart Chain (BEP20)', confirmations: 15, withdrawMin: 1, withdrawFee: 0.15, depositMin: 1, address: EVM },
    { id: 'polygon', label: 'Polygon', confirmations: 30, withdrawMin: 1, withdrawFee: 0.1, depositMin: 1, address: EVM },
    { id: 'sol', label: 'Solana (SPL)', confirmations: 1, withdrawMin: 1, withdrawFee: 0.1, depositMin: 1, address: SOL },
  ],
  LTC: [{ id: 'litecoin', label: 'Litecoin', confirmations: 3, withdrawMin: 0.01857329, withdrawFee: 0.000138, depositMin: 0.001, address: '^(ltc1[a-z0-9]{25,59}|[LM][1-9A-HJ-NP-Za-km-z]{26,33})$' }],
  SOL: [{ id: 'solana', label: 'Solana', confirmations: 1, withdrawMin: 0.01050998, withdrawFee: 0.000005, depositMin: 0.001, address: SOL }],
  DOGE: [{ id: 'dogecoin', label: 'Dogecoin', confirmations: 3, withdrawMin: 5.4992597, withdrawFee: 0.52151198, depositMin: 1, address: '^D[1-9A-HJ-NP-Za-km-z]{25,34}$' }],
  TRX: [{ id: 'trc20', label: 'Tron (TRC20)', confirmations: 3, withdrawMin: 7.82408913, withdrawFee: 0.0733617, depositMin: 1, address: TRON }],
  USDC: [
    { id: 'erc20', label: 'Ethereum (ERC20)', confirmations: 6, withdrawMin: 2.5, withdrawFee: 1, depositMin: 1, address: EVM },
    { id: 'sol', label: 'Solana (SPL)', confirmations: 1, withdrawMin: 1, withdrawFee: 0.1, depositMin: 1, address: SOL },
    { id: 'polygon', label: 'Polygon', confirmations: 30, withdrawMin: 1, withdrawFee: 0.1, depositMin: 1, address: EVM },
    { id: 'bep20', label: 'BNB Smart Chain (BEP20)', confirmations: 15, withdrawMin: 1, withdrawFee: 0.15, depositMin: 1, address: EVM },
  ],
  // XRP deposits share one address per network and are told apart by a
  // destination tag, as on the real ledger.
  XRP: [{ id: 'ripple', label: 'XRP Ledger', confirmations: 1, withdrawMin: 2, withdrawFee: 0.2, depositMin: 1, address: '^r[1-9A-HJ-NP-Za-km-z]{24,34}$', tag: true }],
  BNB: [{ id: 'bep20', label: 'BNB Smart Chain (BEP20)', confirmations: 15, withdrawMin: 0.002, withdrawFee: 0.0005, depositMin: 0.001, address: EVM }],
  BCH: [{ id: 'bitcoincash', label: 'Bitcoin Cash', confirmations: 3, withdrawMin: 0.001, withdrawFee: 0.0001, depositMin: 0.0001, address: '^((bitcoincash:)?[qp][a-z0-9]{41}|[13][1-9A-HJ-NP-Za-km-z]{25,34})$' }],
};

export function networksFor(code) {
  return NETWORKS[code] || [];
}

export function networkFor(code, id) {
  const list = networksFor(code);
  return list.find((n) => n.id === id) || list[0] || null;
}

// Destination tags / memos: a 32-bit unsigned integer.
export function validTag(tag) {
  return tag === '' || tag == null || (/^\d{1,10}$/.test(String(tag)) && Number(tag) <= 4294967295);
}

export function validAddress(code, networkId, address) {
  const n = networkFor(code, networkId);
  return !!n && new RegExp(n.address).test(String(address || '').trim());
}
