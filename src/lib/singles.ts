// 单图作品：没被任何系列收录的照片
//
// 判定规则是「series 不在 series.json 的 slug 清单里」——photos.json 的 series 来自
// 母版图所在的目录名（见 scripts/build-photos.mjs），所以在 _masters/ 下新建一个目录
// 放照片、又没往 series.json 里登记，这些照片就会落到这里，而不会凭空消失。
// 约定俗成的目录名是 _masters/single/。
import allSeries from '../data/series.json';
import allPhotos from '../data/photos.json';

const seriesSlugs = new Set(allSeries.map((s) => s.slug));

export const singles = allPhotos.filter((p) => !seriesSlugs.has(p.series));
