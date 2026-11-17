/**
 * Mock for @modelcontextprotocol/sdk/types.js
 */

const ListToolsRequestSchema = {
  method: 'tools/list',
};

const CallToolRequestSchema = {
  method: 'tools/call',
};

const isJSONRPCRequest = (value) =>
  typeof value === 'object' &&
  value !== null &&
  value.jsonrpc === '2.0' &&
  (typeof value.id === 'string' || typeof value.id === 'number') &&
  typeof value.method === 'string';

const isInitializeRequest = (value) =>
  typeof value === 'object' &&
  value !== null &&
  value.method === 'initialize' &&
  typeof value.params === 'object' &&
  value.params !== null &&
  typeof value.params.protocolVersion === 'string' &&
  typeof value.params.clientInfo === 'object' &&
  typeof value.params.capabilities === 'object';

module.exports = {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  isJSONRPCRequest,
  isInitializeRequest,
};
