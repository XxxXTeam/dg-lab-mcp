/**
 * JSON-RPC Handler
 * Processes JSON-RPC 2.0 requests and routes to appropriate handlers
 * Implements Requirements 1.4, 1.5, 12.1, 12.2, 12.3
 */

import type {
  JsonRpcRequest,
  JsonRpcNotification,
  JsonRpcResponse,
  JsonRpcError,
} from "./types/jsonrpc";
import {
  JSON_RPC_ERRORS,
  deserialize,
  createSuccessResponse,
  createErrorResponse,
  isJsonRpcRequest,
  isJsonRpcNotification,
} from "./types/jsonrpc";

export type RequestHandler = (
  params: Record<string, unknown> | undefined
) => Promise<unknown>;

export type NotificationHandler = (
  params: Record<string, unknown> | undefined
) => Promise<void>;

export interface JsonRpcHandlerOptions {
  onRequest?: (method: string, params?: Record<string, unknown>) => void;
  onNotification?: (method: string, params?: Record<string, unknown>) => void;
  onError?: (error: JsonRpcError) => void;
}

export class JsonRpcHandler {
  private requestHandlers: Map<string, RequestHandler> = new Map();
  private notificationHandlers: Map<string, NotificationHandler> = new Map();
  private options: JsonRpcHandlerOptions;

  constructor(options: JsonRpcHandlerOptions = {}) {
    this.options = options;
  }

  registerRequestHandler(method: string, handler: RequestHandler): void {
    this.requestHandlers.set(method, handler);
  }

  registerNotificationHandler(method: string, handler: NotificationHandler): void {
    this.notificationHandlers.set(method, handler);
  }

  async handleMessage(data: string): Promise<JsonRpcResponse | null> {
    const parseResult = deserialize(data);

    if (!parseResult.success) {
      const error = parseResult.error!;
      this.options.onError?.(error);
      return createErrorResponse(null, error.code, error.message, error.data);
    }

    const message = parseResult.message!;

    // Handle request (has id)
    if (isJsonRpcRequest(message)) {
      return this.handleRequest(message);
    }

    // Handle notification (no id)
    if (isJsonRpcNotification(message)) {
      await this.handleNotification(message);
      return null; // Notifications don't get responses
    }

    // Invalid message type
    const error: JsonRpcError = {
      code: JSON_RPC_ERRORS.INVALID_REQUEST,
      message: "Invalid Request: not a valid request or notification",
    };
    this.options.onError?.(error);
    return createErrorResponse(null, error.code, error.message);
  }

  private async handleRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    this.options.onRequest?.(request.method, request.params);

    const handler = this.requestHandlers.get(request.method);
    if (!handler) {
      const error: JsonRpcError = {
        code: JSON_RPC_ERRORS.METHOD_NOT_FOUND,
        message: `Method not found: ${request.method}`,
      };
      this.options.onError?.(error);
      return createErrorResponse(request.id, error.code, error.message);
    }

    try {
      const result = await handler(request.params);
      return createSuccessResponse(request.id, result);
    } catch (err) {
      const error: JsonRpcError = {
        code: JSON_RPC_ERRORS.INTERNAL_ERROR,
        message: err instanceof Error ? err.message : "Internal error",
      };
      this.options.onError?.(error);
      return createErrorResponse(request.id, error.code, error.message);
    }
  }

  private async handleNotification(notification: JsonRpcNotification): Promise<void> {
    this.options.onNotification?.(notification.method, notification.params);

    const handler = this.notificationHandlers.get(notification.method);
    if (handler) {
      try {
        await handler(notification.params);
      } catch (err) {
        // Notifications don't return errors, but we can log them
        const error: JsonRpcError = {
          code: JSON_RPC_ERRORS.INTERNAL_ERROR,
          message: err instanceof Error ? err.message : "Internal error",
        };
        this.options.onError?.(error);
      }
    }
    // If no handler, silently ignore (per JSON-RPC spec for notifications)
  }

  /**
   * Validate request parameters against expected schema
   * Returns error response if validation fails, null if valid
   */
  validateParams(
    id: string | number,
    params: Record<string, unknown> | undefined,
    required: string[]
  ): JsonRpcResponse | null {
    if (!params && required.length > 0) {
      return createErrorResponse(
        id,
        JSON_RPC_ERRORS.INVALID_PARAMS,
        `Missing required parameters: ${required.join(", ")}`
      );
    }

    const missing = required.filter((key) => params?.[key] === undefined);
    if (missing.length > 0) {
      return createErrorResponse(
        id,
        JSON_RPC_ERRORS.INVALID_PARAMS,
        `Missing required parameters: ${missing.join(", ")}`
      );
    }

    return null;
  }
}
