/**
 * DG-LAB MCP SSE Server Entry Point
 * 
 * Main entry point that initializes and starts the MCP server.
 * Includes built-in WebSocket server for DG-LAB APP connections.
 * Sessions are stored in memory only (1 hour TTL).
 */

import { loadConfig } from "./config";
import { createServer, broadcastNotification } from "./server";
import { registerMCPProtocol } from "./mcp-protocol";
import { ToolManager, registerToolHandlers } from "./tool-manager";
import { SessionManager } from "./session-manager";
import { DGLabWSServer } from "./ws-server";
import { registerDeviceTools } from "./tools/device-tools";
import { registerControlTools } from "./tools/control-tools";
import { getWaveformTools, initWaveformStorage } from "./tools/waveform-tools";
import { WaveformStorage, loadWaveforms } from "./waveform-storage";

async function main() {
  console.log("=".repeat(50));
  console.log("DG-LAB MCP SSE Server");
  console.log("=".repeat(50));

  // Load configuration
  const config = loadConfig();
  console.log(`[Config] HTTP Port: ${config.port}`);
  console.log(`[Config] WS Port: ${config.wsPort}`);
  console.log(`[Config] SSE Path: ${config.ssePath}`);
  console.log(`[Config] POST Path: ${config.postPath}`);

  // Create HTTP server for MCP SSE
  const server = createServer(config);

  // Create tool manager
  const toolManager = new ToolManager(() => {
    broadcastNotification(server, "notifications/tools/list_changed");
  });

  // Create session manager (memory only, 1 hour TTL)
  const sessionManager = new SessionManager();
  console.log("[Sessions] Memory-only mode (1 hour TTL)");

  // Create WebSocket server (self-hosted, replaces external WS backend)
  const wsServer = new DGLabWSServer({
    port: config.wsPort,
    heartbeatInterval: config.heartbeatInterval,
    onStrengthUpdate: (controllerId, a, b, limitA, limitB) => {
      console.log(`[WS] ${controllerId} strength: A=${a}/${limitA}, B=${b}/${limitB}`);
      // Update session manager with strength info
      const session = sessionManager.getSessionByClientId(controllerId);
      if (session) {
        sessionManager.updateStrength(session.deviceId, a, b, limitA, limitB);
      }
    },
    onFeedback: (controllerId, index) => {
      console.log(`[WS] ${controllerId} feedback: ${index}`);
    },
    onBindChange: (controllerId, appId) => {
      console.log(`[WS] ${controllerId} bind: ${appId || "unbound"}`);
      // Update session manager with bind state
      const session = sessionManager.getSessionByClientId(controllerId);
      if (session) {
        sessionManager.updateConnectionState(session.deviceId, {
          boundToApp: !!appId,
          targetId: appId,
        });
      }
    },
  });

  // Start WebSocket server
  wsServer.start();
  console.log(`[WS Server] Listening on port ${config.wsPort}`);

  // Initialize waveform storage (persisted to disk for convenience)
  const waveformStorage = new WaveformStorage();
  if (loadWaveforms(waveformStorage, config.waveformStorePath)) {
    console.log(`[Waveforms] Loaded ${waveformStorage.list().length} waveforms from disk`);
  }
  initWaveformStorage(waveformStorage, config.waveformStorePath);

  // Register MCP protocol handlers
  registerMCPProtocol(server.jsonRpcHandler, () => {
    console.log("[MCP] Client initialized");
  });

  // Register tool handlers
  registerToolHandlers(server.jsonRpcHandler, toolManager);

  // Register device tools (now uses wsServer instead of wsBridge)
  registerDeviceTools(toolManager, sessionManager, wsServer);
  console.log("[Tools] Device tools registered");

  // Register control tools (now uses wsServer instead of wsBridge)
  registerControlTools(toolManager, sessionManager, wsServer);
  console.log("[Tools] Control tools registered");

  // Register waveform tools
  const waveformTools = getWaveformTools();
  for (const tool of waveformTools) {
    toolManager.registerTool(tool.name, tool.description, tool.inputSchema, tool.handler);
  }
  console.log("[Tools] Waveform tools registered");
  console.log(`[Tools] Total: ${toolManager.toolCount}`);

  // Graceful shutdown
  const shutdown = async () => {
    console.log("\n[Server] Shutting down...");
    wsServer.stop();
    sessionManager.stopCleanupTimer();
    sessionManager.clearAll();
    await server.stop();
    console.log("[Server] Stopped");
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Start HTTP server
  await server.start();
  console.log("=".repeat(50));
  console.log("Server ready");
  console.log(`SSE: http://localhost:${config.port}${config.ssePath}`);
  console.log(`POST: http://localhost:${config.port}${config.postPath}`);
  console.log(`WebSocket: ws://localhost:${config.wsPort}`);
  console.log("=".repeat(50));
}

main().catch((error) => {
  console.error("[Fatal]", error);
  process.exit(1);
});
