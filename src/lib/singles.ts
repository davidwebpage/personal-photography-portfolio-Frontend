// 单幅作品：不属于任何系列、但属于某个单幅类别的照片
//
// 判定规则：
//   - 照片的 series 字段（来自母版图所在目录名，见 scripts/build-photos.mjs）
//   - 如果它在「单幅类别」的 slug 清单里 → 是单幅作品，按类别分组展示
//   - 如果它在「系列作品」的 slug 清单里 → 是系列作品，归系列页
//   - 都不在 → 暂不显示（既不是单幅也不是系列，通常是还没归类）
//
// 约定俗成的目录名：_masters/<单幅类别slug>/ 放单幅照片，
// _masters/<系列slug>/ 放系列照片。
import allSeries from '../data/series.json';
import allCategories from '../data/single-categories.json';
import allPhotos from '../data/photos.json';

const seriesSlugs = new Set(allSeries.map((s) => s.slug));
const categorySlugs = new Set(allCategories.map((c) => c.slug));

// 单幅作品：属于某个单幅类别，且不属于任何系列
export const singles = allPhotos.filter(
  (p) => categorySlugs.has(p.series) && !seriesSlugs.has(p.series),
);

// 按类别分组：返回 [{ category, photos }]，类别顺序按 single-categories.json。
// 空类别也返回（photos 为空数组），页面会显示占位，保证 5 个类别始终可见。
export function singlesByCategory() {
  return allCategories.map((c) => ({
    category: c,
    photos: singles.filter((p) => p.series === c.slug),
  }));
}
