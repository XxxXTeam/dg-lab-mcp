/**
 * Tool Schema Validity Tests
 * Feature: dg-lab-sse-tool, Property 4: Tool Input Schema Validity
 * Validates: Requirements 3.3
 */

import { describe, test, expect } from "bun:test";
import * as fc from "fast-check";
import { ToolManager, createToolResult } from "../tool-manager";
import type { JsonSchema } from "../tool-manager";

/**
 * Validate that a schema is a valid JSON Schema object
 */
function isValidJsonSchema(schema: unknown): boolean {
  if (typeof schema !== "object" || schema === null) return false;
  
  const s = schema as Record<string, unknown>;
  
  // Must have a type field
  if (typeof s.type !== "string") return false;
  
  // If type is "object", properties should be an object if present
  if (s.type === "object" && s.properties !== undefined) {
    if (typeof s.properties !== "object" || s.properties === null) return false;
  }
  
  // required should be an array if present
  if (s.required !== undefined && !Array.isArray(s.required)) return false;
  
  return true;
}

describe("Tool Schema Validity", () => {
  /**
   * Property 4: Tool Input Schema Validity
   * For any tool returned by `tools/list`, its `inputSchema` SHALL be a valid
   * JSON Schema object that can be used for parameter validation.
   */
  describe("Property 4: Tool Input Schema Validity", () => {
    test("All registered tools have valid JSON Schema inputSchema", () => {
      // Generate random valid JSON Schemas
      const jsonSchemaArb: fc.Arbitrary<JsonSchema> = fc.record({
        type: fc.constant("object"),
        properties: fc.option(
          fc.dictionary(
            fc.string({ minLength: 1, maxLength: 20 }),
            fc.record({
              type: fc.constantFrom("string", "number", "boolean", "array", "object"),
              description: fc.option(fc.string({ maxLength: 100 }), { nil: undefined }),
            })
          ),
          { nil: undefined }
        ),
        required: fc.option(
          fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 }),
          { nil: undefined }
        ),
      }).map((s) => {
        const schema: JsonSchema = { type: s.type };
        if (s.properties) schema.properties = s.properties as JsonSchema["properties"];
        if (s.required) schema.required = s.required;
        return schema;
      });

      const toolNameArb = fc.string({ minLength: 1, maxLength: 30 });
      const toolDescArb = fc.string({ minLength: 1, maxLength: 100 });

      fc.assert(
        fc.property(
          fc.array(fc.tuple(toolNameArb, toolDescArb, jsonSchemaArb), { minLength: 1, maxLength: 10 }),
          (toolDefs) => {
            const manager = new ToolManager();

            // Register all tools
            for (const [name, desc, schema] of toolDefs) {
              manager.registerTool(name, desc, schema, async () => createToolResult("ok"));
            }

            // List tools and verify schemas
            const tools = manager.listTools();

            for (const tool of tools) {
              // Each tool must have a valid inputSchema
              expect(isValidJsonSchema(tool.inputSchema)).toBe(true);
              
              // inputSchema must have type "object"
              expect(tool.inputSchema.type).toBe("object");
              
              // If properties exist, they must be an object
              if (tool.inputSchema.properties !== undefined) {
                expect(typeof tool.inputSchema.properties).toBe("object");
              }
              
              // If required exists, it must be an array
              if (tool.inputSchema.required !== undefined) {
                expect(Array.isArray(tool.inputSchema.required)).toBe(true);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    test("Tool schemas are serializable to JSON", () => {
      const manager = new ToolManager();

      // Register a tool with complex schema
      manager.registerTool(
        "test_tool",
        "A test tool",
        {
          type: "object",
          properties: {
            deviceId: { type: "string", description: "Device ID" },
            channel: { type: "string", enum: ["A", "B"], description: "Channel" },
            value: { type: "number", minimum: 0, maximum: 200, description: "Value" },
          },
          required: ["deviceId", "channel", "value"],
        },
        async () => createToolResult("ok")
      );

      const tools = manager.listTools();
      
      // Schema should be JSON serializable
      expect(() => JSON.stringify(tools[0].inputSchema)).not.toThrow();
      
      // Serialized and parsed schema should be equivalent
      const serialized = JSON.stringify(tools[0].inputSchema);
      const parsed = JSON.parse(serialized);
      expect(parsed.type).toBe("object");
      expect(parsed.properties.deviceId.type).toBe("string");
      expect(parsed.required).toContain("deviceId");
    });

    test("Empty tool list returns valid structure", () => {
      const manager = new ToolManager();
      const tools = manager.listTools();
      
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBe(0);
    });
  });

  describe("Tool Registration and Listing", () => {
    test("Registered tools appear in list", () => {
      fc.assert(
        fc.property(
          fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 10 }),
          (names) => {
            const uniqueNames = [...new Set(names)];
            const manager = new ToolManager();

            for (const name of uniqueNames) {
              manager.registerTool(
                name,
                `Description for ${name}`,
                { type: "object" },
                async () => createToolResult("ok")
              );
            }

            const tools = manager.listTools();
            const toolNames = tools.map((t) => t.name);

            // All registered tools should appear
            for (const name of uniqueNames) {
              expect(toolNames).toContain(name);
            }

            // Tool count should match
            expect(tools.length).toBe(uniqueNames.length);
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});
