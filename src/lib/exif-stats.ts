// 拍摄档案：把 photos.json 里的 EXIF 字符串聚合成「总览 + 若干分布」的展示数据
//
// 为什么放在构建时算：photos.json 由 npm run photos 生成，每次都会从母版图重算 exif，
// 手写进去的派生字段会被覆盖，所以统计只能读取时现算。
//
// 解析原则：字段缺失或读不出来一律返回 null，绝不抛错；解析不出来的照片计入 missing，
// 百分比的分母是该字段「可统计的照片数」，不是照片总数。

export interface ExifPhoto {
  series?: string;
  width?: number;
  height?: number;
  exif?: {
    camera?: string;
    focal?: string;
    aperture?: string;
    shutter?: string;
    iso?: string;
    taken?: string;
  } | null;
}

/** 分布图里的一行：标签 + 张数 + 占比 */
export interface StatRow {
  label: string;
  count: number;
  /** 占该字段可统计照片数的比例，0–1 */
  ratio: number;
  /** 条形宽度用，保留一位小数，例如 33.3 */
  percent: number;
}

/** 一张分布卡片 */
export interface StatPanel {
  title: string;
  rows: StatRow[];
  /** 该字段可统计的照片数（百分比分母） */
  parsed: number;
  /** 该字段读不出来的照片数 */
  missing: number;
  /** 收起来的那几行（放在「其余 N 档」的折叠里，默认不展开） */
  more?: StatRow[];
  /** 独占整行（焦段行数多，排在光圈/快门/感光度下面的第二行） */
  wide?: boolean;
}

/** 总览里的一张小卡 */
export interface SummaryCard {
  label: string;
  value: string;
  hint?: string;
}

export interface ExifStats {
  total: number;
  summary: SummaryCard[];
  panels: StatPanel[];
}

// ---------- 解析（输入形如 "165mm" "f/5.6" "1/15s" "ISO 4000"） ----------

