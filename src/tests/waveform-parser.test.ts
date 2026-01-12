/**
 * Waveform Parser Tests
 * Feature: dg-lab-sse-tool
 * Tests for new text format (Dungeonlab+pulse:) parsing
 */

import { describe, test, expect } from "bun:test";
import * as fc from "fast-check";
import {
  parseWaveform,
  encodeWaveform,
  getOutputValue,
  isValidHexWaveform,
} from "../waveform-parser";

// Sample waveform data in new text format
const SAMPLE_WAVEFORM = "Dungeonlab+pulse:0,1,8=0,29,8,1,1/0.00-1,16.67-0,33.33-0,50.00-0,66.67-0,83.33-0,100.00-1+section+0,20,8,1,1/100.00-1,83.33-0,66.67-0,50.00-0,33.33-0,16.67-0,0.00-1+section+0,20,8,1,0/0.00-1,100.00-1";

// Simple single-section waveform
const SIMPLE_WAVEFORM = "Dungeonlab+pulse:0,1,8=10,20,4,1,1/50.00-0,75.00-1,100.00-0,50.00-1";

describe("Waveform Parser - New Text Format", () => {
  describe("Basic Parsing", () => {
    test("Parses sample waveform correctly", () => {
      const waveform = parseWaveform(SAMPLE_WAVEFORM, "test-wave");

      expect(waveform.name).toBe("test-wave");
      expect(waveform.rawData).toBe(SAMPLE_WAVEFORM);
      expect(waveform.sections.length).toBeGreaterThan(0);
      expect(waveform.hexWaveforms.length).toBeGreaterThan(0);
      expect(waveform.createdAt).toBeInstanceOf(Date);
    });

    test("Parses simple waveform correctly", () => {
      const waveform = parseWaveform(SIMPLE_WAVEFORM, "simple");

      expect(waveform.name).toBe("simple");
      expect(waveform.sections.length).toBe(1);
      
      const section = waveform.sections[0];
      expect(section).toBeDefined();
      expect(section!.startFrequency).toBe(10);
      expect(section!.endFrequency).toBe(20);
      expect(section!.duration).toBe(4);
      expect(section!.frequencyMode).toBe(1);
      expect(section!.shape.length).toBe(4);
    });

    test("Parses multi-section waveform", () => {
      const waveform = parseWaveform(SAMPLE_WAVEFORM, "multi");

      // First two sections are enabled, third is disabled (enabled=0)
      expect(waveform.sections.length).toBe(2);
      expect(waveform.metadata.section2Enabled).toBe(true);
      expect(waveform.metadata.section3Enabled).toBe(false);
    });

    test("Extracts shape points correctly", () => {
      const waveform = parseWaveform(SIMPLE_WAVEFORM, "shapes");
      const section = waveform.sections[0];

      expect(section).toBeDefined();
      expect(section!.shape.length).toBe(4);
      expect(section!.shape[0]).toEqual({ strength: 50, shapeType: 0 });
      expect(section!.shape[1]).toEqual({ strength: 75, shapeType: 1 });
      expect(section!.shape[2]).toEqual({ strength: 100, shapeType: 0 });
      expect(section!.shape[3]).toEqual({ strength: 50, shapeType: 1 });
    });
  });

  describe("Error Handling", () => {
    test("Throws error for invalid format", () => {
      expect(() => parseWaveform("invalid data", "test")).toThrow("Invalid waveform format");
    });

    test("Throws error for empty sections", () => {
      expect(() => parseWaveform("Dungeonlab+pulse:", "test")).toThrow();
    });

    test("Throws error for malformed section data", () => {
      // No slash separator
      expect(() => parseWaveform("Dungeonlab+pulse:0,1,8=10,20,4,1,1", "test")).toThrow();
    });
  });

  describe("Round-Trip Encoding", () => {
    test("Encode and parse preserves structure", () => {
      const original = parseWaveform(SIMPLE_WAVEFORM, "roundtrip");
      const encoded = encodeWaveform(original);
      const reparsed = parseWaveform(encoded, "roundtrip");

      expect(reparsed.sections.length).toBe(original.sections.length);
      expect(reparsed.sections[0]!.startFrequency).toBe(original.sections[0]!.startFrequency);
      expect(reparsed.sections[0]!.endFrequency).toBe(original.sections[0]!.endFrequency);
      expect(reparsed.sections[0]!.duration).toBe(original.sections[0]!.duration);
      expect(reparsed.sections[0]!.frequencyMode).toBe(original.sections[0]!.frequencyMode);
    });

    test("Property: Round-trip preserves section count", () => {
      fc.assert(
        fc.property(
          fc.record({
            startFreq: fc.integer({ min: 0, max: 79 }),
            endFreq: fc.integer({ min: 0, max: 79 }),
            duration: fc.integer({ min: 1, max: 20 }),
            mode: fc.integer({ min: 1, max: 4 }),
            shapeCount: fc.integer({ min: 1, max: 10 }),
          }),
          (input) => {
            // Generate shape data
            const shapes = Array.from({ length: input.shapeCount }, (_, i) => 
              `${(i * 100 / input.shapeCount).toFixed(2)}-${i % 2}`
            ).join(",");

            const waveformData = `Dungeonlab+pulse:0,1,8=${input.startFreq},${input.endFreq},${input.duration},${input.mode},1/${shapes}`;
            
            const parsed = parseWaveform(waveformData, "prop-test");
            const encoded = encodeWaveform(parsed);
            const reparsed = parseWaveform(encoded, "prop-test");

            expect(reparsed.sections.length).toBe(parsed.sections.length);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe("Frequency Conversion", () => {
    test("getOutputValue returns values in valid range (10-240)", () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 100 }), (x) => {
          const output = getOutputValue(x);
          expect(output).toBeGreaterThanOrEqual(10);
          expect(output).toBeLessThanOrEqual(240);
        }),
        { numRuns: 100 }
      );
    });

    test("getOutputValue produces reasonable values", () => {
      // Test that output is within valid range for all inputs
      for (let x = 0; x <= 100; x++) {
        const output = getOutputValue(x);
        expect(output).toBeGreaterThanOrEqual(10);
        expect(output).toBeLessThanOrEqual(240);
      }
    });

    test("Known frequency values", () => {
      expect(getOutputValue(0)).toBe(10);
      expect(getOutputValue(10)).toBe(20);
      expect(getOutputValue(40)).toBe(50);
    });
  });

  describe("Hex Waveform Validation", () => {
    test("Valid 16-char hex strings are accepted", () => {
      const hexCharArb = fc.constantFrom(
        "0", "1", "2", "3", "4", "5", "6", "7",
        "8", "9", "a", "b", "c", "d", "e", "f"
      );
      const hex16Arb = fc.array(hexCharArb, { minLength: 16, maxLength: 16 })
        .map((chars) => chars.join(""));

      fc.assert(
        fc.property(hex16Arb, (hex) => {
          expect(isValidHexWaveform(hex)).toBe(true);
        }),
        { numRuns: 50 }
      );
    });

    test("Invalid hex strings are rejected", () => {
      expect(isValidHexWaveform("")).toBe(false);
      expect(isValidHexWaveform("0123456789abcde")).toBe(false); // 15 chars
      expect(isValidHexWaveform("0123456789abcdef0")).toBe(false); // 17 chars
      expect(isValidHexWaveform("0123456789abcdeg")).toBe(false); // invalid char
    });
  });

  describe("HEX Waveform Generation", () => {
    test("Generated hex waveforms have correct format", () => {
      const waveform = parseWaveform(SIMPLE_WAVEFORM, "hex-test");

      expect(waveform.hexWaveforms.length).toBeGreaterThan(0);

      for (const hex of waveform.hexWaveforms) {
        expect(isValidHexWaveform(hex)).toBe(true);
      }
    });

    test("Property: All generated hex waveforms are valid", () => {
      fc.assert(
        fc.property(
          fc.record({
            startFreq: fc.integer({ min: 0, max: 79 }),
            endFreq: fc.integer({ min: 0, max: 79 }),
            duration: fc.integer({ min: 1, max: 10 }),
            mode: fc.integer({ min: 1, max: 4 }),
          }),
          (input) => {
            const shapes = "50.00-0,75.00-1,100.00-0,50.00-1";
            const waveformData = `Dungeonlab+pulse:0,1,8=${input.startFreq},${input.endFreq},${input.duration},${input.mode},1/${shapes}`;
            
            const parsed = parseWaveform(waveformData, "prop-hex");

            for (const hex of parsed.hexWaveforms) {
              expect(isValidHexWaveform(hex)).toBe(true);
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe("Metadata Extraction", () => {
    test("Metadata fields are correctly extracted", () => {
      const waveform = parseWaveform(SAMPLE_WAVEFORM, "metadata-test");

      expect(waveform.metadata.startFrequencies).toBeDefined();
      expect(waveform.metadata.endFrequencies).toBeDefined();
      expect(waveform.metadata.durations).toBeDefined();
      expect(waveform.metadata.frequencyModes).toBeDefined();
      expect(typeof waveform.metadata.section2Enabled).toBe("boolean");
      expect(typeof waveform.metadata.section3Enabled).toBe("boolean");
      expect(waveform.metadata.playbackSpeed).toBe(1);
    });

    test("Property: Metadata arrays have 3 elements", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 79 }),
          (freq) => {
            const waveformData = `Dungeonlab+pulse:0,1,8=${freq},${freq + 10},8,1,1/50.00-0,100.00-1`;
            const parsed = parseWaveform(waveformData, "meta-prop");

            expect(parsed.metadata.startFrequencies.length).toBe(3);
            expect(parsed.metadata.endFrequencies.length).toBe(3);
            expect(parsed.metadata.durations.length).toBe(3);
            expect(parsed.metadata.frequencyModes.length).toBe(3);
          }
        ),
        { numRuns: 20 }
      );
    });
  });
});
