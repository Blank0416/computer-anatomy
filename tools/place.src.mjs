/* ============================================================
   tools/place.src.mjs — 装配布局的纯 Node 验收（不开浏览器，几乎不耗 CPU）

   由 tools/place.mjs 用 esbuild 打包（alias: three → vendor/three.module.js）后运行。
   查四件事：
     1. 每个元件的 t=0 世界包围盒是否落在机箱内腔里（装得进去吗）
     2. 两两之间的包围盒重叠比例（有没有明显穿模）
     3. 装配态各件的相对大小是否像一台真机（主板最大、内存/硬盘细长……）
     4. 镜头够不够远：元件拆解态的半径 vs 机位距离在该 fov 下的可见半径
        ——「点开之后元素顶出画面被切角」这个问题不用浏览器就能先卡住
   ============================================================ */

import * as THREE from 'three';
import { createKit } from '../src/engine/kit.js';
import { layout } from '../src/data/layout.js';

import cpu from '../src/parts/cpu.js';
import cooler from '../src/parts/cooler.js';
import motherboard from '../src/parts/motherboard.js';
import ram from '../src/parts/ram.js';
import storage from '../src/parts/storage.js';
import gpu from '../src/parts/gpu.js';
import psu from '../src/parts/psu.js';
import chassis from '../src/parts/case.js';

const MODULES = [cpu, cooler, motherboard, ram, storage, gpu, psu, chassis];

/* 与 layout.js 注释里写的一致：case.js 的内腔 */
const IN = { x: [-0.37, 0.37], y: [0.03, 1.67], z: [-0.83, 0.83] };
/* main.js 里的元件机位拉远系数（改 main.js 记得同步这里） */
const K_FOCUS = 2.15;

const kit = createKit();
const f3 = (n) => Math.round(n * 1000) / 1000;
const size = (b) => [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z].map(f3);
const ctr = (b) => [f3((b.min.x + b.max.x) / 2), f3((b.min.y + b.max.y) / 2), f3((b.min.z + b.max.z) / 2)];

const rows = [];
const problems = [];
const boxes = new Map();

for (const m of MODULES) {
  const L = m.id === 'case' ? layout.case : layout.parts[m.id];
  if (!L) { problems.push(`${m.id}: layout.js 里没有位置`); continue; }

  // 复刻 main.js 的层级：root → wrapper(座位) → 元件
  const root = new THREE.Group();
  const wrapper = new THREE.Group();
  wrapper.position.set(L.pos[0], L.pos[1], L.pos[2]);
  wrapper.rotation.set(L.rot[0], L.rot[1], L.rot[2], 'XYZ');
  wrapper.scale.setScalar(L.scale);
  root.add(wrapper);

  const built = m.build(kit);
  wrapper.add(built.group);

  built.setExplode(0);
  root.updateMatrixWorld(true);
  const box0 = new THREE.Box3().setFromObject(built.group);

  built.setExplode(1);
  root.updateMatrixWorld(true);
  const box1 = new THREE.Box3().setFromObject(built.group);
  built.setExplode(0);

  // 相对元件自己原点的包围盒（机位偏移就是这个原点出发的）
  const rel1 = box1.clone().translate(new THREE.Vector3(-L.pos[0], -L.pos[1], -L.pos[2]));
  const rad1 = rel1.getSize(new THREE.Vector3()).length() / 2;

  const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(L.rot[0], L.rot[1], L.rot[2], 'XYZ'));
  const offFrom = new THREE.Vector3(...m.focus.from).multiplyScalar(L.scale * K_FOCUS).applyQuaternion(quat);
  const d = offFrom.length();
  const fov = m.focus.fov ?? 34;
  const halfV = d * Math.tan((fov * Math.PI / 180) / 2);
  const fill = rad1 / halfV;          // <0.8 才算留了白

  const r = {
    id: m.id, scale: L.scale,
    box0: size(box0), box0ctr: ctr(box0),
    box1: size(box1),
    rad1: f3(rad1), camDist: f3(d), fov, fill: f3(fill),
  };
  rows.push(r);
  boxes.set(m.id, box0);

  if (m.id !== 'case') {
    const [[x0, x1], [y0, y1], [z0, z1]] = [IN.x, IN.y, IN.z];
    const out = [];
    if (box0.min.x < x0 - 1e-3 || box0.max.x > x1 + 1e-3) out.push('X');
    if (box0.min.y < y0 - 1e-3 || box0.max.y > y1 + 1e-3) out.push('Y');
    if (box0.min.z < z0 - 1e-3 || box0.max.z > z1 + 1e-3) out.push('Z');
    if (out.length) problems.push(`${m.id}: t=0 超出机箱内腔（${out.join('/')}）`);
    if (fill > 0.8) problems.push(`${m.id}: 机位太近，拆解态占画面 ${(fill * 100).toFixed(0)}%（>80% 会被切角）`);
  }
}

