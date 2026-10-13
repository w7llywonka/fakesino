import crypto from 'node:crypto';
import { CURRENCIES, roundDown, fromUsd, toUsd } from '../public/js/shared/currencies.js';
import { DEMO_CARDS, cardBrand, luhn, demoCard, DEMO_3DS_CODE } from '../public/js/shared/cards.js';
import { HttpError, badRequest } from './http.js';
import { parseCurrency, parseAmount, credit, debit, vipInfo, DAILY_BONUS_COOLDOWN } from './accounts.js';

export const DEPOSIT_LIMITS = { min: 10, max: 100000 }; // in fiat units
export const WITHDRAW_MIN_USD = 5;
export const CONFIRMATIONS = { BTC: 2, ETH: 6, LTC: 3, SOL: 1, DOGE: 3, USDT: 6, TRX: 3 };
export const NETWORK_FEES_USD = { BTC: 2, ETH: 1.5, LTC: 0.05, SOL: 0.01, DOGE: 0.2, USDT: 1, TRX: 1 };

const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567';
function fakeAddress(currency) {
  // Deliberately not a valid on-chain address: the "fake" prefix makes it
  // impossible to send real funds here by mistake.
  const bytes = crypto.randomBytes(28);
  let body = '';
  for (const b of bytes) body += BASE32[b % 32];
  return `fake${currency.toLowerCase()}1${body}`;
}

function txId() {
  return crypto.randomBytes(16).toString('hex');
}

