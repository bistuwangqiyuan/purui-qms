// 由 favicon.svg 生成 PWA 图标（利用 netlify-cli 依赖中的 sharp）
import { createRequire } from 'module';
import fs from 'fs';

const require = createRequire(import.meta.url);
const sharp = require('sharp');

fs.mkdirSync('public/icons', { recursive: true });
const svg = fs.readFileSync('public/favicon.svg');
await sharp(svg, { density: 300 }).resize(192, 192).png().toFile('public/icons/icon-192.png');
await sharp(svg, { density: 300 }).resize(512, 512).png().toFile('public/icons/icon-512.png');
console.log('icons done');
