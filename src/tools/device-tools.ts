/**
 * Device Management Tools
 * Implements dg_connect, dg_list_devices, dg_set_alias, dg_find_device
 * Requirements: 4.1-4.5, 5.1-5.2
 */

import type { ToolManager } from "../tool-manager";
import { createToolResult, createToolError } from "../tool-manager";
import type { SessionManager } from "../session-manager";
import type { DGLabWSServer } from "../ws-server";
import { getConfig } from "../config";
import * as os from "os";

/**
 * Get local IP address for QR code generation
 */
function getLocalIP(): string {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      // Skip internal and non-IPv4 addresses
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return "localhost";
}

/**
 * Register device management tools
 */
export function registerDeviceTools(
  toolManager: ToolManager,
  sessionManager: SessionManager,
  wsServer: DGLabWSServer
): void {
  const config = getConfig();
  const localIP = getLocalIP();

  // dg_connect - Create new device connection
  toolManager.registerTool(
    "dg_connect",
    "建立与DG-LAB设备的连接，返回deviceId和二维码URL供APP扫描绑定",
    {
      type: "object",
      properties: {},
      required: [],
    },
    async () => {
      try {
        // Create new session in session manager
        const session = sessionManager.createSession();

        // Create controller in WebSocket server
        const clientId = wsServer.createController();

        // Update session with clientId
        sessionManager.updateConnectionState(session.deviceId, {
          clientId,
          connected: true,
        });

        // Generate QR code URL
        const qrCodeUrl = wsServer.getQRCodeUrl(clientId, localIP);
        const wsUrl = wsServer.getWSUrl(clientId, localIP);

        return createToolResult(
          JSON.stringify({
            deviceId: session.deviceId,
            clientId,
            qrCodeUrl,
            wsUrl,
            status: "waiting_for_app",
            message: "请使用DG-LAB APP扫描二维码进行绑定",
          })
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "Connection failed";
        return createToolError(`连接失败: ${message}`);
      }
    }
  );

  // dg_list_devices - List all devices
  toolManager.registerTool(
    "dg_list_devices",
    "列出所有已连接的设备及其状态",
    {
      type: "object",
      properties: {
        alias: {
          type: "string",
          description: "可选，按别名过滤设备",
        },
      },
      required: [],
    },
    async (params) => {
      let sessions = sessionManager.listSessions();

      // Filter by alias if provided
      const alias = params.alias as string | undefined;
      if (alias) {
        sessions = sessionManager.findByAlias(alias);
      }

      const devices = sessions.map((s) => {
        // Check if controller is bound in WS server
        const isBound = s.clientId ? wsServer.isControllerBound(s.clientId) : false;
        
        return {
          deviceId: s.deviceId,
          clientId: s.clientId,
          alias: s.alias,
          connected: s.connected,
          boundToApp: isBound,
          strengthA: s.strengthA,
          strengthB: s.strengthB,
          strengthLimitA: s.strengthLimitA,
          strengthLimitB: s.strengthLimitB,
          lastActive: s.lastActive.toISOString(),
        };
      });

      return createToolResult(JSON.stringify({ devices, count: devices.length }));
    }
  );

  // dg_set_alias - Set device alias
  toolManager.registerTool(
    "dg_set_alias",
    "为设备设置自定义别名，方便后续查找",
    {
      type: "object",
      properties: {
        deviceId: {
          type: "string",
          description: "设备ID",
        },
        alias: {
          type: "string",
          description: "自定义别名（如用户名、昵称等）",
        },
      },
      required: ["deviceId", "alias"],
    },
    async (params) => {
      const deviceId = params.deviceId as string;
      const alias = params.alias as string;

      if (!deviceId) {
        return createToolError("缺少必需参数: deviceId");
      }
      if (!alias) {
        return createToolError("缺少必需参数: alias");
      }

      const success = sessionManager.setAlias(deviceId, alias);
      if (!success) {
        return createToolError(`设备不存在: ${deviceId}`);
      }

      return createToolResult(
        JSON.stringify({
          success: true,
          deviceId,
          alias,
          message: `已将设备 ${deviceId} 的别名设置为 "${alias}"`,
        })
      );
    }
  );

  // dg_find_device - Find devices by alias
  toolManager.registerTool(
    "dg_find_device",
    "通过别名查找设备（大小写不敏感）",
    {
      type: "object",
      properties: {
        alias: {
          type: "string",
          description: "要查找的别名",
        },
      },
      required: ["alias"],
    },
    async (params) => {
      const alias = params.alias as string;

      if (!alias) {
        return createToolError("缺少必需参数: alias");
      }

      const sessions = sessionManager.findByAlias(alias);
      const devices = sessions.map((s) => {
        const isBound = s.clientId ? wsServer.isControllerBound(s.clientId) : false;
        
        return {
          deviceId: s.deviceId,
          clientId: s.clientId,
          alias: s.alias,
          connected: s.connected,
          boundToApp: isBound,
          strengthA: s.strengthA,
          strengthB: s.strengthB,
          strengthLimitA: s.strengthLimitA,
          strengthLimitB: s.strengthLimitB,
        };
      });

      return createToolResult(
        JSON.stringify({
          devices,
          count: devices.length,
          searchAlias: alias,
        })
      );
    }
  );
}
