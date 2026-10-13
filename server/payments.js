import crypto from 'node:crypto';
import { CURRENCIES, roundDown, fromUsd, toUsd } from '../public/js/shared/currencies.js';
import { amountText } from './notify.js';
import { NETWORKS, networkFor } from '../public/js/shared/networks.js';
import { requireTwoFactor } from './totp.js';
import { PROVIDERS, quote, quotes } from '../public/js/shared/onramps.js';
import { HttpError, badRequest } from './http.js';
import { parseCurrency, parseAmount, credit, debit, vipInfo, assertNotOnBreak, assertDepositLimit } from './accounts.js';

// Play money: nothing is verified, nothing waits. Deposits, purchases, swaps
// and withdrawals complete the moment they are made.
export const DEPOSIT_LIMITS = { max: 100000 }; // in fiat units, a sanity cap
export const CONFIRMATIONS = { BTC: 2, ETH: 6, LTC: 3, SOL: 1, DOGE: 3, USDT: 6, TRX: 3, USDC: 6, XRP: 1, BNB: 15, BCH: 3 };
export const NETWORK_FEES_USD = { BTC: 2, ETH: 1.5, LTC: 0.05, SOL: 0.01, DOGE: 0.2, USDT: 1, TRX: 1, USDC: 1, XRP: 0.1, BNB: 0.3, BCH: 0.04 };

const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567';
function fakeAddress(currency, network = '') {
  // Deliberately not a valid on-chain address: the "fake" prefix (plus the
  // network id) makes it impossible to send real funds here by mistake.
  const bytes = crypto.randomBytes(28);
  let body = '';
  for (const b of bytes) body += BASE32[b % 32];
  return `fake${currency.toLowerCase()}${network ? `-${network}` : ''}1${body}`;
}

function houseAddress(currency, network) {
  const h = crypto.createHash('sha256').update(`house:${currency}:${network}`).digest();
  let body = '';
  for (const b of h.subarray(0, 28)) body += BASE32[b % 32];
  return `fake${currency.toLowerCase()}-${network}1${body}`;
}

function txId() {
  return crypto.randomBytes(16).toString('hex');
}

