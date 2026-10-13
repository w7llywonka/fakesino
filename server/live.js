// Server-sent events hub: public feeds (bets, crash, chat) plus per-user pushes
// (balance changes from async deposits, crash auto cashouts).
export class LiveHub {
  constructor() {
    this.clients = new Set();
    this.heartbeat = setInterval(() => {
      for (const c of this.clients) c.res.write(`: ping ${Date.now()}\n\n`);
    }, 20000);
    this.heartbeat.unref();
  }

  connect(req, res, userId, hello) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 3000\n\n');
    const client = { res, userId };
    this.clients.add(client);
    if (hello) this.write(client, 'hello', hello);
    req.on('close', () => this.clients.delete(client));
  }

  write(client, event, data) {
    client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  broadcast(event, data) {
    for (const c of this.clients) this.write(c, event, data);
  }

  // Like broadcast, but the owner's own connections get `mine: true` so the
  // client can hold its own result back until the game animation finishes.
  broadcastOwned(event, data, ownerId) {
    for (const c of this.clients) this.write(c, event, c.userId === ownerId ? { ...data, mine: true } : data);
  }

  toUser(userId, event, data) {
    for (const c of this.clients) if (c.userId === userId) this.write(c, event, data);
  }

  close() {
    clearInterval(this.heartbeat);
    for (const c of this.clients) c.res.end();
    this.clients.clear();
  }
}
