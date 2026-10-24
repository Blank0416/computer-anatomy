/* ============================================================
   tools/smoke.mjs — 元件模块冒烟测试（Node 里跑，不需要浏览器）
   three 的几何/材质在 Node 里能跑，WebGLRenderer 才需要显卡。
   检查：能否构建 / 包围盒 / 三角面 / setExplode 往返是否复原
     node tools/smoke.mjs
   ============================================================ */

import * as THREE from 'three';
import { createKit } from '../src/engine/kit.js';

const kit = createKit();

const MODULES = [
  'cpu', 'cooler', 'motherboard', 'ram', 'storage', 'gpu', 'psu', 'case',
];

/* ---------- 快照：所有后代的 position/rotation/scale ---------- */
function snapshot(root) {
  const out = [];
  root.traverse((o) => out.push([
    o.position.x, o.position.y, o.position.z,
    o.rotation.x, o.rotation.y, o.rotation.z,
    o.scale.x, o.scale.y, o.scale.z,
  ]));
  return out;
}
function maxDiff(a, b) {
  if (a.length !== b.length) return Infinity;
  let m = 0;
  for (let i = 0; i < a.length; i++)
    for (let j = 0; j < a[i].length; j++) m = Math.max(m, Math.abs(a[i][j] - b[i][j]));
  return m;
}

let failed = 0;
const rows = [];

for (const name of MODULES) {
  let mod;
  try {
    mod = (await import(`../src/parts/${name}.js`)).default;
  } catch (e) {
    rows.push([name, '缺失', (e.message || '').split('\n')[0].slice(0, 46)]);
    failed++;
    continue;
  }

  const problems = [];

  // --- 元数据 ---
  if (mod.id !== name) problems.push(`id 应为 ${name}，实为 ${mod.id}`);
  for (const k of ['name', 'en', 'hue']) if (mod[k] === undefined) problems.push(`缺 ${k}`);
  if (!mod.focus?.from || !mod.focus?.look) problems.push('缺 focus.from/look');
  if (typeof mod.build !== 'function') problems.push('缺 build()');

  // --- 构建 ---
  let built;
  try {
    built = mod.build(kit);
  } catch (e) {
    rows.push([name, '构建失败', (e.message || '').split('\n')[0].slice(0, 46)]);
    failed++;
    continue;
  }
  for (const k of ['group', 'setExplode']) if (!built[k]) problems.push(`build 返回缺 ${k}`);

  const g = built.group;
  g.updateMatrixWorld(true);

  // --- 包围盒（未拆解态）---
  const box = new THREE.Box3().setFromObject(g);
  const size = new THREE.Vector3();
  box.getSize(size);
  const limit = name === 'case' ? 2.2 : 1.6;
  if (size.x > limit || size.y > limit || size.z > limit)
    problems.push(`体积超限 ${size.x.toFixed(2)}×${size.y.toFixed(2)}×${size.z.toFixed(2)} > ${limit}`);

  // 原点应该大致在几何中心
  const c = new THREE.Vector3();
  box.getCenter(c);
  if (Math.max(Math.abs(c.x), Math.abs(c.y), Math.abs(c.z)) > 0.45)
    problems.push(`原点偏离中心 (${c.x.toFixed(2)}, ${c.y.toFixed(2)}, ${c.z.toFixed(2)})`);

  // --- 三角面 ---
  const st = kit.stats(g);
  if (st.tris > 60000) problems.push(`三角面 ${st.tris} > 60000`);

  // --- setExplode 往返 ---
  built.setExplode(0);
  const s0 = snapshot(g);
  built.setExplode(1);
  const s1 = snapshot(g);
  built.setExplode(0);
  const s0b = snapshot(g);
  const back = maxDiff(s0, s0b);
  const moved = maxDiff(s0, s1);
  if (back > 1e-6) problems.push(`setExplode 往返未复原（最大偏差 ${back.toFixed(4)}）`);
  if (moved < 0.05) problems.push('setExplode(1) 几乎没有位移 —— 看不出拆解');

  // --- update 不该让结构漂走（光点/风扇可以动，但整体不能跑飞） ---
  if (typeof built.update === 'function') {
    built.setExplode(0.5);
    const before = new THREE.Box3().setFromObject(g).getSize(new THREE.Vector3());
    for (let i = 0; i < 240; i++) built.update(i * 0.05, 0.016, 1);
    built.setExplode(0.5);
    g.updateMatrixWorld(true);
    const after = new THREE.Box3().setFromObject(g).getSize(new THREE.Vector3());
    const grow = Math.max(
      after.x / Math.max(before.x, 1e-6),
      after.y / Math.max(before.y, 1e-6),
      after.z / Math.max(before.z, 1e-6)
    );
    if (grow > 1.25)
      problems.push(`跑 240 帧后体积膨胀到 ${grow.toFixed(2)}× —— update() 可能在累加位置`);
  }

  // --- legend ---
  if (built.legend && built.legend.length && built.legend.some((l) => !l.text || !l.desc))
    problems.push('legend 有条目缺 text/desc');

  const sizeStr = `${size.x.toFixed(2)}×${size.y.toFixed(2)}×${size.z.toFixed(2)}`;
  rows.push([
    name,
    problems.length ? `⚠ ${problems.length}` : '✔',
    `${sizeStr}  ${st.tris}t  ${st.meshes}m  ${built.legend?.length ?? 0}legend  ` +
    `focus[${mod.focus.from.map((v) => (+v).toFixed(1)).join(',')}]`,
  ]);
  if (problems.length) {
    failed++;
    for (const p of problems) rows.push(['', '·', p]);
  }
}

const w = Math.max(...rows.map((r) => r[0].length));
console.log('\n元件模块冒烟测试\n' + '─'.repeat(72));
for (const [a, b, c] of rows) console.log(`${a.padEnd(w)}  ${b.padEnd(8)}${c}`);
console.log('─'.repeat(72));
console.log(failed ? `\n${failed} 项有问题\n` : '\n全部通过\n');
process.exit(failed ? 1 : 0);