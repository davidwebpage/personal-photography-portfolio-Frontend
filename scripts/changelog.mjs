#!/usr/bin/env node
// 更新日志工具：把一次更新追加到 CHANGELOG.md（新条目在最上面）。
// 这是项目"底层逻辑"的一部分——每次改完网站，用这个脚本记一笔：
//   更新了什么（what）、怎么实现的（how）。
//
// 用法：
//   node scripts/changelog.mjs "更新内容一句话" "实现方式说明"
//   node scripts/changelog.mjs --draft   从 git 改动生成草稿（只打印，不写入）
//   node scripts/changelog.mjs --help
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CHANGELOG = join(__dirname, '..', 'CHANGELOG.md');

function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function gitDraft() {
  try {
    const status = execSync('git status --short', { encoding: 'utf8' }).trim();
    const diff = execSync('git diff --stat HEAD', { encoding: 'utf8' }).trim();
    return { status, diff };
  } catch {
    return { status: '', diff: '' };
  }
}

const args = process.argv.slice(2);

if (args.includes('--help') || args.length === 0) {
  console.log(`更新日志工具
用法:
  node scripts/changelog.mjs "更新内容" "实现方式"
  node scripts/changelog.mjs --draft   从 git 改动生成草稿（只打印，不写入）
`);
  process.exit(0);
}

if (args.includes('--draft')) {
  const { status, diff } = gitDraft();
  console.log('=== 当前 git 改动 ===');
  console.log(status || '（无改动）');
  console.log('\n=== 改动统计 ===');
  console.log(diff || '（无）');
  process.exit(0);
}

const [what, how] = args;
const entry = `## ${today()}

### 更新内容
${what}

### 实现方式
${how || '（未填写）'}
`;

let content = '';
if (existsSync(CHANGELOG)) {
  content = readFileSync(CHANGELOG, 'utf8');
} else {
  content = `# 更新日志

记录每次对网站的改动：更新了什么、怎么实现的。新条目在最上面。

`;
}

// 在第一条 "## " 条目之前插入新条目（保留文件头部的说明文字）
const lines = content.split('\n');
let insertAt = lines.length;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].startsWith('## ')) { insertAt = i; break; }
}
lines.splice(insertAt, 0, '', entry.trim(), '');

// 合并多余空行，保证文件以单个换行结尾
const out = lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
writeFileSync(CHANGELOG, out);
console.log(`已写入 ${CHANGELOG}`);
