#!/usr/bin/env node
// 一键部署到 Cloudflare Pages（直接上传 dist，不走 Git 构建）。
//
// 为什么直接上传而不是连 Git 自动构建：
//   照片是由 npm run photos 从 _masters/ 母版图生成到 public/photos/ 的，
//   而 _masters/ 不在 Git 里。Git 自动构建的服务器拿不到母版图，会缺图。
//   所以在本地（有母版图的环境）构建好 dist，再直接上传 dist。
//
// 用法：
//   1. 注册 Cloudflare 账号：https://dash.cloudflare.com/sign-up
//   2. 安装 wrangler 并登录（只需一次）：
//        npx wrangler@latest login
//   3. 首次部署前，先在 Cloudflare 控制台创建一个 Pages 项目
//      （或直接运行本脚本，wrangler 会问要不要新建），项目名默认
//      "photography-portfolio"，可用环境变量 CF_PAGES_PROJECT 覆盖。
//   4. 运行：  npm run deploy
//      每次改完照片/内容，本地 npm run build 后再 npm run deploy 即可。
//
// 需要的话，构建步骤可以并进来：
//   npm run build && npm run deploy
import { spawnSync } from 'node:child_process';
import { rm, access, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const DIST = path.join(ROOT, 'dist');
const PROJECT = process.env.CF_PAGES_PROJECT || 'photography-portfolio';

async function exists(p) {
  try { await access(p); return true; } catch { return false; }
}

// 清掉 dist 里 macOS 产生的 .DS_Store 垃圾（会被 Astro 从 public 复制进来）
async function cleanJunk(dir) {
  let removed = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.name === '.DS_Store') {
      await rm(full, { force: true });
      removed++;
    } else if (entry.isDirectory()) {
      removed += await cleanJunk(full);
    }
  }
  return removed;
}

async function main() {
  if (!(await exists(DIST))) {
    console.error('✗ 没找到 dist/ 目录。请先运行：npm run build');
    process.exit(1);
  }
  // dist 太久没构建就提醒一下（避免传了旧产物）
  const built = (await stat(path.join(DIST, 'index.html'))).mtimeMs;
  const ageMin = Math.round((Date.now() - built) / 60000);
  if (ageMin > 60) {
    console.warn(`⚠️ dist 是 ${ageMin} 分钟前构建的，建议先 npm run build 再部署。`);
  }

  const junk = await cleanJunk(DIST);
  if (junk) console.log(`已清理 ${junk} 个 .DS_Store。`);

  console.log(`正在上传 dist/ 到 Cloudflare Pages（项目：${PROJECT}）…`);
  const args = ['wrangler@latest', 'pages', 'deploy', DIST, '--project-name', PROJECT];
  const res = spawnSync('npx', args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (res.status !== 0) {
    console.error('✗ 部署失败。首次运行需要先 npx wrangler@latest login 登录 Cloudflare。');
    process.exit(res.status ?? 1);
  }
  console.log('✓ 部署完成。访问地址会在上面的输出里给出（*.pages.dev）。');
}

main();
