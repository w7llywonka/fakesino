import { createApp } from './app.js';

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';
const app = createApp({
  dataFile: process.env.FAKESINO_DATA || undefined,
  secureCookies: process.env.SECURE_COOKIES === '1',
});

app.server.listen(port, host, () => {
  console.log(`Fakesino running at http://localhost:${port}  (play money only)`);
});

let closing = false;
async function shutdown(signal) {
  if (closing) return;
  closing = true;
  console.log(`\n${signal} received, saving and shutting down…`);
  setTimeout(() => process.exit(0), 3000).unref();
  await app.close();
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
