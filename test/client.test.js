import test from 'node:test';

// No other test loads these browser modules. Importing them makes a missing
// export (say, a shared helper that was removed) fail here rather than only
// in the browser, where the Wallet modal or the page would stop loading.
const MODULES = [
  'ui/wallet.js',
  'ui/txmodal.js',
  'ui/help.js',
  'ui/offers.js',
  'ui/forms.js',
  'pages/transactions.js',
  'pages/settings.js',
  'pages/explorer.js',
  'pages/misc.js',
];

for (const m of MODULES) {
  test(`${m} loads`, async () => {
    await import(`../public/js/${m}`);
  });
}
