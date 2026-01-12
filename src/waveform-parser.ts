/**
 * Waveform Parser Module
 * Feature: dg-lab-sse-tool
 * 
 * Handles waveform data parsing for new text format (APP v2.0+):
 * - Format: Dungeonlab+pulse:header+section+section1+section+section2...
 * - Waveform data → 8-byte HEX format for device
 */

// Waveform metadata
export interface WaveformMetadata {
  startFrequencies: [number, number, number];
  endFrequencies: [number, number, number];
  durations: [number, number, number];
  frequencyModes: [number, number, number]; // 1=fixed, 2=section gradient, 3=element gradient, 4=inter-element gradient
  section2Enabled: boolean;
  section3Enabled: boolean;
  playbackSpeed: number;
}

// Waveform shape data point
export interface WaveformShapePoint {
  shapeType: number; // 0-4
  strength: number;  // 0-100
}

// Waveform section
export interface WaveformSection {
  index: number; // 0, 1, 2
  enabled: boolean;
  startFrequency: number;
  endFrequency: number;
  duration: number;
  frequencyMode: number;
  shape: WaveformShapePoint[];
}

// Complete parsed waveform
export interface ParsedWaveform {
  name: string;
  metadata: WaveformMetadata;
  sections: WaveformSection[];
  rawData: string;
  hexWaveforms: string[];
  createdAt: Date;
}

/**
 * Frequency conversion function
 * Converts raw frequency value (0-79+) to output value (10-240)
 * Reference: https://fang.blog.miri.site/archives/990/
 */
export function getOutputValue(x: number): number {
  // x -> fx conversion table
  const xToFx = [
    { xMin: 0, xMax: 40, k: 1, b: 10 },
    { xMin: 40, xMax: 55, k: 2, b: -30 },
    { xMin: 55, xMax: 59, k: 5, b: -195 },
    { xMin: 59, xMax: 69, k: 10, b: -490 },
    { xMin: 69, xMax: 75, k: 33, b: -2099 },
    { xMin: 75, xMax: 79, k: 50, b: -3350 },
    { xMin: 79, xMax: Infinity, k: 100, b: -7300 },
  ];

  // fx -> output conversion table
  const fxToOutput = [
    { xMin: 0, xMax: 100, k: 1, b: 0 },
    { xMin: 100, xMax: 660, k: 0.2, b: 80 },
    { xMin: 660, xMax: Infinity, k: 0.1, b: 140 },
  ];

  let fx = 10; // default
  for (const range of xToFx) {
    if (x >= range.xMin && x < range.xMax) {
      fx = range.k * x + range.b;
      break;
    }
  }

  let output = 10; // default
  for (const range of fxToOutput) {
    if (fx >= range.xMin && fx < range.xMax) {
      output = range.k * fx + range.b;
      break;
    }
  }

  // Clamp to valid range (10-240)
  return Math.max(10, Math.min(240, Math.round(output)));
}

/**
 * Validate hex waveform format (16 hex characters = 8 bytes)
 */
export function isValidHexWaveform(hex: string): boolean {
  return /^[0-9a-fA-F]{16}$/.test(hex);
}

/**
 * Parse new text format waveform data (APP v2.0+)
 * Format: Dungeonlab+pulse:header+section+section1+section+section2...
 * 
 * Example: Dungeonlab+pulse:0,1,8=0,29,8,1,1/0.00-1,16.67-0,...+section+0,20,8,1,1/...
 */
export function parseWaveform(data: string, name: string): ParsedWaveform {
  // Validate format
  if (!data.startsWith("Dungeonlab+pulse:") && !data.includes("+section+")) {
    throw new Error("Invalid waveform format: must be Dungeonlab+pulse: text format");
  }

  // Remove prefix
  const cleanData = data.replace(/^Dungeonlab\+pulse:/i, "");
  
  // Split by +section+ to get sections
  const sectionParts = cleanData.split("+section+");
  
  if (sectionParts.length === 0) {
    throw new Error("Invalid waveform data: no sections found");
  }

  const sections: WaveformSection[] = [];
  const startFrequencies: [number, number, number] = [0, 0, 0];
  const endFrequencies: [number, number, number] = [0, 0, 0];
  const durations: [number, number, number] = [0, 0, 0];
  const frequencyModes: [number, number, number] = [1, 1, 1];

  for (let i = 0; i < sectionParts.length && i < 3; i++) {
    const sectionData = sectionParts[i];
    if (!sectionData) continue;
    
    // Split by '/' to separate header from shape data
    const slashIdx = sectionData.indexOf("/");
    if (slashIdx === -1) continue;

    const headerPart = sectionData.substring(0, slashIdx);
    const shapePart = sectionData.substring(slashIdx + 1);

    // Parse header: startFreq,endFreq,duration,mode,enabled (or with = for first section)
    let headerValues: string[];
    if (headerPart.includes("=")) {
      // First section has global header: globalParams=sectionParams
      const parts = headerPart.split("=");
      const sectionHeader = parts[1] || "";
      headerValues = sectionHeader.split(",");
    } else {
      headerValues = headerPart.split(",");
    }

    const startFreq = Number(headerValues[0]) || 0;
    const endFreq = Number(headerValues[1]) || 0;
    const duration = Number(headerValues[2]) || 8;
    const mode = Number(headerValues[3]) || 1;
    const enabled = headerValues[4] !== "0";

    startFrequencies[i] = startFreq;
    endFrequencies[i] = endFreq;
    durations[i] = duration;
    frequencyModes[i] = mode;

    // Parse shape data: strength-type,strength-type,...
    const shapePoints: WaveformShapePoint[] = [];
    const shapeItems = shapePart.split(",");
    
    for (const item of shapeItems) {
      const [strengthStr, typeStr] = item.split("-");
      shapePoints.push({
        strength: Math.round(Number(strengthStr) || 0),
        shapeType: Number(typeStr) || 0,
      });
    }

    if (enabled || i === 0) {
      sections.push({
        index: i,
        enabled: true,
        startFrequency: startFreq,
        endFrequency: endFreq,
        duration,
        frequencyMode: mode,
        shape: shapePoints,
      });
    }
  }

  if (sections.length === 0) {
    throw new Error("Invalid waveform data: no valid sections found");
  }

  const metadata: WaveformMetadata = {
    startFrequencies,
    endFrequencies,
    durations,
    frequencyModes,
    section2Enabled: sections.length > 1,
    section3Enabled: sections.length > 2,
    playbackSpeed: 1,
  };

  // Generate hex waveforms from sections
  const hexWaveforms = convertToHexWaveforms(sections);

  return {
    name,
    metadata,
    sections,
    rawData: data,
    hexWaveforms,
    createdAt: new Date(),
  };
}

