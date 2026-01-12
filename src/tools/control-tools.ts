/**
 * Device Control Tools
 * Implements dg_set_strength, dg_send_waveform, dg_clear_waveform, dg_get_status
 * Requirements: 6.1-6.7, 7.1-7.6, 8.1-8.5, 9.1-9.4
 */

import type { ToolManager } from "../tool-manager";
import { createToolResult, createToolError } from "../tool-manager";
import type { SessionManager } from "../session-manager";
import type { DGLabWSServer } from "../ws-server";

// Strength mode type
type StrengthMode = "increase" | "decrease" | "set";

// Validation helpers
function validateDeviceId(
  sessionManager: SessionManager,
  deviceId: string | undefined
): { error: string } | { session: ReturnType<SessionManager["getSession"]> } {
  if (!deviceId) {
    return { error: "缺少必需参数: deviceId" };
  }

  const session = sessionManager.getSession(deviceId);
  if (!session) {
    return { error: `设备不存在: ${deviceId}` };
  }

  return { session };
}

function validateChannel(channel: string | undefined): { error: string } | { channel: "A" | "B" } {
  if (!channel) {
    return { error: "缺少必需参数: channel" };
  }
  if (channel !== "A" && channel !== "B") {
    return { error: `无效的通道: ${channel}，必须是 "A" 或 "B"` };
  }
  return { channel };
}

function validateStrengthValue(value: unknown): { error: string } | { value: number } {
  if (value === undefined || value === null) {
    return { error: "缺少必需参数: value" };
  }
  const num = Number(value);
  if (isNaN(num) || num < 0 || num > 200) {
    return { error: `无效的强度值: ${value}，必须在 0-200 范围内` };
  }
  return { value: num };
}

function validateStrengthMode(mode: string | undefined): { error: string } | { mode: StrengthMode } {
  if (!mode) {
    return { error: "缺少必需参数: mode" };
  }
  if (mode !== "increase" && mode !== "decrease" && mode !== "set") {
    return { error: `无效的模式: ${mode}，必须是 "increase"、"decrease" 或 "set"` };
  }
  return { mode };
}

function validateWaveforms(waveforms: unknown): { error: string } | { waveforms: string[] } {
  if (!waveforms) {
    return { error: "缺少必需参数: waveforms" };
  }
  if (!Array.isArray(waveforms)) {
    return { error: "waveforms 必须是数组" };
  }
  if (waveforms.length === 0) {
    return { error: "waveforms 数组不能为空" };
  }
  if (waveforms.length > 100) {
    return { error: `waveforms 数组长度超过限制: ${waveforms.length}，最大 100` };
  }

  // Validate each waveform is a valid 16-character hex string
  const hexPattern = /^[0-9a-fA-F]{16}$/;
  for (let i = 0; i < waveforms.length; i++) {
    const wf = waveforms[i];
    if (typeof wf !== "string" || !hexPattern.test(wf)) {
      return { error: `无效的波形数据 [${i}]: "${wf}"，必须是16字符的HEX字符串` };
    }
  }

  return { waveforms: waveforms as string[] };
}

/**
 * Register device control tools
 */
