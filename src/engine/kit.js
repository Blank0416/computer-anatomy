/* ============================================================
   kit.js — 共享材质库 + 几何脚手架
   八个元件全部通过这些材质/工具建模，保证质感是同一套语言。
   CONTRACT.md §2 §3 是面向使用者的文档，这份是实现。
   ============================================================ */

import * as THREE from 'three';
import { createDetail } from './detail.js';

/* ------------------------------------------------------------
   1. 共享材质库（低饱和，明度集中在 45%–78%）
   ------------------------------------------------------------ */

function buildMaterials() {
  const S = (o) => new THREE.MeshStandardMaterial(o);
  const P = (o) => new THREE.MeshPhysicalMaterial(o);

  return {
    // 电路板：深青灰，哑光。不用真的"阻焊绿"，那太饱和。
    pcb: S({ color: 0x2b3a3c, roughness: 0.78, metalness: 0.06 }),

    // 裸晶片 / 硅 die：极暗，带一点冷调，表面略有光泽
    silicon: S({ color: 0x232a33, roughness: 0.34, metalness: 0.16 }),

    // 铝：外壳、散热鳍片。金属感收一点 —— 纯反射材质在暗环境里会整块发黑，
    // 留些漫反射才看得见体积。
    metal: S({ color: 0x9aa0a6, roughness: 0.44, metalness: 0.62 }),

    // 深灰结构件、螺丝、支架
    metalDark: S({ color: 0x555b62, roughness: 0.5, metalness: 0.56 }),

    // 亚光塑料：浅中灰
    plastic: S({ color: 0x8d9299, roughness: 0.72, metalness: 0.02 }),
    plasticMid: S({ color: 0x6d737a, roughness: 0.74, metalness: 0.02 }),
    plasticDark: S({ color: 0x3a3f46, roughness: 0.78, metalness: 0.03 }),

    // 铜：热管、铜走线。低饱和暖铜，不要做成亮橙。
    copper: S({ color: 0xa8765a, roughness: 0.36, metalness: 0.7 }),

    // 金手指 / 触点：低饱和的哑金
    gold: S({ color: 0xb99b62, roughness: 0.42, metalness: 0.74 }),

    // 陶瓷 / 电容封装：灰米
    ceramic: S({ color: 0xa8a294, roughness: 0.62, metalness: 0.04 }),

    // 深色烟熏侧板：给"剖开看内部"用。不做真折射（太贵）。
    // 关键是颜色要深 —— 浅灰 + 低不透明度在暗底上会糊成一块白板。
    glass: P({
      // 密度要低：这张侧板正对镜头，一旦压到 0.3 就变成一只黑箱子，整机内部全看不见。
      // 现在的做法是"几乎全透 + 留一点高光"，读者靠它边缘的框、螺丝和反光认出这是玻璃。
      color: 0x7d8b96, roughness: 0.18, metalness: 0.0,
      transparent: true, opacity: 0.09, transmission: 0.0,
      side: THREE.DoubleSide, depthWrite: false,
    }),

    // 风扇脚垫 / 密封
    rubber: S({ color: 0x1c1f23, roughness: 0.95, metalness: 0.0 }),
  };
}

/* ------------------------------------------------------------
   1.5 细节层：把程序化纹理挂到共享材质上
   ------------------------------------------------------------
   这是整份文件里"性价比"最高的一段 —— 八个元件全部复用这几个共享材质，
   所以在这一处加贴图，八件同时从"塑料积木"变成"有材料感的实物"。
   注意：贴图自带颜色时，材质 color 必须置白，否则颜色会被乘两次。
   ------------------------------------------------------------ */
