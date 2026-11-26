import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';

const require = createRequire(import.meta.url);
const root = process.cwd();
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const all = { ...pkg.dependencies, ...pkg.devDependencies };

const rows = [];
for (const name of Object.keys(all).sort()) {
  const dir = join(root, 'node_modules', name);
  const manifest = join(dir, 'package.json');
  if (!existsSync(manifest)) {
    rows.push([name, 'MISSING', '-', '-']);
    continue;
  }
  const p = JSON.parse(readFileSync(manifest, 'utf8'));
  rows.push([name, p.version ?? '?', p.license ?? (p.licenses ? 'see licenses' : 'UNKNOWN'), p.type ?? 'commonjs']);
}

const w = (s, n) => String(s).padEnd(n);
console.log(w('package', 26) + w('version', 12) + w('license', 14) + 'module');
console.log('-'.repeat(62));
for (const r of rows) console.log(w(r[0], 26) + w(r[1], 12) + w(r[2], 14) + r[3]);

console.log('\nimport check:');
for (const name of ['culori', 'fflate', 'idb', 'zustand', 'magic-wand-js', '@jaames/iro', 'react', '@capacitor/core']) {
  try {
    const m = await import(name);
    const keys = Object.keys(m).slice(0, 5).join(',');
    console.log(`  ok   ${name}  exports: ${keys || '(empty)'}`);
  } catch (e) {
    console.log(`  warn ${name}  ${e.code || e.name}: ${String(e.message).split('\n')[0].slice(0, 90)}`);
  }
}

// 最小功能冒烟：颜色转换 + zip 打包
const { converter } = await import('culori');
const toHsv = converter('hsv');
console.log('\nculori hsv(#7CB342):', JSON.stringify(toHsv('#7CB342')));

const { zipSync, unzipSync, strToU8, strFromU8 } = await import('fflate');
const zipped = zipSync({ 'project.json': strToU8('{"format":"pixeluv-project"}') });
const back = strFromU8(unzipSync(zipped)['project.json']);
console.log('fflate roundtrip:', back);