/**
 * Convert sections to hex waveforms for device
 */
function convertToHexWaveforms(sections: WaveformSection[]): string[] {
  const hexWaveforms: string[] = [];

  for (const section of sections) {
    if (section.shape.length === 0) continue;

    const duration = Math.max(section.shape.length, section.duration);
    const startFreq = section.startFrequency;
    const endFreq = section.endFrequency;
    const freqMode = section.frequencyMode;

    const waveformFreq: number[] = [];
    const waveformStrength: number[] = [];

    // Generate 4 samples per 100ms
    for (let m = 0; m < duration; m++) {
      for (let n = 0; n < 4; n++) {
        // Calculate shape index
        const shapeIdx = Math.floor((m * section.shape.length) / duration);
        const nextShapeIdx = Math.min(shapeIdx + 1, section.shape.length - 1);

        const currentPoint = section.shape[shapeIdx];
        const nextPoint = section.shape[nextShapeIdx];
        
        // Interpolation factor
        const unitsPerShape = Math.round(duration / section.shape.length) || 1;
        const posInUnit = m % unitsPerShape;
        const interpFactor = (posInUnit / unitsPerShape) + (n / (4 * unitsPerShape));

        // Interpolate strength (scale to 0-100)
        const startStrength = currentPoint?.strength || 0;
        const endStrength = nextPoint?.strength || startStrength;
        const strength = Math.round(startStrength + (endStrength - startStrength) * interpFactor);
        waveformStrength.push(Math.max(0, Math.min(100, strength)));

        // Calculate frequency based on mode
        let freq: number;
        const totalProgress = m / duration + n / (4 * duration);
        const shapeProgress = shapeIdx / section.shape.length;

        switch (freqMode) {
          case 1: // Fixed
            freq = getOutputValue(startFreq);
            break;
          case 2: // Section gradient
            freq = getOutputValue(startFreq + (endFreq - startFreq) * totalProgress);
            break;
          case 3: // Element gradient
            freq = getOutputValue(startFreq + (endFreq - startFreq) * interpFactor);
            break;
          case 4: // Inter-element gradient
            freq = getOutputValue(startFreq + (endFreq - startFreq) * shapeProgress);
            break;
          default:
            freq = getOutputValue(startFreq);
        }
        waveformFreq.push(Math.round(freq));
      }
    }

    // Combine into 8-byte HEX strings
    for (let i = 0; i < waveformFreq.length; i += 4) {
      const freqHex = [
        waveformFreq[i] ?? 10,
        waveformFreq[i + 1] ?? 10,
        waveformFreq[i + 2] ?? 10,
        waveformFreq[i + 3] ?? 10,
      ]
        .map((v) => v.toString(16).padStart(2, "0"))
        .join("");

      const strengthHex = [
        waveformStrength[i] ?? 0,
        waveformStrength[i + 1] ?? 0,
        waveformStrength[i + 2] ?? 0,
        waveformStrength[i + 3] ?? 0,
      ]
        .map((v) => v.toString(16).padStart(2, "0"))
        .join("");

      hexWaveforms.push(freqHex + strengthHex);
    }
  }

  return hexWaveforms;
}

/**
 * Encode waveform back to text format (for testing)
 */
export function encodeWaveform(waveform: ParsedWaveform): string {
  const sectionStrings: string[] = [];

  for (let i = 0; i < waveform.sections.length; i++) {
    const section = waveform.sections[i];
    if (!section) continue;

    // Build header
    const header = [
      section.startFrequency,
      section.endFrequency,
      section.duration,
      section.frequencyMode,
      section.enabled ? 1 : 0,
    ].join(",");

    // Build shape data
    const shapeData = section.shape
      .map((p) => `${p.strength.toFixed(2)}-${p.shapeType}`)
      .join(",");

    if (i === 0) {
      // First section has global header prefix
      sectionStrings.push(`0,1,8=${header}/${shapeData}`);
    } else {
      sectionStrings.push(`${header}/${shapeData}`);
    }
  }

  return `Dungeonlab+pulse:${sectionStrings.join("+section+")}`;
}
