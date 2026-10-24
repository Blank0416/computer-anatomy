/* ============================================================
   detail.js — 「表面细节 + 细零件」工具箱
   ------------------------------------------------------------
   为什么需要它：v1 的八个元件几何比例是对的，但**整个项目零张贴图、
   零件数量也太少**，所以看着像塑料积木。真实硬件"高级感"的来源其实
   只有三样，而且成本递增极陡：
     ① 表面纹理（PCB 走线/丝印、金属拉丝、磨砂颗粒）—— 最便宜，收益最大
     ② 细零件（螺丝/电容/电感/鳍片/接口/排针）—— 中等成本，收益中等
     ③ 倒角（锐边上的一线高光 + 件与件之间的暗缝）—— 便宜，收益意外地高
   这个文件把 ①②③ 都做成可复用工具，八个元件共用一套语言。

   全部贴图用 Canvas 2D **程序化生成**：
     - 不新增任何外部资源（单文件 HTML 的硬约束还在）
     - 尺寸小、可平铺、确定性（同一台机器每次长得一模一样）
   ============================================================ */

import * as THREE from 'three';

/* ------------------------------------------------------------
   0. 画布 / 贴图基础
   ------------------------------------------------------------ */

function cv(w, h) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

/* 纯 Node 环境（tools/audit.mjs、tools/place.mjs）没有 document，
   这里全部优雅降级成"没有贴图"，几何与拆解逻辑照常可测。 */
const NUL = { map: null, roughnessMap: null, normalMap: null };

