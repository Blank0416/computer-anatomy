/* ============================================================
   main.js — 装配与交互
   装配态 = 一台立式中塔机箱：机箱先到位，八个元件从打开的侧板外
   依次飞进来装好；点某一个 → 它沿 +X（侧板那侧）抽出机箱并拆开，
   镜头跟着飞到它跟前；Esc 或点空白 → 它装回去，镜头退回全景。
   位置/朝向/比例表在 src/data/layout.js，CONTRACT.md §5 是行为说明。
   ============================================================ */

import * as THREE from 'three';
import './ui.css';

import { createStage } from './engine/stage.js';
import { createKit } from './engine/kit.js';
import { createCameraRig } from './engine/camera.js';
import { copy } from './data/copy.js';
import { layout } from './data/layout.js';

import cpu from './parts/cpu.js';
import cooler from './parts/cooler.js';
import motherboard from './parts/motherboard.js';
import ram from './parts/ram.js';
import storage from './parts/storage.js';
import gpu from './parts/gpu.js';
import psu from './parts/psu.js';
import chassis from './parts/case.js';

/* 列表里的顺序 = 面板上一个/下一个的顺序，从处理器开始 */
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
   1. 机位设计
   ------------------------------------------------------------ */

/* 元件机位还要再拉远多少。元件模型是按「自己单独摆」调的机位，
   装进机箱后整体乘了布局的 scale，拆解态会顶到画面边被切角。
   这个系数不是拍脑袋来的：`node tools/place.mjs` 会算出每件拆解态的
   半径在机位距离、该 fov 下占画面多少，要求 ≤80%（最坏是包围盒的
   对角，所以留白比标称的更宽）。实测显卡最贪，1.45 时占 114%，
   2.15 时降到 77%，其余都在 62%~77%。改机位后重跑那个脚本。 */
/* 元件机位：展开态包围球半径占画面短边一半的比例。0.62 ≈ 四周留 38% 白。
   固定倍率 K_FOCUS 已被「按包围球自动解距」取代 —— 元件重做后展开态尺寸会差很多，
   固定距离必然让大件顶到画面边缘。 */
const FILL = 0.45;

/* 全景：从打开的侧板（+X）斜前上方看进去，整机都在画面里。
   整机 0.80 × 1.70 × 1.72，最远的角离注视点 1.26 —— 距离 6.2、fov 32 时
   画面半高 1.79，占 70%，留白够。 */
const OVERVIEW = { from: [4.30, 3.30, 3.80], look: [0, 0.86, 0], fov: 32 };
/* 开场远景：从更远处推进来，让「这是一台机器」先立住 */
const ESTABLISH = { from: [8.40, 6.00, 7.00], look: [0, 0.95, 0], fov: 32 };

const world = new THREE.Group();
stage.scene.add(world);

