#!/usr/bin/env node
// 真实照片处理管线：把 _masters/ 里的母版大图转成网页用的多尺寸 webp，
// 并把结果「合并」进 src/data/photos.json。
//
// 为什么要合并、而不是重建整份清单：
//   母版图很大，平时不留在项目里（见 README「新增照片（精简流程）」）。
//   只在要新增或替换照片时，把用到的那几张放进 _masters/<系列slug>/，跑一次本脚本。
//   如果脚本按 _masters/ 重建整份清单，那些这次没放母版的老照片就会从网站消失。
//   所以这里改成：处理几张贴几张，原有记录一律保留，只有同名（同系列 + 同 id）的才更新。
//
// 用法：
//   1. 把要新增/替换的照片按系列放进 _masters/<系列slug>/（jpg / jpeg / png / tif / tiff / webp 均可）
//      例：_masters/mountains/DSC_1234.jpg
//   2. 运行  npm run photos
//   3. 派生图输出到 public/photos/<系列slug>/，photos.json 只增改对应的那几条
//   4. 处理完可以删掉 _masters/，网站不受影响
//
// 约定：
//   - 父目录名 = 系列 slug，要和 src/data/series.json 里的 slug 一致；
//     不在系列清单里的目录名会被当成「单图作品」类别（见 README）
//   - 文件名 = 照片 id，同一系列内不要重名
//   - 标题 / 地点 / 年份 / 色调等手工字段，在更新同名照片时会被保留
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

// 读现有清单：这是「合并」的基准，读不到就用空表（首次使用）。
// 文件存在但内容坏掉时直接报错退出，绝不用空表覆盖，避免把整份清单冲掉。
let existing = [];
try {
  existing = JSON.parse(await readFile(DATA, 'utf8'));
} catch (err) {
  if (err.code !== 'ENOENT') {
    console.error(`✗ 读不懂 ${path.relative(ROOT, DATA)}：${err.message}`);
    console.error('  为避免覆盖现有清单，已中止。');
    process.exit(1);
  }
}
if (!Array.isArray(existing)) {
  console.error('✗ photos.json 不是数组，已中止。');
  process.exit(1);
}
const keep = new Map(existing.map((p) => [`${p.series}/${p.id}`, p]));

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (EXTS.has(path.extname(entry.name).toLowerCase())) yield full;
  }
}

// _masters/ 现在是「临时工作区」：不存在就是没有新照片要处理，不算错误。
const masters = [];
try {
  await stat(MASTERS);
  for await (const file of walk(MASTERS)) masters.push(file);
} catch {
  console.log('提示：没有 _masters/ 目录，没有新照片要处理。');
  console.log('要新增照片时，把母版放进 _masters/<系列slug>/ 再跑一次。');
  process.exit(0);
}

if (masters.length === 0) {
  console.log('提示：_masters/ 是空的，没有新照片要处理。清单未改动。');
  process.exit(0);
}

// 处理 _masters/ 里的每一张，结果按「系列/id」收好。
const processed = new Map();
for (const file of masters) {
  const series = path.basename(path.dirname(file));
  const id = path.basename(file, path.extname(file));
  const old = keep.get(`${series}/${id}`) ?? {};
  const rec = await processPhoto(file, series, old);
  processed.set(`${series}/${id}`, rec);
  console.log(`✓ ${series}/${id}`);
}

// 合并：以现有清单为底，本次处理过的覆盖进去，其余原样保留。
const merged = new Map(keep);
for (const [key, rec] of processed) merged.set(key, rec);

let added = 0;
let updated = 0;
for (const key of processed.keys()) {
  if (keep.has(key)) updated++;
  else added++;
}
const kept = keep.size - updated;

const photos = [...merged.values()].sort((a, b) => (a.series + a.id).localeCompare(b.series + b.id));
await writeFile(DATA, JSON.stringify(photos, null, 2) + '\n', 'utf8');

console.log(`\n完成：新增 ${added} 张、更新 ${updated} 张，保留 ${kept} 张未动的旧记录`);
console.log(`清单共 ${photos.length} 张 → src/data/photos.json 已更新`);
console.log('下一步：npm run colors 给新照片打色调标签，再 npm run dev 预览。');
console.log('确认没问题后，_masters/ 可以删掉，网站不受影响。');
