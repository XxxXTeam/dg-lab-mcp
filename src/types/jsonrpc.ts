/**
 * JSON-RPC 2.0 Type Definitions and Serialization
 * Implements Requirements 11.1, 11.2, 11.4
 */

// JSON-RPC 2.0 Error Codes
export const JSON_RPC_ERRORS = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;

export type JsonRpcErrorCode = (typeof JSON_RPC_ERRORS)[keyof typeof JSON_RPC_ERRORS];

// JSON-RPC 2.0 Error Object
export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

// JSON-RPC 2.0 Request
export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

// JSON-RPC 2.0 Notification (no id)
export interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
}

// JSON-RPC 2.0 Success Response
export interface JsonRpcSuccessResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result: unknown;
}

// JSON-RPC 2.0 Error Response
export interface JsonRpcErrorResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  error: JsonRpcError;
}

// Union types
export type JsonRpcResponse = JsonRpcSuccessResponse | JsonRpcErrorResponse;
export type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification | JsonRpcResponse;

// Type guards
export function isJsonRpcRequest(msg: unknown): msg is JsonRpcRequest {
  if (typeof msg !== "object" || msg === null) return false;
  const obj = msg as Record<string, unknown>;
  return (
    obj.jsonrpc === "2.0" &&
    "method" in obj &&
    typeof obj.method === "string" &&
    "id" in obj &&
    (typeof obj.id === "string" || typeof obj.id === "number")
  );
}

export function isJsonRpcNotification(msg: unknown): msg is JsonRpcNotification {
  if (typeof msg !== "object" || msg === null) return false;
  const obj = msg as Record<string, unknown>;
  return (
    obj.jsonrpc === "2.0" &&
    "method" in obj &&
    typeof obj.method === "string" &&
    !("id" in obj)
  );
}

export function isJsonRpcResponse(msg: unknown): msg is JsonRpcResponse {
  if (typeof msg !== "object" || msg === null) return false;
  const obj = msg as Record<string, unknown>;
  return obj.jsonrpc === "2.0" && "id" in obj && ("result" in obj || "error" in obj);
}

export function isJsonRpcErrorResponse(msg: unknown): msg is JsonRpcErrorResponse {
  if (!isJsonRpcResponse(msg)) return false;
  return "error" in msg;
}

export function isJsonRpcSuccessResponse(msg: unknown): msg is JsonRpcSuccessResponse {
  if (!isJsonRpcResponse(msg)) return false;
  return "result" in msg;
}

// Serialization functions
export function serialize(message: JsonRpcMessage): string {
  return JSON.stringify(message);
}

export interface DeserializeResult {
  success: boolean;
  message?: JsonRpcMessage;
  error?: JsonRpcError;
}

export function deserialize(data: string): DeserializeResult {
  try {
    const parsed = JSON.parse(data);
    
    if (typeof parsed !== "object" || parsed === null) {
      return {
        success: false,
        error: {
          code: JSON_RPC_ERRORS.INVALID_REQUEST,
          message: "Invalid Request: not an object",
        },
      };
    }

    if (parsed.jsonrpc !== "2.0") {
      return {
        success: false,
        error: {
          code: JSON_RPC_ERRORS.INVALID_REQUEST,
          message: "Invalid Request: missing or invalid jsonrpc version",
        },
      };
    }

    return { success: true, message: parsed as JsonRpcMessage };
  } catch {
    return {
      success: false,
      error: {
        code: JSON_RPC_ERRORS.PARSE_ERROR,
        message: "Parse error: invalid JSON",
      },
    };
  }
}

// Helper functions to create responses
export function createSuccessResponse(id: string | number | null, result: unknown): JsonRpcSuccessResponse {
  return { jsonrpc: "2.0", id, result };
}

export function createErrorResponse(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown
): JsonRpcErrorResponse {
  const error: JsonRpcError = { code, message };
  if (data !== undefined) error.data = data;
  return { jsonrpc: "2.0", id, error };
}

export function createNotification(method: string, params?: Record<string, unknown>): JsonRpcNotification {
  const notification: JsonRpcNotification = { jsonrpc: "2.0", method };
  if (params !== undefined) notification.params = params;
  return notification;
}