/** mulberry32：确定性随机，保证每次打开纹理一致 */
function rng(seed) {
  let a = (seed >>> 0) || 0x9e3779b9;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 画布 → 贴图。
 * srgb 只给颜色贴图（albedo）；粗糙度/法线必须是线性空间，
 * 否则会被 gamma 二次校正，金属看起来会发灰。
 */
function toTex(canvas, { srgb = false, repeat = 1, mirror = false } = {}) {
  if (!canvas) return null;
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = mirror ? THREE.MirroredRepeatWrapping : THREE.RepeatWrapping;
  const [rx, ry] = Array.isArray(repeat) ? repeat : [repeat, repeat];
  t.repeat.set(rx, ry);
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

/** 高度图 → 切线空间法线图（Sobel）。法线用绿色通道表示 UV 的 +v */
function heightToNormal(heightCanvas, strength = 2.2) {
  if (!heightCanvas) return null;
  const w = heightCanvas.width, h = heightCanvas.height;
  const src = heightCanvas.getContext('2d').getImageData(0, 0, w, h).data;
  const out = cv(w, h);
  const octx = out.getContext('2d');
  const img = octx.createImageData(w, h);
  const H = (x, y) => {
    x = (x + w) % w; y = (y + h) % h;
    return src[((y * w + x) << 2)] / 255;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
      const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      let nx = -dx, ny = dy, nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len; ny /= len; nz /= len;
      const i = ((y * w + x) << 2);
      img.data[i] = (nx * 0.5 + 0.5) * 255;
      img.data[i + 1] = (ny * 0.5 + 0.5) * 255;
      img.data[i + 2] = (nz * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
}

const shade = (hex, amt) => {
  const c = new THREE.Color(hex);
  c.lerp(new THREE.Color(amt > 0 ? 0xffffff : 0x000000), Math.min(Math.abs(amt), 1));
  return '#' + c.getHexString();
};

/* ------------------------------------------------------------
   1. 纹理生成器
   ------------------------------------------------------------ */

/** PCB：阻焊底色 + 走线 + 过孔 + 丝印。最值钱的一张图。 */
function pcbTexture({
  size = 1024,
  base = '#1d2b2a',      // 阻焊深青灰
  trace = '#2f4a44',     // 走线（比底稍亮）
  silk = '#8d938f',      // 丝印（低饱和米白）
  seed = 0x51a7,
} = {}) {
  if (typeof document === 'undefined') return NUL;
  const c = cv(size, size), x = c.getContext('2d');
  const hgt = cv(size, size), hx = hgt.getContext('2d');
  const r = rng(seed);

  x.fillStyle = base; x.fillRect(0, 0, size, size);
  hx.fillStyle = '#7a7a7a'; hx.fillRect(0, 0, size, size);

  // ① 阻焊的斑驳：几十块极低透明度的明暗团，破掉纯色的塑料感
  for (let i = 0; i < 260; i++) {
    x.globalAlpha = 0.02 + r() * 0.035;
    x.fillStyle = r() < 0.5 ? '#000000' : '#ffffff';
    x.beginPath();
    x.arc(r() * size, r() * size, 12 + r() * 90, 0, Math.PI * 2);
    x.fill();
  }
  x.globalAlpha = 1;

  // ② 铺铜区：几块大的圆角矩形，边缘一圈亮线
  for (let i = 0; i < 7; i++) {
    const w = 90 + r() * 300, h = 70 + r() * 260;
    const px = r() * (size - w), py = r() * (size - h);
    x.globalAlpha = 0.10;
    x.fillStyle = shade(trace, 0.18);
    x.beginPath();
    x.roundRect(px, py, w, h, 10);
    x.fill();
    x.globalAlpha = 0.22;
    x.strokeStyle = shade(trace, 0.30);
    x.lineWidth = 1.5;
    x.stroke();
    x.globalAlpha = 1;
  }

  // ③ 走线：正交折线 + 45° 拐角，每条都画"亮线 + 暗侧影"造出浮雕感
  const drawTrace = (pts, wpx, alpha) => {
    x.globalAlpha = alpha;
    x.strokeStyle = shade(trace, 0.20);
    x.lineWidth = wpx;
    x.lineJoin = 'round';
    x.beginPath();
    x.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) x.lineTo(pts[i][0], pts[i][1]);
    x.stroke();
    // 侧影
    x.globalAlpha = alpha * 0.5;
    x.strokeStyle = '#000000';
    x.lineWidth = wpx * 0.5;
    x.beginPath();
    x.moveTo(pts[0][0] + wpx * 0.7, pts[0][1] + wpx * 0.7);
    for (let i = 1; i < pts.length; i++) x.lineTo(pts[i][0] + wpx * 0.7, pts[i][1] + wpx * 0.7);
    x.stroke();
    // 高度图：走线比板面高一点
    hx.globalAlpha = 0.55;
    hx.strokeStyle = '#d8d8d8';
    hx.lineWidth = wpx + 1;
    hx.lineJoin = 'round';
    hx.beginPath();
    hx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) hx.lineTo(pts[i][0], pts[i][1]);
    hx.stroke();
    x.globalAlpha = 1; hx.globalAlpha = 1;
  };

  for (let i = 0; i < 90; i++) {
    const px = r() * size, py = r() * size;
    const n = 2 + Math.floor(r() * 3);
    const pts = [[px, py]];
    let cx = px, cy = py;
    for (let s = 0; s < n; s++) {
      const horiz = r() < 0.5;
      const len = 26 + r() * 130;
      const dir = r() < 0.5 ? -1 : 1;
      if (horiz) { cx += dir * len; cy += (r() < 0.5 ? -1 : 1) * len * 0.35; }
      else { cy += dir * len; cx += (r() < 0.5 ? -1 : 1) * len * 0.35; }
      pts.push([cx, cy]);
    }
    drawTrace(pts, 1 + r() * 2.2, 0.45 + r() * 0.45);
  }

  // ④ 过孔：暗环 + 亮心
  for (let i = 0; i < 190; i++) {
    const px = r() * size, py = r() * size, rad = 2.2 + r() * 2.6;
    x.globalAlpha = 0.85;
    x.fillStyle = '#0a0f0f';
    x.beginPath(); x.arc(px, py, rad + 1.6, 0, Math.PI * 2); x.fill();
    x.fillStyle = shade('#6d7f79', r() * 0.3 - 0.05);
    x.beginPath(); x.arc(px, py, rad, 0, Math.PI * 2); x.fill();
    hx.globalAlpha = 0.8;
    hx.fillStyle = '#202020';
    hx.beginPath(); hx.arc(px, py, rad + 1.6, 0, Math.PI * 2); hx.fill();
    x.globalAlpha = 1; hx.globalAlpha = 1;
  }

  // ⑤ 丝印：元件轮廓框 + 短线 + 假文字（只要求"看起来有字"，不追求可读）
  x.strokeStyle = silk;
  for (let i = 0; i < 34; i++) {
    const w = 20 + r() * 70, h = 14 + r() * 50;
    x.globalAlpha = 0.30 + r() * 0.30;
    x.lineWidth = 1.6;
    x.strokeRect(r() * (size - w), r() * (size - h), w, h);
  }
  for (let i = 0; i < 70; i++) {
    x.globalAlpha = 0.22 + r() * 0.4;
    x.fillStyle = silk;
    const w = 4 + r() * 22, h = 2 + r() * 2.4;
    x.fillRect(r() * size, r() * size, w, h);
  }
  // 几处规整的"元件位号"块
  for (let i = 0; i < 22; i++) {
    const px = r() * size, py = r() * size;
    x.globalAlpha = 0.35;
    for (let k = 0; k < 4; k++) {
      x.fillRect(px + k * 5, py, 3.2, 4.5);
    }
  }
  x.globalAlpha = 1;

  return {
    map: toTex(c, { srgb: true }),
    normalMap: toTex(heightToNormal(hgt, 1.7), { repeat: 1 }),
    roughnessMap: toTex(c, { repeat: 1 }),   // 走线区略亮 → 略光；够用
  };
}

/** 拉丝金属：横向细密条纹。tiles 很干净（条纹是整行画的） */
function brushedCanvas(hex, { size = 512, dir = 'x', seed = 0x2f11, strength = 0.09 } = {}) {
  const c = cv(size, size);
  if (!c) return null;
  const x = c.getContext('2d');
  const base = new THREE.Color(hex);
  x.fillStyle = '#' + base.getHexString();
  x.fillRect(0, 0, size, size);
  const r = rng(seed);
  const n = Math.round(size * 2.6);
  for (let i = 0; i < n; i++) {
    const t = r();
    const col = base.clone().offsetHSL(0, 0, (t - 0.5) * strength * 2).getStyle();
    x.globalAlpha = 0.05 + r() * 0.16;
    x.strokeStyle = col;
    x.lineWidth = r() < 0.82 ? 1 : 2;
    x.beginPath();
    if (dir === 'x') {
      const y = r() * size;
      x.moveTo(0, y); x.lineTo(size, y);
    } else {
      const px = r() * size;
      x.moveTo(px, 0); x.lineTo(px, size);
    }
    x.stroke();
  }
  x.globalAlpha = 1;
  return c;
}

/** 磨砂塑料：细颗粒噪点（albedo + 粗糙度用同一张，法线再用另一张） */
function grainCanvas(hex, { size = 256, amount = 16, seed = 0x7c3d } = {}) {
  const c = cv(size, size);
  if (!c) return null;
  const x = c.getContext('2d');
  x.fillStyle = hex;
  x.fillRect(0, 0, size, size);
  const img = x.getImageData(0, 0, size, size);
  const d = img.data;
  const r = rng(seed);
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * amount;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  x.putImageData(img, 0, 0);
  return c;
}

/** 从灰度噪点造一张轻微起伏的法线图（塑料/橡胶表面用） */
function grainNormal({ size = 256, cell = 4, strength = 0.55, seed = 0x1234 } = {}) {
  const c = cv(size, size);
  if (!c) return null;
  const x = c.getContext('2d');
  const r = rng(seed);
  x.fillStyle = '#808080'; x.fillRect(0, 0, size, size);
  for (let y = 0; y < size; y += cell) {
    for (let px = 0; px < size; px += cell) {
      const v = 128 + (r() - 0.5) * 120;
      x.fillStyle = `rgb(${v | 0},${v | 0},${v | 0})`;
      x.fillRect(px, y, cell, cell);
    }
  }
  return heightToNormal(c, strength * 4);
}

/** 打孔网板 / 防尘网的 alpha 图（1 = 实体，0 = 孔） */
function perfCanvas({ size = 256, step = 16, hole = 0.34 } = {}) {
  const c = cv(size, size);
  if (!c) return null;
  const x = c.getContext('2d');
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, size, size);
  x.fillStyle = '#000000';
  const rad = step * hole;
  for (let y = step / 2; y < size; y += step) {
    for (let px = step / 2; px < size; px += step) {
      const off = (Math.round(y / step) % 2) * step * 0.5;
      x.beginPath(); x.arc(px + off, y, rad, 0, Math.PI * 2); x.fill();
    }
  }
  return c;
}

/** 丝印文字贴片（transparent 背景）：铭牌、型号、条码 */
function plateCanvas(lines, {
  w = 512, h = 256, bg = null, ink = '#c9cdc8', font = '600 34px "Microsoft YaHei", sans-serif',
  align = 'left', barcode = false, seed = 0x9a1,
} = {}) {
  const c = cv(w, h);
  if (!c) return null;
  const x = c.getContext('2d');
  if (bg) { x.fillStyle = bg; x.fillRect(0, 0, w, h); }
  x.fillStyle = ink;
  x.textBaseline = 'middle';
  x.font = font;
  const pad = 26;
  let y = pad + 18;
  for (const line of lines) {
    x.globalAlpha = 0.92;
    if (align === 'center') {
      x.textAlign = 'center';
      x.fillText(line, w / 2, y);
    } else {
      x.textAlign = 'left';
      x.fillText(line, pad, y);
    }
    y += 44;
  }
  if (barcode) {
    const r = rng(seed);
    let bx = pad;
    const by = h - pad - 42;
    x.globalAlpha = 0.85;
    while (bx < w - pad) {
      const bw = 1 + Math.floor(r() * 4);
      if (r() < 0.62) x.fillRect(bx, by, bw, 40);
      bx += bw + 1 + Math.floor(r() * 3);
    }
  }
  x.globalAlpha = 1;
  return c;
}

/* ------------------------------------------------------------
   2. 几何：倒角盒（这一步的"高级感"回报高得离谱）
   ------------------------------------------------------------ */

function roundedRectShape(w, h, r) {
  const s = new THREE.Shape();
  const x0 = -w / 2, y0 = -h / 2;
  const rr = Math.max(0.0002, Math.min(r, Math.min(w, h) / 2 - 0.0001));
  s.moveTo(x0 + rr, y0);
  s.lineTo(x0 + w - rr, y0);
  s.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + rr);
  s.lineTo(x0 + w, y0 + h - rr);
  s.quadraticCurveTo(x0 + w, y0 + h, x0 + w - rr, y0 + h);
  s.lineTo(x0 + rr, y0 + h);
  s.quadraticCurveTo(x0, y0 + h, x0, y0 + h - rr);
  s.lineTo(x0, y0 + rr);
  s.quadraticCurveTo(x0, y0, x0 + rr, y0);
  return s;
}

