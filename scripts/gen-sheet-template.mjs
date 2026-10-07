#!/usr/bin/env node
// 生成「图片清单」Excel 模板：用户填好路径和元信息后，
// 由 scripts/build-from-sheet.mjs 读取并驱动图片管线。
import ExcelJS from 'exceljs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const OUT = path.join(ROOT, '图片清单模板.xlsx');

// 类别下拉选项（对应 src/data/single-categories.json 的 slug）
const CATEGORIES = ['nature', 'city', 'people', 'event', 'space'];

// 列定义：key 是脚本读取用的字段名，header 是表头文字，note 是示例/说明
const COLUMNS = [
  { key: 'category', header: '类别', note: '下拉选择：nature / city / people / event / space' },
  { key: 'path', header: '图片路径', note: '图片在电脑上的完整路径，如 /Users/David/图片库/雪山.jpg' },
  { key: 'title', header: '标题', note: '可选，作品名，如 日照金山' },
  { key: 'province', header: '省份', note: '可选，拍摄省份，如 四川' },
  { key: 'city', header: '城市', note: '可选，拍摄城市，如 成都' },
  { key: 'year', header: '年份', note: '可选，拍摄年份，如 2026' },
];

// 示例行：帮助用户理解每列填什么（脚本读取时会跳过示例行）
const EXAMPLE = {
  category: 'nature',
  path: '/Users/David/图片库/示例-雪山.jpg',
  title: '日照金山',
  province: '四川',
  city: '成都',
  year: 2026,
};

const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet('图片清单');

// 表头
const headerRow = ws.addRow(COLUMNS.map((c) => c.header));
headerRow.font = { bold: true };
headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F0EC' } };

// 示例行（脚本读取时会跳过）
ws.addRow(COLUMNS.map((c) => EXAMPLE[c.key]));

// 填写说明行（脚本读取时会跳过）
ws.addRow(COLUMNS.map((c) => c.note));

// 列宽
COLUMNS.forEach((c, i) => {
  ws.getColumn(i + 1).width = c.key === 'path' ? 50 : 16;
});

// 类别列（A 列）从第 2 行起加数据验证下拉，预留 200 行
const lastRow = 200;
for (let r = 2; r <= lastRow; r++) {
  ws.getCell(`A${r}`).dataValidation = {
    type: 'list',
    allowBlank: true,
    formulae: [`"${CATEGORIES.join(',')}"`],
    showErrorMessage: true,
    errorTitle: '类别无效',
    error: '请从下拉列表选择：nature / city / people / event / space',
  };
}

await wb.xlsx.writeFile(OUT);
console.log(`模板已生成：${OUT}`);
console.log('说明：');
console.log('  - 第 1 行是表头，不要改');
console.log('  - 第 2 行是示例，脚本会跳过，可删可留');
console.log('  - 第 3 行是每列的填写说明，脚本会跳过');
console.log('  - 从第 4 行开始填你的照片，每行一张');
console.log('  - 「类别」列是下拉选项，点单元格右侧箭头选择');
