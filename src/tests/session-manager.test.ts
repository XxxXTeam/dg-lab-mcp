/**
 * Session Manager Tests
 * Feature: dg-lab-sse-tool
 * Property 11: Alias Case-Insensitive Search
 * Property 12: Multiple Devices Same Alias
 * 
 * Note: Session persistence tests removed - sessions are now memory-only
 */

import { describe, test, expect } from "bun:test";
import * as fc from "fast-check";
import { SessionManager } from "../session-manager";

describe("Session Manager", () => {
  /**
   * Property 11: Alias Case-Insensitive Search
   * For any alias string, calling findByAlias with the alias in any case
   * SHALL return the same set of devices.
   */
  describe("Property 11: Alias Case-Insensitive Search", () => {
    test("findByAlias is case-insensitive", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 30 }).filter((s) => /[a-zA-Z]/.test(s)),
          (alias) => {
            const manager = new SessionManager();
            const session = manager.createSession();
            manager.setAlias(session.deviceId, alias);

            // Search with different cases
            const lower = manager.findByAlias(alias.toLowerCase());
            const upper = manager.findByAlias(alias.toUpperCase());
            const original = manager.findByAlias(alias);

            // All should return the same session
            expect(lower.length).toBe(1);
            expect(upper.length).toBe(1);
            expect(original.length).toBe(1);

            expect(lower[0].deviceId).toBe(session.deviceId);
            expect(upper[0].deviceId).toBe(session.deviceId);
            expect(original[0].deviceId).toBe(session.deviceId);

            manager.stopCleanupTimer();
          }
        ),
        { numRuns: 100 }
      );
    });

    test("Mixed case aliases are found regardless of search case", () => {
      const manager = new SessionManager();
      const session = manager.createSession();
      manager.setAlias(session.deviceId, "TestUser123");

      expect(manager.findByAlias("testuser123").length).toBe(1);
      expect(manager.findByAlias("TESTUSER123").length).toBe(1);
      expect(manager.findByAlias("TestUser123").length).toBe(1);
      expect(manager.findByAlias("tEsTuSeR123").length).toBe(1);

      manager.stopCleanupTimer();
    });
  });

  /**
   * Property 12: Multiple Devices Same Alias
   * For any alias, multiple devices can be assigned the same alias,
   * and findByAlias SHALL return all of them.
   */
  describe("Property 12: Multiple Devices Same Alias", () => {
    test("Multiple devices can have the same alias", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 30 }),
          fc.integer({ min: 1, max: 5 }),
          (alias, count) => {
            const manager = new SessionManager();
            const deviceIds: string[] = [];

            // Create multiple sessions with same alias
            for (let i = 0; i < count; i++) {
              const session = manager.createSession();
              manager.setAlias(session.deviceId, alias);
              deviceIds.push(session.deviceId);
            }

            // Find by alias should return all
            const found = manager.findByAlias(alias);
            expect(found.length).toBe(count);

            // All device IDs should be in the result
            const foundIds = found.map((s) => s.deviceId);
            for (const id of deviceIds) {
              expect(foundIds).toContain(id);
            }

            manager.stopCleanupTimer();
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe("Basic Operations", () => {
    test("createSession generates unique deviceIds", () => {
      const manager = new SessionManager();
      const ids = new Set<string>();

      for (let i = 0; i < 100; i++) {
        const session = manager.createSession();
        expect(ids.has(session.deviceId)).toBe(false);
        ids.add(session.deviceId);
      }

      manager.stopCleanupTimer();
    });

    test("getSession returns null for non-existent deviceId", () => {
      const manager = new SessionManager();
      expect(manager.getSession("non-existent")).toBeNull();
      manager.stopCleanupTimer();
    });

    test("deleteSession removes session", () => {
      const manager = new SessionManager();
      const session = manager.createSession();

      expect(manager.getSession(session.deviceId)).not.toBeNull();
      expect(manager.deleteSession(session.deviceId)).toBe(true);
      expect(manager.getSession(session.deviceId)).toBeNull();

      manager.stopCleanupTimer();
    });

    test("setAlias returns false for non-existent deviceId", () => {
      const manager = new SessionManager();
      expect(manager.setAlias("non-existent", "alias")).toBe(false);
      manager.stopCleanupTimer();
    });

    test("touchSession updates lastActive", () => {
      const manager = new SessionManager();
      const session = manager.createSession();
      const originalTime = session.lastActive.getTime();

      // Wait a bit
      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
      wait(10).then(() => {
        manager.touchSession(session.deviceId);
        const updated = manager.getSession(session.deviceId);
        expect(updated!.lastActive.getTime()).toBeGreaterThanOrEqual(originalTime);
        manager.stopCleanupTimer();
      });
    });

    test("getSessionByClientId finds session", () => {
      const manager = new SessionManager();
      const session = manager.createSession();
      manager.updateConnectionState(session.deviceId, { clientId: "test-client-id" });

      const found = manager.getSessionByClientId("test-client-id");
      expect(found).not.toBeNull();
      expect(found!.deviceId).toBe(session.deviceId);

      manager.stopCleanupTimer();
    });

    test("clearAll removes all sessions", () => {
      const manager = new SessionManager();
      manager.createSession();
      manager.createSession();
      manager.createSession();

      expect(manager.sessionCount).toBe(3);
      manager.clearAll();
      expect(manager.sessionCount).toBe(0);

      manager.stopCleanupTimer();
    });
  });

  describe("Memory-only behavior", () => {
    test("Sessions are stored in memory only", () => {
      const manager = new SessionManager();
      const session = manager.createSession();
      manager.setAlias(session.deviceId, "test-alias");

      // Session exists in this manager
      expect(manager.getSession(session.deviceId)).not.toBeNull();

      // New manager has no sessions
      const manager2 = new SessionManager();
      expect(manager2.getSession(session.deviceId)).toBeNull();
      expect(manager2.sessionCount).toBe(0);

      manager.stopCleanupTimer();
      manager2.stopCleanupTimer();
    });
  });
});