/**
 * 带倒角的盒子：w×h×d，倒角 c。
 * 为什么值得：真实物体没有数学意义的锐边，锐边会吃掉所有高光，
 * 于是渲染出来就是"塑料积木"。0.5mm 的倒角能接住一线灯光，轮廓立刻立起来。
 */
function chamferGeo(w, h, d, c = 0.006, cornerR = 0.01) {
  const bevel = Math.min(c, w / 2 - 0.002, h / 2 - 0.002, d / 2 - 0.002);
  const depth = Math.max(h - bevel * 2, 0.0008);
  const shape = roundedRectShape(w - bevel * 2, d - bevel * 2, cornerR);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0.0004,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    curveSegments: 3,
    steps: 1,
  });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, -(h / 2 - bevel), 0);
  geo.computeVertexNormals();
  return geo;
}

/* ------------------------------------------------------------
   3. 工厂
   ------------------------------------------------------------ */

export function createDetail(kit) {
  /* ---- 懒建纹理：只有真的用到才生成，避免启动卡顿 ---- */
  const T = {};
  const once = (key, fn) => {
    if (!T[key]) T[key] = fn();
    return T[key];
  };

  const tex = {
    /** PCB 三件套（map / normalMap / roughnessMap） */
    pcb: (o) => once('pcb' + JSON.stringify(o || {}), () => pcbTexture(o || {})),
    brushed: (hex, o = {}) => once(`b${hex}${JSON.stringify(o)}`, () => {
      const canvas = brushedCanvas(hex, o);
      return {
        map: toTex(canvas, { srgb: true, repeat: o.repeat ?? 2 }),
        roughnessMap: toTex(canvas, { repeat: o.repeat ?? 2 }),
        normalMap: toTex(heightToNormal(grainCanvas('#808080', { size: 256, amount: 40, seed: 0x33 }), 0.9), { repeat: o.repeat ?? 2 }),
      };
    }),
    grain: (hex, o = {}) => once(`g${hex}${JSON.stringify(o)}`, () => {
      const canvas = grainCanvas(hex, o);
      return {
        map: toTex(canvas, { srgb: true, repeat: o.repeat ?? 3 }),
        roughnessMap: toTex(canvas, { repeat: o.repeat ?? 3 }),
        normalMap: toTex(grainNormal({}), { repeat: o.repeat ?? 3 }),
      };
    }),
    perf: (o = {}) => once(`perf${JSON.stringify(o)}`, () => toTex(perfCanvas(o), { repeat: o.repeat ?? 4 })),
    plate: (lines, o = {}) => toTex(plateCanvas(lines, o), { srgb: true, repeat: 1 }),
  };

  /* ---- 材质：在基础材质上叠贴图，仍然走 kit 的缓存 ---- */
  const mat = {
    /** 拉丝金属（机箱钢板、散热鳍片、挡板） */
    brushed(hex, o = {}) {
      const t = tex.brushed(hex, o);
      return kit.mat('metal', {
        color: hex, roughness: o.rough ?? 0.34, metalness: o.metal ?? 0.72,
        map: t.map, roughnessMap: t.roughnessMap, normalMap: t.normalMap,
        normalScale: new THREE.Vector2(0.35, 0.35),
      });
    },
    /** 磨砂塑料 / 深色涂料（外壳、扇框、挡板喷粉） */
    grain(hex, o = {}) {
      const t = tex.grain(hex, o);
      return kit.mat('plasticDark', {
        color: hex, roughness: o.rough ?? 0.74, metalness: o.metal ?? 0.03,
        map: t.map, roughnessMap: t.roughnessMap, normalMap: t.normalMap,
        normalScale: new THREE.Vector2(o.bump ?? 0.4, o.bump ?? 0.4),
      });
    },
    /** 电路板 */
    pcb(base = '#1d2b2a') {
      const t = tex.pcb({ base });
      return kit.mat('pcb', {
        color: 0xffffff,
        map: t.map, roughnessMap: t.roughnessMap, normalMap: t.normalMap,
        normalScale: new THREE.Vector2(0.55, 0.55),
        roughness: 0.74,
      });
    },
  };

  /* ---- 细零件 ---- */
  const parts = {
    /** 倒角块：几何级倒角，返回 Mesh */
    cbox(w, h, d, material, bevel = 0.006, cornerR = 0.012) {
      const m = new THREE.Mesh(chamferGeo(w, h, d, bevel, cornerR), material);
      m.castShadow = m.receiveShadow = true;
      return m;
    },

    /** 螺丝：圆头 + 十字槽。r 半径、h 头高 */
    screw(r = 0.016, h = 0.007, material = null) {
      const g = new THREE.Group();
      const mat0 = material || kit.mats.metalDark;
      const head = kit.cyl(r, r * 0.97, h, 12, mat0);
      g.add(head);
      const slot = kit.mat('metalDark', { color: 0x14171a, roughness: 0.85, metalness: 0.3 });
      for (const a of [0, Math.PI / 2]) {
        const s = kit.box(r * 1.42, h * 0.42, r * 0.26, slot);
        s.position.y = h * 0.34;
        s.rotation.y = a;
        g.add(s);
      }
      return g;
    },

    /** 直立圆柱电容：套管 + 顶部十字防爆纹 */
    capacitor(r = 0.02, h = 0.05, hex = 0x3a4048) {
      const g = new THREE.Group();
      const body = kit.cyl(r, r, h, 12, kit.mat('plasticDark', { color: hex, roughness: 0.6 }));
      g.add(body);
      const top = kit.cyl(r * 0.86, r * 0.86, h * 0.06, 12, kit.mat('metal', { color: 0xb0b4b8, roughness: 0.4, metalness: 0.6 }));
      top.position.y = h / 2;
      g.add(top);
      return g;
    },

    /** 贴片电感（方形铁氧体 + 顶部涂层） */
    inductor(w = 0.05, h = 0.045, d = 0.05) {
      const g = new THREE.Group();
      const body = parts.cbox(w, h, d, kit.mat('plasticDark', { color: 0x2c3036, roughness: 0.66 }), 0.004, 0.008);
      g.add(body);
      const cap = parts.cbox(w * 0.82, h * 0.12, d * 0.82, kit.mat('plasticMid', { color: 0x4a5058, roughness: 0.5 }), 0.003, 0.006);
      cap.position.y = h / 2;
      g.add(cap);
      return g;
    },

    /** 一排针脚 / 金手指（InstancedMesh，便宜） */
    pinRow(n, pitch, { w = 0.010, h = 0.008, d = 0.03 } = {}, material = null) {
      const geo = new THREE.BoxGeometry(w, h, d);
      const mesh = new THREE.InstancedMesh(geo, material || kit.mats.gold, n);
      const m4 = new THREE.Matrix4();
      const x0 = -((n - 1) * pitch) / 2;
      for (let i = 0; i < n; i++) {
        m4.makeTranslation(x0 + i * pitch, 0, 0);
        mesh.setMatrixAt(i, m4);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = mesh.receiveShadow = true;
      return mesh;
    },

    /** 鳍片叠：count 片薄板沿 X 铺开。zLen 是鳍片深度、h 是高度 */
    finStack({ count = 48, spanX = 1.2, y = 0.15, h = 0.10, zLen = 0.86, thick = 0.004 }, material = null) {
      const geo = new THREE.BoxGeometry(thick, h, zLen);
      const mesh = new THREE.InstancedMesh(geo, material || kit.mats.metal, count);
      const dummy = new THREE.Object3D();
      for (let i = 0; i < count; i++) {
        const t = count === 1 ? 0.5 : i / (count - 1);
        dummy.position.set(-spanX / 2 + t * spanX, y, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = mesh.receiveShadow = true;
      return mesh;
    },

    /** 风扇：返回 { group, rotor }。叶片用锥筒带做出真弧面（比薄盒子像得多） */
    fan({ r = 0.2, blades = 11, hubR = 0.058, thick = 0.055, frameMat = null, bladeMat = null } = {}) {
      const group = new THREE.Group();
      const fMat = frameMat || kit.mat('plasticDark', { color: 0x30353c, roughness: 0.72 });
      const bMat = bladeMat || kit.mat('plasticMid', { color: 0x5a6068, roughness: 0.55 });

      // 扇框：外圈 + 4 根辐条 + 中心凹台
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.075, 6, 28), fMat);
      ring.rotation.x = Math.PI / 2;
      ring.castShadow = ring.receiveShadow = true;
      group.add(ring);
      const back = new THREE.Mesh(new THREE.TorusGeometry(r * 0.55, r * 0.055, 6, 22), fMat);
      back.rotation.x = Math.PI / 2;
      back.position.y = -thick * 0.42;
      group.add(back);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const spoke = kit.box(r * 0.92, thick * 0.30, r * 0.10, fMat);
        spoke.position.set(Math.cos(a) * r * 0.5, -thick * 0.34, Math.sin(a) * r * 0.5);
        spoke.rotation.y = -a;
        group.add(spoke);
      }

      // 转子
      const rotor = new THREE.Group();
      const hub = kit.cyl(hubR, hubR * 0.9, thick * 0.72, 16, fMat);
      rotor.add(hub);
      const cap = kit.cyl(hubR * 0.72, hubR * 0.72, thick * 0.06, 14, kit.mat('metal', { color: 0x9aa0a6, roughness: 0.42, metalness: 0.62 }));
      cap.position.y = thick * 0.38;
      rotor.add(cap);

      // 叶片：锥筒带（thetaLength 一小段）= 真弧面
      const band = new THREE.CylinderGeometry(r * 0.985, r * 0.42, thick * 0.86, 5, 1, true, 0, 0.62);
      band.scale(1, 1, 1);
      const bMatSide = bMat.clone();
      bMatSide.side = THREE.DoubleSide;
      for (let i = 0; i < blades; i++) {
        const a = (i / blades) * Math.PI * 2;
        const blade = new THREE.Mesh(band, bMatSide);
        blade.rotation.order = 'YXZ';
        blade.rotation.set(0.62, -a + 0.2, 0);
        blade.position.y = 0;
        blade.castShadow = true;
        rotor.add(blade);
      }
      group.add(rotor);
      return { group, rotor };
    },

    /** 显示接口：hdmi / dp / type-c。返回 Group（已在 +X 方向开口） */
    port(kind = 'dp', { w = 0.15, h = 0.075, mat = null } = {}) {
      const g = new THREE.Group();
      const shell = mat || kit.mat('metal', { color: 0x8b9096, roughness: 0.38, metalness: 0.78 });
      const dark = kit.mat('metalDark', { color: 0x15181b, roughness: 0.9, metalness: 0.1 });
      const gold = kit.mats.gold;

      if (kind === 'hdmi') {
        const body = parts.cbox(0.05, h * 0.72, w, shell, 0.004, 0.01);
        g.add(body);
        const mouth = kit.box(0.03, h * 0.5, w * 0.84, dark);
        mouth.position.x = 0.016;
        g.add(mouth);
        const tongue = kit.box(0.024, h * 0.10, w * 0.72, gold);
        tongue.position.set(0.02, -h * 0.10, 0);
        g.add(tongue);
      } else if (kind === 'dp') {
        const body = parts.cbox(0.05, h * 0.86, w * 0.78, shell, 0.004, 0.012);
        g.add(body);
        const mouth = kit.box(0.032, h * 0.62, w * 0.6, dark);
        mouth.position.x = 0.018;
        g.add(mouth);
        // DP 口是"L 形"，一角斜切
        const cut = kit.box(0.034, h * 0.2, w * 0.2, shell);
        cut.position.set(0.018, h * 0.3, w * 0.3);
        g.add(cut);
        const tongue = kit.box(0.026, h * 0.08, w * 0.5, gold);
        tongue.position.set(0.022, 0, 0);
        g.add(tongue);
      } else {
        // type-c：椭圆口
        const body = parts.cbox(0.045, h * 0.44, w * 0.7, shell, 0.004, 0.02);
        g.add(body);
        const mouth = kit.box(0.028, h * 0.30, w * 0.62, dark);
        mouth.position.x = 0.016;
        g.add(mouth);
        const tongue = kit.box(0.024, h * 0.06, w * 0.42, gold);
        tongue.position.set(0.02, 0, 0);
        g.add(tongue);
      }
      return g;
    },

    /** 一根热管（沿折线）。radius 常见 0.028（≈5mm 实机） */
    heatpipe(points, radius = 0.026, material = null) {
      return kit.trace(points, radius, material || kit.mat('copper', { roughness: 0.28, metalness: 0.82 }), 26);
    },

    /** 贴片元件阵列（MLCC/电阻）：InstancedMesh 一片铺开 */
    smdField(count, { w = 0.012, h = 0.008, d = 0.008 } = {}, material = null) {
      const geo = new THREE.BoxGeometry(w, h, d);
      const mesh = new THREE.InstancedMesh(geo, material || kit.mats.ceramic, count);
      const r = rng(0x4b2);
      const dummy = new THREE.Object3D();
      for (let i = 0; i < count; i++) {
        dummy.position.set(0, 0, 0);
        dummy.rotation.set(0, r() < 0.5 ? 0 : Math.PI / 2, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.userData.fill = (x0, x1, z0, z1, y, seed = 1) => {
        const rr = rng(seed);
        for (let i = 0; i < count; i++) {
          dummy.position.set(x0 + rr() * (x1 - x0), y, z0 + rr() * (z1 - z0));
          dummy.rotation.set(0, rr() < 0.5 ? 0 : Math.PI / 2, 0);
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
        return mesh;
      };
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = mesh.receiveShadow = true;
      return mesh;
    },
  };

  return { tex, mat, parts, chamferGeo, roundedRectShape, heightToNormal, toTex };
}

export default createDetail;
