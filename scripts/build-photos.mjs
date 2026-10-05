#!/usr/bin/env node
// 真实照片处理管线：把母版大图批量转成网页用的多尺寸多格式派生图，并更新 photos.json
//
// 用法：
//   1. 把整理好的照片按系列放进 _masters/<系列slug>/ 目录
//      例：_masters/mountains/DSC_1234.jpg   （jpg / png / tiff / webp 均可）
//   2. 运行  npm run photos
//   3. 派生图生成到 public/photos/<系列slug>/，src/data/photos.json 自动更新
//
// 约定：
//   - 父目录名 = 系列 slug，必须和 src/data/series.json 里的 slug 一致
//   - 文件名 = 照片 id，同一系列内不要重名
//   - 标题/地点等文字信息在生成后补进 photos.json，重新生成时保留（不会被覆盖）
import sharp from 'sharp';
import { readdir, mkdir, writeFile, stat, readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);

const ROOT = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const MASTERS = path.join(ROOT, '_masters');
const OUT = path.join(ROOT, 'public/photos');
const DATA = path.join(ROOT, 'src/data/photos.json');

const EDGES = [800, 1600, 2560]; // 按「最长边」分档：横图竖图统一标准
const EXTS = new Set(['.jpg', '.jpeg', '.png', '.tif', '.tiff', '.webp']);

// 已存在的手工字段（标题/地点/年份）在重新生成时保留，不会被覆盖
let existing = [];
try {
  existing = JSON.parse(await readFile(DATA, 'utf8'));
} catch { /* 第一次运行，没有旧文件 */ }
const keep = new Map(existing.map((p) => [`${p.series}/${p.id}`, p]));

// 有些相机的 EXIF 型号不好读，这里换成更直观的名字
const CAMERA_ALIASES = {
  'DJI FC8482': 'DJI mini4pro',
  'Panasonic DC-S1M2ES': 'Panasonic DC-S1M2E', // 去掉后缀，只留机身名
};

// 这些机器传感器远小于全画幅，实际焦段（如 6.7mm）看不出视角，改用等效焦距（24mm）
const EQUIV_FOCAL_MAKES = new Set(['DJI']);

// 解析母版图 EXIF 拍摄参数（供灯箱显示）。exiftool 不可用或无 EXIF 时返回 null，灯箱会隐藏面板
async function readExif(file) {
  try {
    const { stdout } = await execFileAsync('exiftool', [
      '-json', '-q', '-Make', '-Model', '-FocalLength', '-FocalLengthIn35mmFormat',
      '-ExposureTime', '-Aperture', '-ISO', '-DateTimeOriginal', file,
    ]);
    const [row] = JSON.parse(stdout);
    if (!row) return null;
    const camera = [row.Make, row.Model].filter(Boolean).join(' ');
    // 焦段四舍五入到整数（如 6.8 mm → 7mm）；无人机改用等效焦距
    const raw = EQUIV_FOCAL_MAKES.has(row.Make)
      ? (row.FocalLengthIn35mmFormat ?? row.FocalLength)
      : row.FocalLength;
    const focal = parseFloat(raw);
    return {
      camera: CAMERA_ALIASES[camera] ?? camera,
      focal: Number.isFinite(focal) ? `${Math.round(focal)}mm` : '',
      aperture: row.Aperture ? `f/${row.Aperture}` : '',
      shutter: row.ExposureTime ? `${row.ExposureTime}s` : '',
      iso: row.ISO ? `ISO ${row.ISO}` : '',
      taken: row.DateTimeOriginal ? formatTaken(row.DateTimeOriginal) : '',
    };
  } catch {
    return null;
  }
}

function formatTaken(s) {
  // "2026:08:04 20:29:51" → "2026-08-04"（只到日）
  return s.replace(/(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3').slice(0, 10);
}

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (EXTS.has(path.extname(entry.name).toLowerCase())) yield full;
  }
}

try {
  await stat(MASTERS);
} catch {
  console.error(`未找到 _masters/ 目录。请先创建 _masters/<系列slug>/ 并放入照片母版。`);
  process.exit(1);
}

const photos = [];
for await (const file of walk(MASTERS)) {
  const series = path.basename(path.dirname(file));
  const id = path.basename(file, path.extname(file));
  const outDir = path.join(OUT, series);
  await mkdir(outDir, { recursive: true });

  const base = sharp(file).rotate(); // 按 EXIF 方向自动转正
  const meta = await base.metadata();
  // EXIF 方向 5-8 表示旋转了 90°/270°，实际显示时长宽互换，
  // metadata() 返回的是存储时的原始尺寸，这里要换算，否则竖图会被当成横图
  const rotated = (meta.orientation ?? 1) >= 5;
  const srcW = rotated ? meta.height : meta.width;
  const srcH = rotated ? meta.width : meta.height;

  // 按「最长边」分档：横图缩宽度、竖图缩高度，保证长边一致
  const longest = Math.max(srcW, srcH);
  const targets = EDGES.filter((e) => e <= longest); // 不放大小图
  if (targets.length === 0) targets.push(longest); // 比最小档还小，按原尺寸出一档

  const srcset = [];
  for (const edge of targets) {
    // 按长边缩放：横图缩宽度、竖图缩高度
    const resized = srcW >= srcH
      ? base.clone().resize({ width: edge })
      : base.clone().resize({ height: edge });

    // 实际输出尺寸（竖图缩的是高度，宽度会小于 edge）
    const outW = Math.round((srcW * edge) / longest);
    // withMetadata 保留 EXIF（下载/查看时仍带拍摄参数）；orientation 固定为 1，
    // 因为已用 .rotate() 转正，避免浏览器二次旋转
    await resized.withMetadata({ orientation: 1 }).webp({ quality: 82 }).toFile(path.join(outDir, `${id}-${edge}.webp`));
    await resized.withMetadata({ orientation: 1 }).jpeg({ quality: 85, mozjpeg: true }).toFile(path.join(outDir, `${id}-${edge}.jpg`));
    // srcset 的 w 描述符必须是文件真实宽度，否则浏览器选档会出错
    srcset.push(`/photos/${series}/${id}-${edge}.webp ${outW}w`);
  }

  // 主尺寸用 1600 档，或最大的可用档；宽高按长边比例换算
  const mainEdge = targets.includes(1600) ? 1600 : targets[targets.length - 1];
  const mainW = Math.round((srcW * mainEdge) / longest);
  const mainH = Math.round((srcH * mainEdge) / longest);
  const old = keep.get(`${series}/${id}`) ?? {};
  // exif：优先从母版新解析；若母版无 EXIF（exiftool 返回 null）则保留旧手工值
  const exif = (await readExif(file)) ?? old.exif ?? null;
  photos.push({
    id,
    series,
    title: old.title ?? '',
    src: `/photos/${series}/${id}-${mainEdge}.webp`,
    srcset: srcset.join(', '),
    width: mainW,
    height: mainH,
    year: old.year ?? null,
    location: old.location ?? '',
    exif,
  });
  console.log(`✓ ${series}/${id}`);
}

photos.sort((a, b) => (a.series + a.id).localeCompare(b.series + b.id));
await writeFile(DATA, JSON.stringify(photos, null, 2) + '\n', 'utf8');
console.log(`\n完成：${photos.length} 张照片 → public/photos/，photos.json 已更新`);
console.log('提示：照片过百后建议把 public/photos 迁到对象存储（腾讯云 COS / 阿里 OSS），仓库里只留清单。');
