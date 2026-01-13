/**
 * Debug script to analyze waveform generation
 */

import { parseWaveform, getOutputValue, getFrequencyFromIndex } from "./src/waveform-parser";

// User-provided correct waveform
const correctWaveform = "Dungeonlab+pulse:0,1,2=53,0,36,3,1/1.43-1,50.71-0,100.00-1,50.31-0,0.62-1,20.50-0,40.37-0,60.25-0,80.12-0,100.00-1+section+0,83,23,2,1/100.00-1,31.07-1+section+0,20,8,1,0/0.00-1,100.00-1";

console.log("=== 波形解析测试 ===\n");

const parsed = parseWaveform(correctWaveform, "correct-wave");

// 分析小节 1
const section1 = parsed.sections[0]!;
console.log("=== 小节 1 详细分析 ===");
console.log(`形状点数量: ${section1.shape.length}`);
console.log(`小节设定时长: ${section1.duration} x 100ms`);
console.log(`脉冲元时长: ${section1.shape.length} x 100ms`);

const pulseElementCount = Math.ceil(section1.duration / section1.shape.length);
console.log(`脉冲元循环次数: ${pulseElementCount}`);
console.log("");

// 检查脉冲元之间的过渡
console.log("=== 检查脉冲元之间的过渡 ===");
console.log("（查看每个脉冲元的最后一个包和下一个脉冲元的第一个包）\n");

for (let elem = 0; elem < pulseElementCount; elem++) {
  const startIdx = elem * section1.shape.length;
  const endIdx = startIdx + section1.shape.length - 1;
  
  const lastHex = parsed.hexWaveforms[endIdx];
  const nextHex = parsed.hexWaveforms[endIdx + 1];
  
  if (lastHex) {
    const lastStrengths = [
      parseInt(lastHex.substring(8, 10), 16),
      parseInt(lastHex.substring(10, 12), 16),
      parseInt(lastHex.substring(12, 14), 16),
      parseInt(lastHex.substring(14, 16), 16),
    ];
    console.log(`脉冲元 ${elem + 1} 最后一个包 (${endIdx + 1}): 强度=[${lastStrengths.join(',')}]`);
  }
  
  if (nextHex && elem < pulseElementCount - 1) {
    const nextStrengths = [
      parseInt(nextHex.substring(8, 10), 16),
      parseInt(nextHex.substring(10, 12), 16),
      parseInt(nextHex.substring(12, 14), 16),
      parseInt(nextHex.substring(14, 16), 16),
    ];
    console.log(`脉冲元 ${elem + 2} 第一个包 (${endIdx + 2}): 强度=[${nextStrengths.join(',')}]`);
    console.log("");
  }
}

// 检查是否有强度为 0 的包
console.log("\n=== 检查是否有强度为 0 的包 ===");
let zeroCount = 0;
for (let i = 0; i < parsed.hexWaveforms.length; i++) {
  const hex = parsed.hexWaveforms[i]!;
  const strengths = [
    parseInt(hex.substring(8, 10), 16),
    parseInt(hex.substring(10, 12), 16),
    parseInt(hex.substring(12, 14), 16),
    parseInt(hex.substring(14, 16), 16),
  ];
  
  if (strengths.every(s => s === 0)) {
    console.log(`  包 ${i + 1}: 全部强度为 0`);
    zeroCount++;
  }
}

if (zeroCount === 0) {
  console.log("  没有发现全部强度为 0 的包");
}

// 输出完整的 HEX 数组（用于对比）
console.log("\n\n=== 完整 HEX 数组（小节 1 的前 40 个包）===");
const section1HexCount = pulseElementCount * section1.shape.length;
for (let i = 0; i < Math.min(40, section1HexCount); i++) {
  const hex = parsed.hexWaveforms[i]!;
  const strengths = [
    parseInt(hex.substring(8, 10), 16),
    parseInt(hex.substring(10, 12), 16),
    parseInt(hex.substring(12, 14), 16),
    parseInt(hex.substring(14, 16), 16),
  ];
  const freqs = [
    parseInt(hex.substring(0, 2), 16),
    parseInt(hex.substring(2, 4), 16),
    parseInt(hex.substring(4, 6), 16),
    parseInt(hex.substring(6, 8), 16),
  ];
  
  const elemIdx = Math.floor(i / section1.shape.length);
  const shapeIdx = i % section1.shape.length;
  
  console.log(`  ${(i + 1).toString().padStart(2)}: 脉冲元${elemIdx + 1}-形状点${shapeIdx + 1} | 强度=[${strengths.map(s => s.toString().padStart(3)).join(',')}] | 频率=[${freqs.map(f => f.toString().padStart(3)).join(',')}]`);
}