export function createPayments({ store, live, publicUser }) {
  const timers = new Set();
  const later = (ms, fn) => {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
  };

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
  }

  function validateCardInput(card) {
    if (!card || typeof card !== 'object') throw badRequest('Enter your card details');
    const number = String(card.number || '').replace(/\D/g, '');
    const brand = cardBrand(number);
    if (number.length < 13 || !luhn(number)) throw badRequest('Your card number is invalid.', { field: 'number', code: 'invalid_number' });
    const demo = demoCard(number);
    if (!demo) {
      throw badRequest('Fakesino only accepts demo cards. Real cards are never charged or stored. Use 4242 4242 4242 4242.', {
        field: 'number',
        code: 'real_card_rejected',
      });
    }
    const expMonth = Number(card.expMonth);
    let expYear = Number(card.expYear);
    if (expYear < 100) expYear += 2000;
    if (!Number.isInteger(expMonth) || expMonth < 1 || expMonth > 12) throw badRequest("Your card's expiration date is incomplete.", { field: 'exp' });
    const now = new Date();
    if (!Number.isInteger(expYear) || expYear < now.getFullYear() || (expYear === now.getFullYear() && expMonth < now.getMonth() + 1)) {
      throw badRequest("Your card's expiration year is in the past.", { field: 'exp', code: 'expired_card' });
    }
    const cvc = String(card.cvc || '');
    const cvcLen = brand === 'amex' ? 4 : 3;
    if (!new RegExp(`^\\d{${cvcLen}}$`).test(cvc)) throw badRequest("Your card's security code is incomplete.", { field: 'cvc' });
    const name = String(card.name || '').trim();
    if (!name) throw badRequest('Enter the name on the card', { field: 'name' });
    return { number, brand, demo, expMonth, expYear, name: name.slice(0, 60), last4: number.slice(-4) };
  }

  function resolveCard(user, body) {
    if (body.savedCardId) {
      const saved = (user.cards || []).find((c) => c.id === body.savedCardId);
      if (!saved) throw badRequest('Saved card not found');
      const cvc = String(body.cvc || '');
      const cvcLen = saved.brand === 'amex' ? 4 : 3;
      if (!new RegExp(`^\\d{${cvcLen}}$`).test(cvc)) throw badRequest("Enter your card's security code", { field: 'cvc' });
      return { ...saved, demo: DEMO_CARDS[saved.demoKey], saved: true };
    }
    const c = validateCardInput(body.card);
    return { ...c, demoKey: c.number, saved: false };
  }

  function settleCardDeposit(user, payment) {
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
      details: { brand: payment.brand, last4: payment.last4, threeDS: !!payment.threeDS },
    });
    payment.status = 'succeeded';
    payment.txId = tx.id;
    store.save();
    pushTx(user, tx);
    return tx;
  }

  function cardDeposit(user, body) {
    const fiat = body.currency === 'EUR' ? 'EUR' : 'USD';
    const amount = parseAmount(fiat, body.amount);
    if (amount < DEPOSIT_LIMITS.min) throw badRequest(`Minimum deposit is ${CURRENCIES[fiat].symbol}${DEPOSIT_LIMITS.min}`, { field: 'amount' });
    if (amount > DEPOSIT_LIMITS.max) throw badRequest(`Maximum deposit is ${CURRENCIES[fiat].symbol}${DEPOSIT_LIMITS.max.toLocaleString('en-US')}`, { field: 'amount' });
    const creditCurrency = parseCurrency(user, body.creditCurrency || fiat);
    const card = resolveCard(user, body);
    const payment = {
      id: `pay_${crypto.randomBytes(12).toString('hex')}`,
      userId: user.id,
      amount,
      currency: fiat,
      creditCurrency,
      brand: card.brand,
      last4: card.last4,
      status: 'processing',
      createdAt: Date.now(),
    };
    if (body.saveCard && !card.saved) {
      user.cards ||= [];
      if (!user.cards.some((c) => c.demoKey === card.demoKey)) {
        user.cards.push({
          id: `card_${crypto.randomBytes(8).toString('hex')}`,
          brand: card.brand,
          last4: card.last4,
          expMonth: card.expMonth,
          expYear: card.expYear,
          name: card.name,
          demoKey: card.demoKey,
        });
      }
    }
    const outcome = card.demo.outcome;
    if (outcome === 'declined') {
      payment.status = 'failed';
      const tx = addTx(user, {
        type: 'deposit',
        method: 'card',
        status: 'failed',
        currency: creditCurrency,
        amount: 0,
        fiat: { currency: fiat, amount },
        details: { brand: card.brand, last4: card.last4, declineCode: card.demo.code },
      });
      store.save();
      return { payment: { ...publicPayment(payment), declineCode: card.demo.code, message: card.demo.message }, transaction: publicTx(tx), user: publicUser(user) };
    }
    if (outcome === '3ds') {
      payment.status = 'requires_action';
      payment.threeDS = true;
      payment.attempts = 0;
      store.data.payments[payment.id] = payment;
      store.save();
      return { payment: publicPayment(payment), user: publicUser(user) };
    }
    const tx = settleCardDeposit(user, payment);
    return { payment: publicPayment(payment), transaction: publicTx(tx), user: publicUser(user) };
  }

  function publicPayment(p) {
    const { userId, ...rest } = p;
    return rest;
  }

  function authenticate(user, id, body) {
    const payment = store.data.payments[id];
    if (!payment || payment.userId !== user.id) throw new HttpError(404, 'Payment not found');
    if (payment.status !== 'requires_action') throw badRequest('This payment does not need authentication');
    if (Date.now() - payment.createdAt > 15 * 60 * 1000) {
      payment.status = 'failed';
      throw badRequest('Authentication expired, please try again');
    }
    if (body.cancel) {
      payment.status = 'failed';
      delete store.data.payments[id];
      const tx = addTx(user, {
        type: 'deposit',
        method: 'card',
        status: 'failed',
        currency: payment.creditCurrency,
        amount: 0,
        fiat: { currency: payment.currency, amount: payment.amount },
        details: { brand: payment.brand, last4: payment.last4, declineCode: 'authentication_failed' },
      });
      store.save();
      return { payment: { ...publicPayment(payment), declineCode: 'authentication_failed', message: 'We are unable to authenticate your payment method.' }, transaction: publicTx(tx), user: publicUser(user) };
    }
    if (String(body.code || '') !== DEMO_3DS_CODE) {
      payment.attempts++;
      if (payment.attempts >= 3) {
        payment.status = 'failed';
        delete store.data.payments[id];
        store.save();
        throw badRequest('Too many incorrect codes. The payment was cancelled.', { code: 'authentication_failed' });
      }
      throw badRequest(`Incorrect code. ${3 - payment.attempts} attempt(s) left.`, { field: 'code' });
    }
    delete store.data.payments[id];
    const tx = settleCardDeposit(user, payment);
    return { payment: publicPayment(payment), transaction: publicTx(tx), user: publicUser(user) };
  }

  function depositAddress(user, body) {
    const currency = parseCurrency(user, body.currency);
    if (CURRENCIES[currency].type !== 'crypto') throw badRequest('Choose a crypto currency');
    user.addresses ||= {};
    if (!user.addresses[currency] || body.regenerate) user.addresses[currency] = fakeAddress(currency);
    store.save();
    return {
      currency,
      network: CURRENCIES[currency].network,
      address: user.addresses[currency],
      confirmations: CONFIRMATIONS[currency],
      minimum: roundDown(currency, fromUsd(currency, 1)),
    };
  }

  // Simulates a blockchain transfer arriving at the user's deposit address:
  // pending → N confirmations → credited.
  function simulateCryptoDeposit(user, body) {
    const currency = parseCurrency(user, body.currency);
    if (CURRENCIES[currency].type !== 'crypto') throw badRequest('Choose a crypto currency');
    const amount = parseAmount(currency, body.amount);
    if (amount <= 0) throw badRequest('Enter an amount');
    if (toUsd(currency, amount) > 1_000_000) throw badRequest('Maximum simulated deposit is $1,000,000 equivalent');
    const required = CONFIRMATIONS[currency];
    const tx = addTx(user, {
      type: 'deposit',
      method: 'crypto',
      status: 'pending',
      currency,
      amount,
      details: { address: user.addresses?.[currency] || null, txHash: crypto.randomBytes(32).toString('hex'), confirmations: 0, required },
    });
    store.save();
    const step = Number(process.env.FAKESINO_CONFIRM_MS ?? 1500);
    const confirm = () => {
      tx.details.confirmations++;
      tx.updatedAt = Date.now();
      if (tx.details.confirmations >= required) {
        tx.status = 'completed';
        credit(user, currency, amount);
        store.save();
        pushTx(user, tx);
        return;
      }
      store.save();
      live.toUser(user.id, 'tx', publicTx(tx));
      later(step, confirm);
    };
    later(step, confirm);
    return { transaction: publicTx(tx) };
  }

  function withdraw(user, body) {
    const currency = parseCurrency(user, body.currency);
    const amount = parseAmount(currency, body.amount);
    if (toUsd(currency, amount) < WITHDRAW_MIN_USD) throw badRequest(`Minimum withdrawal is $${WITHDRAW_MIN_USD} equivalent`, { field: 'amount' });
    const isCrypto = CURRENCIES[currency].type === 'crypto';
    let details;
    let fee = 0;
    if (isCrypto) {
      const address = String(body.address || '').trim();
      if (address.length < 10 || address.length > 120 || /\s/.test(address)) throw badRequest('Enter a valid withdrawal address', { field: 'address' });
      fee = roundDown(currency, fromUsd(currency, NETWORK_FEES_USD[currency]));
      if (amount <= fee) throw badRequest('Amount must be larger than the network fee', { field: 'amount' });
      details = { address, network: CURRENCIES[currency].network, fee };
    } else {
      const saved = (user.cards || []).find((c) => c.id === body.cardId);
      if (!saved) throw badRequest('Choose a saved card to withdraw to', { field: 'card' });
      details = { brand: saved.brand, last4: saved.last4 };
    }
    debit(user, currency, amount);
    const tx = addTx(user, { type: 'withdrawal', method: isCrypto ? 'crypto' : 'card', status: 'pending', currency, amount, details });
    store.save();
    later(Number(process.env.FAKESINO_WITHDRAW_MS ?? 4000), () => {
      tx.status = 'completed';
      tx.updatedAt = Date.now();
      if (isCrypto) tx.details.txHash = crypto.randomBytes(32).toString('hex');
      store.save();
      pushTx(user, tx);
    });
    return { transaction: publicTx(tx), user: publicUser(user) };
  }

  function removeCard(user, id) {
    user.cards = (user.cards || []).filter((c) => c.id !== id);
    store.save();
    return { user: publicUser(user) };
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

  function claimDaily(user) {
    const wait = user.dailyBonusAt + DAILY_BONUS_COOLDOWN - Date.now();
    if (wait > 0) throw badRequest('Your daily reload is not ready yet', { retryIn: wait });
    const vip = vipInfo(user.stats.wageredUsd);
    const usd = 25 * (vip.index + 1);
    const currency = user.currency;
    const amount = roundDown(currency, fromUsd(currency, usd));
    credit(user, currency, amount);
    user.dailyBonusAt = Date.now();
    const tx = addTx(user, { type: 'bonus', method: 'daily_reload', status: 'completed', currency, amount, details: { usd } });
    store.save();
    return { transaction: publicTx(tx), user: publicUser(user) };
  }

  // Vault: park funds away from the betting balance.
  function vault(user, body) {
    const currency = parseCurrency(user, body.currency);
    const amount = parseAmount(currency, body.amount);
    if (amount <= 0) throw badRequest('Enter an amount');
    user.vault ||= {};
    if (body.direction === 'withdraw') {
      if (amount > (user.vault[currency] || 0) + 1e-12) throw badRequest('Not enough in the vault');
      user.vault[currency] = roundDown(currency, (user.vault[currency] || 0) - amount);
      credit(user, currency, amount);
    } else {
      debit(user, currency, amount);
      user.vault[currency] = roundDown(currency, (user.vault[currency] || 0) + amount);
    }
    addTx(user, { type: 'vault', method: body.direction === 'withdraw' ? 'vault_out' : 'vault_in', status: 'completed', currency, amount, details: {} });
    store.save();
    return { user: publicUser(user) };
  }

  function transactions(user, { type, limit = 50 } = {}) {
    const out = [];
    const txs = store.data.transactions;
    for (let i = txs.length - 1; i >= 0 && out.length < limit; i--) {
      const t = txs[i];
      if (t.userId !== user.id) continue;
      if (type && type !== 'all' && t.type !== type) continue;
      out.push(publicTx(t));
    }
    return out;
  }

  // Resume pending transfers after a restart.
  function recover() {
    for (const tx of store.data.transactions) {
      if (tx.status !== 'pending') continue;
      const user = store.data.users[tx.userId];
      if (!user) continue;
      if (tx.type === 'deposit' && tx.method === 'crypto') {
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
    cardDeposit,
    authenticate,
    depositAddress,
    simulateCryptoDeposit,
    withdraw,
    removeCard,
    claimRakeback,
    claimDaily,
    vault,
    transactions,
    recover,
    stop,
    methods: () => ({
      demoCards: Object.entries(DEMO_CARDS).map(([number, c]) => ({ number, ...c })),
      limits: DEPOSIT_LIMITS,
      confirmations: CONFIRMATIONS,
      fees: NETWORK_FEES_USD,
      withdrawMinUsd: WITHDRAW_MIN_USD,
      threeDSCode: DEMO_3DS_CODE,
    }),
  };
}
