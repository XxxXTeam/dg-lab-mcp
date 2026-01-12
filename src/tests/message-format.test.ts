/**
 * JSON-RPC Message Format Tests
 * Feature: dg-lab-sse-tool, Property 1: JSON-RPC Message Format Validity
 * Validates: Requirements 1.2, 11.1
 */

import { describe, test, expect } from "bun:test";
import * as fc from "fast-check";
import {
  createSuccessResponse,
  createErrorResponse,
  createNotification,
  isJsonRpcResponse,
  isJsonRpcNotification,
  JSON_RPC_ERRORS,
} from "../types/jsonrpc";

describe("JSON-RPC Message Format", () => {
  /**
   * Property 1: JSON-RPC Message Format Validity
   * For any message sent by the MCP_Server to the client, the message SHALL be
   * a valid JSON-RPC 2.0 formatted object containing `jsonrpc: "2.0"` and either
   * `result`/`error` (for responses) or `method` (for notifications).
   */
  describe("Property 1: Message Format Validity", () => {
    test("Success responses have valid JSON-RPC 2.0 format", () => {
      const idArb = fc.oneof(
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.integer({ min: 0, max: 1000000 }),
        fc.constant(null)
      );
      const resultArb = fc.jsonValue();

      fc.assert(
        fc.property(idArb, resultArb, (id, result) => {
          const response = createSuccessResponse(id, result);

          // Must have jsonrpc: "2.0"
          expect(response.jsonrpc).toBe("2.0");
          
          // Must have id field
          expect("id" in response).toBe(true);
          expect(response.id).toBe(id);
          
          // Must have result field
          expect("result" in response).toBe(true);
          
          // Must not have error field
          expect("error" in response).toBe(false);
          
          // Must be recognized as a response
          expect(isJsonRpcResponse(response)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    test("Error responses have valid JSON-RPC 2.0 format", () => {
      const idArb = fc.oneof(
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.integer({ min: 0, max: 1000000 }),
        fc.constant(null)
      );
      const codeArb = fc.constantFrom(
        JSON_RPC_ERRORS.PARSE_ERROR,
        JSON_RPC_ERRORS.INVALID_REQUEST,
        JSON_RPC_ERRORS.METHOD_NOT_FOUND,
        JSON_RPC_ERRORS.INVALID_PARAMS,
        JSON_RPC_ERRORS.INTERNAL_ERROR
      );
      const messageArb = fc.string({ minLength: 1, maxLength: 100 });

      fc.assert(
        fc.property(idArb, codeArb, messageArb, (id, code, message) => {
          const response = createErrorResponse(id, code, message);

          // Must have jsonrpc: "2.0"
          expect(response.jsonrpc).toBe("2.0");
          
          // Must have id field
          expect("id" in response).toBe(true);
          expect(response.id).toBe(id);
          
          // Must have error field with code and message
          expect("error" in response).toBe(true);
          expect(response.error.code).toBe(code);
          expect(response.error.message).toBe(message);
          
          // Must not have result field
          expect("result" in response).toBe(false);
          
          // Must be recognized as a response
          expect(isJsonRpcResponse(response)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    test("Notifications have valid JSON-RPC 2.0 format", () => {
      const methodArb = fc.string({ minLength: 1, maxLength: 50 });
      const paramsArb = fc.option(
        fc.dictionary(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.jsonValue()
        ),
        { nil: undefined }
      );

      fc.assert(
        fc.property(methodArb, paramsArb, (method, params) => {
          const notification = createNotification(method, params);

          // Must have jsonrpc: "2.0"
          expect(notification.jsonrpc).toBe("2.0");
          
          // Must have method field
          expect("method" in notification).toBe(true);
          expect(notification.method).toBe(method);
          
          // Must NOT have id field
          expect("id" in notification).toBe(false);
          
          // Must NOT have result or error fields
          expect("result" in notification).toBe(false);
          expect("error" in notification).toBe(false);
          
          // Must be recognized as a notification
          expect(isJsonRpcNotification(notification)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    test("All server messages are valid JSON strings", () => {
      const idArb = fc.oneof(
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.integer({ min: 0, max: 1000000 }),
        fc.constant(null)
      );
      const resultArb = fc.jsonValue();

      fc.assert(
        fc.property(idArb, resultArb, (id, result) => {
          const response = createSuccessResponse(id, result);
          const jsonString = JSON.stringify(response);
          
          // Must be valid JSON
          expect(() => JSON.parse(jsonString)).not.toThrow();
          
          // Parsed JSON must equal original
          const parsed = JSON.parse(jsonString);
          expect(parsed.jsonrpc).toBe("2.0");
        }),
        { numRuns: 100 }
      );
    });
  });
});
