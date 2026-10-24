/* ============================================================
   main.js — 装配与交互
   八大件环成一圈 → 点一个 → 镜头沿弧线飞过去 → 它拆开 → 面板滑入。
   CONTRACT.md §5 是这份实现的行为说明。
   ============================================================ */

import * as THREE from 'three';
import './ui.css';

import { createStage } from './engine/stage.js';
import { createKit } from './engine/kit.js';
import { createCameraRig } from './engine/camera.js';
import { copy } from './data/copy.js';

import cpu from './parts/cpu.js';
import cooler from './parts/cooler.js';
import motherboard from './parts/motherboard.js';
import ram from './parts/ram.js';
import storage from './parts/storage.js';
import gpu from './parts/gpu.js';
import psu from './parts/psu.js';
import chassis from './parts/case.js';

/* 环上的顺序 = 装机顺序，从处理器开始 */
const MODULES = [cpu, cooler, motherboard, ram, storage, gpu, psu, chassis];

/* ------------------------------------------------------------
   0. 环境开关
   ------------------------------------------------------------ */

const q = new URLSearchParams(location.search);
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  || q.get('motion') === 'off';
const FREEZE_T = q.has('t') ? Math.max(0, Math.min(1, parseFloat(q.get('t')) || 0)) : null;

const canvas = document.getElementById('stage');
const appEl = document.getElementById('app');

const stage = createStage(canvas);
const kit = createKit();
const rig = createCameraRig(stage.camera);

/* ------------------------------------------------------------
   1. 地面与环
   ------------------------------------------------------------ */

const RING_R = 4.6;
const START_ANGLE = 0.92;          // 让第一个元件正对初始机位
const GROUND_Y = -1.15;

/* 机位设计：地面在 y = GROUND_Y，八个元件坐落其上。
   先定义在这里，下面量元件尺寸时要用全景机位。

   仰角是关键：环从低角度看，横向会被压成"四团"——极值点附近的两个
   邻居 screen-x 几乎重合，三四个元件叠在一起看不清。抬到 42° 之后，
   前后深度差转成屏幕上的纵向差，八个元件各自分开，而且都能看到顶面
   （主板/显卡/电源的识别全靠顶面）。 */
const OVERVIEW = { from: [9.9, 12.8, 12.0], look: [0, -2.76, 0], fov: 30 };
const ESTABLISH = { from: [10.6, 5.2, 12.8], look: [0, GROUND_Y + 1.25, 0], fov: 33 };

const world = new THREE.Group();
stage.scene.add(world);

