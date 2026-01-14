/**
 * Configuration Tests
 * Feature: device-reconnection-timeout
 * 测试配置加载和验证功能
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fc from "fast-check";
import { loadConfig, resetConfig } from "../config";
import { ConfigError } from "../errors";

describe("Configuration - Reconnection Timeout", () => {
  // 保存原始环境变量
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // 重置配置单例
    resetConfig();
  });

  afterEach(() => {
    // 恢复原始环境变量
    process.env = { ...originalEnv };
    resetConfig();
  });

  describe("Default Values", () => {
    test("使用默认值 5 分钟当 RECONNECTION_TIMEOUT_MINUTES 未设置", () => {
      // 确保环境变量未设置
      delete process.env.RECONNECTION_TIMEOUT_MINUTES;

      const config = loadConfig();

      expect(config.reconnectionTimeoutMinutes).toBe(5);
    });

    test("使用默认值 5 分钟当 CONNECTION_TIMEOUT_MINUTES 未设置", () => {
      // 确保环境变量未设置
      delete process.env.CONNECTION_TIMEOUT_MINUTES;

      const config = loadConfig();

      expect(config.connectionTimeoutMinutes).toBe(5);
    });
  });

  describe("Valid Configuration", () => {
    test("接受有效的 RECONNECTION_TIMEOUT_MINUTES 值", () => {
      process.env.RECONNECTION_TIMEOUT_MINUTES = "10";

      const config = loadConfig();

      expect(config.reconnectionTimeoutMinutes).toBe(10);
    });

    test("接受边界值 1 分钟", () => {
      process.env.RECONNECTION_TIMEOUT_MINUTES = "1";

      const config = loadConfig();

      expect(config.reconnectionTimeoutMinutes).toBe(1);
    });

    test("接受边界值 60 分钟", () => {
      process.env.RECONNECTION_TIMEOUT_MINUTES = "60";

      const config = loadConfig();

      expect(config.reconnectionTimeoutMinutes).toBe(60);
    });
  });

  describe("Invalid Configuration", () => {
    test("拒绝小于 1 的值", () => {
      process.env.RECONNECTION_TIMEOUT_MINUTES = "0";

      expect(() => loadConfig()).toThrow(ConfigError);
    });

    test("拒绝大于 60 的值", () => {
      process.env.RECONNECTION_TIMEOUT_MINUTES = "61";

      expect(() => loadConfig()).toThrow(ConfigError);
    });

    test("拒绝负数值", () => {
      process.env.RECONNECTION_TIMEOUT_MINUTES = "-5";

      expect(() => loadConfig()).toThrow(ConfigError);
    });

    test("拒绝非数字值", () => {
      process.env.RECONNECTION_TIMEOUT_MINUTES = "invalid";

      expect(() => loadConfig()).toThrow(ConfigError);
    });

    test("拒绝空字符串", () => {
      process.env.RECONNECTION_TIMEOUT_MINUTES = "";

      expect(() => loadConfig()).toThrow(ConfigError);
    });
  });

  describe("Property: Invalid Configuration Rejection", () => {
    /**
     * Feature: device-reconnection-timeout, Property 2: Invalid Configuration Rejection
     * 
     * 属性：对于任何无效的 RECONNECTION_TIMEOUT_MINUTES 值（非数字、负数、零或大于 60），
     * 配置系统应该抛出 ConfigError
     * 
     * Validates: Requirements 1.3, 1.4
     */
    test("属性测试：所有无效值都应被拒绝", () => {
      fc.assert(
        fc.property(
          fc.oneof(
            // 非数字字符串
            fc.string().filter(s => isNaN(parseInt(s, 10))),
            // 小于 1 的数字
            fc.integer({ max: 0 }).map(n => n.toString()),
            // 大于 60 的数字
            fc.integer({ min: 61, max: 1000 }).map(n => n.toString())
          ),
          (invalidValue) => {
            process.env.RECONNECTION_TIMEOUT_MINUTES = invalidValue;
            resetConfig();

            let threwError = false;
            try {
              loadConfig();
            } catch (error) {
              threwError = error instanceof ConfigError;
            }

            // 清理环境变量
            delete process.env.RECONNECTION_TIMEOUT_MINUTES;
            resetConfig();

            return threwError;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: device-reconnection-timeout, Property 1: Configuration Loading
     * 
     * 属性：对于任何有效的数字字符串值（1-60），配置系统应该正确解析并存储
     * 
     * Validates: Requirements 1.1
     */
    test("属性测试：所有有效值都应被接受", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 60 }),
          (validValue) => {
            process.env.RECONNECTION_TIMEOUT_MINUTES = validValue.toString();
            resetConfig();

            let config;
            try {
              config = loadConfig();
            } catch {
              // 清理环境变量
              delete process.env.RECONNECTION_TIMEOUT_MINUTES;
              resetConfig();
              return false;
            }

            const result = config.reconnectionTimeoutMinutes === validValue;

            // 清理环境变量
            delete process.env.RECONNECTION_TIMEOUT_MINUTES;
            resetConfig();

            return result;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe("Backward Compatibility", () => {
    test("CONNECTION_TIMEOUT_MINUTES 仍然正常工作", () => {
      process.env.CONNECTION_TIMEOUT_MINUTES = "10";

      const config = loadConfig();

      expect(config.connectionTimeoutMinutes).toBe(10);
    });

    test("两个超时配置可以独立设置", () => {
      process.env.CONNECTION_TIMEOUT_MINUTES = "3";
      process.env.RECONNECTION_TIMEOUT_MINUTES = "15";

      const config = loadConfig();

      expect(config.connectionTimeoutMinutes).toBe(3);
      expect(config.reconnectionTimeoutMinutes).toBe(15);
    });
  });
});
