/**
 * MCP Protocol Implementation
 * Handles MCP initialization handshake and protocol methods
 * Implements Requirements 2.1, 2.2, 2.3, 2.4, 2.5
 */

import type { JsonRpcHandler } from "./jsonrpc-handler";

// MCP Protocol Version
export const MCP_PROTOCOL_VERSION = "2024-11-05";

// Server Info
export const SERVER_INFO = {
  name: "dg-lab-mcp-server",
  version: "1.0.0",
};

// Server Capabilities
export const SERVER_CAPABILITIES = {
  tools: {
    listChanged: true,
  },
};

export interface InitializeParams {
  protocolVersion: string;
  capabilities: Record<string, unknown>;
  clientInfo: {
    name: string;
    version: string;
  };
}

export interface InitializeResult {
  protocolVersion: string;
  capabilities: typeof SERVER_CAPABILITIES;
  serverInfo: typeof SERVER_INFO;
}

/**
 * Register MCP protocol handlers on the JSON-RPC handler
 */
export function registerMCPProtocol(
  handler: JsonRpcHandler,
  onInitialized?: () => void
): void {
  // Handle initialize request
  handler.registerRequestHandler("initialize", async (params) => {
    const initParams = params as InitializeParams | undefined;
    
    // Validate protocol version
    if (initParams?.protocolVersion && initParams.protocolVersion !== MCP_PROTOCOL_VERSION) {
      // We support the specified version, but warn if different
      console.log(`[MCP] Client requested protocol version: ${initParams.protocolVersion}`);
    }

    const result: InitializeResult = {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: SERVER_CAPABILITIES,
      serverInfo: SERVER_INFO,
    };

    console.log("[MCP] Initialize request received, responding with capabilities");
    return result;
  });

  // Handle initialized notification
  handler.registerNotificationHandler("initialized", async () => {
    console.log("[MCP] Initialization complete");
    onInitialized?.();
  });

  // Handle ping request (optional but useful)
  handler.registerRequestHandler("ping", async () => {
    return {};
  });
}
