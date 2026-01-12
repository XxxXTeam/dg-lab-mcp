/**
 * Configuration management module
 * Supports environment variables with sensible defaults
 */

export interface ServerConfig {
  port: number;
  wsPort: number;
  ssePath: string;
  postPath: string;
  sessionStorePath: string;
  waveformStorePath: string;
  heartbeatInterval: number;
  staleDeviceTimeout: number;
}

function getEnvString(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined) return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Invalid number for ${key}: ${value}`);
  }
  return parsed;
}

export function loadConfig(): ServerConfig {
  const config: ServerConfig = {
    port: getEnvNumber("PORT", 3000),
    wsPort: getEnvNumber("WS_PORT", 4562),
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

function validateConfig(config: ServerConfig): void {
  if (config.port < 1 || config.port > 65535) {
    throw new Error(`Invalid port: ${config.port}. Must be between 1 and 65535`);
  }

  if (config.wsPort < 1 || config.wsPort > 65535) {
    throw new Error(`Invalid WS port: ${config.wsPort}. Must be between 1 and 65535`);
  }

  if (!config.ssePath.startsWith("/")) {
    throw new Error(`Invalid SSE path: ${config.ssePath}. Must start with /`);
  }

  if (!config.postPath.startsWith("/")) {
    throw new Error(`Invalid POST path: ${config.postPath}. Must start with /`);
  }

  if (config.heartbeatInterval < 1000) {
    throw new Error(`Invalid heartbeat interval: ${config.heartbeatInterval}. Must be at least 1000ms`);
  }

  if (config.staleDeviceTimeout < 60000) {
    throw new Error(`Invalid stale device timeout: ${config.staleDeviceTimeout}. Must be at least 60000ms`);
  }
}

// Singleton config instance
let configInstance: ServerConfig | null = null;

export function getConfig(): ServerConfig {
  if (!configInstance) {
    configInstance = loadConfig();
  }
  return configInstance;
}

export function resetConfig(): void {
  configInstance = null;
}