// 展台地面：比背景亮一档。地面和背景同色时，"环"中间那块空地
// 看起来不是"场地"而是"洞"，八个元件像悬在虚空里。
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(80, 80),
  kit.tint(0x22262d, { rough: 0.96, metal: 0 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = GROUND_Y;
ground.receiveShadow = true;
world.add(ground);

// 一圈极淡的定位环，让"八个位置"这件事看得出来
const ringLine = new THREE.Mesh(
  new THREE.TorusGeometry(RING_R, 0.0055, 5, 200),
  kit.glow(0x6d7783, 0.55)
);
ringLine.rotation.x = -Math.PI / 2;
ringLine.position.y = GROUND_Y + 0.004;
world.add(ringLine);

/* ------------------------------------------------------------
   2. 八个元件就位（各自"坐落"在地面上）
   ------------------------------------------------------------ */

const parts = MODULES.map((mod, i) => {
  const a = START_ANGLE + (i / MODULES.length) * Math.PI * 2;

  // 半径交替内缩/外扩：环的横向投影在极值点附近会把相邻两个元件叠在一起，
  // 让它们分处两个半径上，深度差就把它们拆开了（展台摆法）。
  const rr = RING_R + (i % 2 === 0 ? 0.42 : -0.42);

  // wrapper 决定它在环上的位置与朝向；anim 负责入场/退避，不动基准。
  // 局部 +Z 指向环外（rotation.y = π/2 − a 的几何结果），退避时沿它往外推。
  const wrapper = new THREE.Group();
  wrapper.rotation.y = Math.PI / 2 - a;
  world.add(wrapper);

  const anim = new THREE.Group();
  wrapper.add(anim);

  const built = mod.build(kit);
  anim.add(built.group);

  // 量一下这个元件自己的高度，让它底面对齐地面（这样才有接触阴影，
  // 而不是八个东西各自飘在不同高度）
  const box = new THREE.Box3().setFromObject(built.group);
  const halfH = Math.max(0.05, (box.max.y - box.min.y) / 2);

  wrapper.position.set(
    Math.cos(a) * rr,
    GROUND_Y + 0.01 - box.min.y,
    Math.sin(a) * rr
  );

  // 地面上的标识点：hue 只在这里（和选中时的光晕）出现，
  // 是"哪个部件"的唯一色彩线索，所以不能小到看不见。
  const pad = new THREE.Mesh(
    new THREE.CircleGeometry(Math.max(0.34, halfH * 0.8), 32),
    kit.tint(mod.hue, { rough: 1, metal: 0, emissive: mod.hue, emissiveIntensity: 0.13 })
  );
  pad.rotation.x = -Math.PI / 2;
  pad.position.set(wrapper.position.x, GROUND_Y + 0.006, wrapper.position.z);
  world.add(pad);

  // 机位：把"相对元件"的坐标转成世界坐标
  const rotY = new THREE.Matrix4().makeRotationY(wrapper.rotation.y);
  const toWorld = (arr) => new THREE.Vector3(...arr).applyMatrix4(rotY).add(wrapper.position);

  return {
    mod, wrapper, anim, built, pad, halfH,
    hue: '#' + mod.hue.toString(16).padStart(6, '0'),
    outward: new THREE.Vector3(Math.cos(a), 0, Math.sin(a)),
    focusFrom: toWorld(mod.focus.from),
    focusLook: toWorld(mod.focus.look ?? [0, 0, 0]),
    fov: mod.focus.fov ?? 34,
    explode: 0, emphasize: 0, recede: 0, hover: 0,
    enter: 0, delay: i * 0.085,
  };
});

/* ------------------------------------------------------------
   3. 左栏列表
   ------------------------------------------------------------ */

const pickerList = document.getElementById('picker-list');
parts.forEach((p) => {
  const li = document.createElement('li');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'picker__item';
  btn.dataset.id = p.mod.id;
  btn.style.setProperty('--h', p.hue);
  btn.innerHTML =
    `<span class="picker__hue" aria-hidden="true"></span>` +
    `<span class="picker__name">${esc(p.mod.name)}</span>` +
    `<span class="picker__en">${esc(p.mod.en)}</span>`;
  btn.addEventListener('click', () => select(p.mod.id));
  li.appendChild(btn);
  pickerList.appendChild(li);
});

/* ------------------------------------------------------------
   4. 右侧面板
   ------------------------------------------------------------ */

const panelEl = document.getElementById('panel');
const panelScroll = document.getElementById('panel-scroll');
const el = (id) => document.getElementById(id);

document.getElementById('panel-back').addEventListener('click', () => select(null));
document.getElementById('nav-prev').addEventListener('click', () => step(-1));
document.getElementById('nav-next').addEventListener('click', () => step(1));

let selected = null;

function select(id, { instant = false } = {}) {
  const p = id ? parts.find((x) => x.mod.id === id) || null : null;
  selected = p;

  appEl.classList.add('is-started');
  appEl.classList.toggle('is-open', !!p);
  document.documentElement.style.setProperty('--accent', p ? p.hue : '#c9a98a');

  for (const btn of pickerList.querySelectorAll('.picker__item')) {
    if (p && btn.dataset.id === p.mod.id) btn.setAttribute('aria-current', 'true');
    else btn.removeAttribute('aria-current');
  }

  if (p) {
    fillPanel(p);
    rig.flyTo({ from: p.focusFrom, look: p.focusLook, fov: p.fov },
      { duration: REDUCED ? 0 : 1.45, instant: REDUCED || instant });
    rig.setIdleDrift(REDUCED ? 0 : 0.045);
    panelScroll.scrollTop = 0;
  } else {
    rig.flyTo(OVERVIEW, { duration: REDUCED ? 0 : 1.7, instant: REDUCED || instant, bulge: 1.25 });
    rig.setIdleDrift(REDUCED ? 0 : 0.05);
  }
}

function fillPanel(p) {
  const c = copy[p.mod.id] || {};
  const legend = p.built.legend || [];
  const specs = c.specs || [];

  el('panel-en').textContent = p.mod.en;
  el('panel-name').textContent = p.mod.name;
  el('panel-tagline').textContent = c.tagline || '';

  el('panel-principle').innerHTML = (c.principle || []).map((t) => `<p>${esc(t)}</p>`).join('');

  el('panel-legend').innerHTML = legend.map((l) =>
    `<li class="legend__row">` +
    `<span class="legend__dot" aria-hidden="true"></span>` +
    `<div><div class="legend__name">${esc(l.text)}</div>` +
    `<div class="legend__desc">${esc(l.desc)}</div></div></li>`
  ).join('');
  el('block-legend').hidden = legend.length === 0;

  el('panel-specs').innerHTML = specs.map((s) =>
    `<div class="specs__row"><dt class="specs__k">${esc(s.k)}</dt>` +
    `<dd class="specs__v">${esc(s.v)}</dd></div>`
  ).join('');
  el('block-specs').hidden = specs.length === 0;

  const i = parts.indexOf(p);
  el('nav-pos').textContent = `${i + 1} / ${parts.length}`;
}

function step(dir) {
  if (!selected) return select(parts[0].mod.id);
  const i = parts.indexOf(selected);
  select(parts[(i + dir + parts.length) % parts.length].mod.id);
}

/* ------------------------------------------------------------
   5. 指针：悬停 / 拖动环绕 / 滚轮 / 点击选中
   ------------------------------------------------------------ */

const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let lastCast = 0;
let drag = null;

function castAt(cx, cy) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, stage.camera);
  const hits = ray.intersectObjects(parts.map((p) => p.anim), true);
  if (!hits.length) return null;
  let o = hits[0].object;
  while (o && !o.userData.__part) o = o.parent;
  return o ? o.userData.__part : null;
}
parts.forEach((p) => { p.anim.userData.__part = p; });

