import { defineConfig } from 'astro/config';

export default defineConfig({
  // 上线前改成你的真实域名（用于 sitemap、canonical 等）
  site: 'https://www.example.com',

  // 关掉开发模式左下角那个 Astro 悬浮工具条（只在 npm run dev 时出现，构建产物里本来就没有）。
  // 想看无障碍检查之类的调试工具时，把这一段删掉或改成 true 就会回来。
  devToolbar: { enabled: false },
});
