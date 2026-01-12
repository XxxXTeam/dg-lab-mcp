/**
 * JSON-RPC Serialization Tests
 * Feature: dg-lab-sse-tool, Property 2: JSON-RPC Serialization Round-Trip
 * Validates: Requirements 11.3
 */

import { describe, test, expect } from "bun:test";
import * as fc from "fast-check";
import {
  serialize,
  deserialize,
  JsonRpcRequest,
  JsonRpcSuccessResponse,
  JsonRpcErrorResponse,
  JsonRpcNotification,
  isJsonRpcRequest,
  isJsonRpcNotification,
  isJsonRpcSuccessResponse,
  isJsonRpcErrorResponse,
} from "../types/jsonrpc";

// Arbitrary generators for JSON-RPC messages
const jsonRpcIdArb = fc.oneof(
  fc.string({ minLength: 1, maxLength: 50 }),
  fc.integer({ min: 0, max: 1000000 })
);

const jsonRpcParamsArb = fc.option(
  fc.dictionary(
    fc.string({ minLength: 1, maxLength: 20 }),
    fc.jsonValue()
  ),
  { nil: undefined }
);

const jsonRpcRequestArb: fc.Arbitrary<JsonRpcRequest> = fc.record({
  jsonrpc: fc.constant("2.0" as const),
  id: jsonRpcIdArb,
  method: fc.string({ minLength: 1, maxLength: 50 }),
  params: jsonRpcParamsArb,
}).map((r) => {
  if (r.params === undefined) {
    const { params: _, ...rest } = r;
    return rest as JsonRpcRequest;
  }
  return r as JsonRpcRequest;
});

const jsonRpcNotificationArb: fc.Arbitrary<JsonRpcNotification> = fc.record({
  jsonrpc: fc.constant("2.0" as const),
  method: fc.string({ minLength: 1, maxLength: 50 }),
  params: jsonRpcParamsArb,
}).map((n) => {
  if (n.params === undefined) {
    const { params: _, ...rest } = n;
    return rest as JsonRpcNotification;
  }
  return n as JsonRpcNotification;
});

const jsonRpcSuccessResponseArb: fc.Arbitrary<JsonRpcSuccessResponse> = fc.record({
  jsonrpc: fc.constant("2.0" as const),
  id: fc.oneof(jsonRpcIdArb, fc.constant(null)),
  result: fc.jsonValue(),
});

const jsonRpcErrorResponseArb: fc.Arbitrary<JsonRpcErrorResponse> = fc.record({
  jsonrpc: fc.constant("2.0" as const),
  id: fc.oneof(jsonRpcIdArb, fc.constant(null)),
  error: fc.record({
    code: fc.integer({ min: -32768, max: 32767 }),
    message: fc.string({ minLength: 1, maxLength: 100 }),
    data: fc.option(fc.jsonValue(), { nil: undefined }),
  }).map((e) => {
    if (e.data === undefined) {
      const { data: _, ...rest } = e;
      return rest;
    }
    return e;
  }),
});

describe("JSON-RPC Serialization", () => {
  /**
   * Property 2: JSON-RPC Serialization Round-Trip
   * For any valid JSON-RPC message object, serializing to string and then
   * deserializing back SHALL produce an object equivalent to the original.
   */
  describe("Property 2: Round-Trip", () => {
    test("Request round-trip preserves data", () => {
      fc.assert(
        fc.property(jsonRpcRequestArb, (request) => {
          const serialized = serialize(request);
          const result = deserialize(serialized);
          
          expect(result.success).toBe(true);
          // JSON.stringify normalizes -0 to 0, so we compare via JSON
          expect(JSON.stringify(result.message)).toEqual(JSON.stringify(request));
        }),
        { numRuns: 100 }
      );
    });

    test("Notification round-trip preserves data", () => {
      fc.assert(
        fc.property(jsonRpcNotificationArb, (notification) => {
          const serialized = serialize(notification);
          const result = deserialize(serialized);
          
          expect(result.success).toBe(true);
          // JSON.stringify normalizes -0 to 0, so we compare via JSON
          expect(JSON.stringify(result.message)).toEqual(JSON.stringify(notification));
        }),
        { numRuns: 100 }
      );
    });

    test("Success response round-trip preserves data", () => {
      fc.assert(
        fc.property(jsonRpcSuccessResponseArb, (response) => {
          const serialized = serialize(response);
          const result = deserialize(serialized);
          
          expect(result.success).toBe(true);
          // JSON.stringify normalizes -0 to 0, so we compare via JSON
          expect(JSON.stringify(result.message)).toEqual(JSON.stringify(response));
        }),
        { numRuns: 100 }
      );
    });

    test("Error response round-trip preserves data", () => {
      fc.assert(
        fc.property(jsonRpcErrorResponseArb, (response) => {
          const serialized = serialize(response);
          const result = deserialize(serialized);
          
          expect(result.success).toBe(true);
          // JSON.stringify normalizes -0 to 0, so we compare via JSON
          expect(JSON.stringify(result.message)).toEqual(JSON.stringify(response));
        }),
        { numRuns: 100 }
      );
    });
  });

  describe("Type Guards", () => {
    test("isJsonRpcRequest correctly identifies requests", () => {
      fc.assert(
        fc.property(jsonRpcRequestArb, (request) => {
          expect(isJsonRpcRequest(request)).toBe(true);
          expect(isJsonRpcNotification(request)).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    test("isJsonRpcNotification correctly identifies notifications", () => {
      fc.assert(
        fc.property(jsonRpcNotificationArb, (notification) => {
          expect(isJsonRpcNotification(notification)).toBe(true);
          expect(isJsonRpcRequest(notification)).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    test("isJsonRpcSuccessResponse correctly identifies success responses", () => {
      fc.assert(
        fc.property(jsonRpcSuccessResponseArb, (response) => {
          expect(isJsonRpcSuccessResponse(response)).toBe(true);
          expect(isJsonRpcErrorResponse(response)).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    test("isJsonRpcErrorResponse correctly identifies error responses", () => {
      fc.assert(
        fc.property(jsonRpcErrorResponseArb, (response) => {
          expect(isJsonRpcErrorResponse(response)).toBe(true);
          expect(isJsonRpcSuccessResponse(response)).toBe(false);
        }),
        { numRuns: 100 }
      );
    });
  });
});
