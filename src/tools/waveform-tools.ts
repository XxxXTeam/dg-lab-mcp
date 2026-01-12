/**
 * Waveform Tools
 * Feature: dg-lab-sse-tool
 * 
 * MCP tools for waveform management:
 * - dg_parse_waveform: Parse waveform data and save
 * - dg_list_waveforms: List all saved waveforms
 * - dg_get_waveform: Get waveform by name
 * - dg_delete_waveform: Delete waveform by name
 */

import type { Tool, ToolResult, ToolHandler, JsonSchema } from "../tool-manager";
import { WaveformStorage, persistWaveforms } from "../waveform-storage";
import { parseWaveform } from "../waveform-parser";

// Extended tool type with handler for internal use
export interface ToolWithHandler extends Tool {
  handler: ToolHandler;
}

// Shared waveform storage instance
let waveformStorage: WaveformStorage | null = null;
let storagePath = "./data/waveforms.json";

/**
 * Initialize waveform storage
 */
export function initWaveformStorage(storage?: WaveformStorage, path?: string): void {
  waveformStorage = storage || new WaveformStorage();
  if (path) storagePath = path;
}

/**
 * Get waveform storage instance
 */
export function getWaveformStorage(): WaveformStorage {
  if (!waveformStorage) {
    waveformStorage = new WaveformStorage();
  }
  return waveformStorage;
}

/**
 * Create tool error result
 */
function createToolError(message: string): ToolResult {
  return {
    content: [{ type: "text", text: `Error: ${message}` }],
    isError: true,
  };
}

/**
 * Create tool success result
 */
function createToolSuccess(data: unknown): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

/**
 * dg_parse_waveform tool
 * Parse waveform data and save
 */
export const dgParseWaveformTool: ToolWithHandler = {
  name: "dg_parse_waveform",
  description: "解析波形数据（Dungeonlab+pulse:格式）并以指定名称保存波形",
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
      return createToolError("hexData is required and must be a string");
    }

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return createToolError("name is required and must be a non-empty string");
    }

    try {
      const waveform = parseWaveform(hexData, name.trim());

      // Save to storage
      const storage = getWaveformStorage();
      const existed = storage.has(name.trim());
      storage.save(waveform);

      // Persist to disk
      persistWaveforms(storage, storagePath);

      return createToolSuccess({
        success: true,
        name: waveform.name,
        format: "new-text",
        overwritten: existed,
        metadata: {
          startFrequencies: waveform.metadata.startFrequencies,
          endFrequencies: waveform.metadata.endFrequencies,
          durations: waveform.metadata.durations,
          frequencyModes: waveform.metadata.frequencyModes,
          section2Enabled: waveform.metadata.section2Enabled,
          section3Enabled: waveform.metadata.section3Enabled,
          playbackSpeed: waveform.metadata.playbackSpeed,
        },
        sectionCount: waveform.sections.length,
        hexWaveformCount: waveform.hexWaveforms.length,
        createdAt: waveform.createdAt.toISOString(),
      });
    } catch (error) {
      if (error instanceof Error) {
        return createToolError(error.message);
      }
      return createToolError("Failed to parse waveform data");
    }
  },
};

/**
 * dg_list_waveforms tool
 * List all saved waveforms
 */
export const dgListWaveformsTool: ToolWithHandler = {
  name: "dg_list_waveforms",
  description: "列出所有保存的波形",
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
      sectionCount: w.sections.length,
      totalDuration: w.metadata.durations.reduce((a, b) => a + b, 0),
      hexWaveformCount: w.hexWaveforms.length,
      createdAt: w.createdAt.toISOString(),
    }));

    return createToolSuccess({
      count: list.length,
      waveforms: list,
    });
  },
};

/**
 * dg_get_waveform tool
 * Get waveform by name
 */
export const dgGetWaveformTool: ToolWithHandler = {
  name: "dg_get_waveform",
  description: "按名称获取波形详细信息和hexWaveforms数据",
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
      return createToolError("name is required and must be a string");
    }

    const storage = getWaveformStorage();
    const waveform = storage.get(name);

    if (!waveform) {
      return createToolError(`Waveform not found: ${name}`);
    }

    return createToolSuccess({
      name: waveform.name,
      metadata: waveform.metadata,
      sections: waveform.sections,
      hexWaveforms: waveform.hexWaveforms,
      rawData: waveform.rawData,
      createdAt: waveform.createdAt.toISOString(),
    });
  },
};

/**
 * dg_delete_waveform tool
 * Delete waveform by name
 */
export const dgDeleteWaveformTool: ToolWithHandler = {
  name: "dg_delete_waveform",
  description: "按名称删除波形",
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
      return createToolError("name is required and must be a string");
    }

    const storage = getWaveformStorage();

    if (!storage.has(name)) {
      return createToolError(`Waveform not found: ${name}`);
    }

    storage.delete(name);

    // Persist to disk
    persistWaveforms(storage, storagePath);

    return createToolSuccess({
      success: true,
      deleted: name,
    });
  },
};

/**
 * Get all waveform tools
 */
export function getWaveformTools(): ToolWithHandler[] {
  return [
    dgParseWaveformTool,
    dgListWaveformsTool,
    dgGetWaveformTool,
    dgDeleteWaveformTool,
  ];
}
