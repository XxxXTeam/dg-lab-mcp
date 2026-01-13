/**
 * @fileoverview 配置管理模块
 * @description 支持环境变量配置，提供合理的默认值
 */

/**
 * 服务器配置接口
 */
export interface ServerConfig {
  /** HTTP/WebSocket 服务端口（共享） */
  port: number;
  /** 公网IP地址（用于生成二维码，留空则自动检测本地IP） */
  publicIp: string;
  /** SSE 端点路径 */
  ssePath: string;
  /** POST 端点路径 */
  postPath: string;
  /** 会话存储路径 */
  sessionStorePath: string;
  /** 波形存储路径 */
  waveformStorePath: string;
  /** 心跳间隔（毫秒） */
  heartbeatInterval: number;
  /** 设备过期超时（毫秒） */
  staleDeviceTimeout: number;
}

/**
 * 获取字符串类型环境变量
 * @param key - 环境变量名
 * @param defaultValue - 默认值
 * @returns 环境变量值或默认值
 */
function getEnvString(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

/**
 * 获取数字类型环境变量
 * @param key - 环境变量名
 * @param defaultValue - 默认值
 * @returns 环境变量值或默认值
 * @throws 当环境变量值不是有效数字时抛出错误
 */
function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined) return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`环境变量 ${key} 的值无效: ${value}`);
  }
  return parsed;
}

/**
 * 加载服务器配置
 * @returns 服务器配置对象
 */
export function loadConfig(): ServerConfig {
  const config: ServerConfig = {
    port: getEnvNumber("PORT", 3323),
    publicIp: getEnvString("PUBLIC_IP", ""),
    ssePath: getEnvString("SSE_PATH", "/sse"),
    postPath: getEnvString("POST_PATH", "/message"),
    sessionStorePath: getEnvString("SESSION_STORE_PATH", "./data/sessions.json"),
    waveformStorePath: getEnvString("WAVEFORM_STORE_PATH", "./data/waveforms.json"),
    heartbeatInterval: getEnvNumber("HEARTBEAT_INTERVAL", 30000),
    staleDeviceTimeout: getEnvNumber("STALE_DEVICE_TIMEOUT", 3600000),
  };

  validateConfig(config);
  return config;
}

/**
 * 验证配置有效性
 * @param config - 服务器配置
 * @throws 当配置无效时抛出错误
 */
function validateConfig(config: ServerConfig): void {
  if (config.port < 1 || config.port > 65535) {
    throw new Error(`端口无效: ${config.port}，必须在 1-65535 范围内`);
  }

  // 验证公网IP格式（如果提供）
  if (config.publicIp) {
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipv4Regex.test(config.publicIp)) {
      throw new Error(`公网IP格式无效: ${config.publicIp}，必须是有效的IPv4地址`);
    }
    // 验证每个数字段在0-255范围内
    const parts = config.publicIp.split(".");
    if (parts.some(part => parseInt(part, 10) > 255)) {
      throw new Error(`公网IP格式无效: ${config.publicIp}，每段必须在0-255范围内`);
    }
  }

  if (!config.ssePath.startsWith("/")) {
    throw new Error(`SSE 路径无效: ${config.ssePath}，必须以 / 开头`);
  }

  if (!config.postPath.startsWith("/")) {
    throw new Error(`POST 路径无效: ${config.postPath}，必须以 / 开头`);
  }

  if (config.heartbeatInterval < 1000) {
    throw new Error(`心跳间隔无效: ${config.heartbeatInterval}，必须至少 1000ms`);
  }

  if (config.staleDeviceTimeout < 60000) {
    throw new Error(`设备过期超时无效: ${config.staleDeviceTimeout}，必须至少 60000ms`);
  }
}

/** 单例配置实例 */
let configInstance: ServerConfig | null = null;

/**
 * 获取配置实例（单例模式）
 * @returns 服务器配置对象
 */
export function getConfig(): ServerConfig {
  if (!configInstance) {
    configInstance = loadConfig();
  }
  return configInstance;
}

/**
 * 重置配置实例（用于测试）
 */
export function resetConfig(): void {
  configInstance = null;
}
