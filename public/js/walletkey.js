// The browser's wallet key: a random 256-bit secret kept in local storage.
// It is sent with every API request (X-Wallet-Key) and is the only thing that
// identifies a wallet, so nothing depends on cookies.
const DEVICE_KEY = 'fakesino:device';
export const KEY_RE = /^[a-f0-9]{32,128}$/;
let memoryKey = null;

export function randomKey() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function deviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!KEY_RE.test(id || '')) {
      id = memoryKey && KEY_RE.test(memoryKey) ? memoryKey : randomKey();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    memoryKey ||= randomKey();
    return memoryKey;
  }
}

export function setDeviceId(id) {
  memoryKey = id;
  try {
    localStorage.setItem(DEVICE_KEY, id);
  } catch {
    /* storage unavailable: the in-memory key is used for this visit */
  }
}