export function createPayments({ store, live, publicUser, notify = () => {} }) {
  const timers = new Set();

  function addTx(user, tx) {
    const full = {
      id: store.nextId('tx'),
      ref: txId(),
      userId: user.id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...tx,
    };
    store.addTransaction(full);
    return full;
  }

  function publicTx(tx) {
    const { userId, ...rest } = tx;
    return rest;
  }

  function pushTx(user, tx) {
    live.toUser(user.id, 'tx', publicTx(tx));
    live.toUser(user.id, 'balance', { currency: tx.currency, amount: user.balances[tx.currency] });
    const amt = amountText(tx.amount, tx.currency);
    if (tx.type === 'deposit' && tx.status === 'completed')
      notify(user.id, { kind: 'deposit', title: tx.method === 'card' ? 'Deposit successful' : 'Deposit confirmed', message: `${amt} play money has been credited to your wallet.`, link: '/transactions/deposits' });
    if (tx.type === 'withdrawal' && tx.status === 'completed')
      notify(user.id, { kind: 'withdrawal', title: 'Withdrawal sent', message: `${amt} was sent${tx.details?.txHash ? ` · tx ${tx.details.txHash.slice(0, 10)}…` : ''} (simulated).`, link: '/transactions/withdrawals' });
    if (tx.type === 'swap' && tx.status === 'completed')
      notify(user.id, { kind: 'swap', title: 'Swap complete', message: `${amountText(tx.details.fromAmount, tx.details.from)} → ${amt}`, link: '/transactions/swaps' });
  }

  function settleCardDeposit(user, payment) {
    if (payment.buy) return startPurchase(user, payment);
    const creditCurrency = payment.creditCurrency;
    const creditAmount = roundDown(creditCurrency, fromUsd(creditCurrency, toUsd(payment.currency, payment.amount)));
    credit(user, creditCurrency, creditAmount);
    const tx = addTx(user, {
      type: 'deposit',
      method: 'card',
      status: 'completed',
      currency: creditCurrency,
      amount: creditAmount,
      fiat: { currency: payment.currency, amount: payment.amount },
      details: { brand: 'demo' },
    });
    payment.status = 'succeeded';
    payment.txId = tx.id;
    store.save();
    pushTx(user, tx);
    return tx;
  }

  // On-ramp purchase: the provider sends the coins straight to this wallet.
  function startPurchase(user, payment) {
    const coin = payment.creditCurrency;
    const net = networkFor(coin, payment.buy.network);
    const q = quote(payment.buy.provider, { fiat: payment.currency, fiatAmount: payment.amount, coin, network: net.id });
    const amount = roundDown(coin, q.youGet);
    const key = `${coin}:${net.id}`;
    user.addresses ||= {};
    user.addresses[key] ||= fakeAddress(coin, net.id);
    const tx = addTx(user, {
      type: 'deposit',
      method: 'buy',
      status: 'completed',
      currency: coin,
      amount,
      fiat: { currency: payment.currency, amount: payment.amount },
      details: {
        provider: q.name,
        providerId: q.provider,
        fiatAmount: payment.amount,
        fiatCurrency: payment.currency,
        fee: Math.round(q.feeFiat * 100) / 100,
        networkFee: q.networkFee,
        rate: q.rate,
        network: net.id,
        networkLabel: net.label,
        address: user.addresses[key],
        txHash: crypto.randomBytes(32).toString('hex'),
        confirmations: net.confirmations,
        required: net.confirmations,
      },
    });
    credit(user, coin, amount);
    payment.status = 'succeeded';
    payment.txId = tx.id;
    store.save();
    live.toUser(user.id, 'tx', publicTx(tx));
    live.toUser(user.id, 'balance', { currency: coin, amount: user.balances[coin] });
    notify(user.id, { kind: 'deposit', title: `Purchase complete · ${q.name}`, message: `${amountText(amount, coin)} has been added to your wallet.`, link: '/transactions/purchases' });
    return tx;
  }

  function buyQuotes(params) {
    const fiat = params.fiat === 'EUR' ? 'EUR' : 'USD';
    const coin = CURRENCIES[params.coin]?.type === 'crypto' ? params.coin : 'BTC';
    const fiatAmount = Math.max(0, Number(params.amount) || 0);
    const network = networkFor(coin, params.network).id;
    return { fiat, coin, network, fiatAmount, minimum: 0, quotes: quotes({ fiat, fiatAmount, coin, network }) };
  }

  function cardDeposit(user, body) {
    const { fiat, amount } = fiatAmount(user, body);
    const creditCurrency = parseCurrency(user, body.creditCurrency || fiat);
    // Buying crypto through an on-ramp: the coins land in this wallet at once.
    let buy = null;
    if (body.provider) {
      if (!PROVIDERS.some((p) => p.id === body.provider)) throw badRequest('Unknown provider');
      if (CURRENCIES[creditCurrency].type !== 'crypto') throw badRequest('Choose a crypto to buy');
      buy = { provider: body.provider, network: networkFor(creditCurrency, body.network).id };
    }
    const payment = { id: `pay_${crypto.randomBytes(12).toString('hex')}`, userId: user.id, amount, currency: fiat, creditCurrency, status: 'processing', createdAt: Date.now(), buy };
    const tx = settleCardDeposit(user, payment);
    return { payment: publicPayment(payment), transaction: publicTx(tx), user: publicUser(user) };
  }

  function publicPayment(p) {
    const { userId, ...rest } = p;
    return rest;
  }

  function depositAddress(user, body) {
    const currency = parseCurrency(user, body.currency);
    if (CURRENCIES[currency].type !== 'crypto') throw badRequest('Choose a crypto currency');
    const net = networkFor(currency, body.network);
    const key = `${currency}:${net.id}`;
    user.addresses ||= {};
    if (net.tag) {
      // One shared (fake) address per network; the destination tag identifies this wallet.
      user.addresses[key] = houseAddress(currency, net.id);
      user.tags ||= {};
      if (!user.tags[key] || body.regenerate) user.tags[key] = String(100000000 + crypto.randomInt(900000000));
    } else if (!user.addresses[key] || body.regenerate) user.addresses[key] = fakeAddress(currency, net.id);
    store.save();
    return {
      currency,
      network: { id: net.id, label: net.label },
      networks: NETWORKS[currency].map(({ id, label }) => ({ id, label })),
      address: user.addresses[key],
      tag: net.tag ? user.tags[key] : undefined,
      confirmations: net.confirmations,
      minimum: net.depositMin,
    };
  }

  // Simulates a blockchain transfer arriving at the user's deposit address.
  // It is credited immediately: there is nothing to confirm with play money.
  function simulateCryptoDeposit(user, body) {
    const currency = parseCurrency(user, body.currency);
    if (CURRENCIES[currency].type !== 'crypto') throw badRequest('Choose a crypto currency');
    const amount = parseAmount(currency, body.amount);
    if (amount <= 0) throw badRequest('Enter an amount', { field: 'amount' });
    if (toUsd(currency, amount) > 1_000_000) throw badRequest('Maximum simulated deposit is $1,000,000 equivalent', { field: 'amount' });
    assertNotOnBreak(user);
    assertDepositLimit(store, user, toUsd(currency, amount));
    const net = networkFor(currency, body.network);
    const address = user.addresses?.[`${currency}:${net.id}`] || null;
    const tag = net.tag ? user.tags?.[`${currency}:${net.id}`] : undefined;
    const required = net.confirmations;
    credit(user, currency, amount);
    const tx = addTx(user, {
      type: 'deposit',
      method: 'crypto',
      status: 'completed',
      currency,
      amount,
      details: { address, tag, network: net.id, networkLabel: net.label, txHash: crypto.randomBytes(32).toString('hex'), confirmations: required, required },
    });
    store.save();
    pushTx(user, tx);
    return { transaction: publicTx(tx), user: publicUser(user) };
  }

  function withdraw(user, body) {
    const currency = parseCurrency(user, body.currency);
    const amount = parseAmount(currency, body.amount);
    if (amount <= 0) throw badRequest('Enter an amount', { field: 'amount' });
    const isCrypto = CURRENCIES[currency].type === 'crypto';
    let details;
    if (isCrypto) {
      // Any address will do: nothing ever leaves the site.
      const net = networkFor(currency, body.network);
      const address = String(body.address || '').trim().slice(0, 140) || fakeAddress(currency, net.id);
      const tag = String(body.tag ?? '').trim().slice(0, 20);
      details = { address, ...(net.tag && tag ? { tag } : {}), network: net.id, networkLabel: net.label, fee: 0, txHash: crypto.randomBytes(32).toString('hex') };
    } else details = { bank: 'Fakesino Demo Bank' };
    if (!(amount <= (user.balances[currency] || 0) + 1e-12)) throw badRequest('Insufficient balance', { field: 'amount', code: 'insufficient_balance' });
    requireTwoFactor(user, body.code);
    debit(user, currency, amount);
    const tx = addTx(user, { type: 'withdrawal', method: isCrypto ? 'crypto' : 'bank', status: 'completed', currency, amount, details });
    store.save();
    pushTx(user, tx);
    return { transaction: publicTx(tx), user: publicUser(user) };
  }

  function claimRakeback(user) {
    let any = false;
    const claimed = {};
    for (const [c, v] of Object.entries(user.rakeback)) {
      const amt = roundDown(c, v);
      if (amt > 0) {
        credit(user, c, amt);
        user.rakeback[c] = v - amt;
        claimed[c] = amt;
        any = true;
        addTx(user, { type: 'bonus', method: 'rakeback', status: 'completed', currency: c, amount: amt, details: {} });
      }
    }
    if (!any) throw badRequest('No rakeback available yet, keep playing');
    store.save();
    return { claimed, user: publicUser(user) };
  }



  // Vault: park funds away from the betting balance.
  function vault(user, body) {
    const currency = parseCurrency(user, body.currency);
    const amount = parseAmount(currency, body.amount);
    if (amount <= 0) throw badRequest('Enter an amount');
    user.vault ||= {};
    if (body.direction === 'withdraw') {
      if (amount > (user.vault[currency] || 0) + 1e-12) throw badRequest('Not enough in the vault');
      requireTwoFactor(user, body.code);
      user.vault[currency] = roundDown(currency, (user.vault[currency] || 0) - amount);
      credit(user, currency, amount);
    } else {
      debit(user, currency, amount);
      user.vault[currency] = roundDown(currency, (user.vault[currency] || 0) + amount);
    }
    addTx(user, { type: 'vault', method: body.direction === 'withdraw' ? 'vault_out' : 'vault_in', status: 'completed', currency, amount, details: {} });
    store.save();
    notify(user.id, { kind: 'vault', title: body.direction === 'withdraw' ? 'Vault withdrawal' : 'Vault deposit', message: `${amountText(amount, currency)} ${body.direction === 'withdraw' ? 'moved back to your wallet' : 'locked in your vault'}.`, link: '/transactions/vault' });
    return { user: publicUser(user) };
  }

  // Tabs: deposits exclude on-ramp purchases, which have their own tab;
  // "tips" covers tips and rain.
  const TYPE_FILTER = {
    deposit: (t) => t.type === 'deposit' && t.method !== 'buy',
    purchase: (t) => t.type === 'deposit' && t.method === 'buy',
    tips: (t) => t.type === 'tip' || t.type === 'rain' || t.method === 'rain',
  };
  function transactions(user, { type, status, limit = 50 } = {}) {
    const out = [];
    const txs = store.data.transactions;
    const match = TYPE_FILTER[type] || ((t) => !type || type === 'all' || t.type === type);
    for (let i = txs.length - 1; i >= 0 && out.length < limit; i--) {
      const t = txs[i];
      if (t.userId !== user.id || !match(t)) continue;
      if (status && t.status !== status) continue;
      out.push(publicTx(t));
    }
    return out;
  }

  // ---- other fiat methods (fictional providers, no bank log-in) ----
  function fiatAmount(user, body) {
    const fiat = body.currency === 'EUR' ? 'EUR' : 'USD';
    const amount = parseAmount(fiat, body.amount);
    if (amount <= 0) throw badRequest('Enter an amount', { field: 'amount' });
    if (amount > DEPOSIT_LIMITS.max) throw badRequest(`Maximum deposit is ${CURRENCIES[fiat].symbol}${DEPOSIT_LIMITS.max.toLocaleString('en-US')}`, { field: 'amount' });
    assertNotOnBreak(user);
    assertDepositLimit(store, user, toUsd(fiat, amount));
    return { fiat, amount };
  }

  // Bank transfer from the (fictional) Fakesino Demo Bank: credited at once.
  function bankStart(user, body) {
    const { fiat, amount } = fiatAmount(user, body);
    const reference = `FKS-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    credit(user, fiat, amount);
    const tx = addTx(user, {
      type: 'deposit',
      method: 'bank',
      status: 'completed',
      currency: fiat,
      amount,
      details: { stage: 'credited', reference, bank: 'Fakesino Demo Bank' },
    });
    store.save();
    pushTx(user, tx);
    return { transaction: publicTx(tx), user: publicUser(user) };
  }

  // Mobile wallet ("Demo Pay"): a one-tap payment sheet, settled instantly.
  function mobilePay(user, body) {
    const { fiat, amount } = fiatAmount(user, body);
    credit(user, fiat, amount);
    const tx = addTx(user, { type: 'deposit', method: 'mobile_wallet', status: 'completed', currency: fiat, amount, details: { wallet: 'Demo Pay', last4: '4242' } });
    store.save();
    pushTx(user, tx);
    return { transaction: publicTx(tx), user: publicUser(user) };
  }

  function transaction(user, id) {
    const t = store.data.transactions.find((x) => x.id === Number(id) && x.userId === user.id);
    if (!t) throw new HttpError(404, 'Transaction not found');
    return { transaction: publicTx(t) };
  }

  // ---- swap between cryptos (0.5% fee) ----
  const SWAP_FEE = 0.005;
  function swapQuote(from, to, amount) {
    if (CURRENCIES[from]?.type !== 'crypto' || CURRENCIES[to]?.type !== 'crypto') throw badRequest('Swaps are between cryptocurrencies');
    if (from === to) throw badRequest('Choose two different coins');
    const rate = CURRENCIES[from].usd / CURRENCIES[to].usd;
    const fee = roundDown(from, amount * SWAP_FEE);
    const toAmount = roundDown(to, (amount - fee) * rate);
    return { from, to, amount, rate, fee, toAmount, minimum: 0 };
  }

  function swap(user, body) {
    const from = parseCurrency(user, body.from);
    const to = parseCurrency(user, body.to);
    const amount = parseAmount(from, body.amount);
    if (amount <= 0) throw badRequest('Enter an amount', { field: 'amount' });
    const q = swapQuote(from, to, amount);
    if (!(q.toAmount > 0)) throw badRequest('That amount is too small to swap', { field: 'amount' });
    assertNotOnBreak(user);
    debit(user, from, amount);
    credit(user, to, q.toAmount);
    const net = networkFor(to);
    const tx = addTx(user, {
      type: 'swap',
      method: 'swap',
      status: 'completed',
      currency: to,
      amount: q.toAmount,
      details: { from, to, fromAmount: amount, toAmount: q.toAmount, rate: q.rate, fee: q.fee, network: net.id, networkLabel: net.label, txHash: crypto.randomBytes(32).toString('hex'), confirmations: net.confirmations, required: net.confirmations },
    });
    store.save();
    live.toUser(user.id, 'balance', { currency: from, amount: user.balances[from] });
    pushTx(user, tx);
    return { transaction: publicTx(tx), user: publicUser(user) };
  }

  // ---- simulated block explorer ----
  const BLOCK_SECONDS = { ripple: 3.5, bitcoincash: 600, bitcoin: 600, litecoin: 150, dogecoin: 60, erc20: 12, bep20: 3, polygon: 2, trc20: 3, sol: 0.4, solana: 0.4 };
  const BASE_HEIGHT = { ripple: 90000000, bitcoincash: 860000, bitcoin: 860000, litecoin: 2700000, dogecoin: 5300000, erc20: 20500000, bep20: 41000000, polygon: 60000000, trc20: 64000000, sol: 280000000, solana: 280000000 };
  const fakeExternal = (seed, network) => `fake-${network}-ext1${crypto.createHash('sha256').update(seed).digest('hex').slice(0, 30)}`;
  function explorerTx(hash) {
    const t = store.data.transactions.find((x) => x.details?.txHash === hash);
    if (!t) throw new HttpError(404, 'Transaction not found on this (simulated) network');
    const d = t.details;
    const net = d.network || networkFor(t.currency)?.id || 'erc20';
    const height = Math.floor(BASE_HEIGHT[net] + (t.createdAt - Date.UTC(2026, 0, 1)) / 1000 / (BLOCK_SECONDS[net] || 10));
    const confirmations = t.status === 'completed' ? Math.max(d.required || 1, d.confirmations || 1) : d.confirmations || 0;
    const outgoing = t.type === 'withdrawal';
    return {
      tx: {
        hash,
        coin: t.currency,
        network: net,
        networkLabel: d.networkLabel || networkFor(t.currency)?.label || net,
        amount: t.type === 'swap' ? d.toAmount : t.amount,
        fee: t.type === 'withdrawal' ? (d.fee ?? null) : t.method === 'buy' ? (d.networkFee ?? null) : null,
        status: t.status === 'completed' ? 'confirmed' : t.status === 'failed' ? 'failed' : 'pending',
        blockHeight: t.status === 'pending' && !confirmations ? null : height,
        confirmations,
        timestamp: t.updatedAt,
        from: outgoing ? fakeExternal(`hot:${t.currency}`, net) : fakeExternal(hash, net),
        to: outgoing ? d.address : d.address || fakeExternal(`swap:${hash}`, net),
        tag: d.tag,
      },
    };
  }

  // Resume pending transfers after a restart.
  function recover() {
    for (const tx of store.data.transactions) {
      if (tx.status !== 'pending') continue;
      const user = store.data.users[tx.userId];
      if (!user) continue;
      if ((tx.type === 'deposit' && (tx.method === 'crypto' || tx.method === 'buy' || tx.method === 'bank')) || tx.type === 'swap') {
        if (tx.method === 'bank') tx.details.stage = 'credited';
        tx.status = 'completed';
        tx.details.confirmations = tx.details.required;
        credit(user, tx.currency, tx.amount);
      } else if (tx.type === 'withdrawal') {
        tx.status = 'completed';
      }
    }
    store.save();
  }

  function stop() {
    for (const t of timers) clearTimeout(t);
    timers.clear();
  }

  return {
    addTx,
    buyQuotes,
    transaction,
    bankStart,
    mobilePay,
    swap,
    swapQuote: (q) => swapQuote(q.from, q.to, Number(q.amount) || 0),
    explorerTx,
    cardDeposit,
    depositAddress,
    simulateCryptoDeposit,
    withdraw,
    claimRakeback,
    vault,
    transactions,
    recover,
    stop,
    methods: () => ({
      limits: DEPOSIT_LIMITS,
      confirmations: CONFIRMATIONS,
      networks: NETWORKS,
    }),
  };
}
