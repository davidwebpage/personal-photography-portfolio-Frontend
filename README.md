# 摄影作品集网站

个人摄影作品集静态网站，用 [Astro](https://astro.build) 构建。无数据库、无后端，构建产物是纯静态文件，可部署到任何静态托管（对象存储 + CDN、GitHub Pages 等）。

## 环境准备（只需做一次）

本项目需要 Node.js（v20+，推荐 v24 LTS）。本机安装在 `~/.local/node`，并已把以下一行加入 `~/.zshrc`：

```bash
export PATH="$HOME/.local/node/bin:$PATH"
```

新开终端后 `node --version` 能显示版本号即就绪。

## 常用命令

在项目目录（`~/personal-photography-portfolio`）下运行：

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
personal-photography-portfolio/
├── src/
│   ├── pages/            页面：首页 index.astro、归档 archive.astro、
│   │                     单图 single.astro、获奖 awards.astro、
│   │                     关于 about.astro（含拍摄档案与联系方式）、
│   │                     系列页 series/[slug].astro（按系列自动生成）
│   ├── layouts/Base.astro    全站外壳：顶栏导航、页脚、灯箱脚本、明暗主题
│   ├── components/Gallery.astro  瀑布流画廊组件
│   ├── components/ExifStats.astro 拍摄档案（参数总览 + 分布图）
│   ├── components/StatRows.astro  分布图里的一组行（面板与折叠里共用）
│   ├── lib/exif-stats.ts     拍摄档案的统计与分档逻辑
│   ├── lib/singles.ts        单图作品的判定（不属于任何系列的照片）
│   ├── styles/global.css      全站样式（明暗两套主题）
│   └── data/
│       ├── series.json     ★ 系列信息（标题、简介、封面、年份）
│       ├── awards.json     ★ 获奖记录（见「维护获奖作品」）
│       ├── music.json      ★ 背景音乐歌单（见「背景音乐」）
│       └── photos.json     照片清单（由脚本生成，可手改标题/地点）
├── public/photos/        网站引用的图片（占位图或处理后的成品）
├── public/audio/         背景音乐文件（见「背景音乐」）
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
   不想归入任何系列的单张照片，放进 `_masters/single/`（见下文「单图作品」）。
2. 运行 `npm run photos`。脚本会对每张照片生成 800 / 1600 / 2560 三档宽度的 webp + jpg，输出到 `public/photos/<系列>/`，并更新 `src/data/photos.json`。
3. 打开 `src/data/photos.json`，给每张照片填 `title`（标题）和 `location`（拍摄地）。**已手工填写的字段再次运行脚本时会被保留**，放心重复执行。
4. 同步编辑 `src/data/series.json`：系列标题、简介、封面图路径、年份。新增系列就加一段 JSON，`series/[slug].astro` 会自动生成对应页面。
5. `npm run dev` 看效果，满意后 `npm run build`。

## 背景音乐

每次**整页打开**网站时，从歌单里随机抽一首循环播放（站内翻页不换歌，音乐连着播）。右上角那个 ♪ 按钮可以随时关掉／打开，鼠标停在按钮上会显示正在放的曲名。

**关于「一进来就播」**：浏览器有一条硬规矩——访客还没跟页面产生过任何互动之前，网页**不许自动出声**（Chrome、Safari、Firefox 全都一样）。这不是代码写得好不好的问题，是浏览器专门设计来拦这件事的，绕不过去。所以现在做的是：

- 页面一加载就立刻尝试播放，不等图片加载完；
- 只要访客做了**任何一个**动作（点击、按键、触摸、滚动）就立刻补启动，不需要特意点哪里；
- 万一被拦住了，音符按钮旁边会出现一行「点一下页面，音乐即响起」，一出声就收走；
- 之前来过的访客（浏览器记住了你在这个站上的互动）往往一打开就直接响。

想让访客**必然**是「点一下就进站、进去就有音乐」，只有一个办法：加一层「点击进入」的封面。这是有背景音乐的摄影站常见做法，代价是访客得先点那一下才看得到内容。要做的话说一声。

加歌两步：

1. 把音乐文件丢进 `public/audio/`；
2. 在 `src/data/music.json` 里加一行：

```json
[
  { "file": "/audio/飞雪玉花-净友钢琴版.mp3", "title": "飞雪玉花 · 净友钢琴版" }
]
```

`title` 只用来做按钮上的提示，随便写。

**格式**：mp3 和 m4a（AAC）都可以，现在的两首就是这两种，浏览器都认。要换新歌的话，导出成 **mp3、128 kbps** 左右最稳——这是兼容性最好的组合，手机上、老浏览器上都能放，一首 2 分钟的曲子大约 1.8 MB。文件控制在 3 MB 以内，太大了会拖慢首屏。你自己扒下来的无损（flac / wav）别直接放，先用播放器或在线工具转成 mp3 128k。

## 单图作品

顶栏「单图作品」这一栏放**不属于任何系列**的照片——单张的、临时的、还没凑成组的都放这里。

放法：把照片丢进 `_masters/single/`，运行 `npm run photos` 即可。判定规则很简单：**照片的系列名 = 它所在的目录名，凡是目录名不在 `src/data/series.json` 的 slug 清单里，就算单图**。所以：

- 目录名不叫 `single` 也行（比如 `_masters/杂片/`），效果一样；
- 反过来，如果你新开了一个目录想当系列、却忘了往 `series.json` 里登记，那些照片会落到「单图作品」里，而不会凭空消失——发现它们出现在这儿，就说明该去补 `series.json` 了。

「全部照片」页末尾也会自动多出一组「单图作品」；一张单图都没有时，两处都不显示空分组。

## 拍摄档案的分档

`src/lib/exif-stats.ts` 里几张表的边界都能自己改（改了记得 `npm run dev` 看一眼）：

- **光圈占比**：按具体光圈值逐档列，只露用得最多的 5 档，其余折进「其余 N 档」；
- **快门天梯**：从慢到快一档挨着一档，**空档位也保留**，所以看得出自己常在哪一段、哪一段从来没用过；
- **ISO区间**、**焦段分布**：改 `ISO_BANDS` / `FOCAL_BANDS` 两个数组即可，区间首尾相接就不会漏照片（万一留了缝，脚本会自动把照片归到最近的一档）。

## 维护获奖作品

「获奖作品」栏目的内容全部写在 `src/data/awards.json` 里，按年份从新到旧自动排序：

```json
[
  {
    "year": "2026",
    "title": "峰林布依",
    "competition": "某某国际摄影大赛",
    "award": "风光组 金奖",
    "link": "https://…"
  }
]
```

`year` 和 `title` 建议都填；`competition`、`award` 留空就不显示那一行；`link` 留空就不显示「查看」按钮。文件是空的（`[]`）时，页面显示「获奖与入展记录整理中」。

## 首页背景图

每次打开首页（包括站内点「首页」回到首页）都会从作品里**随机抽一张横构图照片**当背景，所以不需要手动挑。抽取范围在 `src/pages/index.astro` 顶部：默认是 `photos.json` 里所有横构图（宽 ≥ 高）的照片；想只从某个系列里抽，把那里的 `.filter(...)` 改成按 `p.series === '城市切片对应的 slug'` 过滤即可。

## 明暗主题

右上角圆形按钮切换深色 / 浅色，默认跟随设备的深色模式设置。用户点过之后选择存在浏览器本地（`localStorage` 的 `theme`），下次打开沿用。颜色都定义在 `src/styles/global.css` 顶部的 `:root` 里，用 `light-dark(亮色, 暗色)` 写一对值即可。

灯箱看图和系列页封面上的顶栏固定用深色界面（照片才是主体），不跟着切换。

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