/* 地面：比背景亮一档，给机箱一个落脚的场地和接触阴影。
   压在 +Y 之下 4‰，避免和机箱底板共面打架。 */
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(60, 60),
  kit.tint(0x22262d, { rough: 0.96, metal: 0 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.004;
ground.receiveShadow = true;
world.add(ground);

/* 背景穹顶：一整片竖直渐变，替掉原来的纯色清屏。
   这也是「颜色有点灰」的一半解 —— 机身是深色的，背景也是深灰的话，
   整幅画就只剩明度没有色相。穹顶顶部混一点当前元件的色相，
   选中谁，整个空间跟着轻微偏一点色。

   注意 `fog: false`：穹顶半径 60，远在雾的 far(34) 之外，
   不关掉雾它会被整片替换成雾色，渐变就白做了。 */
const skyCanvas = document.createElement('canvas');
skyCanvas.width = 8;
skyCanvas.height = 256;
const skyTex = new THREE.CanvasTexture(skyCanvas);
skyTex.colorSpace = THREE.SRGBColorSpace;
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(60, 32, 16),
  new THREE.MeshBasicMaterial({
    map: skyTex, side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
  })
);
world.add(sky);

const SKY_BASE = new THREE.Color(0x171a1f);
const GROUND_BASE = new THREE.Color(0x22262d);
const skyTmp = new THREE.Color();

function paintSky(hueHex) {
  const g = skyCanvas.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  // 顶部只混 22% 的色相，再多就变成彩色背景布了
  skyTmp.set(hueHex).lerp(SKY_BASE, 0.78);
  grad.addColorStop(0.0, skyTmp.getStyle());
  grad.addColorStop(0.42, SKY_BASE.getStyle());
  grad.addColorStop(1.0, '#0e1014');
  g.fillStyle = grad;
  g.fillRect(0, 0, 8, 256);
  skyTex.needsUpdate = true;
  // 地面也跟着沾一点色（5% 就够），否则机身和地面是两个色温
  ground.material.color.copy(GROUND_BASE).lerp(skyTmp.set(hueHex), 0.05);
}
paintSky(0xc9a98a);

/* ------------------------------------------------------------
   2. 装配顺序与延迟（这是真实装机顺序，开场就按它一件件飞进来）
   ------------------------------------------------------------ */

const INSTALL = {
  case: 0,          // 机箱先落位，后面的东西才有地方装
  motherboard: 0.34,
  psu: 0.62,
  cpu: 0.88,
  cooler: 1.10,
  ram: 1.32,
  storage: 1.54,
  gpu: 1.76,
};
const ENTER_DUR = 0.95;        // 每一件飞进来要多久
const ENTER_GAP = 2.60;        // 从多远处飞进来（世界单位）

/* ------------------------------------------------------------
   3. 八个元件就位
   层级：world → mover（装配位移，走世界轴）→ wrapper（座位：位置/朝向/比例）
              → anim（元件自身微动，走局部轴）→ built.group
   拆开 mover 和 wrapper 是为了让「抽出去」这件事永远沿世界 +X，
   不用去算每个元件各自被旋转过多少度。
   ------------------------------------------------------------ */

const parts = MODULES.map((mod) => {
  const L = mod.id === 'case' ? layout.case : layout.parts[mod.id];
  if (!L) throw new Error(`layout.js 里缺少 ${mod.id} 的位置`);

  const mover = new THREE.Group();
  world.add(mover);

  const wrapper = new THREE.Group();
  wrapper.position.set(L.pos[0], L.pos[1], L.pos[2]);
  wrapper.rotation.set(L.rot[0], L.rot[1], L.rot[2], 'XYZ');
  wrapper.scale.setScalar(L.scale);
  mover.add(wrapper);

  const anim = new THREE.Group();
  wrapper.add(anim);

  const built = mod.build(kit);
  anim.add(built.group);

  anim.userData.__part = null;   // 下面填

  /* 机位：元件的 focus 是「相对元件自己原点」的坐标。
     先按布局的 scale 缩放、再按布局的朝向旋转，就得到世界偏移。
     抽出去之后元件整体平移，所以镜头目标 = mover 当前位置 + 这个偏移。 */
  const quat = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(L.rot[0], L.rot[1], L.rot[2], 'XYZ')
  );

  /* 机位自动装框：先临时炸开到 t=1 量一次包围球（展开态才是看得最满的状态），
     再按 fov 反解出「刚好装下」的距离，取它和作者给定机位距离的较大者。
     画面中心对准展开态包围球心 —— 有些件的拆解会上抬（散热器），
     对准原点会让它跑到画面外。 */
  const fovV = mod.focus.fov ?? 34;
  built.setExplode(1);
  built.group.updateMatrixWorld(true);
  const sphere = new THREE.Box3()
    .setFromObject(built.group)
    .getBoundingSphere(new THREE.Sphere());
  built.setExplode(0);
  built.group.updateMatrixWorld(true);

  const dirLocal = new THREE.Vector3(...mod.focus.from);
  const authored = dirLocal.length();     // 作者给的机位距离，作下限
  dirLocal.normalize();
  const fitDist =
    sphere.radius / (FILL * Math.tan(THREE.MathUtils.degToRad(fovV / 2)));
  const offFrom = dirLocal
    .multiplyScalar(Math.max(authored, fitDist) * L.scale)
    .applyQuaternion(quat);
  const offLook = sphere.center
    .clone()
    .multiplyScalar(L.scale)
    .applyQuaternion(quat);

  const seat = new THREE.Vector3(L.pos[0], L.pos[1], L.pos[2]);
  const extractVec = new THREE.Vector3(L.extract[0], L.extract[1], L.extract[2]);
  const outPos = seat.clone().add(extractVec);

  const p = {
    mod, mover, wrapper, anim, built, seat, extractVec,
    offFrom, offLook, outPos,
    hue: '#' + mod.hue.toString(16).padStart(6, '0'),
    fov: mod.focus.fov ?? 34,
    // 进场：从侧板外飞进来。mover 走世界轴，所以要换算成世界距离。
    enterDist: mod.id === 'case' ? 0.95 : ENTER_GAP,
    delay: INSTALL[mod.id] ?? 0,
    /* 全部初始化为 0 —— 少写一个就会让 kit.damp(undefined, …) 算出 NaN，
       而 NaN 一旦进到 position/scale 里，元件会直接消失 */
    explode: 0, emphasize: 0, extract: 0, recede: 0, hover: 0, enter: 0,
    /* 机位用普通数组：camera.js 的 flyTo 用 a[0]/a[1]/a[2] 取值，
       传 Vector3 会取到 undefined → 被吞成 0 → 镜头飞到世界原点。 */
    shot(at) {
      return {
        from: at.clone().add(this.offFrom).toArray(),
        look: at.clone().add(this.offLook).toArray(),
        fov: this.fov,
      };
    },
  };
  anim.userData.__part = p;
  return p;
});

