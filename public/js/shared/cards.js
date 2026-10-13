// Demo payment cards. These are well-known public test numbers; they cannot
// move real money anywhere. Any other card number is refused in the browser
// before it is sent, and refused again by the server.

export const DEMO_3DS_CODE = '123456';

export const DEMO_CARDS = {
  '4242424242424242': { brand: 'visa', outcome: 'success', label: 'Visa · succeeds' },
  '5555555555554444': { brand: 'mastercard', outcome: 'success', label: 'Mastercard · succeeds' },
  '378282246310005': { brand: 'amex', outcome: 'success', label: 'Amex · succeeds' },
  '6011111111111117': { brand: 'discover', outcome: 'success', label: 'Discover · succeeds' },
  '4000002760003184': { brand: 'visa', outcome: '3ds', label: 'Visa · requires 3-D Secure' },
  '4000000000000002': { brand: 'visa', outcome: 'declined', code: 'card_declined', message: 'Your card was declined.', label: 'Visa · declined' },
  '4000000000009995': { brand: 'visa', outcome: 'declined', code: 'insufficient_funds', message: 'Your card has insufficient funds.', label: 'Visa · insufficient funds' },
};

export function demoCard(number) {
  return DEMO_CARDS[String(number).replace(/\D/g, '')] || null;
}

export function luhn(number) {
  const digits = String(number).replace(/\D/g, '');
  let sum = 0;
  let dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  return digits.length > 0 && sum % 10 === 0;
}

export function cardBrand(number) {
  const n = String(number).replace(/\D/g, '');
  if (/^4/.test(n)) return 'visa';
  if (/^(5[1-5]|2[2-7])/.test(n)) return 'mastercard';
  if (/^3[47]/.test(n)) return 'amex';
  if (/^(6011|65|64[4-9])/.test(n)) return 'discover';
  return 'unknown';
}

export function formatCardNumber(number) {
  const n = String(number).replace(/\D/g, '');
  if (cardBrand(n) === 'amex') return [n.slice(0, 4), n.slice(4, 10), n.slice(10, 15)].filter(Boolean).join(' ');
  return n.replace(/(.{4})/g, '$1 ').trim();
}