let hovered = null;
function hoverAt(cx, cy) {
  const now = performance.now();
  if (now - lastCast < 45) return;
  lastCast = now;
  const p = castAt(cx, cy);
  hovered = p;
  canvas.classList.toggle('is-hot', !!p && !drag);
  if (p) canvas.title = `${p.mod.name} · ${p.mod.en}`;
  else canvas.removeAttribute('title');
}

canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  canvas.setPointerCapture?.(e.pointerId);
  drag = { x: e.clientX, y: e.clientY, moved: 0 };
  canvas.classList.add('is-grab');
});

canvas.addEventListener('pointermove', (e) => {
  if (drag) {
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    drag.x = e.clientX; drag.y = e.clientY;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    if (drag.moved > 5) rig.addOrbit(dx, dy);
  } else {
    hoverAt(e.clientX, e.clientY);
    // 视差
    if (!REDUCED) {
      const r = canvas.getBoundingClientRect();
      rig.setParallax(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        -(((e.clientY - r.top) / r.height) * 2 - 1)
      );
    }
  }
});

function endDrag(e) {
  const wasDrag = drag && drag.moved > 5;
  drag = null;
  canvas.classList.remove('is-grab');
  if (!wasDrag && e) {
    const p = castAt(e.clientX, e.clientY);
    select(p ? p.mod.id : null);
  }
}
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', () => { drag = null; canvas.classList.remove('is-grab'); });
canvas.addEventListener('pointerleave', () => {
  hovered = null;
  canvas.classList.remove('is-hot');
  if (!REDUCED) rig.setParallax(0, 0);
});

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  rig.addZoom(Math.exp(e.deltaY * 0.0011));
}, { passive: false });

window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
  else if (e.key === 'Escape') { e.preventDefault(); select(null); }
});

/* ------------------------------------------------------------
   6. 帧循环
   ------------------------------------------------------------ */

stage.onTick((elapsed, dt) => {
  rig.update(elapsed, dt);

  for (const p of parts) {
    /* --- 拆解 --- */
    if (p === selected && FREEZE_T !== null) {
      p.explode = FREEZE_T;
    } else {
      p.explode = REDUCED
        ? (p === selected ? 1 : 0)
        : kit.damp(p.explode, p === selected ? 1 : 0, 3.4, dt);
    }
    p.built.setExplode(p.explode);

    /* --- 每帧的持续动画：选中的跑得快，其余保持待机 --- */
    const emph = kit.damp(p.emphasize, p === selected ? 1 : 0, 3.0, dt);
    p.emphasize = emph;
    p.built.update?.(elapsed, dt, emph);

    /* --- 入场 + 其他元件退避 --- */
    if (elapsed > p.delay) p.enter = kit.clamp01(p.enter + dt / 0.85);
    const e = REDUCED ? 1 : kit.easeOut(p.enter);
    p.recede = REDUCED ? ((selected && p !== selected) ? 1 : 0)
                       : kit.damp(p.recede, (selected && p !== selected) ? 1 : 0, 3.0, dt);
    p.hover = kit.damp(p.hover, hovered === p ? 1 : 0, 8, dt);

    // 入场：从上方轻轻落下（不穿到地面以下）；退避：沿局部 +Z（环外）推开
    const s = (0.60 + 0.40 * e) * (1 - 0.30 * p.recede) * (1 + 0.05 * p.hover);
    p.anim.scale.setScalar(s);
    p.anim.position.set(0, (1 - e) * 0.55 - 0.40 * p.recede, 1.9 * p.recede);

    p.wrapper.visible = e > 0.002;
    p.pad.visible = e > 0.002;
    // 标识点跟着元件一起被推开，不要留在地上当孤儿
    p.pad.position.set(
      p.wrapper.position.x + p.outward.x * 1.9 * p.recede,
      GROUND_Y + 0.006,
      p.wrapper.position.z + p.outward.z * 1.9 * p.recede
    );
  }
});

/* ------------------------------------------------------------
   7. 尺寸 / 可见性 / 首屏
   ------------------------------------------------------------ */

if (window.ResizeObserver) {
  new ResizeObserver(() => stage.resize()).observe(canvas);
} else {
  window.addEventListener('resize', () => stage.resize());
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) stage.stop(); else stage.start();
});

// 开场：从大远景推进到全景机位，元件逐个升起
rig.flyTo(ESTABLISH, { instant: true });
stage.start();
setTimeout(() => {
  select(q.get('part') || null, { instant: false });
  if (!q.get('part')) rig.flyTo(OVERVIEW, { duration: REDUCED ? 0 : 2.6, instant: REDUCED, bulge: 1.5 });
}, 90);

/* ------------------------------------------------------------
   工具
   ------------------------------------------------------------ */

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (m) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

// 方便排查：控制台里能看到引擎句柄
window.__anatomy = { stage, kit, rig, parts, select };