/* ------------------------------------------------------------
   4. 左栏列表
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
   5. 右侧面板
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
  paintSky(p ? p.hue : 0xc9a98a);   // 空间色温跟着选中的元件走

  for (const btn of pickerList.querySelectorAll('.picker__item')) {
    if (p && btn.dataset.id === p.mod.id) btn.setAttribute('aria-current', 'true');
    else btn.removeAttribute('aria-current');
  }

  if (p) {
    fillPanel(p);
    // 镜头飞到「抽出来之后」的位置：元件还在往那儿走，镜头也正好一起到
    rig.flyTo(p.shot(p.outPos), {
      duration: REDUCED ? 0 : 1.45,
      instant: REDUCED || instant,
    });
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
   6. 指针：悬停 / 拖动环绕 / 滚轮 / 点击选中
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
   7. 帧循环
   ------------------------------------------------------------ */

/* ?part=xxx 是调试通道，直接看元件拆解态，不要让它等装配动画 */
const BOOT_PART = q.get('part');
if (BOOT_PART) parts.forEach((p) => { p.enter = 1; p.delay = 0; });

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

    /* --- 装配入场：从打开的侧板外飞进来 --- */
    if (elapsed > p.delay) p.enter = kit.clamp01(p.enter + dt / ENTER_DUR);
    const e = REDUCED ? 1 : kit.easeOut(p.enter);

    /* --- 抽出：选中就往 +X 走，其他退回座位 --- */
    p.extract = REDUCED
      ? (p === selected ? 1 : 0)
      : kit.damp(p.extract, p === selected ? 1 : 0, 2.6, dt);

    /* --- 没被选中的稍微缩一点，把注意力留给抽出来那件 --- */
    p.recede = REDUCED
      ? ((selected && p !== selected) ? 1 : 0)
      : kit.damp(p.recede, (selected && p !== selected) ? 1 : 0, 3.0, dt);
    p.hover = kit.damp(p.hover, hovered === p ? 1 : 0, 8, dt);

    // 装配位移走世界轴：还没装进来的停在外侧，选中的沿 +X 抽出去
    p.mover.position.set(
      (1 - e) * p.enterDist + p.extractVec.x * p.extract,
      p.extractVec.y * p.extract,
      p.extractVec.z * p.extract
    );

    // 元件自身的微动走局部轴（不影响「抽出去」的方向）
    const s = (0.72 + 0.28 * e) * (1 - 0.16 * p.recede) * (1 + 0.04 * p.hover);
    p.anim.scale.setScalar(s);

    p.mover.visible = e > 0.002;
  }
});

/* ------------------------------------------------------------
   8. 尺寸 / 可见性 / 首屏
   ------------------------------------------------------------ */

if (window.ResizeObserver) {
  new ResizeObserver(() => stage.resize()).observe(canvas);
} else {
  window.addEventListener('resize', () => stage.resize());
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) stage.stop(); else stage.start();
});

/* 开场：远景 → 机箱先落位 → 八件按装机顺序飞进来 → 推到全景机位。
   镜头推进（2.9 s）和最后一件装好（gpu: 1.76 + 0.95 = 2.71 s）基本同时结束。 */
rig.flyTo(ESTABLISH, { instant: true });
stage.start();
setTimeout(() => {
  select(BOOT_PART || null, { instant: false });
  if (!BOOT_PART) rig.flyTo(OVERVIEW, { duration: REDUCED ? 0 : 2.9, instant: REDUCED, bulge: 1.5 });
}, 90);

/* ------------------------------------------------------------
   工具
   ------------------------------------------------------------ */

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (m) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

// 方便排查：控制台里能看到引擎句柄
window.__anatomy = { stage, kit, rig, parts, select, layout };