#!/usr/bin/env bash

echo "Starting MCP Server in interactive mode..."
echo "The server will start and you can type JSON-RPC commands."
echo ""
echo "Try these commands (paste them one at a time):"
echo ""
echo '1. Initialize:'
echo '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"0.1.0","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}},"id":1}'
echo ""
echo '2. List tools:'
echo '{"jsonrpc":"2.0","method":"tools/list","params":{},"id":2}'
echo ""
echo '3. Call ping tool:'
echo '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"ping","arguments":{"message":"hello"}},"id":3}'
echo ""
echo "Press Ctrl+C to exit"
echo "=========================================="
echo ""

# Run the server
npx tsx src/index.ts

