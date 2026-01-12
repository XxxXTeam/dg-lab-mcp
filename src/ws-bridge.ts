/**
 * WebSocket Bridge
 * Connects to DG-LAB WebSocket backend (official or self-hosted)
 * Protocol based on temp_dg_plugin/app.js and temp_dg_lab/socket/README.md
 * 
 * No reconnection - if connection drops, session is invalidated
 */

import WebSocket from "ws";
import type { SessionManager, DeviceSession } from "./session-manager";

// DG-LAB WebSocket message types
export type DGLabMessageType = "bind" | "msg" | "heartbeat" | "break" | "error";

export interface DGLabMessage {
  type: DGLabMessageType | string;
  clientId: string;
  targetId: string;
  message: string;
  channel?: string;
}

// Strength mode: 0=decrease, 1=increase, 2=set
export type StrengthMode = "increase" | "decrease" | "set";

const STRENGTH_MODE_MAP: Record<StrengthMode, number> = {
  decrease: 0,
  increase: 1,
  set: 2,
};

export interface WSBridgeOptions {
  wsBackendUrl: string;
  heartbeatInterval?: number;
  onConnectionChange?: (deviceId: string, connected: boolean) => void;
  onStrengthUpdate?: (deviceId: string, a: number, b: number, limitA: number, limitB: number) => void;
  onFeedback?: (deviceId: string, index: number) => void;
  onError?: (deviceId: string, error: string) => void;
}

export class WSBridge {
  private options: Required<WSBridgeOptions>;
  private sessionManager: SessionManager;
  private heartbeatTimers: Map<string, ReturnType<typeof setInterval>> = new Map();

  constructor(sessionManager: SessionManager, options: WSBridgeOptions) {
    this.sessionManager = sessionManager;
    this.options = {
      heartbeatInterval: 30000,
      onConnectionChange: () => {},
      onStrengthUpdate: () => {},
      onFeedback: () => {},
      onError: () => {},
      ...options,
    };
  }

