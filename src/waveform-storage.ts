/**
 * Waveform Storage Module
 * Feature: dg-lab-sse-tool
 * 
 * Manages waveform persistence:
 * - Save, get, list, delete waveforms
 * - Persist to JSON file
 * - Load from file on startup
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";
import type { ParsedWaveform, WaveformMetadata, WaveformSection } from "./waveform-parser";

// Storage format for waveforms
export interface StoredWaveform {
  name: string;
  metadata: WaveformMetadata;
  sections: WaveformSection[];
  rawData: string;
  hexWaveforms: string[];
  createdAt: string; // ISO 8601
}

export interface WaveformStorageData {
  version: 1;
  waveforms: StoredWaveform[];
}

/**
 * Waveform Storage Manager
 */
export class WaveformStorage {
  private waveforms: Map<string, ParsedWaveform> = new Map();

  /**
   * Save a waveform (overwrites if name exists)
   */
  save(waveform: ParsedWaveform): void {
    this.waveforms.set(waveform.name, waveform);
  }

  /**
   * Get a waveform by name
   */
  get(name: string): ParsedWaveform | null {
    return this.waveforms.get(name) || null;
  }

  /**
   * List all waveforms
   */
  list(): ParsedWaveform[] {
    return Array.from(this.waveforms.values());
  }

  /**
   * Delete a waveform by name
   */
  delete(name: string): boolean {
    return this.waveforms.delete(name);
  }

  /**
   * Get waveform count
   */
  get count(): number {
    return this.waveforms.size;
  }

  /**
   * Check if waveform exists
   */
  has(name: string): boolean {
    return this.waveforms.has(name);
  }

  /**
   * Clear all waveforms
   */
  clear(): void {
    this.waveforms.clear();
  }

  /**
   * Convert to storage data format
   */
  toStorageData(): WaveformStorageData {
    const waveforms: StoredWaveform[] = [];

    for (const waveform of this.waveforms.values()) {
      waveforms.push({
        name: waveform.name,
        metadata: waveform.metadata,
        sections: waveform.sections,
        rawData: waveform.rawData,
        hexWaveforms: waveform.hexWaveforms,
        createdAt: waveform.createdAt.toISOString(),
      });
    }

    return { version: 1, waveforms };
  }

  /**
   * Load from storage data format
   */
  fromStorageData(data: WaveformStorageData): void {
    this.waveforms.clear();

    for (const stored of data.waveforms) {
      const waveform: ParsedWaveform = {
        name: stored.name,
        metadata: stored.metadata,
        sections: stored.sections,
        rawData: stored.rawData,
        hexWaveforms: stored.hexWaveforms,
        createdAt: new Date(stored.createdAt),
      };
      this.waveforms.set(waveform.name, waveform);
    }
  }
}

/**
 * Persist waveforms to disk
 */
export function persistWaveforms(
  storage: WaveformStorage,
  filePath: string = "./data/waveforms.json"
): void {
  const data = storage.toStorageData();
  const json = JSON.stringify(data, null, 2);

  // Ensure directory exists
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(filePath, json, "utf8");
}

/**
 * Load waveforms from disk
 */
export function loadWaveforms(
  storage: WaveformStorage,
  filePath: string = "./data/waveforms.json"
): boolean {
  if (!existsSync(filePath)) {
    return false;
  }

  try {
    const json = readFileSync(filePath, "utf8");
    const data = JSON.parse(json) as WaveformStorageData;

    if (data.version !== 1) {
      console.warn(`Unknown waveform storage version: ${data.version}`);
      return false;
    }

    storage.fromStorageData(data);
    return true;
  } catch (error) {
    console.error("Failed to load waveforms:", error);
    return false;
  }
}