/* 两两重叠：AABB 交集体积 / 较小那个的体积。
   机箱要排除 —— 它是个空心壳，包围盒把里面所有东西都罩住了，
   和它比重叠永远是几十个百分点，没有信息量。 */
const ids = rows.map((r) => r.id).filter((id) => id !== 'case');
for (let i = 0; i < ids.length; i++) {
  for (let j = i + 1; j < ids.length; j++) {
    const a = boxes.get(ids[i]), b = boxes.get(ids[j]);
    if (!a || !b) continue;
    const ov = a.clone().intersect(b);
    if (ov.isEmpty()) continue;
    const va = a.getSize(new THREE.Vector3()).x * a.getSize(new THREE.Vector3()).y * a.getSize(new THREE.Vector3()).z;
    const vb = b.getSize(new THREE.Vector3()).x * b.getSize(new THREE.Vector3()).y * b.getSize(new THREE.Vector3()).z;
    const vv = ov.getSize(new THREE.Vector3()).x * ov.getSize(new THREE.Vector3()).y * ov.getSize(new THREE.Vector3()).z;
    const ratio = vv / Math.min(va, vb);
    if (ratio > 0.02) rows.push({ id: `  ↳ ${ids[i]} ∩ ${ids[j]}`, scale: '', box0: [], box0ctr: [], box1: [], rad1: '', camDist: '', fov: '', fill: '', overlap: `${(ratio * 100).toFixed(1)}%` });
  }
}

console.log('\n=== 装配布局（世界单位，1 单位 ≈ 30cm；原点 = 机箱底板中心）===');
console.log('id             scale   t=0 尺寸 (X×Y×Z)          t=0 中心                  拆解态半径  机位距离  fov  画面占比');
for (const r of rows) {
  if (r.overlap !== undefined) { console.log(`${r.id.padEnd(28)} 重叠 ${r.overlap}`); continue; }
  console.log(
    `${r.id.padEnd(14)} ${String(r.scale).padEnd(6)} ${r.box0.join(' × ').padEnd(24)} ${('[' + r.box0ctr.join(', ') + ']').padEnd(22)} ${String(r.rad1).padEnd(10)} ${String(r.camDist).padEnd(8)} ${String(r.fov).padEnd(4)} ${(r.fill * 100).toFixed(0)}%`
  );
}

console.log('\n=== 相对大小（装配态 t=0 最长边，大→小）===');
const longs = rows.filter((r) => r.box0 && r.box0.length).map((r) => [r.id, Math.max(...r.box0)]).sort((a, b) => b[1] - a[1]);
console.log(longs.map(([id, v]) => `${id} ${v}`).join('  >  '));

const sizeRows = rows.filter((r) => r.box0 && r.box0.length);
const caseRow = sizeRows.find((r) => r.id === 'case');
if (caseRow) {
  const ok = Math.abs(caseRow.box0[0] - 0.80) < 0.02 && Math.abs(caseRow.box0[1] - 1.70) < 0.02 && Math.abs(caseRow.box0[2] - 1.72) < 0.02;
  const y0 = caseRow.box0ctr[1] - caseRow.box0[1] / 2;
  console.log(`\n机箱外部 ${caseRow.box0.join(' × ')}（目标 0.8×1.7×1.72）min.y=${f3(y0)}（目标 ≈0）→ ${ok && Math.abs(y0) < 0.02 ? '✅ 符合' : '⚠ 还不符合'}`);
}

console.log('');
if (problems.length) {
  console.log('⚠ 问题：');
  for (const p of problems) console.log('  · ' + p);
  process.exitCode = 1;
} else {
  console.log('✅ 装得进机箱、没有明显穿模、机位都留了白。');
}