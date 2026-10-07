// 照片主色调分档：把一张照片归到 1–2 个色调档位里
//
// 重要：这套规则是「猜」，不是「事实」。同一张照片换个阈值就可能换一个档，
// 尤其是头名和第二名咬得紧的那些。所以阈值集中放在下面，改完先跑
//   npm run colors -- --dry
// 逐行看一眼结果，满意了再写回 photos.json。
//
// 为什么按「像素面积」数票、而不是按饱和度加权投票：
// 加权投票会先把灰色像素全部丢掉，再在剩下的少数像素里挑赢家。实测过一张
// 73% 是灰的照片，它却报出「青色 42%」——而且那个赢家是靠 0.9 度的分界线
// 赢的（色相 199.08°，分界线画在 200°）。面积计数才是站得住的规则。
//
// 中性怎么处理：无彩色像素（灰、黑、白、过暗、过亮）**直接跳过，不进分母**。
// 档位只由「有颜色的像素」决定——一张 60% 灰 + 40% 蓝的照片，蓝就是 100% 的
// 主色。整张都没有彩色像素的照片（雪景、雾、黑白）打不出任何档，就不参与
// 色调筛选。没有单独的中性档。

/** 七个色相档，顺序即色带上从红到紫的排列。 */
export const COLOR_ORDER = ['红', '橙', '黄', '绿', '青', '蓝', '紫'];

// ---------- 可调阈值 ----------
// 低于这个彩度就算无彩色（灰、黑、白，以及接近灰的褐色），直接跳过。
// 彩度是 max-min（0~1），比 HSL 饱和度更贴近直觉：深海军蓝的 HSL 饱和度
// 只有 0.26，但它确实是蓝的，不该被当成灰色扔掉。
export const CHROMA_MIN = 0.08;
export const L_MIN = 0.08; // 近黑（暗部）算无彩色
export const L_MAX = 0.95; // 近白（高光、过曝）算无彩色
export const TOP2_GAP = 10; // 第二名与头名的最大差距（百分点），在此之内就一起挂

// 色相分档表 [档位, 下界, 上界)。红跨 0 度，所以它的上界（15）小于下界（345）。
// 黄/绿边界定在 60° 而不是 70°：实测大量「黄绿之间」的照片（50–70°）在
// 人眼里是绿（树叶、草地、竹林），70° 会把它们误归成黄。移到 60° 后这些
// 归绿，而真正的黄（夕阳、灯光，色相 20–40°）不受影响。
const HUE_BANDS = [
  ['红', 345, 15],
  ['橙', 15, 45],
  ['黄', 45, 60],
  ['绿', 60, 160],
  ['青', 160, 200],
  ['蓝', 200, 260],
  ['紫', 260, 345],
];

/**
 * 一个像素（RGB 各 0~255）→ 色相 h（0~360）、明度 l（0~1）、彩度 chroma（0~1）。
 * 无彩色时 chroma 为 0，色相没有意义，返回 0。
 */
export function rgbToHsl(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const chroma = max - min;
  const l = (max + min) / 2;

  let h = 0;
  if (chroma !== 0) {
    if (max === rn) h = (gn - bn) / chroma + (gn < bn ? 6 : 0);
    else if (max === gn) h = (bn - rn) / chroma + 2;
    else h = (rn - gn) / chroma + 4;
    h *= 60;
  }
  return { h, l, chroma };
}

/** 色相 → 档位名。无彩色的像素调用方应先用跳过判定拦掉，别调这里。 */
export function hueToColor(h) {
  for (const [name, lo, hi] of HUE_BANDS) {
    if (lo < hi ? h >= lo && h < hi : h >= lo || h < hi) return name;
  }
  return COLOR_ORDER[0]; // 分档表已覆盖 0~360，这里只是兜底
}

/** 一个像素的档位；无彩色（灰/黑/白/过暗/过亮）返回 null，调用方应跳过它 */
export function pixelColor(r, g, b) {
  const { h, l, chroma } = rgbToHsl(r, g, b);
  if (chroma < CHROMA_MIN || l < L_MIN || l > L_MAX) return null;
  return hueToColor(h);
}

/**
 * 统计一块 RGB 像素里各档位的占比，从大到小返回 [{ color, share }]。
 * share 是 0~1 的小数，分母是**有颜色的像素**（无彩色像素直接跳过、不算）——
 * 「第二名与头名差 10 个百分点」这条规则只有在同一个分母下才有意义。
 * 并列时按固定顺序排（红橙黄绿青蓝紫），保证同一张图每次跑结果一样。
 */
export function colorShares(rgb, channels = 3) {
  const counts = new Map();
  let total = 0;
  for (let i = 0; i + channels <= rgb.length; i += channels) {
    const name = pixelColor(rgb[i], rgb[i + 1], rgb[i + 2]);
    if (name === null) continue; // 无彩色像素跳过，不进分母
    counts.set(name, (counts.get(name) ?? 0) + 1);
    total++;
  }
  if (!total) return [];

  const rank = COLOR_ORDER;
  return [...counts.entries()]
    .map(([color, count]) => ({ color, count, share: count / total }))
    .sort((a, b) => b.share - a.share || rank.indexOf(a.color) - rank.indexOf(b.color));
}

/**
 * 把统计结果收敛成最终挂的档位（1–2 个）。
 * 头名必挂；第二名若与头名差 ≤ TOP2_GAP 个百分点就一并挂，最多两个。
 */
export function pickColors(shares) {
  if (!shares.length) return [];
  const picked = [shares[0].color];
  const second = shares[1];
  if (second) {
    // 加一个极小的容差：0.40 与 0.30 相减在浮点里是 0.10000000000000003，
    // 乘 100 会得到 10.000000000000004，恰好越过 10 这条线，把「刚好差 10」
    // 判成「超过 10」。这是最容易悄悄出错又最难发现的地方。
    const gapPct = (shares[0].share - second.share) * 100;
    if (gapPct <= TOP2_GAP + 1e-9) picked.push(second.color);
  }
  return picked;
}

/** 一步到位：RGB 像素 → 最终档位（1–2 个） */
export function classifyPixels(rgb, channels = 3) {
  return pickColors(colorShares(rgb, channels));
}