function decorate(detail, mats) {
  const put = (m, t, color, over) => {
    m.map = t.map;
    if (t.roughnessMap) m.roughnessMap = t.roughnessMap;
    if (t.normalMap) {
      m.normalMap = t.normalMap;
      m.normalScale = new THREE.Vector2(0.45, 0.45);
    }
    m.color = new THREE.Color(color);
    if (over) Object.assign(m, over);
    m.needsUpdate = true;
  };

  // 注意：下面每个 hex 是**贴图里烘进去的颜色**，不是材质 color —— 见 put() 的第一句话。
  // 深色件在深色底上会糊成一片，所以整体比"真实值"亮一档：这是照明补偿，不是配色偏好。
  put(mats.pcb, detail.tex.pcb({ base: '#2b3c3b', trace: '#3c5a52', silk: '#9ba39d' }), 0xffffff, {
    normalScale: new THREE.Vector2(0.62, 0.62),
    roughness: 0.72,
  });
  put(mats.metal, detail.tex.brushed(0xb0b6bc, { repeat: 3 }), 0xffffff);
  put(mats.metalDark, detail.tex.brushed(0x676e76, { repeat: 3, strength: 0.07 }), 0xffffff);
  put(mats.copper, detail.tex.brushed(0xb58467, { repeat: 2.5, strength: 0.06 }), 0xffffff);
  put(mats.plastic, detail.tex.grain(0x9ba1a8, { repeat: 3 }), 0xffffff);
  put(mats.plasticMid, detail.tex.grain(0x7b828a, { repeat: 3 }), 0xffffff);
  put(mats.plasticDark, detail.tex.grain(0x494f57, { repeat: 3 }), 0xffffff);

  // 金手指/触点：只加极细的凹凸，颜色不动（哑金要保准）
  const g = detail.tex.grain(0xb99b62, { size: 128, amount: 10, repeat: 4 });
  mats.gold.normalMap = g.normalMap;
  mats.gold.normalScale = new THREE.Vector2(0.18, 0.18);
  mats.gold.needsUpdate = true;
}

/* ------------------------------------------------------------
   2. 工具
   ------------------------------------------------------------ */

