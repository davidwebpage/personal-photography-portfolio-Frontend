# 摄影作品集网站

个人摄影作品集静态网站，用 [Astro](https://astro.build) 构建。无数据库、无后端，构建产物是纯静态文件，可部署到任何静态托管（对象存储 + CDN、GitHub Pages 等）。

## 环境准备（只需做一次）

本项目需要 Node.js（v20+，推荐 v24 LTS）。本机安装在 `~/.local/node`，并已把以下一行加入 `~/.zshrc`：

```bash
export PATH="$HOME/.local/node/bin:$PATH"
```

新开终端后 `node --version` 能显示版本号即就绪。

## 常用命令

在项目目录（`~/photo-portfolio`）下运行：

| 命令 | 作用 |
|---|---|
| `npm install` | 安装依赖（只需跑一次，或依赖变动后） |
| `npm run dev` | 本地预览，浏览器打开 http://localhost:4321 （改文件即时刷新） |
| `npm run build` | 构建静态站点到 `dist/` |
| `npm run preview` | 本地预览构建产物 |
| `npm run placeholders` | 重新生成灰色占位图（仅搭框架阶段用） |
| `npm run photos` | 处理真实照片（见下文"替换成真实照片"） |

## 目录结构

```
photo-portfolio/
├── src/
│   ├── pages/            页面：首页 index.astro、归档 archive.astro、
│   │                     关于 about.astro、联系 contact.astro、
│   │                     系列页 series/[slug].astro（按系列自动生成）
│   ├── layouts/Base.astro    全站外壳：顶栏导航、页脚、灯箱脚本
│   ├── components/Gallery.astro  瀑布流画廊组件
│   ├── styles/global.css      全站样式（深色主题）
│   └── data/
│       ├── series.json     ★ 系列信息（标题、简介、封面、年份）
│       └── photos.json     照片清单（由脚本生成，可手改标题/地点）
├── public/photos/        网站引用的图片（占位图或处理后的成品）
├── scripts/
│   ├── gen-placeholders.mjs   生成占位图
│   └── build-photos.mjs       真实照片处理管线
└── _masters/             ★ 你的原始照片（不会上传 git，见 .gitignore）
```

## 替换成真实照片

1. 把原始照片按系列放进 `_masters/<系列slug>/`，例如：
   ```
   _masters/mountains/DSC001.jpg
   _masters/mountains/DSC002.jpg
   _masters/sea/IMG_1234.jpg
   ```
   系列 slug 必须和 `src/data/series.json` 里的 `slug` 一致。支持 jpg / jpeg / png / tiff / webp。
2. 运行 `npm run photos`。脚本会对每张照片生成 800 / 1600 / 2560 三档宽度的 webp + jpg，输出到 `public/photos/<系列>/`，并更新 `src/data/photos.json`。
3. 打开 `src/data/photos.json`，给每张照片填 `title`（标题）和 `location`（拍摄地）。**已手工填写的字段再次运行脚本时会被保留**，放心重复执行。
4. 同步编辑 `src/data/series.json`：系列标题、简介、封面图路径、年份。新增系列就加一段 JSON，`series/[slug].astro` 会自动生成对应页面。
5. `npm run dev` 看效果，满意后 `npm run build`。

## 上线部署清单（到时候再办）

1. **域名**：在国内注册商（阿里云 / 腾讯云）购买，例如 `你的名字.com`。
2. **ICP 备案**：服务器/对象存储在国内必须备案，注册商后台有指引，约 2–3 周。
3. **部署**：`npm run build` 后把 `dist/` 上传到腾讯云 COS（静态网站托管）+ CDN 加速，绑定域名。
4. 把 `astro.config.mjs` 里的 `site` 改成真实域名（用于 sitemap 和 canonical）。

## FAQ

**需要自己写代码吗？**
日常更新只需要：往 `_masters/` 放照片 → `npm run photos` → 编辑两个 JSON 文件（纯文本，照现有格式填）→ `npm run build`。页面结构改动才需要碰代码。

**照片原图会被公开吗？**
不会。`_masters/` 不会被构建也不会进 git，网站只引用 `public/photos/` 里压缩后的副本（最大 2560px 宽）。

**访客数据、评论、后台管理？**
都没有——纯静态站。需要留言功能可后期接第三方表单服务（如 Formspree）。

## 后续可选增强

- 中文字体子集化（减少首屏加载）
- 双语版本（/en）
- 拍摄地地图（高德 + GCJ02 坐标）
- Pagefind 站内搜索
- og 分享卡片（微信/微博分享时显示封面）
