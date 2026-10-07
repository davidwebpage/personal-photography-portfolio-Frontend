// 色调分档的单元测试。跑法：
//   node --test scripts/
// 用的是 Node 自带的测试运行器，不需要装任何东西。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyPixels,
  colorShares,
  pixelColor,
  rgbToHsl,
} from './colors.mjs';

/** 造一块像素：makePixels([[255,0,0], 110], [[0,0,255], 90]) = 110 个红 + 90 个蓝 */
function makePixels(...specs) {
  const out = [];
  for (const [[r, g, b], n] of specs) for (let i = 0; i < n; i++) out.push(r, g, b);
  return Uint8Array.from(out);
}

const RED = [255, 0, 0];
const BLUE = [0, 0, 255];
const GREEN = [0, 255, 0];
const GRAY = [128, 128, 128];
const BLACK = [0, 0, 0];

test('RGB 转 HSL：基本量对得上', () => {
  assert.deepEqual(rgbToHsl(255, 0, 0), { h: 0, l: 0.5, chroma: 1 });
  assert.deepEqual(rgbToHsl(0, 0, 255), { h: 240, l: 0.5, chroma: 1 });
  // 灰色没有色相，chroma 为 0
  const gray = rgbToHsl(128, 128, 128);
  assert.equal(gray.chroma, 0);
  assert.equal(gray.h, 0);
});

test('无彩色像素返回 null（调用方跳过，不进分母）', () => {
  assert.equal(pixelColor(128, 128, 128), null); // 中灰
  assert.equal(pixelColor(0, 0, 0), null); // 全黑（明度太低）
  assert.equal(pixelColor(255, 255, 255), null); // 全白（明度太高）
  assert.equal(pixelColor(193, 196, 197), null); // 带一丝青的浅灰
});

test('彩度高低是判无彩色的关键，深色也照样算有颜色', () => {
  // 藏青 #2F3550：又暗又灰，但它确实是蓝的，不能当灰色扔掉
  assert.equal(pixelColor(47, 53, 80), '蓝');
  // 灰褐 #848276 和深褐 #514D42：肉眼就是灰的，该跳过
  assert.equal(pixelColor(132, 130, 118), null);
  assert.equal(pixelColor(81, 77, 66), null);
});

test('纯色照片只挂一个档', () => {
  assert.deepEqual(classifyPixels(makePixels([RED, 100])), ['红']);
  assert.deepEqual(classifyPixels(makePixels([GREEN, 100])), ['绿']);
});

test('刚好差 10 个百分点 → 挂两个（边界要含进去）', () => {
  // 110 : 90 = 55% : 45%，差正好 10，必须算「在内」
  const picks = classifyPixels(makePixels([RED, 110], [BLUE, 90]));
  assert.deepEqual(picks, ['红', '蓝']);
});

test('差 11 个百分点 → 只挂头名', () => {
  const picks = classifyPixels(makePixels([RED, 111], [BLUE, 89]));
  assert.deepEqual(picks, ['红']);
});

test('差距悬殊时不会被第二三名拖进来', () => {
  const picks = classifyPixels(makePixels([GREEN, 890], [RED, 90], [BLUE, 20]));
  assert.deepEqual(picks, ['绿']);
});

test('无彩色像素被跳过，不进分母，不抬高有彩色像素的名次', () => {
  // 60% 灰 + 25% 红 + 15% 蓝：灰被跳过，红蓝按 25:15 算，差 25 个百分点 → 只挂红
  const picks = classifyPixels(makePixels([GRAY, 600], [RED, 250], [BLUE, 150]));
  assert.deepEqual(picks, ['红']);
});

test('整张都是无彩色 → 打不出任何档（不参与色调筛选）', () => {
  assert.deepEqual(classifyPixels(makePixels([GRAY, 100])), []);
  assert.deepEqual(classifyPixels(makePixels([GRAY, 50], [BLACK, 50])), []);
});

test('并列时按固定顺序排，同一张图每次结果一致', () => {
  const shares = colorShares(makePixels([GREEN, 50], [BLUE, 50]));
  assert.deepEqual(shares.map((s) => s.color), ['绿', '蓝']);
});

test('达古冰川背影那张的真实调色板 → 蓝（无彩色像素被跳过，蓝是唯一有彩色的）', () => {
  // 数据来自储卫民那个工具导出的 palette.json，8 个色块及其面积权重。
  // 老算法会丢掉 73% 的灰色像素，然后在剩下的里面挑出「青色」——
  // 而青色是靠 0.9 度的分界线赢的（色相 199.05°，分界线在 200°）。
  // 现在无彩色像素直接跳过，剩下的有彩色像素里蓝（#2F3550 藏青 + #2B4F8A 蓝）
  // 占多数，归为蓝。
  const picks = classifyPixels(
    makePixels(
      [[193, 196, 197], 431], // #C1C4C5 浅灰（跳过）
      [[132, 130, 118], 136], // #848276 灰褐（跳过）
      [[81, 77, 66], 100], // #514D42 深褐（跳过）
      [[47, 53, 80], 84], // #2F3550 藏青 → 蓝
      [[43, 79, 138], 75], // #2B4F8A 蓝
      [[5, 123, 178], 69], // #057BB2 亮青蓝 → 蓝
      [[32, 35, 36], 67], // #202324 近黑（跳过）
      [[176, 229, 63], 38], // #B0E53F 亮黄绿 → 绿
    ),
  );
  assert.deepEqual(picks, ['蓝']);
});

test('空输入不炸', () => {
  assert.deepEqual(colorShares(Uint8Array.from([])), []);
  assert.deepEqual(classifyPixels(Uint8Array.from([])), []);
});
