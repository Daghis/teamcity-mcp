/**
 * Mock for @modelcontextprotocol/sdk/server/stdio.js
 */

class StdioServerTransport {
  constructor() {
    this.input = process.stdin;
    this.output = process.stdout;
  }
}

module.exports = { StdioServerTransport };
