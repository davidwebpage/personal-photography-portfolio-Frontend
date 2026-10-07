// 资源地址工具：本地开发时返回原始路径（/photos/...），
// 生产构建时自动加上 R2 存储桶地址（环境变量 ASSET_BASE_URL）。
//
// 用法：
//   import { assetUrl, assetSrcset } from '../lib/asset-url';
//   <img src={assetUrl(p.src)} srcset={assetSrcset(p.srcset)} />
//
// Cloudflare Pages 环境变量设置：
//   ASSET_BASE_URL = https://pub-xxxx.r2.dev
// 本地开发不设置该变量，路径保持 /photos/... 从本地 public/ 读取。

const BASE = import.meta.env.ASSET_BASE_URL || '';

/** 给单个资源路径加 R2 前缀（本地开发时原样返回） */
export function assetUrl(path: string): string {
  if (!path || !BASE) return path;
  if (path.startsWith('/')) return BASE + path;
  return path;
}

/** 给 srcset 中的所有路径加 R2 前缀（本地开发时原样返回） */
export function assetSrcset(srcset: string | undefined): string | undefined {
  if (!srcset || !BASE) return srcset;
  // srcset 格式：/path/to/a.webp 800w, /path/to/b.webp 1600w
  // 匹配每个以 / 开头的路径，前面加上 BASE
  return srcset.replace(/(^|,\s*)(\/[^\s,]+)/g, (_m, prefix, path) => prefix + BASE + path);
}
