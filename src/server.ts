/**
 * HTTP Server with SSE and POST endpoints
 * Implements Requirements 1.1, 1.3
 */

import express from "express";
import type { Request, Response, Application } from "express";
import type { ServerConfig } from "./config";
import { SSETransport } from "./sse-transport";
import { JsonRpcHandler } from "./jsonrpc-handler";
import { serialize } from "./types/jsonrpc";
import type { JsonRpcResponse } from "./types/jsonrpc";

export interface MCPServer {
  app: Application;
  sseTransport: SSETransport;
  jsonRpcHandler: JsonRpcHandler;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export function createServer(config: ServerConfig): MCPServer {
  const app = express();
  
  // CORS middleware
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") {
      res.sendStatus(200);
      return;
    }
    next();
  });

  app.use(express.json());
  app.use(express.text({ type: "application/json" }));

  const sseTransport = new SSETransport(config.postPath);
  const jsonRpcHandler = new JsonRpcHandler({
    onError: (error) => {
      console.error("[JSON-RPC Error]", error);
    },
  });

  // SSE endpoint (GET /sse)
  app.get(config.ssePath, (req: Request, res: Response) => {
    console.log("[SSE] New connection");
    const connection = sseTransport.connect(req, res);
    console.log(`[SSE] Connection established: ${connection.id}`);
  });

  // POST endpoint for JSON-RPC messages
  app.post(config.postPath, async (req: Request, res: Response) => {
    const sessionId = req.query.sessionId as string;
    
    if (!sessionId || !sseTransport.hasConnection(sessionId)) {
      res.status(400).json({ error: "Invalid or missing sessionId" });
      return;
    }

    // Get raw body as string
    let body: string;
    if (typeof req.body === "string") {
      body = req.body;
    } else {
      body = JSON.stringify(req.body);
    }

    console.log(`[POST] Received message for session ${sessionId}:`, body);

    // Process JSON-RPC message
    const response = await jsonRpcHandler.handleMessage(body);

    // Send response via SSE if there is one (requests get responses, notifications don't)
    if (response) {
      sseTransport.send(sessionId, response);
    }

    // Always return 202 Accepted for POST (response sent via SSE)
    res.status(202).json({ status: "accepted" });
  });

  // Health check endpoint
  app.get("/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      connections: sseTransport.connectionCount,
    });
  });

  let server: ReturnType<typeof app.listen> | null = null;

  return {
    app,
    sseTransport,
    jsonRpcHandler,

    async start(): Promise<void> {
      return new Promise((resolve) => {
        server = app.listen(config.port, () => {
          console.log(`[Server] MCP SSE Server listening on port ${config.port}`);
          console.log(`[Server] SSE endpoint: ${config.ssePath}`);
          console.log(`[Server] POST endpoint: ${config.postPath}`);
          resolve();
        });
      });
    },

    async stop(): Promise<void> {
      return new Promise((resolve, reject) => {
        if (server) {
          server.close((err) => {
            if (err) reject(err);
            else resolve();
          });
        } else {
          resolve();
        }
      });
    },
  };
}

/**
 * Send notification to all connected clients
 */
export function broadcastNotification(
  server: MCPServer,
  method: string,
  params?: Record<string, unknown>
): void {
  const notification = {
    jsonrpc: "2.0" as const,
    method,
    params,
  };
  server.sseTransport.broadcast(notification);
}
