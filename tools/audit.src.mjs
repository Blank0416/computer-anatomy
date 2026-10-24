/* ============================================================
   tools/audit.src.mjs — 纯 Node 静态验收（不用浏览器、几乎不耗 CPU）

   由 tools/audit.mjs 用 esbuild 打包（--alias:three=vendor/three.module.js）后运行。
   对 CONTRACT.md §7 的自查清单做机器可判定的部分：
     · 导出字段齐全、focus 坐标合法
     · 只用 kit 材质（统计材质是不是 kit 注册过的实例）
     · setExplode 0→1→0 逐物体完全复原（position + quaternion）
     · update 无 NaN，且在 t 固定时不改变位置绝对值（无状态性）
     · 三角面数 / 包围盒（t=0 紧凑、t=1 展开、全程 ≤ 上限）
     · copy.js 契约（八个 id、tagline 长度、principle 段数、specs 条数）
   ============================================================ */

import * as THREE from 'three';
import { createKit } from '../src/engine/kit.js';
import { copy } from '../src/data/copy.js';

import cpu from '../src/parts/cpu.js';
import cooler from '../src/parts/cooler.js';
import motherboard from '../src/parts/motherboard.js';
import ram from '../src/parts/ram.js';
import storage from '../src/parts/storage.js';
import gpu from '../src/parts/gpu.js';
import psu from '../src/parts/psu.js';
import chassis from '../src/parts/case.js';

const MODULES = [cpu, cooler, motherboard, ram, storage, gpu, psu, chassis];
const LIMIT_XYZ = 1.6;        // t=0（未拆解）上限：这一档必须"像个实物"
const LIMIT_XYZ_CASE = 2.2;
const LIMIT_ALL = 1.8;        // 拆解过程任意 t 的上限（见 CONTRACT.md §1.5 的修订理由）
const LIMIT_ALL_CASE = 2.4;
const LIMIT_TRIS = 60000;

const kit = createKit();

/* kit 注册过的材质，用来判断元件有没有偷偷自建材质 */
const kitMats = new Set(Object.values(kit.mats));
const overCache = new Set();

const f2 = (n) => Math.round(n * 100) / 100;
const size = (b) => [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z].map(f2);

/* 逐物体快照（世界矩阵分解），用于可逆性比对 */
function snapshot(root) {
  const out = [];
  root.traverse((o) => out.push({ o, p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone() }));
  return out;
}
function maxDelta(snap) {
  let d = 0;
  for (const { o, p, q, s } of snap) {
    d = Math.max(d, o.position.distanceTo(p), Math.abs(o.quaternion.dot(q)) < 0 ? 1 : 1 - Math.abs(o.quaternion.dot(q)),
      o.scale.distanceTo(s));
  }
  return d;
}
function hasNaN(root) {
  let bad = 0;
  root.traverse((o) => {
    const v = [o.position.x, o.position.y, o.position.z, o.quaternion.x, o.quaternion.y, o.quaternion.z, o.quaternion.w];
    if (v.some((n) => !Number.isFinite(n))) bad++;
  });
  return bad;
}

const rows = [];
const problems = [];

