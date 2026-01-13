/**
 * @fileoverview 工具管理器
 * 
 * 管理 MCP 协议中的工具定义和执行。工具是 AI 与系统交互的主要方式，
 * 每个工具都有名称、描述、参数 Schema 和处理函数。
 * 
 * 主要功能：
 * - 注册和注销工具
 * - 列出所有可用工具（供 AI 发现）
 * - 按名称调用工具并返回结果
 * - 与 JSON-RPC 处理器集成
 */

import type { JsonRpcHandler } from "./jsonrpc-handler";

/**
 * JSON Schema 类型定义
 * 
 * 用于描述工具参数的结构，遵循 JSON Schema 规范。
 */
export interface JsonSchema {
  /** 类型 */
  type: string;
  /** 属性定义 */
  properties?: Record<string, JsonSchema & { 
    description?: string; 
    enum?: string[]; 
    minimum?: number; 
    maximum?: number; 
    pattern?: string; 
    maxItems?: number; 
    items?: JsonSchema 
  }>;
  /** 必需属性 */
  required?: string[];
  /** 描述 */
  description?: string;
}

/**
 * 工具内容类型
 * 
 * MCP 协议要求工具返回结构化的内容数组。
 */
export interface ToolContent {
  /** 内容类型 */
  type: "text";
  /** 文本内容 */
  text: string;
}

/**
 * 工具执行结果
 * 
 * 包含返回内容和错误标志。isError 为 true 时表示执行失败。
 */
export interface ToolResult {
  /** 内容数组 */
  content: ToolContent[];
  /** 是否为错误 */
  isError?: boolean;
}

/**
 * 工具定义
 * 
 * 描述一个工具的元信息，用于 AI 发现和调用。
 */
export interface Tool {
  /** 工具名称 */
  name: string;
  /** 工具描述 */
  description: string;
  /** 输入参数 Schema */
  inputSchema: JsonSchema;
}

/**
 * 工具处理函数类型
 * 
 * 接收参数对象，返回执行结果的 Promise。
 */
export type ToolHandler = (params: Record<string, unknown>) => Promise<ToolResult>;

/**
 * 已注册的工具（内部使用）
 * 
 * 扩展 Tool 接口，包含实际的处理函数。
 */
interface RegisteredTool extends Tool {
  handler: ToolHandler;
}

/**
 * 创建成功的工具结果
 * 
 * @param text - 结果文本（通常是 JSON 字符串）
 * @returns 格式化的工具结果
 */
export function createToolResult(text: string): ToolResult {
  return {
    content: [{ type: "text", text }],
  };
}

/**
 * 创建错误的工具结果
 * 
 * @param message - 错误消息
 * @returns 带有 isError 标志的工具结果
 */
export function createToolError(message: string): ToolResult {
  return {
    content: [{ type: "text", text: `Error: ${message}` }],
    isError: true,
  };
}

/**
 * 工具管理器
 * 
 * 集中管理所有 MCP 工具的注册、查询和调用。
 * 支持工具列表变化通知，用于动态更新 AI 可用的工具集。
 */
export class ToolManager {
  private tools: Map<string, RegisteredTool> = new Map();
  private onToolsChanged?: () => void;

  /**
   * 创建工具管理器实例
   * 
   * @param onToolsChanged - 可选的回调函数，当工具列表变化时调用
   */
  constructor(onToolsChanged?: () => void) {
    this.onToolsChanged = onToolsChanged;
  }

  /**
   * 注册新工具
   * 
   * @param name - 工具名称，必须唯一
   * @param description - 工具描述，供 AI 理解工具用途
   * @param inputSchema - 参数 Schema，定义工具接受的参数
   * @param handler - 处理函数，实际执行工具逻辑
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
   * 注销工具
   * 
   * @param name - 要注销的工具名称
   * @returns 是否成功注销（false 表示工具不存在）
   */
  unregisterTool(name: string): boolean {
    const result = this.tools.delete(name);
    if (result) {
      this.onToolsChanged?.();
    }
    return result;
  }

  /**
   * 列出所有已注册的工具
   * 
   * 返回工具的元信息（不包含处理函数），供 AI 发现可用工具。
   * 
   * @returns 工具定义数组
   */
  listTools(): Tool[] {
    return Array.from(this.tools.values()).map(({ name, description, inputSchema }) => ({
      name,
      description,
      inputSchema,
    }));
  }

  /**
   * 按名称调用工具
   * 
   * 查找并执行指定的工具，自动处理异常并返回错误结果。
   * 
   * @param name - 工具名称
   * @param params - 调用参数
   * @returns 工具执行结果
   */
  async callTool(name: string, params: Record<string, unknown>): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return createToolError(`工具未找到: ${name}`);
    }

    try {
      return await tool.handler(params);
    } catch (err) {
      const message = err instanceof Error ? err.message : "未知错误";
      return createToolError(message);
    }
  }

  /**
   * 检查工具是否已注册
   */
  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * 获取已注册的工具数量
   */
  get toolCount(): number {
    return this.tools.size;
  }
}

/**
 * 注册工具相关的 MCP 请求处理器
 * 
 * 将 tools/list 和 tools/call 请求路由到工具管理器。
 * 
 * @param jsonRpcHandler - JSON-RPC 处理器实例
 * @param toolManager - 工具管理器实例
 */
export function registerToolHandlers(
  jsonRpcHandler: JsonRpcHandler,
  toolManager: ToolManager
): void {
  // 处理 tools/list 请求
  jsonRpcHandler.registerRequestHandler("tools/list", async () => {
    const tools = toolManager.listTools();
    return { tools };
  });

  // 处理 tools/call 请求
  jsonRpcHandler.registerRequestHandler("tools/call", async (params) => {
    const name = params?.name as string;
    const args = (params?.arguments as Record<string, unknown>) ?? {};

    if (!name) {
      return createToolError("缺少工具名称");
    }

    return toolManager.callTool(name, args);
  });
}
