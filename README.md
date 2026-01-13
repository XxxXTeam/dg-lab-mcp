# DG-LAB MCP Server

基于 MCP (Model Context Protocol) 的 DG-LAB 设备控制服务器，支持通过 AI 助手控制 DG-LAB 设备。

## 功能特性

- **MCP 协议支持**: 通过 SSE (Server-Sent Events) 实现 MCP 协议通信
- **内置 WebSocket 服务器**: 无需外部 WS 后端，直接与 DG-LAB APP 通信
- **单端口设计**: HTTP/SSE 和 WebSocket 共享同一端口
- **波形管理**: 支持解析、保存、发送 DG-LAB 波形数据
- **会话管理**: 支持设备别名、多设备管理

## 快速开始

### 安装依赖

```bash
bun install
```

### 启动服务器

```bash
bun run src/index.ts
```

服务器默认监听端口 `3323`，启动后会显示：
- SSE 端点: `http://localhost:3323/sse`
- POST 端点: `http://localhost:3323/message`
- WebSocket: `ws://localhost:3323`

## 使用流程

1. **创建连接**: 调用 `dg_connect` 获取二维码链接
2. **扫码绑定**: 用户使用 DG-LAB APP 扫描二维码
3. **检查状态**: 调用 `dg_get_status` 确认 `boundToApp: true`
4. **控制设备**: 使用 `dg_set_strength` 或 `dg_send_waveform` 控制设备

## 可用工具

### 设备管理
| 工具 | 说明 |
|------|------|
| `dg_connect` | 创建新的设备连接，返回二维码链接 |
| `dg_list_devices` | 列出所有设备及状态 |
| `dg_get_status` | 获取指定设备的详细状态 |
| `dg_set_alias` | 为设备设置别名 |
| `dg_find_device` | 按别名查找设备 |
| `dg_disconnect` | 断开并删除设备连接 |

### 设备控制
| 工具 | 说明 |
|------|------|
| `dg_set_strength` | 设置通道强度 (A/B, 0-200) |
| `dg_send_waveform` | 发送波形数据到设备 |
| `dg_clear_waveform` | 清空波形队列 |

### 波形管理
| 工具 | 说明 |
|------|------|
| `dg_parse_waveform` | 解析并保存波形数据 |
| `dg_list_waveforms` | 列出所有已保存的波形 |
| `dg_get_waveform` | 获取波形的 hexWaveforms 数据 |
| `dg_delete_waveform` | 删除已保存的波形 |

## 环境变量

可以通过创建 `.env` 文件配置服务器（参考 `.env.example`）：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | 3323 | 服务端口 (HTTP/WebSocket 共享) |
| `PUBLIC_IP` | (空) | 公网IP地址，用于生成二维码。留空则自动检测本地IP。如果服务器部署在公网或需要远程访问，请填写公网IP |
| `SSE_PATH` | /sse | SSE 端点路径 |
| `POST_PATH` | /message | POST 端点路径 |
| `HEARTBEAT_INTERVAL` | 30000 | 心跳间隔 (ms) |
| `STALE_DEVICE_TIMEOUT` | 3600000 | 设备过期超时 (ms) |
| `SESSION_STORE_PATH` | ./data/sessions.json | 会话存储路径 |
| `WAVEFORM_STORE_PATH` | ./data/waveforms.json | 波形存储路径 |

## 开发

### 运行测试

```bash
bun test
```

### 项目结构

```
src/
├── index.ts          # 入口文件
├── server.ts         # HTTP 服务器
├── ws-server.ts      # WebSocket 服务器
├── session-manager.ts # 会话管理
├── tool-manager.ts   # 工具管理
├── waveform-parser.ts # 波形解析
├── waveform-storage.ts # 波形存储
└── tools/
    ├── device-tools.ts  # 设备管理工具
    ├── control-tools.ts # 设备控制工具
    └── waveform-tools.ts # 波形管理工具
```

## 许可证

MIT
