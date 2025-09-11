/**
 * Mock for @modelcontextprotocol/sdk/server/index.js
 */

class Server {
  constructor(serverInfo, options) {
    this.serverInfo = serverInfo;
    this.options = options;
    this._capabilities = options?.capabilities;
    this._requestHandlers = new Map();
    this._connected = false;
  }

  setRequestHandler(schema, handler) {
    this._requestHandlers.set(schema, handler);
  }

  async connect(transport) {
    this._transport = transport;
    this._connected = true;
    return Promise.resolve();
  }

  async close() {
    this._connected = false;
    this._transport = null;
    return Promise.resolve();
  }
}

module.exports = { Server };