export function registerControlTools(
  toolManager: ToolManager,
  sessionManager: SessionManager,
  wsServer: DGLabWSServer
): void {
  // dg_set_strength - Set channel strength
  toolManager.registerTool(
    "dg_set_strength",
    "设置设备通道强度",
    {
      type: "object",
      properties: {
        deviceId: { type: "string", description: "设备ID" },
        channel: { type: "string", enum: ["A", "B"], description: "通道" },
        mode: { type: "string", enum: ["increase", "decrease", "set"], description: "模式" },
        value: { type: "number", minimum: 0, maximum: 200, description: "强度值" },
      },
      required: ["deviceId", "channel", "mode", "value"],
    },
    async (params) => {
      // Validate deviceId
      const deviceResult = validateDeviceId(sessionManager, params.deviceId as string);
      if ("error" in deviceResult) return createToolError(deviceResult.error);
      const session = deviceResult.session!;

      // Validate channel
      const channelResult = validateChannel(params.channel as string);
      if ("error" in channelResult) return createToolError(channelResult.error);
      const channel = channelResult.channel;

      // Validate mode
      const modeResult = validateStrengthMode(params.mode as string);
      if ("error" in modeResult) return createToolError(modeResult.error);
      const mode = modeResult.mode;

      // Validate value
      const valueResult = validateStrengthValue(params.value);
      if ("error" in valueResult) return createToolError(valueResult.error);
      const value = valueResult.value;

      // Check connection - need clientId to send commands
      if (!session.clientId) {
        return createToolError("设备未连接");
      }

      // Check if bound to APP
      const isBound = wsServer.isControllerBound(session.clientId);
      if (!isBound) {
        return createToolError("设备未绑定APP");
      }

      // Send command via WS server
      const success = wsServer.sendStrength(session.clientId, channel, mode, value);
      if (!success) {
        return createToolError("发送强度命令失败");
      }

      // Touch session
      sessionManager.touchSession(session.deviceId);

      // Get updated session for response
      const updated = sessionManager.getSession(session.deviceId);
      const newStrength = channel === "A" ? updated?.strengthA : updated?.strengthB;

      return createToolResult(
        JSON.stringify({
          success: true,
          deviceId: session.deviceId,
          channel,
          mode,
          value,
          currentStrength: newStrength,
        })
      );
    }
  );

  // dg_send_waveform - Send waveform data
  toolManager.registerTool(
    "dg_send_waveform",
    "发送波形数据到设备",
    {
      type: "object",
      properties: {
        deviceId: { type: "string", description: "设备ID" },
        channel: { type: "string", enum: ["A", "B"], description: "通道" },
        waveforms: {
          type: "array",
          items: { type: "string" },
          maxItems: 100,
          description: "波形数据数组，每项为8字节HEX字符串（16个十六进制字符）",
        },
      },
      required: ["deviceId", "channel", "waveforms"],
    },
    async (params) => {
      // Validate deviceId
      const deviceResult = validateDeviceId(sessionManager, params.deviceId as string);
      if ("error" in deviceResult) return createToolError(deviceResult.error);
      const session = deviceResult.session!;

      // Validate channel
      const channelResult = validateChannel(params.channel as string);
      if ("error" in channelResult) return createToolError(channelResult.error);
      const channel = channelResult.channel;

      // Validate waveforms
      const waveformsResult = validateWaveforms(params.waveforms);
      if ("error" in waveformsResult) return createToolError(waveformsResult.error);
      const waveforms = waveformsResult.waveforms;

      // Check connection
      if (!session.clientId) {
        return createToolError("设备未连接");
      }

      // Check if bound to APP
      const isBound = wsServer.isControllerBound(session.clientId);
      if (!isBound) {
        return createToolError("设备未绑定APP");
      }

      // Send waveforms via WS server
      const success = wsServer.sendWaveform(session.clientId, channel, waveforms);
      if (!success) {
        return createToolError("发送波形数据失败");
      }

      // Touch session
      sessionManager.touchSession(session.deviceId);

      return createToolResult(
        JSON.stringify({
          success: true,
          deviceId: session.deviceId,
          channel,
          waveformCount: waveforms.length,
          durationMs: waveforms.length * 100,
        })
      );
    }
  );

  // dg_clear_waveform - Clear waveform queue
  toolManager.registerTool(
    "dg_clear_waveform",
    "清空设备波形队列",
    {
      type: "object",
      properties: {
        deviceId: { type: "string", description: "设备ID" },
        channel: { type: "string", enum: ["A", "B"], description: "通道" },
      },
      required: ["deviceId", "channel"],
    },
    async (params) => {
      // Validate deviceId
      const deviceResult = validateDeviceId(sessionManager, params.deviceId as string);
      if ("error" in deviceResult) return createToolError(deviceResult.error);
      const session = deviceResult.session!;

      // Validate channel
      const channelResult = validateChannel(params.channel as string);
      if ("error" in channelResult) return createToolError(channelResult.error);
      const channel = channelResult.channel;

      // Check connection
      if (!session.clientId) {
        return createToolError("设备未连接");
      }

      // Check if bound to APP
      const isBound = wsServer.isControllerBound(session.clientId);
      if (!isBound) {
        return createToolError("设备未绑定APP");
      }

      // Clear waveform via WS server
      const success = wsServer.clearWaveform(session.clientId, channel);
      if (!success) {
        return createToolError("清空波形队列失败");
      }

      // Touch session
      sessionManager.touchSession(session.deviceId);

      return createToolResult(
        JSON.stringify({
          success: true,
          deviceId: session.deviceId,
          channel,
          message: `已清空通道 ${channel} 的波形队列`,
        })
      );
    }
  );

  // dg_get_status - Get device status
  toolManager.registerTool(
    "dg_get_status",
    "获取设备状态",
    {
      type: "object",
      properties: {
        deviceId: { type: "string", description: "设备ID" },
      },
      required: ["deviceId"],
    },
    async (params) => {
      // Validate deviceId
      const deviceResult = validateDeviceId(sessionManager, params.deviceId as string);
      if ("error" in deviceResult) return createToolError(deviceResult.error);
      const session = deviceResult.session!;

      // Check if bound to APP via WS server
      const isBound = session.clientId ? wsServer.isControllerBound(session.clientId) : false;

      return createToolResult(
        JSON.stringify({
          deviceId: session.deviceId,
          clientId: session.clientId,
          alias: session.alias,
          connected: session.connected,
          boundToApp: isBound,
          strengthA: session.strengthA,
          strengthB: session.strengthB,
          strengthLimitA: session.strengthLimitA,
          strengthLimitB: session.strengthLimitB,
          lastActive: session.lastActive.toISOString(),
        })
      );
    }
  );
}

// Export validation functions for testing
export {
  validateDeviceId,
  validateChannel,
  validateStrengthValue,
  validateStrengthMode,
  validateWaveforms,
};