/** 确定性随机（mulberry32）——保证每次打开长得一模一样 */
function makeRng(seed) {
  let a = (seed >>> 0) || 0x9e3779b9;
  return function rng() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 帧率无关的指数平滑。lambda 越大越跟手（6 慢 / 12 快） */
function damp(cur, target, lambda, dt) {
  return target + (cur - target) * Math.exp(-lambda * Math.max(dt, 0));
}

const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
const easeInOut = (t) => { t = clamp01(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const easeOut = (t) => 1 - Math.pow(1 - clamp01(t), 3);
const easeIn = (t) => Math.pow(clamp01(t), 3);
const easeOutBack = (t) => {
  const c1 = 1.70158, c3 = c1 + 1; t = clamp01(t);
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

/** 往白/黑方向挪：amt>0 提亮，amt<0 压暗（在 sRGB 里做，够用） */
function accent(hex, amt = 0) {
  const c = new THREE.Color(hex);
  const t = amt > 0 ? 0xffffff : 0x000000;
  c.lerp(new THREE.Color(t), Math.min(Math.abs(amt), 1));
  return c.getHex();
}

/* ------------------------------------------------------------
   3. kit 工厂
   ------------------------------------------------------------ */

export function createKit() {
  const mats = buildMaterials();
  const cache = new Map();

  const mark = (m) => { m.castShadow = true; m.receiveShadow = true; return m; };

  const kit = {
    THREE,
    mats,

    /** 取共享材质；over 可覆盖参数（会按参数缓存，不会每帧新建材质） */
    mat(name, over) {
      const base = mats[name];
      if (!base) throw new Error(`[kit] 未知材质 "${name}"，可用：${Object.keys(mats).join(', ')}`);
      if (!over) return base;
      const key = name + '|' + JSON.stringify(over);
      if (cache.has(key)) return cache.get(key);
      const m = base.clone();
      Object.assign(m, over);
      if (over.color !== undefined) m.color = new THREE.Color(over.color);
      cache.set(key, m);
      return m;
    },

    /** 以低饱和色生成亚光材质（元件标识色用这个） */
    tint(hex, o = {}) {
      const key = 'tint|' + hex + '|' + JSON.stringify(o);
      if (cache.has(key)) return cache.get(key);
      const m = new THREE.MeshStandardMaterial({
        color: new THREE.Color(hex),
        roughness: o.rough ?? 0.62,
        metalness: o.metal ?? 0.08,
      });
      if (o.emissive !== undefined) {
        m.emissive = new THREE.Color(o.emissive);
        m.emissiveIntensity = o.emissiveIntensity ?? 0.35;
      }
      cache.set(key, m);
      return m;
    },

    /** 自发光（指示灯、数据流、发光走线） */
    glow(hex, intensity = 1.2) {
      const key = `glow|${hex}|${intensity}`;
      if (cache.has(key)) return cache.get(key);
      const m = new THREE.MeshStandardMaterial({
        color: new THREE.Color(hex),
        emissive: new THREE.Color(hex),
        emissiveIntensity: intensity,
        roughness: 0.5, metalness: 0,
        toneMapped: false,
      });
      cache.set(key, m);
      return m;
    },

    /* ---------- 几何快捷 ---------- */

    box(w, h, d, mat, seg) {
      const g = new THREE.BoxGeometry(w, h, d, seg, seg, seg);
      return mark(new THREE.Mesh(g, mat));
    },
    cyl(rt, rb, h, seg, mat, open) {
      return mark(new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg, 1, !!open), mat));
    },
    sphere(r, seg, mat) {
      return mark(new THREE.Mesh(new THREE.SphereGeometry(r, seg, seg / 2), mat));
    },
    plane(w, h, mat) {
      return mark(new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat));
    },

    /** 一排引脚 / 金手指 */
    pins(n, spacing, mat, { w = 0.03, h = 0.06, d = 0.012 } = {}) {
      const g = new THREE.Group();
      const geo = new THREE.BoxGeometry(w, h, d);
      const mesh = new THREE.InstancedMesh(geo, mat, n);
      const m4 = new THREE.Matrix4();
      const x0 = -((n - 1) * spacing) / 2;
      for (let i = 0; i < n; i++) {
        m4.makeTranslation(x0 + i * spacing, 0, 0);
        mesh.setMatrixAt(i, m4);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = mesh.receiveShadow = true;
      g.add(mesh);
      return g;
    },

    /** 沿 3D 折线生成走线 / 热管（Catmull-Rom 平滑 + Tube） */
    trace(points, radius = 0.02, mat, tubular = 24) {
      const pts = points.map((p) => Array.isArray(p) ? new THREE.Vector3(...p) : p);
      const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.4);
      const geo = new THREE.TubeGeometry(curve, tubular, radius, 6, false);
      const mesh = mark(new THREE.Mesh(geo, mat));
      mesh.userData.curve = curve;
      return mesh;
    },

    /** 沿曲线取点（做"数据沿走线流动"用） */
    pointOn(mesh, t) {
      return mesh.userData.curve.getPointAt(clamp01(t));
    },

    /** 二维阵列。fn(x, y, i, j) 返回 Object3D 或 null */
    grid(cols, rows, cell, fn, { centered = true } = {}) {
      const g = new THREE.Group();
      const ox = centered ? -((cols - 1) * cell) / 2 : 0;
      const oy = centered ? -((rows - 1) * cell) / 2 : 0;
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const o = fn(ox + i * cell, oy + j * cell, i, j);
          if (o) { o.position.x += ox + i * cell; o.position.y += oy + j * cell; g.add(o); }
        }
      }
      return g;
    },

    /** 小球（数据流光子） */
    dot(x, y, z, mat, size = 0.03) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(size, 8, 6), mat);
      m.position.set(x, y, z);
      return m;
    },

    rng: makeRng,
    damp, clamp01, easeInOut, easeOut, easeIn, easeOutBack, accent,

    /** 用 hue 派生的中性化色（元件标识色） */
    hueMat(hex, opts) {
      return kit.tint(hex, { rough: 0.55, metal: 0.1, ...opts });
    },

    /** 大致统计三角面数（自查用） */
    stats(root) {
      let tris = 0, meshes = 0;
      root.traverse((o) => {
        if (!o.isMesh) return;
        meshes++;
        const g = o.geometry;
        if (!g) return;
        const count = g.index ? g.index.count : (g.attributes.position ? g.attributes.position.count : 0);
        tris += (count / 3) * (o.isInstancedMesh ? o.count : 1);
      });
      return { tris: Math.round(tris), meshes };
    },
  };

  // 细节层（程序化纹理 + 细零件库）。懒加载：纹理只有真被用到才生成。
  const detail = createDetail(kit);
  // 纯 Node 环境（tools/audit.mjs、tools/place.mjs）没有 document，
  // 跳过贴图挂载 —— 几何与拆解逻辑照常可测。
  if (typeof document !== 'undefined') decorate(detail, mats);
  kit.detail = detail;

  return kit;
}