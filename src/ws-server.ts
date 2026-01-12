/**
 * WebSocket Server for DG-LAB
 * Self-hosted WebSocket server based on temp_dg_plugin/app.js
 * 
 * This replaces connecting to external WS server - we ARE the WS server
 */

import { WebSocketServer, WebSocket } from "ws";
import { v4 as uuidv4 } from "uuid";
import type { IncomingMessage } from "http";

// DG-LAB WebSocket message types
export type DGLabMessageType = "bind" | "msg" | "heartbeat" | "break" | "error";

export interface DGLabMessage {
  type: DGLabMessageType | string;
  clientId: string;
  targetId: string;
  message: string;
  channel?: string;
  time?: number;
}

// Client info stored in the server
interface ClientInfo {
  id: string;
  ws: WebSocket;
  type: "controller" | "app" | "unknown";
  boundTo: string | null; // The other party's clientId
  lastActive: number;
}

// Waveform send timer info
interface WaveformTimer {
  timerId: ReturnType<typeof setInterval>;
  remaining: number;
}

export interface WSServerOptions {
  port: number;
  heartbeatInterval?: number;
  onStrengthUpdate?: (controllerId: string, a: number, b: number, limitA: number, limitB: number) => void;
  onFeedback?: (controllerId: string, index: number) => void;
  onBindChange?: (controllerId: string, appId: string | null) => void;
}

export class DGLabWSServer {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, ClientInfo> = new Map();
  private relations: Map<string, string> = new Map(); // controllerId -> appId
  private waveformTimers: Map<string, WaveformTimer> = new Map(); // clientId-channel -> timer
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private options: Required<WSServerOptions>;

  constructor(options: WSServerOptions) {
    this.options = {
      heartbeatInterval: 60000,
      onStrengthUpdate: () => {},
      onFeedback: () => {},
      onBindChange: () => {},
      ...options,
    };
  }

