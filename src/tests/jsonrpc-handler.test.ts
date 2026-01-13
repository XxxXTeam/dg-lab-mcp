/**
 * JSON-RPC Handler Tests
 * Feature: dg-lab-sse-tool, Property 3: Malformed Input Error Handling
 * Validates: Requirements 1.5, 12.1, 12.2
 */

import { describe, test, expect } from "bun:test";
import * as fc from "fast-check";
import { JsonRpcHandler } from "../jsonrpc-handler";
import { JSON_RPC_ERRORS, isJsonRpcErrorResponse } from "../types/jsonrpc";

describe("JSON-RPC Handler", () => {
  /**
   * Property 3: Malformed Input Error Handling
   * For any malformed JSON string or invalid JSON-RPC request structure,
   * the MCP_Server SHALL return a JSON-RPC error response with code
   * -32700 (parse error) or -32600 (invalid request).
   */
  describe("Property 3: Malformed Input Error Handling", () => {
    test("Invalid JSON returns parse error -32700", async () => {
      const handler = new JsonRpcHandler();

      // Generate strings that are not valid JSON
      const invalidJsonArb = fc.oneof(
        // Truncated JSON - ensure it's actually truncated by not closing the string
        fc.string({ minLength: 1 }).map((s) => `{"jsonrpc": "2.0", "method": "${s}`),
        // Missing quotes
        fc.string({ minLength: 1 }).map((s) => `{jsonrpc: "2.0", method: ${s}}`),
        // Random non-JSON strings (filtered to ensure they're invalid)
        fc.string().filter((s) => {
          try {
            JSON.parse(s);
            return false;
          } catch {
            return true;
          }
        }),
        // Incomplete brackets
        fc.constant("{"),
        fc.constant("["),
        fc.constant('{"jsonrpc"'),
        // Unterminated string
        fc.constant('{"jsonrpc": "2.0", "method": "test'),
      );

      await fc.assert(
        fc.asyncProperty(invalidJsonArb, async (invalidJson) => {
          const response = await handler.handleMessage(invalidJson);
          
          expect(response).not.toBeNull();
          expect(isJsonRpcErrorResponse(response)).toBe(true);
          if (isJsonRpcErrorResponse(response)) {
            expect(response.error.code).toBe(JSON_RPC_ERRORS.PARSE_ERROR);
          }
        }),
        { numRuns: 100 }
      );
    });

    test("Valid JSON but invalid JSON-RPC structure returns invalid request -32600", async () => {
      const handler = new JsonRpcHandler();

      // Generate valid JSON that is not valid JSON-RPC
      const invalidRpcArb = fc.oneof(
        // Missing jsonrpc field
        fc.record({
          id: fc.integer(),
          method: fc.string(),
        }),
        // Wrong jsonrpc version
        fc.record({
          jsonrpc: fc.string().filter((s) => s !== "2.0"),
          id: fc.integer(),
          method: fc.string(),
        }),
        // Array instead of object
        fc.array(fc.jsonValue()),
        // Primitive values
        fc.string(),
        fc.integer(),
        fc.boolean(),
        fc.constant(null),
      );

      await fc.assert(
        fc.asyncProperty(invalidRpcArb, async (invalidRpc) => {
          const jsonString = JSON.stringify(invalidRpc);
          const response = await handler.handleMessage(jsonString);
          
          expect(response).not.toBeNull();
          expect(isJsonRpcErrorResponse(response)).toBe(true);
          if (isJsonRpcErrorResponse(response)) {
            expect(response.error.code).toBe(JSON_RPC_ERRORS.INVALID_REQUEST);
          }
        }),
        { numRuns: 100 }
      );
    });

    test("Method not found returns -32601", async () => {
      const handler = new JsonRpcHandler();

      const methodArb = fc.string({ minLength: 1, maxLength: 50 });

      await fc.assert(
        fc.asyncProperty(methodArb, async (method) => {
          const request = JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: method,
          });
          const response = await handler.handleMessage(request);
          
          expect(response).not.toBeNull();
          expect(isJsonRpcErrorResponse(response)).toBe(true);
          if (isJsonRpcErrorResponse(response)) {
            expect(response.error.code).toBe(JSON_RPC_ERRORS.METHOD_NOT_FOUND);
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  describe("Request Handler Registration", () => {
    test("Registered handler is called with correct params", async () => {
      const handler = new JsonRpcHandler();
      let receivedParams: Record<string, unknown> | undefined;

      handler.registerRequestHandler("test/method", async (params) => {
        receivedParams = params;
        return { success: true };
      });

      const paramsArb = fc.dictionary(
        fc.string({ minLength: 1, maxLength: 10 }),
        fc.jsonValue()
      );

      await fc.assert(
        fc.asyncProperty(paramsArb, async (params) => {
          const request = JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "test/method",
            params: params,
          });
          
          const response = await handler.handleMessage(request);
          
          expect(response).not.toBeNull();
          expect(response?.jsonrpc).toBe("2.0");
          expect(response?.id).toBe(1);
          expect("result" in response!).toBe(true);
          expect(JSON.stringify(receivedParams)).toBe(JSON.stringify(params));
        }),
        { numRuns: 50 }
      );
    });

    test("Handler error returns internal error -32603", async () => {
      const handler = new JsonRpcHandler();

      handler.registerRequestHandler("test/error", async () => {
        throw new Error("Test error");
      });

      const response = await handler.handleMessage(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "test/error",
        })
      );

      expect(response).not.toBeNull();
      expect(isJsonRpcErrorResponse(response)).toBe(true);
      if (isJsonRpcErrorResponse(response)) {
        expect(response.error.code).toBe(JSON_RPC_ERRORS.INTERNAL_ERROR);
        expect(response.error.message).toBe("Test error");
      }
    });
  });

  describe("Notification Handler", () => {
    test("Notifications do not return responses", async () => {
      const handler = new JsonRpcHandler();
      let notificationReceived = false;

      handler.registerNotificationHandler("test/notify", async () => {
        notificationReceived = true;
      });

      const response = await handler.handleMessage(
        JSON.stringify({
          jsonrpc: "2.0",
          method: "test/notify",
        })
      );

      expect(response).toBeNull();
      expect(notificationReceived).toBe(true);
    });
  });

  describe("Parameter Validation", () => {
    test("validateParams returns error for missing required params", () => {
      const handler = new JsonRpcHandler();

      const result = handler.validateParams(1, undefined, ["deviceId"]);
      
      expect(result).not.toBeNull();
      expect(isJsonRpcErrorResponse(result)).toBe(true);
      if (isJsonRpcErrorResponse(result)) {
        expect(result.error.code).toBe(JSON_RPC_ERRORS.INVALID_PARAMS);
      }
    });

    test("validateParams returns null for valid params", () => {
      const handler = new JsonRpcHandler();

      const result = handler.validateParams(1, { deviceId: "test" }, ["deviceId"]);
      
      expect(result).toBeNull();
    });
  });
});
