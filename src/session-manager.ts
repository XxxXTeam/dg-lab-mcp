/**
 * Session Manager
 * Manages device sessions in memory only (no disk persistence)
 * Sessions expire after 1 hour of inactivity
 */

import { v4 as uuidv4 } from "uuid";
import type WebSocket from "ws";

// Session TTL: 1 hour
const SESSION_TTL_MS = 60 * 60 * 1000;
// Cleanup interval: every 5 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

export interface DeviceSession {
  deviceId: string;
  alias: string | null;
  clientId: string | null;  // Our ID from WS server
  targetId: string | null;  // APP's ID
  ws: WebSocket | null;
  connected: boolean;
  boundToApp: boolean;
  strengthA: number;
  strengthB: number;
  strengthLimitA: number;
  strengthLimitB: number;
  lastActive: Date;
  createdAt: Date;
}

export class SessionManager {
  private sessions: Map<string, DeviceSession> = new Map();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.startCleanupTimer();
  }

  /**
   * Create a new device session
   */
  createSession(): DeviceSession {
    const deviceId = uuidv4();
    const now = new Date();

    const session: DeviceSession = {
      deviceId,
      alias: null,
      clientId: null,
      targetId: null,
      ws: null,
      connected: false,
      boundToApp: false,
      strengthA: 0,
      strengthB: 0,
      strengthLimitA: 200,
      strengthLimitB: 200,
      lastActive: now,
      createdAt: now,
    };

    this.sessions.set(deviceId, session);
    console.log(`[Session] Created: ${deviceId}`);
    return session;
  }

  /**
   * Get session by deviceId
   */
  getSession(deviceId: string): DeviceSession | null {
    const session = this.sessions.get(deviceId);
    if (session) {
      if (this.isExpired(session)) {
        this.deleteSession(deviceId);
        return null;
      }
    }
    return session ?? null;
  }

  /**
   * Get session by clientId (WS server assigned ID)
   */
  getSessionByClientId(clientId: string): DeviceSession | null {
    for (const session of this.sessions.values()) {
      if (session.clientId === clientId && !this.isExpired(session)) {
        return session;
      }
    }
    return null;
  }

  /**
   * List all active sessions
   */
  listSessions(): DeviceSession[] {
    this.cleanupExpiredSessions();
    return Array.from(this.sessions.values());
  }

  /**
   * Delete a session
   */
  deleteSession(deviceId: string): boolean {
    const session = this.sessions.get(deviceId);
    if (session) {
      if (session.ws) {
        try { session.ws.close(); } catch { /* ignore */ }
      }
      this.sessions.delete(deviceId);
      console.log(`[Session] Deleted: ${deviceId}`);
      return true;
    }
    return false;
  }

  /**
   * Set alias for a device
   */
  setAlias(deviceId: string, alias: string): boolean {
    const session = this.sessions.get(deviceId);
    if (session && !this.isExpired(session)) {
      session.alias = alias;
      session.lastActive = new Date();
      return true;
    }
    return false;
  }

  /**
   * Find sessions by alias (case-insensitive)
   */
  findByAlias(alias: string): DeviceSession[] {
    const lowerAlias = alias.toLowerCase();
    return Array.from(this.sessions.values()).filter(
      (s) => !this.isExpired(s) && s.alias?.toLowerCase() === lowerAlias
    );
  }

  /**
   * Update session connection state
   */
  updateConnectionState(
    deviceId: string,
    updates: Partial<Pick<DeviceSession, "connected" | "boundToApp" | "clientId" | "targetId" | "ws">>
  ): boolean {
    const session = this.sessions.get(deviceId);
    if (session) {
      Object.assign(session, updates);
      session.lastActive = new Date();
      return true;
    }
    return false;
  }

  /**
   * Update session strength values
   */
  updateStrength(
    deviceId: string,
    strengthA: number,
    strengthB: number,
    strengthLimitA: number,
    strengthLimitB: number
  ): boolean {
    const session = this.sessions.get(deviceId);
    if (session) {
      session.strengthA = strengthA;
      session.strengthB = strengthB;
      session.strengthLimitA = strengthLimitA;
      session.strengthLimitB = strengthLimitB;
      session.lastActive = new Date();
      return true;
    }
    return false;
  }

  /**
   * Touch session to update lastActive (ping/keepalive)
   */
  touchSession(deviceId: string): boolean {
    const session = this.sessions.get(deviceId);
    if (session) {
      session.lastActive = new Date();
      return true;
    }
    return false;
  }

  get sessionCount(): number {
    return this.sessions.size;
  }

  private isExpired(session: DeviceSession): boolean {
    return Date.now() - session.lastActive.getTime() > SESSION_TTL_MS;
  }

  cleanupExpiredSessions(): number {
    let cleaned = 0;
    const now = Date.now();

    for (const [deviceId, session] of this.sessions) {
      const age = now - session.lastActive.getTime();
      if (age > SESSION_TTL_MS) {
        if (session.ws) {
          try { session.ws.close(); } catch { /* ignore */ }
        }
        this.sessions.delete(deviceId);
        console.log(`[Session] Expired: ${deviceId} (inactive ${Math.round(age / 60000)}min)`);
        cleaned++;
      }
    }
    return cleaned;
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      const cleaned = this.cleanupExpiredSessions();
      if (cleaned > 0) {
        console.log(`[Session] Cleanup: ${cleaned} expired, ${this.sessions.size} remaining`);
      }
    }, CLEANUP_INTERVAL_MS);
  }

  stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  clearAll(): void {
    for (const session of this.sessions.values()) {
      if (session.ws) {
        try { session.ws.close(); } catch { /* ignore */ }
      }
    }
    this.sessions.clear();
  }
}