  /**
   * Start the WebSocket server
   */
  start(): void {
    this.wss = new WebSocketServer({ port: this.options.port });

    this.wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
      this.handleConnection(ws, req);
    });

    // Start heartbeat timer
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeats();
    }, this.options.heartbeatInterval);

    console.log(`[WS Server] Listening on port ${this.options.port}`);
  }


  /**
   * Stop the WebSocket server
   */
  stop(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    // Clear all waveform timers
    for (const timer of this.waveformTimers.values()) {
      clearInterval(timer.timerId);
    }
    this.waveformTimers.clear();

    // Close all connections
    for (const client of this.clients.values()) {
      client.ws.close();
    }
    this.clients.clear();
    this.relations.clear();

    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    console.log("[WS Server] Stopped");
  }

  /**
   * Handle new WebSocket connection
   */
  private handleConnection(ws: WebSocket, _req: IncomingMessage): void {
    const clientId = uuidv4();
    
    const clientInfo: ClientInfo = {
      id: clientId,
      ws,
      type: "unknown",
      boundTo: null,
      lastActive: Date.now(),
    };
    
    this.clients.set(clientId, clientInfo);
    console.log(`[WS Server] New connection: ${clientId}`);

    // Send clientId to the new client
    this.send(ws, {
      type: "bind",
      clientId,
      targetId: "",
      message: "targetId",
    });

    ws.on("message", (data) => {
      this.handleMessage(clientId, data.toString());
    });

    ws.on("close", () => {
      this.handleClose(clientId);
    });

    ws.on("error", (error) => {
      console.error(`[WS Server] Error for ${clientId}:`, error.message);
      this.handleError(clientId, error);
    });
  }

  /**
   * Handle incoming message
   */
  private handleMessage(clientId: string, rawData: string): void {
    console.log(`[WS Server] Received from ${clientId}: ${rawData}`);
    
    const client = this.clients.get(clientId);
    if (!client) return;

    client.lastActive = Date.now();

    let data: DGLabMessage;
    try {
      data = JSON.parse(rawData);
    } catch {
      this.send(client.ws, {
        type: "msg",
        clientId: "",
        targetId: "",
        message: "403",
      });
      return;
    }

    // Validate message source
    if (data.clientId !== clientId && data.targetId !== clientId) {
      // Allow if this is the initial bind from APP
      if (!(data.type === "bind" && data.message === "DGLAB")) {
        this.send(client.ws, {
          type: "msg",
          clientId: "",
          targetId: "",
          message: "404",
        });
        return;
      }
    }

    // Route message by type
    switch (data.type) {
      case "bind":
        this.handleBind(clientId, data);
        break;
      case "msg":
        this.handleMsg(clientId, data);
        break;
      case "heartbeat":
        // Just update lastActive, already done above
        break;
      default:
        // Forward to bound partner
        this.forwardMessage(clientId, data);
        break;
    }
  }

  /**
   * Handle bind request
   */
  private handleBind(clientId: string, data: DGLabMessage): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    // APP initiates bind: message = "DGLAB"
    if (data.message === "DGLAB" && data.clientId && data.targetId) {
      const controllerId = data.clientId;
      const appId = data.targetId;

      // Check both clients exist
      if (!this.clients.has(controllerId) || !this.clients.has(appId)) {
        this.send(client.ws, {
          type: "bind",
          clientId: controllerId,
          targetId: appId,
          message: "401",
        });
        return;
      }

      // Check neither is already bound
      const alreadyBound = [controllerId, appId].some(
        (id) => this.relations.has(id) || [...this.relations.values()].includes(id)
      );

      if (alreadyBound) {
        this.send(client.ws, {
          type: "bind",
          clientId: controllerId,
          targetId: appId,
          message: "400",
        });
        return;
      }

      // Create binding
      this.relations.set(controllerId, appId);
      
      const controllerClient = this.clients.get(controllerId);
      const appClient = this.clients.get(appId);
      
      if (controllerClient) {
        controllerClient.type = "controller";
        controllerClient.boundTo = appId;
      }
      if (appClient) {
        appClient.type = "app";
        appClient.boundTo = controllerId;
      }

      // Notify both parties
      const successMsg: DGLabMessage = {
        type: "bind",
        clientId: controllerId,
        targetId: appId,
        message: "200",
      };

      if (controllerClient) this.send(controllerClient.ws, successMsg);
      if (appClient) this.send(appClient.ws, successMsg);

      this.options.onBindChange(controllerId, appId);
      console.log(`[WS Server] Bound: ${controllerId} <-> ${appId}`);
    }
  }


  /**
   * Handle msg type messages
   */
  private handleMsg(clientId: string, data: DGLabMessage): void {
    const { message, targetId } = data;

    // Strength update from APP: strength-A+B+limitA+limitB
    if (message.startsWith("strength-")) {
      const parsed = this.parseStrengthMessage(message);
      if (parsed) {
        // Find the controller bound to this APP
        const client = this.clients.get(clientId);
        if (client?.boundTo) {
          this.options.onStrengthUpdate(
            client.boundTo,
            parsed.strengthA,
            parsed.strengthB,
            parsed.limitA,
            parsed.limitB
          );
        }
        // Forward to controller
        this.forwardMessage(clientId, data);
      }
      return;
    }

    // Feedback from APP: feedback-index
    if (message.startsWith("feedback-")) {
      const index = parseInt(message.substring(9));
      if (!isNaN(index)) {
        const client = this.clients.get(clientId);
        if (client?.boundTo) {
          this.options.onFeedback(client.boundTo, index);
        }
      }
      this.forwardMessage(clientId, data);
      return;
    }

    // Forward other messages
    this.forwardMessage(clientId, data);
  }

  /**
   * Forward message to bound partner
   */
  private forwardMessage(fromClientId: string, data: DGLabMessage): void {
    const client = this.clients.get(fromClientId);
    if (!client?.boundTo) return;

    // Check binding relationship
    const boundId = this.relations.get(fromClientId) || 
      [...this.relations.entries()].find(([_, v]) => v === fromClientId)?.[0];
    
    if (!boundId) {
      this.send(client.ws, {
        type: "bind",
        clientId: data.clientId,
        targetId: data.targetId,
        message: "402",
      });
      return;
    }

    const targetClient = this.clients.get(client.boundTo);
    if (targetClient) {
      this.send(targetClient.ws, data);
    } else {
      this.send(client.ws, {
        type: "msg",
        clientId: data.clientId,
        targetId: data.targetId,
        message: "404",
      });
    }
  }

  /**
   * Handle client disconnect
   */
  private handleClose(clientId: string): void {
    console.log(`[WS Server] Disconnected: ${clientId}`);
    
    const client = this.clients.get(clientId);
    if (!client) return;

    // Clear any waveform timers for this client
    for (const [key, timer] of this.waveformTimers.entries()) {
      if (key.startsWith(clientId + "-")) {
        clearInterval(timer.timerId);
        this.waveformTimers.delete(key);
      }
    }

    // Notify bound partner
    if (client.boundTo) {
      const partner = this.clients.get(client.boundTo);
      if (partner) {
        this.send(partner.ws, {
          type: "break",
          clientId: client.boundTo,
          targetId: clientId,
          message: "209",
        });
        partner.ws.close();
        partner.boundTo = null;
      }

      // Clean up relation
      this.relations.delete(clientId);
      this.relations.delete(client.boundTo);
      
      this.options.onBindChange(
        client.type === "controller" ? clientId : client.boundTo,
        null
      );
    }

    this.clients.delete(clientId);
    console.log(`[WS Server] Cleaned up ${clientId}, clients: ${this.clients.size}`);
  }

  /**
   * Handle client error
   */
  private handleError(clientId: string, error: Error): void {
    const client = this.clients.get(clientId);
    if (!client?.boundTo) return;

    const partner = this.clients.get(client.boundTo);
    if (partner) {
      this.send(partner.ws, {
        type: "error",
        clientId: client.boundTo,
        targetId: clientId,
        message: "500",
      });
    }
  }

  /**
   * Send heartbeats to all clients
   */
  private sendHeartbeats(): void {
    if (this.clients.size === 0) return;

    console.log(`[WS Server] Sending heartbeats to ${this.clients.size} clients`);
    
    for (const [clientId, client] of this.clients.entries()) {
      this.send(client.ws, {
        type: "heartbeat",
        clientId,
        targetId: client.boundTo || "",
        message: "200",
      });
    }
  }

  /**
   * Send message to WebSocket
   */
  private send(ws: WebSocket, msg: DGLabMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  /**
   * Parse strength message: strength-A+B+limitA+limitB
   */
  private parseStrengthMessage(message: string): {
    strengthA: number;
    strengthB: number;
    limitA: number;
    limitB: number;
  } | null {
    const match = message.match(/^strength-(\d+)\+(\d+)\+(\d+)\+(\d+)$/);
    if (!match) return null;

    return {
      strengthA: parseInt(match[1]!, 10),
      strengthB: parseInt(match[2]!, 10),
      limitA: parseInt(match[3]!, 10),
      limitB: parseInt(match[4]!, 10),
    };
  }

  // ============ Public API for MCP Tools ============

  /**
   * Get a new controller clientId (for dg_connect)
   * Creates a virtual controller connection
   */
  createController(): string {
    const clientId = uuidv4();
    
    // Create a mock WebSocket-like object for internal use
    const mockWs = this.createMockWebSocket(clientId);
    
    const clientInfo: ClientInfo = {
      id: clientId,
      ws: mockWs as unknown as WebSocket,
      type: "controller",
      boundTo: null,
      lastActive: Date.now(),
    };
    
    this.clients.set(clientId, clientInfo);
    console.log(`[WS Server] Created controller: ${clientId}`);
    
    return clientId;
  }

  /**
   * Create a mock WebSocket for internal controller
   */
  private createMockWebSocket(clientId: string): object {
    return {
      readyState: WebSocket.OPEN,
      send: (data: string) => {
        // Internal controller receives messages here
        // We can log or process them
        console.log(`[WS Server] To controller ${clientId}: ${data}`);
      },
      close: () => {
        // Handle close
      },
    };
  }

  /**
   * Check if a controller is bound to an APP
   */
  isControllerBound(controllerId: string): boolean {
    return this.relations.has(controllerId);
  }

  /**
   * Get the APP clientId bound to a controller
   */
  getBoundAppId(controllerId: string): string | null {
    return this.relations.get(controllerId) || null;
  }

  /**
   * Get controller info
   */
  getController(controllerId: string): ClientInfo | null {
    const client = this.clients.get(controllerId);
    return client?.type === "controller" ? client : null;
  }

  /**
   * List all controllers
   */
  listControllers(): Array<{ id: string; boundTo: string | null; lastActive: number }> {
    const result: Array<{ id: string; boundTo: string | null; lastActive: number }> = [];
    for (const client of this.clients.values()) {
      if (client.type === "controller") {
        result.push({
          id: client.id,
          boundTo: client.boundTo,
          lastActive: client.lastActive,
        });
      }
    }
    return result;
  }

  /**
   * Remove a controller
   */
  removeController(controllerId: string): boolean {
    const client = this.clients.get(controllerId);
    if (!client || client.type !== "controller") return false;
    
    this.handleClose(controllerId);
    return true;
  }


  /**
   * Send strength command to APP (for dg_set_strength)
   * Protocol: strength-channel+mode+value
   */
  sendStrength(controllerId: string, channel: "A" | "B", mode: "increase" | "decrease" | "set", value: number): boolean {
    const appId = this.relations.get(controllerId);
    if (!appId) return false;

    const appClient = this.clients.get(appId);
    if (!appClient) return false;

    const channelNum = channel === "A" ? 1 : 2;
    const modeNum = mode === "decrease" ? 0 : mode === "increase" ? 1 : 2;
    const message = `strength-${channelNum}+${modeNum}+${value}`;

    this.send(appClient.ws, {
      type: "msg",
      clientId: controllerId,
      targetId: appId,
      message,
    });

    return true;
  }

  /**
   * Send waveform to APP (for dg_send_waveform)
   * Protocol: pulse-channel:["hex1","hex2",...]
   */
  sendWaveform(controllerId: string, channel: "A" | "B", waveforms: string[]): boolean {
    const appId = this.relations.get(controllerId);
    if (!appId) return false;

    const appClient = this.clients.get(appId);
    if (!appClient) return false;

    const message = `pulse-${channel}:${JSON.stringify(waveforms)}`;

    this.send(appClient.ws, {
      type: "msg",
      clientId: controllerId,
      targetId: appId,
      message,
    });

    return true;
  }

  /**
   * Clear waveform queue (for dg_clear_waveform)
   * Protocol: clear-channel
   */
  clearWaveform(controllerId: string, channel: "A" | "B"): boolean {
    const appId = this.relations.get(controllerId);
    if (!appId) return false;

    const appClient = this.clients.get(appId);
    if (!appClient) return false;

    const channelNum = channel === "A" ? 1 : 2;

    this.send(appClient.ws, {
      type: "msg",
      clientId: controllerId,
      targetId: appId,
      message: `clear-${channelNum}`,
    });

    return true;
  }

  /**
   * Get QR code URL for APP to scan
   * Format: https://www.dungeon-lab.com/app-download.php#DGLAB-SOCKET#ws://host:port/clientId
   */
  getQRCodeUrl(controllerId: string, host: string): string {
    const wsUrl = `ws://${host}:${this.options.port}/${controllerId}`;
    return `https://www.dungeon-lab.com/app-download.php#DGLAB-SOCKET#${wsUrl}`;
  }

  /**
   * Get WebSocket URL for APP to connect
   */
  getWSUrl(controllerId: string, host: string): string {
    return `ws://${host}:${this.options.port}/${controllerId}`;
  }

  /**
   * Get server port
   */
  getPort(): number {
    return this.options.port;
  }

  /**
   * Get client count
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Get relation count
   */
  getRelationCount(): number {
    return this.relations.size;
  }
}

// Export error code mapping
export function mapDGLabErrorCode(code: number): string {
  const errors: Record<number, string> = {
    200: "成功",
    209: "对方已断开连接",
    210: "二维码中没有有效的clientID",
    211: "服务器未下发APP ID",
    400: "此ID已被其他客户端绑定",
    401: "目标客户端不存在",
    402: "双方未建立绑定关系",
    403: "消息不是有效的JSON",
    404: "收信人离线",
    405: "消息长度超过1950字符",
    500: "服务器内部错误",
  };
  return errors[code] ?? `未知错误: ${code}`;
}
