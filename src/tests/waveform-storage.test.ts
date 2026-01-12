/**
 * Waveform Storage Tests
 * Feature: dg-lab-sse-tool
 * Property 21: Waveform Storage Persistence
 * Property 22: Waveform Name Uniqueness
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fc from "fast-check";
import { existsSync, unlinkSync, mkdirSync } from "fs";
import {
  WaveformStorage,
  persistWaveforms,
  loadWaveforms,
} from "../waveform-storage";
import type { ParsedWaveform, WaveformMetadata, WaveformSection } from "../waveform-parser";

// Test file path
const TEST_FILE = "./data/test-waveforms.json";

// Helper to create a valid waveform
function createTestWaveform(name: string): ParsedWaveform {
  const metadata: WaveformMetadata = {
    startFrequencies: [30, 30, 30],
    endFrequencies: [50, 50, 50],
    durations: [10, 10, 10],
    frequencyModes: [1, 1, 1],
    section2Enabled: false,
    section3Enabled: false,
    playbackSpeed: 1,
  };

  const sections: WaveformSection[] = [
    {
      index: 0,
      enabled: true,
      startFrequency: 30,
      endFrequency: 50,
      duration: 10,
      frequencyMode: 1,
      shape: [
        { shapeType: 0, strength: 50 },
        { shapeType: 0, strength: 60 },
      ],
    },
  ];

  return {
    name,
    metadata,
    sections,
    rawData: "30,30,30,50,50,50,0,0,0,10,10,10,1,1,1,0,0,0,0,1+0-50,0-60",
    hexWaveforms: ["0a0a0a0a32323232"],
    createdAt: new Date(),
  };
}

describe("Waveform Storage", () => {
  beforeEach(() => {
    // Ensure data directory exists
    if (!existsSync("./data")) {
      mkdirSync("./data", { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up test file
    if (existsSync(TEST_FILE)) {
      unlinkSync(TEST_FILE);
    }
  });

  /**
   * Property 21: Waveform Storage Persistence
   * For any saved waveform, persisting to disk and loading back
   * SHALL restore the waveform with equivalent data.
   */
  describe("Property 21: Waveform Storage Persistence", () => {
    test("Waveforms survive persist and load cycle", () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              name: fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0),
              startFreq: fc.integer({ min: 0, max: 79 }),
              endFreq: fc.integer({ min: 0, max: 79 }),
              duration: fc.integer({ min: 1, max: 100 }),
              mode: fc.integer({ min: 1, max: 4 }),
              strength: fc.integer({ min: 0, max: 100 }),
            }),
            { minLength: 0, maxLength: 5 }
          ),
          (waveformDefs) => {
            // Create storage and add waveforms
            const storage1 = new WaveformStorage();

            for (const def of waveformDefs) {
              const waveform: ParsedWaveform = {
                name: def.name,
                metadata: {
                  startFrequencies: [def.startFreq, def.startFreq, def.startFreq],
                  endFrequencies: [def.endFreq, def.endFreq, def.endFreq],
                  durations: [def.duration, def.duration, def.duration],
                  frequencyModes: [def.mode, def.mode, def.mode],
                  section2Enabled: false,
                  section3Enabled: false,
                  playbackSpeed: 1,
                },
                sections: [
                  {
                    index: 0,
                    enabled: true,
                    startFrequency: def.startFreq,
                    endFrequency: def.endFreq,
                    duration: def.duration,
                    frequencyMode: def.mode,
                    shape: [{ shapeType: 0, strength: def.strength }],
                  },
                ],
                rawData: `${def.startFreq},0,0,${def.endFreq},0,0,0,0,0,${def.duration},0,0,${def.mode},0,0,0,0,0,0,1+0-${def.strength}`,
                hexWaveforms: ["0a0a0a0a32323232"],
                createdAt: new Date(),
              };
              storage1.save(waveform);
            }

            // Persist
            persistWaveforms(storage1, TEST_FILE);

            // Load into new storage
            const storage2 = new WaveformStorage();
            const loaded = loadWaveforms(storage2, TEST_FILE);

            expect(loaded).toBe(true);

            // Unique names only (later ones overwrite earlier)
            const uniqueNames = new Set(waveformDefs.map((d) => d.name));
            expect(storage2.count).toBe(uniqueNames.size);

            // Verify all waveforms restored correctly
            for (const name of uniqueNames) {
              const original = storage1.get(name);
              const restored = storage2.get(name);

              expect(restored).not.toBeNull();
              expect(restored!.name).toBe(original!.name);
              expect(restored!.rawData).toBe(original!.rawData);
              expect(restored!.metadata.startFrequencies).toEqual(original!.metadata.startFrequencies);
              expect(restored!.metadata.endFrequencies).toEqual(original!.metadata.endFrequencies);
              expect(restored!.hexWaveforms).toEqual(original!.hexWaveforms);
            }
          }
        ),
        { numRuns: 30 }
      );
    });

    test("Storage data round-trip preserves all fields", () => {
      const storage1 = new WaveformStorage();
      const waveform = createTestWaveform("test-wave");
      storage1.save(waveform);

      const data = storage1.toStorageData();
      const storage2 = new WaveformStorage();
      storage2.fromStorageData(data);

      const restored = storage2.get("test-wave");
      expect(restored).not.toBeNull();
      expect(restored!.name).toBe(waveform.name);
      expect(restored!.metadata).toEqual(waveform.metadata);
      expect(restored!.sections).toEqual(waveform.sections);
      expect(restored!.rawData).toBe(waveform.rawData);
      expect(restored!.hexWaveforms).toEqual(waveform.hexWaveforms);
    });
  });

  /**
   * Property 22: Waveform Name Uniqueness
   * For any waveform name, saving a new waveform with the same name
   * SHALL overwrite the existing waveform.
   */
  describe("Property 22: Waveform Name Uniqueness", () => {
    test("Saving with same name overwrites existing", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0),
          fc.integer({ min: 0, max: 100 }),
          fc.integer({ min: 0, max: 100 }),
          (name, strength1, strength2) => {
            const storage = new WaveformStorage();

            // Save first waveform
            const wave1 = createTestWaveform(name);
            wave1.sections[0].shape[0].strength = strength1;
            storage.save(wave1);

            expect(storage.count).toBe(1);
            expect(storage.get(name)!.sections[0].shape[0].strength).toBe(strength1);

            // Save second waveform with same name
            const wave2 = createTestWaveform(name);
            wave2.sections[0].shape[0].strength = strength2;
            storage.save(wave2);

            // Should still have only 1 waveform
            expect(storage.count).toBe(1);
            // Should have the new strength value
            expect(storage.get(name)!.sections[0].shape[0].strength).toBe(strength2);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe("Basic Operations", () => {
    test("save and get waveform", () => {
      const storage = new WaveformStorage();
      const waveform = createTestWaveform("test");

      storage.save(waveform);
      const retrieved = storage.get("test");

      expect(retrieved).not.toBeNull();
      expect(retrieved!.name).toBe("test");
    });

    test("get returns null for non-existent name", () => {
      const storage = new WaveformStorage();
      expect(storage.get("non-existent")).toBeNull();
    });

    test("list returns all waveforms", () => {
      const storage = new WaveformStorage();
      storage.save(createTestWaveform("wave1"));
      storage.save(createTestWaveform("wave2"));
      storage.save(createTestWaveform("wave3"));

      const list = storage.list();
      expect(list.length).toBe(3);
      expect(list.map((w) => w.name).sort()).toEqual(["wave1", "wave2", "wave3"]);
    });

    test("delete removes waveform", () => {
      const storage = new WaveformStorage();
      storage.save(createTestWaveform("test"));

      expect(storage.has("test")).toBe(true);
      expect(storage.delete("test")).toBe(true);
      expect(storage.has("test")).toBe(false);
      expect(storage.get("test")).toBeNull();
    });

    test("delete returns false for non-existent name", () => {
      const storage = new WaveformStorage();
      expect(storage.delete("non-existent")).toBe(false);
    });

    test("clear removes all waveforms", () => {
      const storage = new WaveformStorage();
      storage.save(createTestWaveform("wave1"));
      storage.save(createTestWaveform("wave2"));

      expect(storage.count).toBe(2);
      storage.clear();
      expect(storage.count).toBe(0);
    });

    test("has returns correct boolean", () => {
      const storage = new WaveformStorage();
      expect(storage.has("test")).toBe(false);

      storage.save(createTestWaveform("test"));
      expect(storage.has("test")).toBe(true);
    });
  });

  describe("Persistence", () => {
    test("loadWaveforms returns false for non-existent file", () => {
      const storage = new WaveformStorage();
      const result = loadWaveforms(storage, "./data/non-existent.json");
      expect(result).toBe(false);
    });

    test("persistWaveforms creates directory if needed", () => {
      const storage = new WaveformStorage();
      storage.save(createTestWaveform("test"));

      const testPath = "./data/subdir/test-waveforms.json";
      persistWaveforms(storage, testPath);

      expect(existsSync(testPath)).toBe(true);

      // Cleanup
      unlinkSync(testPath);
    });
  });
});
