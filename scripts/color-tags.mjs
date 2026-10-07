#!/usr/bin/env node
// 给 photos.json 里的每张照片自动打「色调」标签，供单幅作品页按色调筛选
//
// 用法：
//   npm run colors             只给还没打过标的照片打标，已有的原样保留
//   npm run colors -- --force  全部重算（改了阈值之后用这个）
//   npm run colors -- --dry    只打印结果表格，不写文件（调阈值时用这个）
//
// 色调是「猜」的，会猜错——尤其是头名和第二名咬得紧的那些。看到不对的，
// 直接改 photos.json 里的 colors 字段即可；下次跑 npm run colors（不加
// --force）不会覆盖你的修改。规则和阈值见 scripts/lib/colors.mjs 顶部。
import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHROMA_MIN, TOP2_GAP, colorShares, pickColors } from './lib/colors.mjs';

const ROOT = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const DATA = path.join(ROOT, 'src/data/photos.json');

const args = new Set(process.argv.slice(2));
const FORCE = args.has('--force');
const DRY = args.has('--dry');

// 分析用尺寸：缩到最长边 80px。再大不会改变结论，只是更慢。
const SAMPLE = 80;

/** 按显示宽度补空格（中文算两格），让终端里的表格对齐 */
function pad(s, width) {
  let w = 0;
  for (const ch of s) w += ch.codePointAt(0) > 0x2e80 ? 2 : 1;
  return s + ' '.repeat(Math.max(0, width - w));
}

/**
 * 取用来分析的文件：srcset 里最小的一档，够用且最快。
 * 这里不能硬编码 -800：母版最长边不足 800px 时，build-photos 只出一档
 * 原尺寸，文件名里没有 -800，写死就会读不到文件。
 */
function sampleFile(p) {
  // srcset 形如 "/photos/city/升庵桂湖 (3)-800.webp 533w, ..."。
  // 文件名可能含空格（如 "升庵桂湖 (3)"），所以不能按空格切，要按「最后一个空格」
  // 切：前面是路径，后面是 w 描述符。用 lastIndexOf 找最后一个空格。
  const first = (p.srcset || p.src).split(',')[0].trim();
  const sp = first.lastIndexOf(' ');
  const file = sp === -1 ? first : first.slice(0, sp);
  return path.join(ROOT, 'public', file.replace(/^\//, ''));
}

/** 读图 → 各档位面积占比（从大到小） */
async function analyze(file) {
  const { data, info } = await sharp(file)
    .rotate()
    .resize({ width: SAMPLE, height: SAMPLE, fit: 'inside' })
    .removeAlpha()
    .toColourspace('srgb') // WebP 可能是 Display-P3，不转色彩空间色相会偏
    .raw()
    .toBuffer({ resolveWithObject: true });
  return colorShares(data, info.channels);
}

const photos = JSON.parse(await readFile(DATA, 'utf8'));
let filled = 0;
let kept = 0;
let failed = 0;
let wouldChange = 0; // 仅 --dry 用：这次重算会导致多少条标签变化

console.log(
  `阈值：差 ≤ ${TOP2_GAP} 个百分点挂第二色 · 彩度 < ${CHROMA_MIN} 或过暗过亮算无彩色（跳过）\n`,
);

for (const p of photos) {
  const existing = Array.isArray(p.colors) && p.colors.length > 0 ? p.colors : null;
  // --dry 是「调阈值用的预览」，已经有标签的也要重算、把数字打出来。
  // 否则改完阈值跑 --dry 只能看到一排「已有标签」，最该看的东西反而没有。
  if (existing && !FORCE && !DRY) {
    kept++;
    console.log(`${pad(p.id, 22)} ${pad(existing.join(' · '), 12)}（已有标签，未重算）`);
    continue;
  }

  let shares;
  try {
    shares = await analyze(sampleFile(p));
  } catch (err) {
    failed++;
    console.warn(`✗ ${pad(p.id, 22)} 读不到图：${err.message}`);
    continue;
  }

  const colors = pickColors(shares);

  const top = shares[0];
  const second = shares[1];
  const detail = shares.length
    ? `头名 ${top.color} ${(top.share * 100).toFixed(0)}%` +
      (second
        ? `，次名 ${second.color} ${(second.share * 100).toFixed(0)}%` +
          `（差 ${((top.share - second.share) * 100).toFixed(1)} 个百分点）`
        : '')
    : '（整张无彩色，不打标）';

  if (DRY) {
    // 预览时标出这条「和现在一样」还是「会被改动」，改阈值时一眼看出影响面。
    // 已经打过标的只提示变化，没标的算新增。
    const same = existing && existing.join(' ') === colors.join(' ');
    const mark = !existing
      ? '（新打标）'
      : same
        ? '（不变）'
        : `（会改：${existing.join(' · ')} → ${colors.join(' · ')}）`;
    if (!same) wouldChange++;
    console.log(`${pad(p.id, 22)} ${pad(colors.join(' · '), 12)} ${detail} ${mark}`);
  } else {
    p.colors = colors;
    filled++;
    console.log(`${pad(p.id, 22)} ${pad(colors.join(' · '), 12)} ${detail}`);
  }
}

if (DRY) {
  console.log(
    `\n--dry：只打印，没有写文件` +
      (failed ? `（${failed} 张读图失败）` : '') +
      (wouldChange
        ? `。按当前阈值重算，${wouldChange} 张会和现在不一样——确认无误后去掉 --dry 再跑一次，或加 --force 全部重算`
        : '。按当前阈值重算，所有照片都和现在一致'),
  );
} else {
  await writeFile(DATA, JSON.stringify(photos, null, 2) + '\n', 'utf8');
  console.log(
    `\n完成：${filled} 张写回标签，${kept} 张已有标签未重算` +
      (failed ? `，${failed} 张失败` : '') +
      ' → src/data/photos.json 已更新',
  );
}

// 提醒：色彩分析只可能「漏」，不会「多」。任何一张没打上标的照片，
// 在页面上点任何色调都会消失。所以宁可跑 --force 全部重来，也别留空的。
const missing = photos.filter((p) => !Array.isArray(p.colors) || !p.colors.length).length;
if (missing) {
  console.warn(`⚠ 还有 ${missing} 张没有色调标签，它们在按色调筛选时会完全消失。`);
}
