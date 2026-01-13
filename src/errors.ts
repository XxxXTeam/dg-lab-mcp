/**
 * @fileoverview 统一错误处理模块
 * 
 * 这个模块定义了应用中使用的所有错误类型。通过统一的错误结构，
 * 可以更方便地进行错误处理、日志记录和用户反馈。
 * 
 * 错误分类：
 * - ConfigError: 配置问题，通常需要修复配置后重启
 * - ConnectionError: 连接问题，单个连接失败不影响其他
 * - ToolError: 工具调用失败，可以重试或换个方式
 * - WebSocketError: WebSocket 通信问题
 * - WaveformError: 波形数据处理问题
 */

/**
 * 错误码枚举
 * 
 * 按模块分组，方便快速定位问题来源。错误码是字符串而不是数字，
 * 这样在日志中更容易理解。
 */
export enum ErrorCode {
  // 配置错误 (1xx)
  CONFIG_LOAD_FAILED = "CONFIG_LOAD_FAILED",
  CONFIG_INVALID_PORT = "CONFIG_INVALID_PORT",
  CONFIG_INVALID_IP = "CONFIG_INVALID_IP",
  CONFIG_INVALID_PATH = "CONFIG_INVALID_PATH",
  
  // 连接错误 (2xx)
  CONN_DEVICE_NOT_FOUND = "CONN_DEVICE_NOT_FOUND",
  CONN_NOT_BOUND = "CONN_NOT_BOUND",
  CONN_ALREADY_EXISTS = "CONN_ALREADY_EXISTS",
  CONN_TIMEOUT = "CONN_TIMEOUT",
  
  // 工具执行错误 (3xx)
  TOOL_INVALID_PARAMS = "TOOL_INVALID_PARAMS",
  TOOL_EXECUTION_FAILED = "TOOL_EXECUTION_FAILED",
  TOOL_NOT_FOUND = "TOOL_NOT_FOUND",
  
  // WebSocket 错误 (4xx)
  WS_CONNECTION_FAILED = "WS_CONNECTION_FAILED",
  WS_MESSAGE_INVALID = "WS_MESSAGE_INVALID",
  WS_PEER_DISCONNECTED = "WS_PEER_DISCONNECTED",
  
  // 波形错误 (5xx)
  WAVEFORM_PARSE_FAILED = "WAVEFORM_PARSE_FAILED",
  WAVEFORM_NOT_FOUND = "WAVEFORM_NOT_FOUND",
  WAVEFORM_INVALID_FORMAT = "WAVEFORM_INVALID_FORMAT",
}

/**
 * 应用错误基类
 * 
 * 所有自定义错误都继承自这个类。除了标准的 Error 属性外，
 * 还包含错误码、是否可恢复的标志，以及可选的上下文信息。
 * 
 * 可恢复的错误意味着程序可以继续运行，比如单个设备连接失败。
 * 不可恢复的错误通常需要修复后重启，比如配置文件格式错误。
 */
export class AppError extends Error {
  /** 错误码，用于程序化处理 */
  readonly code: ErrorCode;
  /** 是否可恢复（true 表示可以继续运行，false 表示需要终止） */
  readonly recoverable: boolean;
  /** 错误上下文信息，包含相关的调试数据 */
  readonly context?: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    message: string,
    options?: {
      recoverable?: boolean;
      context?: Record<string, unknown>;
      cause?: Error;
    }
  ) {
    super(message, { cause: options?.cause });
    this.name = "AppError";
    this.code = code;
    this.recoverable = options?.recoverable ?? true;
    this.context = options?.context;
  }

  /**
   * 格式化错误信息，方便日志输出
   * 
   * 输出格式包含错误码、消息、上下文和原因，一目了然。
   */
  toLogString(): string {
    const parts = [`[${this.code}] ${this.message}`];
    if (this.context) {
      parts.push(`Context: ${JSON.stringify(this.context)}`);
    }
    if (this.cause) {
      parts.push(`Cause: ${this.cause}`);
    }
    return parts.join("\n  ");
  }
}

/**
 * 配置错误
 * 
 * 当配置加载或验证失败时使用。这类错误通常是致命的，
 * 需要用户修复配置文件后重新启动服务器。
 */
export class ConfigError extends AppError {
  constructor(
    message: string,
    options?: {
      code?: ErrorCode;
      context?: Record<string, unknown>;
      cause?: Error;
    }
  ) {
    super(options?.code ?? ErrorCode.CONFIG_LOAD_FAILED, message, {
      recoverable: false,
      context: options?.context,
      cause: options?.cause,
    });
    this.name = "ConfigError";
  }
}

/**
 * 连接错误
 * 
 * 当设备连接、会话管理出现问题时使用。这类错误通常是可恢复的，
 * 单个连接失败不会影响其他设备的正常使用。
 */
export class ConnectionError extends AppError {
  constructor(
    message: string,
    options?: {
      code?: ErrorCode;
      context?: Record<string, unknown>;
      cause?: Error;
    }
  ) {
    super(options?.code ?? ErrorCode.CONN_DEVICE_NOT_FOUND, message, {
      recoverable: true,
      context: options?.context,
      cause: options?.cause,
    });
    this.name = "ConnectionError";
  }
}

/**
 * 工具执行错误
 * 
 * 当 MCP 工具调用失败时使用。这类错误是可恢复的，
 * 单个工具调用失败不会影响服务器的正常运行。
 */
export class ToolError extends AppError {
  constructor(
    message: string,
    options?: {
      code?: ErrorCode;
      context?: Record<string, unknown>;
      cause?: Error;
    }
  ) {
    super(options?.code ?? ErrorCode.TOOL_EXECUTION_FAILED, message, {
      recoverable: true,
      context: options?.context,
      cause: options?.cause,
    });
    this.name = "ToolError";
  }
}

/**
 * WebSocket 错误
 * 
 * 当 WebSocket 连接或消息处理出现问题时使用。这类错误是可恢复的，
 * 单个 WebSocket 连接的问题不会影响其他连接。
 */
export class WebSocketError extends AppError {
  constructor(
    message: string,
    options?: {
      code?: ErrorCode;
      context?: Record<string, unknown>;
      cause?: Error;
    }
  ) {
    super(options?.code ?? ErrorCode.WS_CONNECTION_FAILED, message, {
      recoverable: true,
      context: options?.context,
      cause: options?.cause,
    });
    this.name = "WebSocketError";
  }
}

/**
 * 波形错误
 * 
 * 当波形数据解析或存储出现问题时使用。这类错误是可恢复的，
 * 单个波形处理失败不会影响其他操作。
 */
export class WaveformError extends AppError {
  constructor(
    message: string,
    options?: {
      code?: ErrorCode;
      context?: Record<string, unknown>;
      cause?: Error;
    }
  ) {
    super(options?.code ?? ErrorCode.WAVEFORM_PARSE_FAILED, message, {
      recoverable: true,
      context: options?.context,
      cause: options?.cause,
    });
    this.name = "WaveformError";
  }
}
