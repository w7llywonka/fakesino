import { deviceId } from './walletkey.js';

export class ApiError extends Error {
  constructor(status, data) {
    super(data?.error || `Request failed (${status})`);
    this.status = status;
    this.data = data || {};
    this.field = data?.field;
    this.code = data?.code;
  }
}

// If the server doesn't know this browser's wallet (restart, wiped data), the
// app rebuilds it from the local snapshot and the request is retried once.
let recover = null;
let recovering = null;
export function setRecovery(fn) {
  recover = fn;
}

async function request(method, url, body, { retry = true } = {}) {
  const opts = { method, credentials: 'same-origin', headers: { 'X-Wallet-Key': deviceId() } };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(url, opts);
  } catch {
    throw new ApiError(0, { error: 'Network error, check your connection' });
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) {
    if (res.status === 401 && data?.code === 'auth_required' && retry && recover) {
      recovering ||= Promise.resolve()
        .then(recover)
        .finally(() => (recovering = null));
      try {
        await recovering;
      } catch {
        throw new ApiError(res.status, data);
      }
      return request(method, url, body, { retry: false });
    }
    throw new ApiError(res.status, data);
  }
  return data;
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body = {}, opts) => request('POST', url, body, opts),
};
