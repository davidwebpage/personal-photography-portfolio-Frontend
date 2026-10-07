// 单张照片的处理：读 EXIF → 生成多尺寸 webp → 返回 photos.json 记录
//
// 被 build-photos.mjs（扫 _masters/）和 build-from-sheet.mjs（读 Excel）共用，
// 保证两条管线产出的图片和记录格式完全一致。
//
// 只生成 webp，不生成 jpg 副本：网站只引用 webp，jpg 是转换前的原始文件，
// 留着纯占空间（见记忆 photo-pipeline-no-jpg）。
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);

const ROOT = path.dirname(fileURLToPath(new URL('../../package.json', import.meta.url)));
const OUT = path.join(ROOT, 'public/photos');

const EDGES = [800, 1600, 2560]; // 按「最长边」分档：横图竖图统一标准

// 有些相机的 EXIF 型号不好读，这里换成更直观的名字
const CAMERA_ALIASES = {
  'DJI FC8482': 'DJI mini4pro',
  'Panasonic DC-S1M2ES': 'Panasonic DC-S1M2E', // 去掉后缀，只留机身名
};

// 这些机器传感器远小于全画幅，实际焦段（如 6.7mm）看不出视角，改用等效焦距（24mm）
// 小米手机同理：物理焦段（如 8.7mm）看不出视角，用 35mm 等效焦段（23mm）
const EQUIV_FOCAL_MAKES = new Set(['DJI', 'Xiaomi']);

// 拼相机名：小米的 Make 和 Model 都带 "Xiaomi"，且 Model 常带型号代码后缀
// （如 "Xiaomi 13 Ultra/2304FPN6DC"），要去重并去掉后缀，避免显示成
// "Xiaomi Xiaomi 13 Ultra/2304FPN6DC"
function cameraName(make, model) {
  if (!model) return make ?? '';
  // 去掉型号代码后缀（如 "/2304FPN6DC"）
  const m = model.replace(/\/[A-Za-z0-9]+$/, '');
  // Make 和 Model 都以同一品牌开头时，只留 Model
  if (make && m.toLowerCase().startsWith(make.toLowerCase())) return m;
  return [make, m].filter(Boolean).join(' ');
}

// 解析母版图 EXIF 拍摄参数（供灯箱显示）。exiftool 不可用或无 EXIF 时返回 null，灯箱会隐藏面板
async function readExif(file) {
  try {
    const { stdout } = await execFileAsync('exiftool', [
      '-json', '-q', '-Make', '-Model', '-FocalLength', '-FocalLengthIn35mmFormat',
      '-ExposureTime', '-Aperture', '-ISO', '-DateTimeOriginal', '-CreateDate', file,
    ]);
    const [row] = JSON.parse(stdout);
    if (!row) return null;
    const camera = cameraName(row.Make, row.Model);
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
      // 拍摄时间优先用 DateTimeOriginal（拍摄时刻），缺失时回退到 CreateDate
      taken: row.DateTimeOriginal ? formatTaken(row.DateTimeOriginal)
        : (row.CreateDate ? formatTaken(row.CreateDate) : ''),
    };
  } catch {
    return null;
  }
}

function formatTaken(s) {
  // "2026:08:04 20:29:51" → "2026-08-04"（只到日）
  return s.replace(/(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3').slice(0, 10);
}

/**
 * 处理一张母版图，生成多尺寸 webp 到 public/photos/<series>/，
 * 返回 photos.json 里的一条记录（不含 title/location/year/colors，由调用方补）。
 *
 * @param {string} file 母版图绝对路径
 * @param {string} series 类别或系列 slug（决定输出目录）
 * @param {object} [old] 旧记录（保留手工字段用，可省略）
 */
export async function processPhoto(file, series, old = {}) {
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
    // srcset 的 w 描述符必须是文件真实宽度，否则浏览器选档会出错
    srcset.push(`/photos/${series}/${id}-${edge}.webp ${outW}w`);
  }

  // 主尺寸用 1600 档，或最大的可用档；宽高按长边比例换算
  const mainEdge = targets.includes(1600) ? 1600 : targets[targets.length - 1];
  const mainW = Math.round((srcW * mainEdge) / longest);
  const mainH = Math.round((srcH * mainEdge) / longest);
  // exif：优先从母版新解析；若母版无 EXIF（exiftool 返回 null）则保留旧手工值
  const exif = (await readExif(file)) ?? old.exif ?? null;
  return {
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
    // 色调标签由 scripts/color-tags.mjs（npm run colors）单独生成。
    // 这里必须原样带过去：调用方新建对象时若少带这一行，会把辛苦标好的色调无声清空。
    colors: old.colors ?? null,
  };
}
