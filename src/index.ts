/**
 * @fileoverview DG-LAB MCP SSE 服务器入口
 * @description 主入口文件，负责启动应用和处理进程信号
 */

import { createApp, startApp } from "./app";

/**
 * 主函数
 * 
 * 创建应用实例，设置信号处理，然后启动服务器。
 */
async function main() {
  // 创建并初始化应用
  const app = createApp();

  // 设置优雅关闭
  const shutdown = async () => {
    await app.shutdown();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // 启动应用
  await startApp(app);
}

main().catch((error) => {
  console.error("[致命错误]", error);
  process.exit(1);
});