function num(s: string): number | null {
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

/** "165mm" → 165 */
export function parseFocalMm(v?: string | null): number | null {
  if (!v) return null;
  const m = /([\d.]+)\s*mm/i.exec(v);
  if (!m) return null;
  const n = num(m[1]);
  return n !== null && n > 0 ? n : null;
}

/** "f/5.6" / "F6" → 5.6 */
export function parseAperture(v?: string | null): number | null {
  if (!v) return null;
  const m = /([\d.]+)\s*$/.exec(v.replace(/^f\/?/i, '').trim());
  if (!m) return null;
  const n = num(m[1]);
  return n !== null && n > 0 ? n : null;
}

/** "1/15s" → 0.0667；"2s" → 2（快门用秒，方便按快慢排序） */
export function parseShutterSeconds(v?: string | null): number | null {
  if (!v) return null;
  const s = v.trim();
  const frac = /^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/.exec(s);
  if (frac) {
    const a = num(frac[1]);
    const b = num(frac[2]);
    if (a === null || b === null || b === 0 || a <= 0) return null;
    return a / b;
  }
  const sec = num(s.replace(/s$/i, ''));
  return sec !== null && sec > 0 ? sec : null;
}

/** "ISO 4000" → 4000 */
export function parseIso(v?: string | null): number | null {
  if (!v) return null;
  const m = /(?:iso\s*)?([\d.]+)/i.exec(v);
  if (!m) return null;
  const n = num(m[1]);
  return n !== null && n > 0 ? n : null;
}

/** "Panasonic DC-S5" → "Panasonic" */
export function brandOf(v?: string | null): string {
  return v ? v.trim().split(/\s+/)[0] : '';
}

// ---------- 分档 ----------
// 有序数组，先命中先归；min 含、max 含（除快门那组按注释处理）

interface Band {
  label: string;
  min: number;
  max: number;
}

// 焦段（值已是 35mm 等效：无人机在 build-photos.mjs 里已换成等效焦距）。
// 边界首尾相接，任何整数焦段都落得进某一档
const FOCAL_BANDS: Band[] = [
  { label: '超广角 ≤16mm', min: 0, max: 16 },
  { label: '广角 17–28mm', min: 16.01, max: 28 },
  { label: '标准 29–50mm', min: 28.01, max: 50 },
  { label: '中长焦 51–85mm', min: 50.01, max: 85 },
  { label: '长焦 86–200mm', min: 85.01, max: 200 },
  { label: '超长焦 >200mm', min: 200.01, max: Infinity },
];

// 感光度：低感一段、中感一段、640 单独一档（常用的夜拍档位，值得拎出来看），
// 再按整档往上排。区间首尾相接，任何标准 ISO 值（100/125/160/200…12800）都落得进来。
// 边界值（1600、3200、6400）归下面那一档，所以标签上重复出现的那两个数不会算重。
const ISO_BANDS: Band[] = [
  { label: '≤100', min: 0, max: 100 },
  { label: '100–600', min: 100.01, max: 600 },
  { label: '640', min: 600.01, max: 700 },
  { label: '800–1600', min: 700.01, max: 1600 },
  { label: '1600–3200', min: 1600.01, max: 3200 },
  { label: '3200–6400', min: 3200.01, max: 6400 },
  { label: '>6400', min: 6400.01, max: Infinity },
];

// 快门天梯：从最慢到最快，一档挨着一档排成一架完整的梯子。
// 这一组空档位也保留（不丢档），所以看出来是连贯的，每一张照片都对得上某一格。
const SHUTTER_BANDS: Band[] = [
  // 夜景、星空、流水这类长曝光的落点
  { label: '长曝光 ≥1 秒', min: 1, max: Infinity },
  { label: '1/30–1 秒', min: 1 / 30, max: 1 },
  { label: '1/60–1/30 秒', min: 1 / 60, max: 1 / 30 },
  { label: '1/100–1/60 秒', min: 1 / 100, max: 1 / 60 },
  { label: '1/250–1/100 秒', min: 1 / 250, max: 1 / 100 },
  { label: '1/1000–1/250 秒', min: 1 / 1000, max: 1 / 250 },
  { label: '快于 1/1000 秒', min: 0, max: 1 / 1000 },
];

/** 按分档归类，返回「档位 → 张数」的计数数组（与 bands 顺序一致） */
function countBands(values: (number | null)[], bands: Band[]): number[] {
  const counts = new Array(bands.length).fill(0);
  values.forEach((v) => {
    if (v === null) return;
    let i = bands.findIndex((b) => v >= b.min && v <= b.max);
    // 兜底：万一档位之间留了缝（改了边界没接上），归到最近的一档。
    // 这样每张照片一定被算进某一格，不会凭空消失，也不会被误报成「未记录该项」
    if (i < 0) {
      let nearest = 0;
      let nearestGap = Infinity;
      bands.forEach((b, j) => {
        const gap = v < b.min ? b.min - v : v - b.max;
        if (gap < nearestGap) {
          nearestGap = gap;
          nearest = j;
        }
      });
      i = nearest;
    }
    counts[i] += 1;
  });
  return counts;
}

/** 把计数整理成一行行展示数据；空档位也保留，保证每一档都看得见。
 *  传 sortByCount 时改成「只露用过的档、并按张数从多到少排」——焦段分布用这套，
 *  让人一眼看出自己最常用哪一段，而不是按焦距从小到大排。 */
function buildPanel(
  title: string,
  values: (number | null)[],
  bands: Band[],
  opts?: { sortByCount?: boolean },
): StatPanel {
  const counts = countBands(values, bands);
  const parsed = counts.reduce((a, b) => a + b, 0);
  const rows: StatRow[] = [];
  bands.forEach((band, i) => {
    const ratio = parsed > 0 ? counts[i] / parsed : 0;
    rows.push({
      label: band.label,
      count: counts[i],
      ratio,
      percent: Math.round(ratio * 1000) / 10, // 条形宽度：保留一位小数
    });
  });
  if (opts?.sortByCount) {
    // 丢掉没用过的档，剩下的按张数降序（张数相同的保持原焦距顺序）
    rows.sort((a, b) => b.count - a.count);
    return { title, rows: rows.filter((r) => r.count > 0), parsed, missing: values.length - parsed };
  }
  return { title, rows, parsed, missing: values.length - parsed };
}

/**
 * 一排 = 一个具体数值（不合并成区间），比如光圈就直接列 f/1.7、f/1.8、f/2.2……
 * 用得最多的排在前面，张数相同的按数值从小到大；没出现过的值不占行。
 *
 * maxRows：最多露出几行，多出来的收进 more（页面上折起来）。
 * 注意 parsed 始终是全部可统计的照片数，跟收起与否无关，
 * 所以露出来的百分比加起来不等于 100% 是正常的。
 */
function buildValuePanel(
  title: string,
  values: (number | null)[],
  format: (v: number) => string,
  maxRows?: number,
): StatPanel {
  const counts = new Map<number, number>();
  values.forEach((v) => {
    if (v === null) return;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  });

  const parsed = [...counts.values()].reduce((a, b) => a + b, 0);
  const sorted: StatRow[] = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .map(([v, count]) => {
      const ratio = parsed > 0 ? count / parsed : 0;
      return {
        label: format(v),
        count,
        ratio,
        percent: Math.round(ratio * 1000) / 10,
      };
    });

  const rows = maxRows ? sorted.slice(0, maxRows) : sorted;
  const more = maxRows && sorted.length > maxRows ? sorted.slice(maxRows) : undefined;
  return { title, rows, more, parsed, missing: values.length - parsed };
}

// ---------- 对外入口 ----------

export function computeExifStats(photos: ExifPhoto[]): ExifStats {
  const total = photos.length;
  const exifs = photos.map((p) => p.exif ?? {});

  const focals = exifs.map((e) => parseFocalMm(e.focal));
  const apertures = exifs.map((e) => parseAperture(e.aperture));
  // 快门按「曝光时间」分档，所以这里解析成秒数
  const shutters = exifs.map((e) => parseShutterSeconds(e.shutter));
  const isos = exifs.map((e) => parseIso(e.iso));

  // 排布：光圈 / 快门 / ISO 并成一行，焦段行数多、独占下面一行
  const panels: StatPanel[] = [
    // 只露最常用的 6 档光圈，其余折进「其余 N 档」
    buildValuePanel('光圈占比', apertures, (v) => `f/${v}`, 6),
    // 快门天梯保留空档位：连贯的梯子才看得出自己常在哪一段、哪一段从来没用过
    buildPanel('快门天梯', shutters, SHUTTER_BANDS),
    buildPanel('ISO区间', isos, ISO_BANDS),
    { ...buildPanel('焦段分布', focals, FOCAL_BANDS, { sortByCount: true }), wide: true },
  ].filter((p) => p.parsed > 0);

  // ---- 总览 ----
  const summary: SummaryCard[] = [];
  if (total > 0) {
    const seriesCount = new Set(photos.map((p) => p.series).filter(Boolean)).size;
    summary.push({
      label: '照片总数',
      value: String(total),
      hint: seriesCount ? `${seriesCount} 个系列` : undefined,
    });

    const days = [...new Set(exifs.map((e) => e.taken).filter(Boolean))].sort() as string[];
    if (days.length) {
      summary.push({
        label: '拍摄天数',
        value: String(days.length),
        hint: days.length > 1 ? `${days[0]} ~ ${days[days.length - 1]}` : days[0],
      });
    }

    const brands = [...new Set(exifs.map((e) => brandOf(e.camera)).filter(Boolean))];
    if (brands.length) {
      summary.push({
        label: '覆盖机身',
        value: String(new Set(exifs.map((e) => e.camera).filter(Boolean)).size),
        hint: brands.join(' · '),
      });
    }

    const mm = focals.filter((v): v is number => v !== null);
    if (mm.length) {
      const lo = Math.min(...mm);
      const hi = Math.max(...mm);
      summary.push({
        label: '焦段范围',
        value: lo === hi ? `${lo}mm` : `${lo}–${hi}mm`,
        hint: mm.length > 1 ? `最广 ${lo}mm · 最长 ${hi}mm` : undefined,
      });
    }
  }

  return { total, summary, panels };
}
