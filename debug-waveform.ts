/**
 * Debug script to analyze waveform generation
 * 
 * 核心概念：
 * - 每个形状点 = 100ms 的输出强度（4 个 25ms 采样）
 * - 脉冲元 = 所有形状点组成的一个完整波形周期
 * - 小节 = 脉冲元循环重复播放，直到小节时长结束
 * - 脉冲元会完整播放，即使超过设定的小节时长
 * 
 * 频率模式：
 * - 模式 1：固定频率
 * - 模式 2：整个小节内频率渐变
 * - 模式 3：每个脉冲元内频率渐变，然后重置
 * - 模式 4：脉冲元内频率固定，脉冲元之间渐变
 * 
 * 锚点：仅用于 APP 编辑器 UI，不影响波形播放
 */

import { parseWaveform, getOutputValue, getFrequencyFromIndex } from "./src/waveform-parser";

// User-provided correct waveform
const correctWaveform = "Dungeonlab+pulse:0,1,2=53,0,36,3,1/1.43-1,50.71-0,100.00-1,50.31-0,0.62-1,20.50-0,40.37-0,60.25-0,80.12-0,100.00-1+section+0,83,23,2,1/100.00-1,31.07-1+section+0,20,8,1,0/0.00-1,100.00-1";

console.log("=== 波形解析测试 ===\n");

const parsed = parseWaveform(correctWaveform, "correct-wave");

// 分析每个小节
for (let i = 0; i < parsed.sections.length; i++) {
  const section = parsed.sections[i]!;
  console.log(`\n=== 小节 ${i + 1} ===`);
  console.log(`  形状点数量: ${section.shape.length}`);
  console.log(`  小节设定时长: ${section.duration} x 100ms = ${section.duration / 10}s`);
  console.log(`  脉冲元时长: ${section.shape.length} x 100ms = ${section.shape.length / 10}s`);
  
  const pulseElementCount = Math.ceil(section.duration / section.shape.length);
  const actualDuration = pulseElementCount * section.shape.length;
  console.log(`  脉冲元循环次数: ${pulseElementCount}`);
  console.log(`  实际播放时长: ${actualDuration} x 100ms = ${actualDuration / 10}s`);
  
  const freqModeNames = ['', '固定', '节内渐变', '元内渐变', '元间渐变'];
  console.log(`  频率模式: ${section.frequencyMode} (${freqModeNames[section.frequencyMode]})`);
  console.log(`  起始频率: ${section.startFrequency} Hz -> 输出值: ${getOutputValue(section.startFrequency)}`);
  console.log(`  结束频率: ${section.endFrequency} Hz -> 输出值: ${getOutputValue(section.endFrequency)}`);
  
  console.log(`\n  形状点强度值:`);
  section.shape.forEach((p, idx) => {
    console.log(`    点 ${idx + 1}: 强度=${p.strength.toFixed(2)}, 锚点=${p.isAnchor ? '是' : '否'}`);
  });
}

console.log("\n\n=== 生成的 HEX 波形 ===");
console.log(`总共 ${parsed.hexWaveforms.length} 个 HEX 包（每个 100ms）\n`);

// 显示前几个 HEX 包
const showCount = Math.min(20, parsed.hexWaveforms.length);
for (let i = 0; i < showCount; i++) {
  const hex = parsed.hexWaveforms[i]!;
  const freqs = [
    parseInt(hex.substring(0, 2), 16),
    parseInt(hex.substring(2, 4), 16),
    parseInt(hex.substring(4, 6), 16),
    parseInt(hex.substring(6, 8), 16),
  ];
  const strengths = [
    parseInt(hex.substring(8, 10), 16),
    parseInt(hex.substring(10, 12), 16),
    parseInt(hex.substring(12, 14), 16),
    parseInt(hex.substring(14, 16), 16),
  ];
  console.log(`  ${i + 1}. HEX: ${hex}`);
  console.log(`     频率: [${freqs.join(', ')}], 强度: [${strengths.join(', ')}]`);
}

if (parsed.hexWaveforms.length > showCount) {
  console.log(`  ... 还有 ${parsed.hexWaveforms.length - showCount} 个包`);
}

// 验证小节 1 的第一个脉冲元
console.log("\n\n=== 验证小节 1 第一个脉冲元 ===");
const section1 = parsed.sections[0]!;
console.log("预期：每个形状点生成一个 HEX 包，强度值相同（4 个 25ms 采样）");
console.log("");

for (let shapeIdx = 0; shapeIdx < section1.shape.length; shapeIdx++) {
  const expectedStrength = Math.round(section1.shape[shapeIdx]!.strength);
  const hex = parsed.hexWaveforms[shapeIdx]!;
  const actualStrengths = [
    parseInt(hex.substring(8, 10), 16),
    parseInt(hex.substring(10, 12), 16),
    parseInt(hex.substring(12, 14), 16),
    parseInt(hex.substring(14, 16), 16),
  ];
  
  const match = actualStrengths.every(s => s === expectedStrength);
  console.log(`  形状点 ${shapeIdx + 1}: 预期强度=${expectedStrength}, 实际=[${actualStrengths.join(',')}] ${match ? '✓' : '✗'}`);
}