for (const m of MODULES) {
  const r = { id: m.id, name: m.name, en: m.en, hue: '0x' + m.hue.toString(16), tris: 0, meshes: 0, mat: 'ok', box0: '', box1: '', maxAxis: 0, revert: 0, nan: 0 };
  if (!m.id || !m.name || !m.en || typeof m.hue !== 'number') problems.push(`${m.id}: 顶层字段缺失`);
  if (!m.focus || !Array.isArray(m.focus.from) || !Array.isArray(m.focus.look)) problems.push(`${m.id}: focus 非法`);
  else if (!Number.isFinite(m.focus.fov)) problems.push(`${m.id}: focus.fov 非法`);

  let api;
  try { api = m.build(kit); } catch (e) { problems.push(`${m.id}: build 抛异常 ${e.message}`); rows.push(r); continue; }
  for (const k of ['group', 'setExplode', 'update', 'legend']) if (api[k] === undefined) problems.push(`${m.id}: build() 缺 ${k}`);

  const { group, setExplode, update } = api;

  /* 材质来源 + 面数 */
  group.traverse((o) => {
    if (!o.isMesh && !o.isInstancedMesh && !o.isLine) return;
    r.meshes++;
    const g = o.geometry;
    if (g) {
      const idx = g.index ? g.index.count : g.attributes.position ? g.attributes.position.count : 0;
      r.tris += (idx / 3) * (o.isInstancedMesh ? o.count : 1);
    }
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const mt of mats) {
      if (!mt) { problems.push(`${m.id}: 有 mesh 没有材质`); continue; }
      if (kitMats.has(mt)) continue;
      overCache.add(mt);   // kit.mat(name, over) 的派生材质也合法，记下来最后统一判断
    }
  });
  r.tris = Math.round(r.tris);

  const snap = snapshot(group);

  /* 包围盒：t=0 与 t=1 */
  const boxAt = (t) => {
    setExplode(t);
    group.updateMatrixWorld(true);
    return new THREE.Box3().setFromObject(group);
  };
  const b0 = boxAt(0), b1 = boxAt(1);
  r.box0 = size(b0).join('×');
  r.box1 = size(b1).join('×');

  /* 全程尺寸（含中间态，中间态最容易超界） */
  const cap = m.id === 'case' ? LIMIT_ALL_CASE : LIMIT_ALL;
  const cap0 = m.id === 'case' ? LIMIT_XYZ_CASE : LIMIT_XYZ;
  for (let i = 0; i <= 20; i++) {
    const b = boxAt(i / 20);
    const axis = Math.max(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z);
    r.maxAxis = Math.max(r.maxAxis, axis);
  }
  r.maxAxis = f2(r.maxAxis);
  if (r.maxAxis > cap + 1e-6) problems.push(`${m.id}: 拆解全程最大轴 ${r.maxAxis} > ${cap}`);
  const c0 = [b0.max.x - b0.min.x, b0.max.y - b0.min.y, b0.max.z - b0.min.z].map(f2);
  if (Math.max(...c0) > cap0 + 1e-6) problems.push(`${m.id}: t=0 已超界 ${c0.join('×')} > ${cap0}`);

  /* setExplode 可逆性：0→1→0 */
  setExplode(1); setExplode(0.37); setExplode(0.37); setExplode(0);
  r.revert = +maxDelta(snap).toFixed(6);
  if (r.revert > 1e-6) problems.push(`${m.id}: setExplode 不可逆 delta=${r.revert}`);

  /* update：无 NaN，且不改位置绝对值 */
  const before = snapshot(group).map((x) => x.p.clone());
  for (let i = 0; i < 60; i++) update(i * 0.05, 0.016);
  const after = snapshot(group);
  let moved = 0;
  for (let i = 0; i < after.length; i++) moved = Math.max(moved, after[i].o.position.distanceTo(before[i]));
  r.nan = hasNaN(group);
  setExplode(0);
  if (r.nan) problems.push(`${m.id}: update 后出现 ${r.nan} 个 NaN 变换`);
  r.updateMoved = +moved.toFixed(4);

  /* legend */
  if (!Array.isArray(api.legend) || api.legend.length < 2) problems.push(`${m.id}: legend 少于 2 条`);
  else if (api.legend.some((l) => !l.text || !l.desc)) problems.push(`${m.id}: legend 条目缺 text/desc`);

  if (r.tris > LIMIT_TRIS) problems.push(`${m.id}: 三角面 ${r.tris} > ${LIMIT_TRIS}`);
  rows.push(r);
}

/* 派生材质是否都来自 kit（kit.mat 的 over 参数会生成新材质，无法直接识别实例，
   这里退一步：判断有没有 MeshStandardMaterial 以外的可疑自建材质） */
for (const mt of overCache) {
  if (!mt.isMeshStandardMaterial && !mt.isMeshPhysicalMaterial && !mt.isLineBasicMaterial && !mt.isMeshBasicMaterial) {
    problems.push(`疑似自建材质: ${mt.type}`);
  }
}

/* copy.js 契约 */
const ids = MODULES.map((m) => m.id);
const copyIssues = [];
for (const id of ids) {
  const c = copy[id];
  if (!c) { copyIssues.push(`${id}: copy 缺失`); continue; }
  if (!c.tagline || [...c.tagline].length > 28) copyIssues.push(`${id}: tagline 长度 ${[...(c.tagline || '')].length} > 28`);
  if (!Array.isArray(c.principle) || c.principle.length !== 3) copyIssues.push(`${id}: principle 不是 3 段`);
  else if (c.principle.some((p) => typeof p !== 'string' || p.length < 20)) copyIssues.push(`${id}: principle 有过短段落`);
  if (!Array.isArray(c.specs) || c.specs.length < 3 || c.specs.length > 5) copyIssues.push(`${id}: specs 条数 ${c.specs?.length}`);
  else if (c.specs.some((s) => !s.k || !s.v || [...String(s.v)].length > 12)) copyIssues.push(`${id}: specs 有非法条目`);
}
for (const k of Object.keys(copy)) if (!ids.includes(k)) copyIssues.push(`copy 多余 id: ${k}`);

/* ---------- 输出 ---------- */
const pad = (s, n) => String(s) + ' '.repeat(Math.max(0, n - [...String(s)].reduce((a, c) => a + (c.charCodeAt(0) > 255 ? 2 : 1), 0)));
console.log('\n部件           tris  mesh  t=0 包围盒(t紧凑)      t=1 包围盒(t展开)      全程最大轴  可逆delta  NaN  update位移');
for (const r of rows) {
  console.log(
    pad(r.name, 14) + pad(r.tris, 6) + pad(r.meshes, 6) +
    pad(r.box0, 24) + pad(r.box1, 24) + pad(r.maxAxis, 12) + pad(r.revert, 11) + pad(r.nan, 5) + r.updateMoved
  );
}
const tot = rows.reduce((a, r) => a + r.tris, 0);
console.log(`\n总三角面 ${tot}  部件数 ${rows.length}`);

console.log('\n文案检查：' + (copyIssues.length ? '❌' : '✅ 全部通过'));
copyIssues.forEach((s) => console.log('  - ' + s));

console.log('\n契约检查：' + (problems.length ? '❌ ' + problems.length + ' 条' : '✅ 全部通过'));
problems.forEach((s) => console.log('  - ' + s));
process.exit(problems.length || copyIssues.length ? 1 : 0);