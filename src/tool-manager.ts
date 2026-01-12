/**
 * Tool Manager
 * Manages MCP tool definitions and execution
 * Implements Requirements 3.1, 3.2
 */

import type { JsonRpcHandler } from "./jsonrpc-handler";

// JSON Schema type for tool input
export interface JsonSchema {
  type: string;
  properties?: Record<string, JsonSchema & { description?: string; enum?: string[]; minimum?: number; maximum?: number; pattern?: string; maxItems?: number; items?: JsonSchema }>;
  required?: string[];
  description?: string;
}

// Tool content types
export interface ToolContent {
  type: "text";
  text: string;
}

// Tool result
export interface ToolResult {
  content: ToolContent[];
  isError?: boolean;
}

// Tool definition
export interface Tool {
  name: string;
  description: string;
  inputSchema: JsonSchema;
}

// Tool handler function type
export type ToolHandler = (params: Record<string, unknown>) => Promise<ToolResult>;

// Internal tool with handler
interface RegisteredTool extends Tool {
  handler: ToolHandler;
}

/**
 * Create a successful tool result
 */
export function createToolResult(text: string): ToolResult {
  return {
    content: [{ type: "text", text }],
  };
}

/**
 * Create an error tool result
 */
export function createToolError(message: string): ToolResult {
  return {
    content: [{ type: "text", text: `Error: ${message}` }],
    isError: true,
  };
}

export class ToolManager {
  private tools: Map<string, RegisteredTool> = new Map();
  private onToolsChanged?: () => void;

  constructor(onToolsChanged?: () => void) {
    this.onToolsChanged = onToolsChanged;
  }

  /**
   * Register a new tool
   */
  registerTool(
    name: string,
    description: string,
    inputSchema: JsonSchema,
    handler: ToolHandler
  ): void {
    this.tools.set(name, {
      name,
      description,
      inputSchema,
      handler,
    });
    this.onToolsChanged?.();
  }

  /**
   * Unregister a tool
   */
  unregisterTool(name: string): boolean {
    const result = this.tools.delete(name);
    if (result) {
      this.onToolsChanged?.();
    }
    return result;
  }

  /**
   * List all registered tools (without handlers)
   */
  listTools(): Tool[] {
    return Array.from(this.tools.values()).map(({ name, description, inputSchema }) => ({
      name,
      description,
      inputSchema,
    }));
  }

  /**
   * Call a tool by name
   */
  async callTool(name: string, params: Record<string, unknown>): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return createToolError(`Tool not found: ${name}`);
    }

    try {
      return await tool.handler(params);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return createToolError(message);
    }
  }

  /**
   * Check if a tool exists
   */
  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get tool count
   */
  get toolCount(): number {
    return this.tools.size;
  }
}

/**
 * Register tool-related MCP handlers
 */
export function registerToolHandlers(
  jsonRpcHandler: JsonRpcHandler,
  toolManager: ToolManager
): void {
  // Handle tools/list request
  jsonRpcHandler.registerRequestHandler("tools/list", async () => {
    const tools = toolManager.listTools();
    return { tools };
  });

  // Handle tools/call request
  jsonRpcHandler.registerRequestHandler("tools/call", async (params) => {
    const name = params?.name as string;
    const args = (params?.arguments as Record<string, unknown>) ?? {};

    if (!name) {
      return createToolError("Missing tool name");
    }

    return toolManager.callTool(name, args);
  });
}