  /**
   * Connect a session to the DG-LAB WebSocket backend
   * Returns the clientId assigned by the WS server
   */
  async connect(session: DeviceSession): Promise<string> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.options.wsBackendUrl);
      let resolved = false;

      ws.on("open", () => {
        console.log(`[WS] Connected for device ${session.deviceId}`);
        this.sessionManager.updateConnectionState(session.deviceId, {
          ws,
          connected: true,
        });
        this.options.onConnectionChange(session.deviceId, true);
      });

      ws.on("message", (data) => {
        const msg = this.parseMessage(data.toString());
        if (!msg) return;

        // First message should be bind with our clientId
        if (!resolved && msg.type === "bind" && msg.clientId && msg.message === "targetId") {
          this.sessionManager.updateConnectionState(session.deviceId, {
            clientId: msg.clientId,
          });
          this.startHeartbeat(session.deviceId);
          resolved = true;
          resolve(msg.clientId);
          return;
        }

        this.handleMessage(session.deviceId, msg);
      });

      ws.on("close", () => {
        console.log(`[WS] Disconnected: ${session.deviceId}`);
        this.stopHeartbeat(session.deviceId);
        this.sessionManager.updateConnectionState(session.deviceId, {
          ws: null,
          connected: false,
          boundToApp: false,
        });
        this.options.onConnectionChange(session.deviceId, false);
        // No reconnection - session becomes invalid
      });

      ws.on("error", (err) => {
        console.error(`[WS] Error for ${session.deviceId}:`, err.message);
        this.options.onError(session.deviceId, err.message);
        if (!resolved) {
          resolved = true;
          reject(err);
        }
      });

      // Timeout for initial connection
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          ws.close();
          reject(new Error("Connection timeout: no bind message received"));
        }
      }, 10000);
    });
  }

  /**
   * Disconnect a device
   */
  disconnect(deviceId: string): void {
    const session = this.sessionManager.getSession(deviceId);
    if (session?.ws) {
      this.stopHeartbeat(deviceId);
      session.ws.close();
      this.sessionManager.updateConnectionState(deviceId, {
        ws: null,
        connected: false,
        boundToApp: false,
      });
    }
  }

  /**
   * Send strength control command
   * Protocol: strength-channel+mode+value
   * channel: 1=A, 2=B
   * mode: 0=decrease, 1=increase, 2=set
   */
  sendStrength(deviceId: string, channel: "A" | "B", mode: StrengthMode, value: number): boolean {
    const session = this.sessionManager.getSession(deviceId);
    if (!session?.ws || !session.connected || !session.targetId) {
      return false;
    }

    const channelNum = channel === "A" ? 1 : 2;
    const modeNum = STRENGTH_MODE_MAP[mode];
    const message = `strength-${channelNum}+${modeNum}+${value}`;

    return this.sendToApp(session, message);
  }

  /**
   * Send waveform data
   * Protocol: pulse-channel:["hex1","hex2",...]
   * channel: A or B
   */
  sendWaveform(deviceId: string, channel: "A" | "B", waveforms: string[]): boolean {
    const session = this.sessionManager.getSession(deviceId);
    if (!session?.ws || !session.connected || !session.targetId) {
      return false;
    }

    const message = `pulse-${channel}:${JSON.stringify(waveforms)}`;
    return this.sendToApp(session, message);
  }

  /**
   * Clear waveform queue
   * Protocol: clear-channel
   * channel: 1=A, 2=B
   */
  clearWaveform(deviceId: string, channel: "A" | "B"): boolean {
    const session = this.sessionManager.getSession(deviceId);
    if (!session?.ws || !session.connected || !session.targetId) {
      return false;
    }

    const message = `clear-${channel === "A" ? 1 : 2}`;
    return this.sendToApp(session, message);
  }

  /**
   * Send message to APP via WS server
   */
  private sendToApp(session: DeviceSession, message: string): boolean {
    if (!session.ws || !session.clientId || !session.targetId) return false;

    const payload: DGLabMessage = {
      type: "msg",
      clientId: session.clientId,
      targetId: session.targetId,
      message,
    };

    try {
      session.ws.send(JSON.stringify(payload));
      this.sessionManager.touchSession(session.deviceId);
      return true;
    } catch (err) {
      console.error(`[WS] Send failed for ${session.deviceId}:`, err);
      return false;
    }
  }

  private parseMessage(data: string): DGLabMessage | null {
    try {
      return JSON.parse(data) as DGLabMessage;
    } catch {
      return null;
    }
  }

  private handleMessage(deviceId: string, msg: DGLabMessage): void {
    switch (msg.type) {
      case "bind":
        this.handleBind(deviceId, msg);
        break;
      case "msg":
        this.handleMsg(deviceId, msg);
        break;
      case "heartbeat":
        // Heartbeat acknowledged, touch session
        this.sessionManager.touchSession(deviceId);
        break;
      case "break":
        this.handleBreak(deviceId, msg);
        break;
      case "error":
        this.handleError(deviceId, msg);
        break;
    }
  }

  private handleBind(deviceId: string, msg: DGLabMessage): void {
    // Bind success: message = "200"
    if (msg.message === "200") {
      console.log(`[WS] Bind success for ${deviceId}: targetId=${msg.targetId}`);
      this.sessionManager.updateConnectionState(deviceId, {
        targetId: msg.targetId,
        boundToApp: true,
      });
    } else {
      // Bind error
      console.error(`[WS] Bind failed for ${deviceId}: ${msg.message}`);
      this.options.onError(deviceId, `Bind failed: ${mapDGLabErrorCode(parseInt(msg.message))}`);
    }
  }

  private handleMsg(deviceId: string, msg: DGLabMessage): void {
    const { message } = msg;

    // Strength update from APP: strength-A+B+limitA+limitB
    if (message.startsWith("strength-")) {
      const parsed = parseStrengthMessage(message);
      if (parsed) {
        this.sessionManager.updateStrength(
          deviceId,
          parsed.strengthA,
          parsed.strengthB,
          parsed.limitA,
          parsed.limitB
        );
        this.options.onStrengthUpdate(
          deviceId,
          parsed.strengthA,
          parsed.strengthB,
          parsed.limitA,
          parsed.limitB
        );
      }
      return;
    }

    // Feedback from APP: feedback-index
    if (message.startsWith("feedback-")) {
      const index = parseInt(message.substring(9));
      if (!isNaN(index)) {
        this.options.onFeedback(deviceId, index);
      }
      return;
    }
  }

  private handleBreak(deviceId: string, msg: DGLabMessage): void {
    console.log(`[WS] Break for ${deviceId}: ${msg.message}`);
    this.sessionManager.updateConnectionState(deviceId, {
      boundToApp: false,
      targetId: null,
    });
    this.options.onError(deviceId, `Connection broken: ${mapDGLabErrorCode(parseInt(msg.message))}`);
  }

  private handleError(deviceId: string, msg: DGLabMessage): void {
    console.error(`[WS] Error for ${deviceId}: ${msg.message}`);
    this.options.onError(deviceId, msg.message);
  }

  private startHeartbeat(deviceId: string): void {
    const timer = setInterval(() => {
      const session = this.sessionManager.getSession(deviceId);
      if (session?.ws && session.connected && session.clientId) {
        try {
          const heartbeat: DGLabMessage = {
            type: "heartbeat",
            clientId: session.clientId,
            targetId: session.targetId || "",
            message: "200",
          };
          session.ws.send(JSON.stringify(heartbeat));
        } catch {
          // Connection lost, will be handled by close event
        }
      } else {
        // Session gone, stop heartbeat
        this.stopHeartbeat(deviceId);
      }
    }, this.options.heartbeatInterval);

    this.heartbeatTimers.set(deviceId, timer);
  }

  private stopHeartbeat(deviceId: string): void {
    const timer = this.heartbeatTimers.get(deviceId);
    if (timer) {
      clearInterval(timer);
      this.heartbeatTimers.delete(deviceId);
    }
  }

  /**
   * Stop all heartbeats (for shutdown)
   */
  stopAll(): void {
    for (const timer of this.heartbeatTimers.values()) {
      clearInterval(timer);
    }
    this.heartbeatTimers.clear();
  }
}

/**
 * Parse strength message: strength-A+B+limitA+limitB
 */
export function parseStrengthMessage(message: string): {
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

/**
 * Map DG-LAB error codes to messages
 */
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
