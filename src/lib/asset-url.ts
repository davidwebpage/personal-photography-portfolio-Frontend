// 资源地址工具：决定照片/音频从哪儿加载。两种模式，用环境变量 ASSET_MODE 切换：
//
//   ASSET_MODE=local（默认）→ 路径保持 /photos/...，图片跟网页一起走站点自身域名
//   ASSET_MODE=r2           → 每个路径前加 ASSET_BASE_URL 前缀，走 Cloudflare R2
//
// 用法（两种模式下调用方式完全一样，页面代码不用改）：
//   import { assetUrl, assetSrcset } from '../lib/asset-url';
//   <img src={assetUrl(p.src)} srcset={assetSrcset(p.srcset)} />
//
// 对应的命令：
//   npm run build:local   全前端版（图片打进 dist）
//   npm run build:r2      走 R2 版（需要 ASSET_BASE_URL）
//
// Cloudflare Pages 环境变量设置：
//   全前端站点：ASSET_MODE=local（不设 ASSET_BASE_URL）
//   走 R2 站点：ASSET_MODE=r2 + ASSET_BASE_URL=https://pub-xxxx.r2.dev

const MODE = import.meta.env.ASSET_MODE === 'r2' ? 'r2' : 'local';
const BASE = import.meta.env.ASSET_BASE_URL || '';

if (MODE === 'r2' && !BASE) {
  throw new Error(
    'ASSET_MODE=r2 需要同时设置 ASSET_BASE_URL（例如 https://pub-xxxx.r2.dev），否则图片地址会指向空地址。'
  );
}

// 构建时打印一行，部署错了版本能立刻从构建日志看出来。
console.log(`[assets] 模式 = ${MODE}${MODE === 'r2' ? `（前缀 ${BASE}）` : '（图片随站点一起部署）'}`);

/** 给单个资源路径加 R2 前缀（全前端模式下原样返回） */
export function assetUrl(path: string): string {
  if (!path || MODE !== 'r2') return path;
  if (path.startsWith('/')) return BASE + path;
  return path;
}

/** 给 srcset 中的所有路径加 R2 前缀（全前端模式下原样返回） */
export function assetSrcset(srcset: string | undefined): string | undefined {
  if (!srcset || MODE !== 'r2') return srcset;
  // srcset 格式：/path/to/a.webp 800w, /path/to/b.webp 1600w
  // 匹配每个以 / 开头的路径，前面加上 BASE
  return srcset.replace(/(^|,\s*)(\/[^\s,]+)/g, (_m, prefix, path) => prefix + BASE + path);
}
