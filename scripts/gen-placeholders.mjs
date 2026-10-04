#!/usr/bin/env node
// 生成灰色占位图（SVG）+ 写入 src/data/photos.json
// 用法：npm run placeholders
// 等你有了真实照片，改用 npm run photos（见 scripts/build-photos.mjs），这个脚本就不用再跑了
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const OUT = path.join(ROOT, 'public/photos');
const DATA = path.join(ROOT, 'src/data/photos.json');

// 每个系列 4 张，横竖构图混合，模拟真实作品集
const PLAN = [
  { series: 'mountains', prefix: 'm', hue: 150, sizes: [[1600, 1067], [1067, 1600], [1600, 900], [1280, 1600]] },
  { series: 'city',      prefix: 'c', hue: 30,  sizes: [[1600, 1067], [1600, 1067], [1067, 1600], [1600, 900]] },
  { series: 'sea',       prefix: 's', hue: 210, sizes: [[1280, 1600], [1600, 1067], [1600, 900], [1067, 1600]] },
];
const TITLES = { mountains: '山野之间', city: '城市切片', sea: '海岸线' };

function svg(w, h, label, hue) {
  const frame = 24;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${hue}, 14%, 20%)"/>
      <stop offset="1" stop-color="hsl(${hue}, 10%, 9%)"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#g)"/>
  <rect x="${frame}" y="${frame}" width="${w - frame * 2}" height="${h - frame * 2}" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="2"/>
  <text x="50%" y="47%" text-anchor="middle" fill="rgba(255,255,255,0.45)" font-family="sans-serif" font-size="${Math.round(w / 24)}">${label}</text>
  <text x="50%" y="56%" text-anchor="middle" fill="rgba(255,255,255,0.28)" font-family="sans-serif" font-size="${Math.round(w / 42)}">${w} × ${h} · 占位图</text>
</svg>
`;
}

const photos = [];
for (const plan of PLAN) {
  await mkdir(path.join(OUT, plan.series), { recursive: true });
  let i = 0;
  for (const [w, h] of plan.sizes) {
    i++;
    const id = `${plan.prefix}${String(i).padStart(2, '0')}`;
    await writeFile(path.join(OUT, plan.series, `${id}.svg`), svg(w, h, TITLES[plan.series], plan.hue + i * 8), 'utf8');
    photos.push({
      id,
      series: plan.series,
      title: `${TITLES[plan.series]} · 示例 ${i}`,
      src: `/photos/${plan.series}/${id}.svg`,
      width: w,
      height: h,
      year: 2024,
      location: '',
    });
  }
}

// 首页 hero 大图
await writeFile(path.join(OUT, 'hero.svg'), svg(2560, 1440, '你的名字 · 摄影作品集', 210), 'utf8');

await mkdir(path.dirname(DATA), { recursive: true });
await writeFile(DATA, JSON.stringify(photos, null, 2) + '\n', 'utf8');
console.log(`✓ 已生成 ${photos.length} 张占位图 + 1 张 hero，photos.json 已更新`);
