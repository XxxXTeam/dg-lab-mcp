/**
 * @fileoverview 波形工具
 * @description MCP 波形管理工具
 * - dg_parse_waveform: 解析波形数据并保存
 * - dg_list_waveforms: 列出所有保存的波形
 * - dg_get_waveform: 按名称获取波形
 * - dg_delete_waveform: 按名称删除波形
 */

import type { Tool, ToolResult, ToolHandler } from "../tool-manager";
import { WaveformStorage, persistWaveforms } from "../waveform-storage";
import { parseWaveform } from "../waveform-parser";

/**
 * 带处理函数的工具类型（内部使用）
 */
export interface ToolWithHandler extends Tool {
  handler: ToolHandler;
}

/** 共享的波形存储实例 */
let waveformStorage: WaveformStorage | null = null;
/** 存储路径 */
let storagePath = "./data/waveforms.json";

/**
 * 初始化波形存储
 * @param storage - 波形存储实例（可选）
 * @param path - 存储路径（可选）
 */
export function initWaveformStorage(storage?: WaveformStorage, path?: string): void {
  waveformStorage = storage || new WaveformStorage();
  if (path) storagePath = path;
}

/**
 * 获取波形存储实例
 * @returns 波形存储实例
 */
export function getWaveformStorage(): WaveformStorage {
  if (!waveformStorage) {
    waveformStorage = new WaveformStorage();
  }
  return waveformStorage;
}

/**
 * 创建错误结果
 * @param message - 错误消息
 * @returns 工具结果
 */
function createToolError(message: string): ToolResult {
  return {
    content: [{ type: "text", text: `Error: ${message}` }],
    isError: true,
  };
}

/**
 * 创建成功结果
 * @param data - 数据
 * @returns 工具结果
 */
function createToolSuccess(data: unknown): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

/**
 * dg_parse_waveform 工具
 * 解析波形数据并保存
 */
export const dgParseWaveformTool: ToolWithHandler = {
  name: "dg_parse_waveform",
  description: `解析并保存波形数据。
输入格式：Dungeonlab+pulse:开头的Base64编码字符串（从DG-LAB APP导出）。
解析后保存为hexWaveforms数组，可通过dg_get_waveform获取并用dg_send_waveform发送。
如果name已存在会覆盖原有波形。`,
  inputSchema: {
    type: "object",
    properties: {
      hexData: {
        type: "string",
        description: "波形数据（Dungeonlab+pulse:格式文本）",
      },
      name: {
        type: "string",
        description: "波形名称，用于保存和后续引用",
      },
    },
    required: ["hexData", "name"],
  },
  handler: async (params: Record<string, unknown>): Promise<ToolResult> => {
    const hexData = params.hexData as string | undefined;
    const name = params.name as string | undefined;

    if (!hexData || typeof hexData !== "string") {
      return createToolError("hexData 是必需的且必须是字符串");
    }

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return createToolError("name 是必需的且必须是非空字符串");
    }

    try {
      const waveform = parseWaveform(hexData, name.trim());

      // 保存到存储
      const storage = getWaveformStorage();
      const existed = storage.has(name.trim());
      storage.save(waveform);

      // 持久化到磁盘
      persistWaveforms(storage, storagePath);

      return createToolSuccess({
        success: true,
        name: waveform.name,
        overwritten: existed,
        hexWaveformCount: waveform.hexWaveforms.length,
      });
    } catch (error) {
      if (error instanceof Error) {
        return createToolError(error.message);
      }
      return createToolError("解析波形数据失败");
    }
  },
};

/**
 * dg_list_waveforms 工具
 * 列出所有保存的波形
 */
export const dgListWaveformsTool: ToolWithHandler = {
  name: "dg_list_waveforms",
  description: `列出所有已保存的波形名称和数据量。
返回每个波形的name和hexWaveformCount（波形数据条数）。
用于查看可用波形，然后通过dg_get_waveform获取具体数据。`,
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
  },
  handler: async (): Promise<ToolResult> => {
    const storage = getWaveformStorage();
    const waveforms = storage.list();

    const list = waveforms.map((w) => ({
      name: w.name,
      hexWaveformCount: w.hexWaveforms.length,
    }));

    return createToolSuccess({
      count: list.length,
      waveforms: list,
    });
  },
};

/**
 * dg_get_waveform 工具
 * 按名称获取波形
 */
export const dgGetWaveformTool: ToolWithHandler = {
  name: "dg_get_waveform",
  description: `按名称获取波形的hexWaveforms数组。
返回的hexWaveforms可直接传给dg_send_waveform的waveforms参数使用。
典型流程：dg_list_waveforms查看可用波形 → dg_get_waveform获取数据 → dg_send_waveform发送到设备。`,
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "波形名称",
      },
    },
    required: ["name"],
  },
  handler: async (params: Record<string, unknown>): Promise<ToolResult> => {
    const name = params.name as string | undefined;

    if (!name || typeof name !== "string") {
      return createToolError("name 是必需的且必须是字符串");
    }

    const storage = getWaveformStorage();
    const waveform = storage.get(name);

    if (!waveform) {
      return createToolError(`波形未找到: ${name}`);
    }

    return createToolSuccess({
      name: waveform.name,
      hexWaveforms: waveform.hexWaveforms,
    });
  },
};

/**
 * dg_delete_waveform 工具
 * 按名称删除波形
 */
export const dgDeleteWaveformTool: ToolWithHandler = {
  name: "dg_delete_waveform",
  description: `按名称删除已保存的波形。
删除后无法恢复，需要重新用dg_parse_waveform解析保存。`,
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "要删除的波形名称",
      },
    },
    required: ["name"],
  },
  handler: async (params: Record<string, unknown>): Promise<ToolResult> => {
    const name = params.name as string | undefined;

    if (!name || typeof name !== "string") {
      return createToolError("name 是必需的且必须是字符串");
    }

    const storage = getWaveformStorage();

    if (!storage.has(name)) {
      return createToolError(`波形未找到: ${name}`);
    }

    storage.delete(name);

    // 持久化到磁盘
    persistWaveforms(storage, storagePath);

    return createToolSuccess({
      success: true,
      deleted: name,
    });
  },
};

/**
 * 获取所有波形工具
 * @returns 波形工具数组
 */
export function getWaveformTools(): ToolWithHandler[] {
  return [
    dgParseWaveformTool,
    dgListWaveformsTool,
    dgGetWaveformTool,
    dgDeleteWaveformTool,
  ];
}
