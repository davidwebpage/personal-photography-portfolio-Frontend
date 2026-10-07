#!/usr/bin/env node
// 真实照片处理管线：把母版大图批量转成网页用的多尺寸 webp，并更新 photos.json
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
//
// 只生成 webp，不生成 jpg 副本（见记忆 photo-pipeline-no-jpg）。
import { readdir, writeFile, stat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { processPhoto } from './lib/process-photo.mjs';

const ROOT = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const MASTERS = path.join(ROOT, '_masters');
const DATA = path.join(ROOT, 'src/data/photos.json');

const EXTS = new Set(['.jpg', '.jpeg', '.png', '.tif', '.tiff', '.webp']);

// 已存在的手工字段（标题/地点/年份）在重新生成时保留，不会被覆盖
let existing = [];
try {
  existing = JSON.parse(await readFile(DATA, 'utf8'));
} catch { /* 第一次运行，没有旧文件 */ }
const keep = new Map(existing.map((p) => [`${p.series}/${p.id}`, p]));

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
  const old = keep.get(`${series}/${id}`) ?? {};
  const rec = await processPhoto(file, series, old);
  photos.push(rec);
  console.log(`✓ ${series}/${id}`);
}

photos.sort((a, b) => (a.series + a.id).localeCompare(b.series + b.id));
await writeFile(DATA, JSON.stringify(photos, null, 2) + '\n', 'utf8');
console.log(`\n完成：${photos.length} 张照片 → public/photos/，photos.json 已更新`);
console.log('提示：照片过百后建议把 public/photos 迁到对象存储（腾讯云 COS / 阿里 OSS），仓库里只留清单。');
