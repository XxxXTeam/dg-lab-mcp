/**
 * SSE Transport Layer
 * Manages SSE connections and message transmission
 * Implements Requirements 1.1, 1.2, 1.3
 */

import type { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { serialize } from "./types/jsonrpc";
import type { JsonRpcMessage } from "./types/jsonrpc";

export interface SSEConnection {
  id: string;
  response: Response;
  postEndpoint: string;
  createdAt: Date;
}

export class SSETransport {
  private connections: Map<string, SSEConnection> = new Map();
  private postPath: string;
  private baseUrl: string;

  constructor(postPath: string, baseUrl: string = "") {
    this.postPath = postPath;
    this.baseUrl = baseUrl;
  }

  /**
   * Establish SSE connection and send endpoint event
   */
  connect(req: Request, res: Response): SSEConnection {
    const connectionId = uuidv4();
    
    // Set SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering
    res.flushHeaders();

    // Build POST endpoint URI with session ID
    const postEndpoint = `${this.baseUrl}${this.postPath}?sessionId=${connectionId}`;

    const connection: SSEConnection = {
      id: connectionId,
      response: res,
      postEndpoint,
      createdAt: new Date(),
    };

    this.connections.set(connectionId, connection);

    // Send endpoint event per MCP SSE spec
    this.sendEvent(connectionId, "endpoint", postEndpoint);

    // Handle client disconnect
    req.on("close", () => {
      this.disconnect(connectionId);
    });

    return connection;
  }

  /**
   * Send SSE event to a specific connection
   */
  sendEvent(connectionId: string, event: string, data: string): boolean {
    const connection = this.connections.get(connectionId);
    if (!connection) return false;

    try {
      connection.response.write(`event: ${event}\n`);
      connection.response.write(`data: ${data}\n\n`);
      return true;
    } catch {
      // Connection may have been closed
      this.disconnect(connectionId);
      return false;
    }
  }

  /**
   * Send JSON-RPC message via SSE
   */
  send(connectionId: string, message: JsonRpcMessage): boolean {
    const data = serialize(message);
    return this.sendEvent(connectionId, "message", data);
  }

  /**
   * Disconnect and cleanup SSE connection
   */
  disconnect(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      try {
        connection.response.end();
      } catch {
        // Ignore errors when ending response
      }
      this.connections.delete(connectionId);
    }
  }

  /**
   * Get connection by ID
   */
  getConnection(connectionId: string): SSEConnection | undefined {
    return this.connections.get(connectionId);
  }

  /**
   * Check if connection exists
   */
  hasConnection(connectionId: string): boolean {
    return this.connections.has(connectionId);
  }

  /**
   * Get all active connection IDs
   */
  getConnectionIds(): string[] {
    return Array.from(this.connections.keys());
  }

  /**
   * Broadcast message to all connections
   */
  broadcast(message: JsonRpcMessage): void {
    for (const connectionId of this.connections.keys()) {
      this.send(connectionId, message);
    }
  }

  /**
   * Get connection count
   */
  get connectionCount(): number {
    return this.connections.size;
  }
}
