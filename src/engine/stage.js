/* ============================================================
   stage.js — 渲染器 / 场景 / 灯光 / 环境
   深石墨虚空 + 一组低饱和柔光。所有元件共用这一套光。
   ============================================================ */

import * as THREE from 'three';

/** 用几个发光面片搭一个"柔光棚"，PMREM 烘成环境贴图。
 *  比 RoomEnvironment 更可控：全中性色，不给金属染上暖调。 */
function buildEnvironment(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  const env = new THREE.Scene();
  // 比背景色亮一档：金属件靠反射环境吃饭，环境一暗金属就整块发黑，
  // 八个元件会糊成一团黑剪影。柔光棚的"底光"不能省。
  env.background = new THREE.Color(0x262c34);

  const panel = (color, intensity, w, h, pos, rot) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity) })
    );
    m.position.set(...pos);
    m.rotation.set(...rot);
    env.add(m);
  };

  // 主顶光（大而柔，略偏冷）
  panel(0xdfe6ec, 1.95, 12, 12, [0, 8, 0.5], [Math.PI / 2, 0, 0]);
  // 侧补光（暖一点点，给金属一点层次）
  panel(0xc9c2b6, 0.95, 8, 10, [-7, 1.5, 2], [0, Math.PI / 2, 0]);
  // 另一侧冷补
  panel(0xa8bccb, 0.82, 8, 10, [7, 1.0, -1], [0, -Math.PI / 2, 0]);
  // 背面勾边
  panel(0xb9c4cc, 0.62, 10, 6, [0, 2, -8], [0, 0, 0]);
  // 地面反弹（防止下半身死黑）
  panel(0x3c434c, 0.8, 14, 14, [0, -6, 0], [-Math.PI / 2, 0, 0]);

  const rt = pmrem.fromScene(env, 0.04);
  pmrem.dispose();
  env.traverse((o) => {
    if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); }
  });
  return rt.texture;
}

export function createStage(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
    stencil: false,
  });
  renderer.setClearColor(0x171a1f, 1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.environment = buildEnvironment(renderer);
  scene.environmentIntensity = 0.95;
  // 极淡的雾：只让最远的元件稍微退到背景里。近端要收死，
  // 否则对面的元件被雾压成一块黑，八个里有一半看不出是什么。
  scene.fog = new THREE.Fog(0x171a1f, 17, 38);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 120);
  camera.position.set(6.2, 3.4, 7.4);

  /* ---------- 灯光 ---------- */

  // 半球光：天空略冷、地面略暖，压住整体对比，避免死黑
  const hemi = new THREE.HemisphereLight(0xb9c6d2, 0x3a3630, 0.72);
  scene.add(hemi);

  // 主光：从右上前方打下，唯一投影的光源
  const key = new THREE.DirectionalLight(0xe8eef4, 1.5);
  key.position.set(5.5, 8.5, 4.5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 26;
  const s = 7.5;
  Object.assign(key.shadow.camera, { left: -s, right: s, top: s, bottom: -s });
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.022;
  scene.add(key);
  scene.add(key.target);

  // 左后冷补光：勾出金属边缘，让元件从深底里浮起来
  const rim = new THREE.DirectionalLight(0x9fb6c8, 0.72);
  rim.position.set(-6.5, 3.2, -5.5);
  scene.add(rim);

  // 低角度暖补：照亮元件下缘，避免"飘着没有体积"
  const fill = new THREE.DirectionalLight(0xc3ab90, 0.34);
  fill.position.set(-2.5, -3.0, 4.0);
  scene.add(fill);

  /* ---------- 主循环 ---------- */

  const tickers = new Set();
  const clock = new THREE.Clock();
  let running = false;
  let elapsed = 0;

  function onTick(fn) { tickers.add(fn); return () => tickers.delete(fn); }

  function frame() {
    if (!running) return;
    const dt = Math.min(clock.getDelta(), 0.05);  // 卡顿时不要跳帧太狠
    elapsed += dt;
    for (const fn of tickers) fn(elapsed, dt);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();
  }

  resize();
  window.addEventListener('resize', resize);

  return {
    THREE, renderer, scene, camera, onTick, resize,
    lights: { hemi, key, rim, fill },
    start() { if (!running) { running = true; clock.getDelta(); frame(); } },
    stop() { running = false; },
    get elapsed() { return elapsed; },
    dispose() {
      running = false;
      renderer.dispose();
      scene.traverse((o) => {
        if (o.isMesh) {
          o.geometry?.dispose?.();
          if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
          else o.material?.dispose?.();
        }
      });
    },
  };
}