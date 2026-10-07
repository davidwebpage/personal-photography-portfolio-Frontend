#!/usr/bin/env node
// 从「图片清单」Excel 驱动整条图片管线：读表 → 复制源图到 _masters/ → 生成 webp → 更新 photos.json / series.json
//
// 用法：
//   1. 在 图片清单模板.xlsx 里填好照片（两个工作表：图片清单 / 系列图）
//   2. 运行  npm run from-sheet
//   3. 派生图生成到 public/photos/<类别>/，photos.json 与 series.json 自动更新
//
// 工作表「图片清单」列（A~F）：类别 / 标题 / 省份 / 城市 / 添加时间 / 图片路径
// 工作表「系列图」列（A~F）：系列名称 / 图片序号 / 单幅标题(不显示) / 省份 / 城市 / 图片路径
//
// 只生成 webp，不生成 jpg 副本（见记忆 photo-pipeline-no-jpg）。
import ExcelJS from 'exceljs';
import { copyFile, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { processPhoto } from './lib/process-photo.mjs';

const ROOT = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const SHEET = path.join(ROOT, '图片清单模板.xlsx');
const MASTERS = path.join(ROOT, '_masters');
const DATA = path.join(ROOT, 'src/data/photos.json');
const SERIES_DATA = path.join(ROOT, 'src/data/series.json');

// 系列中文名 → 拼音 slug（网址用）。新增系列在这里补一行。
const SERIES_SLUGS = {
  '天路': 'tianlu',
  '逆光之下': 'niguangzhixia',
  '观众与"观"众': 'guanzhongyuguanzhong',
  '万般色彩见本真': 'wanbansecaijianbenzhen',
};

// 系列副标题/简介：Excel 里没有，先留占位，用户之后在 series.json 里改。
const SERIES_META = {
  '天路': { subtitle: '系列副标题待填', description: '系列简介待填。' },
  '逆光之下': { subtitle: '系列副标题待填', description: '系列简介待填。' },
  '观众与"观"众': { subtitle: '系列副标题待填', description: '系列简介待填。' },
  '万般色彩见本真': { subtitle: '系列副标题待填', description: '系列简介待填。' },
};

// 清理路径里可能残留的引号（Excel 里手填路径偶尔会带 ' 或 "）
function cleanPath(s) {
  return String(s ?? '').trim().replace(/^['"]|['"]$/g, '');
}

// 已存在的手工字段（标题/地点/年份/色调）在重新生成时保留
let existing = [];
try {
  existing = JSON.parse(await readFile(DATA, 'utf8'));
} catch { /* 第一次运行 */ }
const keep = new Map(existing.map((p) => [`${p.series}/${p.id}`, p]));

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(SHEET);

// ---------- 1. 单幅作品 ----------
const singleWs = wb.getWorksheet('图片清单');
const photos = [];
const singleRows = [];
for (const row of singleWs.getSheetValues().slice(1)) {
  if (!row) continue;
  const [ , category, title, province, city, , srcPath] = row;
  if (!category || String(category).trim() === '类别') continue;
  const src = cleanPath(srcPath);
  if (!src) continue;
  singleRows.push({ category: String(category).trim(), title, province, city, src });
}

// 复制源图到 _masters/<类别>/，再处理。文件名用源图 basename（保证 id 稳定、可追溯）。
for (const r of singleRows) {
  const id = path.basename(r.src, path.extname(r.src));
  const series = r.category;
  const dir = path.join(MASTERS, series);
  await mkdir(dir, { recursive: true });
  const dest = path.join(dir, path.basename(r.src));
  if (r.src !== dest) await copyFile(r.src, dest);

  const old = keep.get(`${series}/${id}`) ?? {};
  const rec = await processPhoto(dest, series, old);
  // 标题/地点来自 Excel（Excel 是唯一数据源，覆盖旧值）
  rec.title = r.title ? String(r.title).trim() : '';
  rec.location = [r.province, r.city].filter(Boolean).map(String).join(' ');
  photos.push(rec);
  console.log(`✓ 单幅 ${series}/${id}${rec.title ? `（${rec.title}）` : ''}`);
}

// ---------- 2. 系列作品 ----------
const seriesWs = wb.getWorksheet('系列图');
const seriesMap = new Map(); // slug → { meta, photos: [] }
for (const row of seriesWs.getSheetValues().slice(1)) {
  if (!row) continue;
  const [ , name, , singleTitle, province, city, srcPath] = row;
  if (!name || String(name).trim() === '系列名称') continue;
  const slug = SERIES_SLUGS[String(name).trim()];
  if (!slug) {
    console.warn(`⚠ 系列「${name}」没有对应的 slug，跳过（请在 build-from-sheet.mjs 的 SERIES_SLUGS 里补）`);
    continue;
  }
  const src = cleanPath(srcPath);
  if (!src) continue;
  if (!seriesMap.has(slug)) {
    seriesMap.set(slug, { name: String(name).trim(), meta: SERIES_META[String(name).trim()] ?? {}, photos: [] });
  }
  seriesMap.get(slug).photos.push({ singleTitle, province, city, src });
}

const seriesList = [];
for (const [slug, s] of seriesMap) {
  const dir = path.join(MASTERS, slug);
  await mkdir(dir, { recursive: true });
  const seriesPhotos = [];
  for (const r of s.photos) {
    const id = path.basename(r.src, path.extname(r.src));
    const dest = path.join(dir, path.basename(r.src));
    if (r.src !== dest) await copyFile(r.src, dest);

    const old = keep.get(`${slug}/${id}`) ?? {};
    const rec = await processPhoto(dest, slug, old);
    // 系列照片的标题用「单幅标题（不显示）」列；多数为空，留空即可
    rec.title = r.singleTitle ? String(r.singleTitle).trim() : '';
    rec.location = [r.province, r.city].filter(Boolean).map(String).join(' ');
    seriesPhotos.push(rec);
    photos.push(rec);
    console.log(`✓ 系列 ${slug}/${id}`);
  }
  // 系列封面用第一张；年份从第一张 EXIF 推断
  const cover = seriesPhotos[0]?.src ?? '';
  const year = seriesPhotos[0]?.exif?.taken?.slice(0, 4) ?? '';
  seriesList.push({
    slug,
    title: s.name,
    subtitle: s.meta.subtitle ?? '',
    description: s.meta.description ?? '',
    cover,
    year,
  });
}

// ---------- 3. 写回 ----------
photos.sort((a, b) => (a.series + a.id).localeCompare(b.series + b.id));
await writeFile(DATA, JSON.stringify(photos, null, 2) + '\n', 'utf8');
await writeFile(SERIES_DATA, JSON.stringify(seriesList, null, 2) + '\n', 'utf8');

console.log(`\n完成：${photos.length} 张照片（单幅 ${singleRows.length} + 系列 ${photos.length - singleRows.length}）→ public/photos/`);
console.log(`系列 ${seriesList.length} 个 → src/data/series.json`);
console.log('下一步：npm run colors 打色调标签，然后 npm run dev 看效果。');
