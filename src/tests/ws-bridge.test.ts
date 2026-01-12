/**
 * WebSocket Bridge Tests
 * Feature: dg-lab-sse-tool
 * Property 15: Strength Message Parsing
 * Property 17: DG-LAB Error Code Mapping
 */

import { describe, test, expect } from "bun:test";
import * as fc from "fast-check";
import { parseStrengthMessage, mapDGLabErrorCode } from "../ws-bridge";

describe("WebSocket Bridge", () => {
  /**
   * Property 15: Strength Message Parsing
   * For any valid DG-LAB strength message in format strength-A+B+A_limit+B_limit,
   * the WS_Bridge SHALL correctly parse and store all four values.
   */
  describe("Property 15: Strength Message Parsing", () => {
    test("Valid strength messages are parsed correctly", () => {
      const strengthArb = fc.integer({ min: 0, max: 200 });

      fc.assert(
        fc.property(
          strengthArb,
          strengthArb,
          strengthArb,
          strengthArb,
          (a, b, limitA, limitB) => {
            const message = `strength-${a}+${b}+${limitA}+${limitB}`;
            const result = parseStrengthMessage(message);

            expect(result).not.toBeNull();
            expect(result!.strengthA).toBe(a);
            expect(result!.strengthB).toBe(b);
            expect(result!.limitA).toBe(limitA);
            expect(result!.limitB).toBe(limitB);
          }
        ),
        { numRuns: 100 }
      );
    });

    test("Parsing preserves exact values", () => {
      // Test specific edge cases
      const testCases = [
        { a: 0, b: 0, limitA: 0, limitB: 0 },
        { a: 200, b: 200, limitA: 200, limitB: 200 },
        { a: 100, b: 50, limitA: 150, limitB: 75 },
        { a: 1, b: 2, limitA: 3, limitB: 4 },
      ];

      for (const tc of testCases) {
        const message = `strength-${tc.a}+${tc.b}+${tc.limitA}+${tc.limitB}`;
        const result = parseStrengthMessage(message);

        expect(result).not.toBeNull();
        expect(result!.strengthA).toBe(tc.a);
        expect(result!.strengthB).toBe(tc.b);
        expect(result!.limitA).toBe(tc.limitA);
        expect(result!.limitB).toBe(tc.limitB);
      }
    });

    test("Invalid strength messages return null", () => {
      const invalidMessages = [
        "strength-",
        "strength-1+2+3",
        "strength-1+2+3+4+5",
        "strength-a+b+c+d",
        "invalid",
        "",
        "strength1+2+3+4",
        "STRENGTH-1+2+3+4",
      ];

      for (const msg of invalidMessages) {
        expect(parseStrengthMessage(msg)).toBeNull();
      }
    });

    test("Random invalid formats return null", () => {
      const invalidArb = fc.string().filter((s) => {
        // Filter out strings that match the valid format
        return !/^strength-\d+\+\d+\+\d+\+\d+$/.test(s);
      });

      fc.assert(
        fc.property(invalidArb, (message) => {
          expect(parseStrengthMessage(message)).toBeNull();
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 17: DG-LAB Error Code Mapping
   * For any DG-LAB error code (209, 400-405, 500), the MCP_Server SHALL
   * map it to an appropriate tool error message.
   */
  describe("Property 17: DG-LAB Error Code Mapping", () => {
    test("Known error codes map to descriptive messages", () => {
      const knownCodes = [200, 209, 400, 401, 402, 403, 404, 405, 500];

      for (const code of knownCodes) {
        const message = mapDGLabErrorCode(code);
        
        // Message should be non-empty
        expect(message.length).toBeGreaterThan(0);
        
        // Message should not just be the code
        expect(message).not.toBe(String(code));
        
        // Message should be descriptive (at least 2 chars for Chinese)
        expect(message.length).toBeGreaterThanOrEqual(2);
      }
    });

    test("Error code 209 indicates peer disconnection", () => {
      const message = mapDGLabErrorCode(209);
      // Chinese: 对方已断开连接
      expect(message).toContain("断开");
    });

    test("Error codes 400-405 indicate specific failures", () => {
      // Chinese messages
      expect(mapDGLabErrorCode(400)).toContain("绑定");
      expect(mapDGLabErrorCode(401)).toContain("不存在");
      expect(mapDGLabErrorCode(402)).toContain("绑定");
      expect(mapDGLabErrorCode(403).toLowerCase()).toContain("json");
      expect(mapDGLabErrorCode(404)).toContain("离线");
      expect(mapDGLabErrorCode(405)).toContain("超过");
    });

    test("Error code 500 indicates server error", () => {
      const message = mapDGLabErrorCode(500);
      // Chinese: 服务器内部错误
      expect(message).toContain("服务器");
    });

    test("Unknown error codes return informative message", () => {
      fc.assert(
        fc.property(
          fc.integer().filter((n) => ![200, 209, 400, 401, 402, 403, 404, 405, 500].includes(n)),
          (code) => {
            const message = mapDGLabErrorCode(code);
            
            // Should return something
            expect(message.length).toBeGreaterThan(0);
            
            // Should include the code for debugging
            expect(message).toContain(String(code));
          }
        ),
        { numRuns: 50 }
      );
    });

    test("All known codes have unique messages", () => {
      const knownCodes = [200, 209, 400, 401, 402, 403, 404, 405, 500];
      const messages = knownCodes.map(mapDGLabErrorCode);
      const uniqueMessages = new Set(messages);
      
      expect(uniqueMessages.size).toBe(knownCodes.length);
    });
  });
});
