/* ============================================================
   case.js — 电脑八大件 · 机箱（中塔 / 双面侧透 / 网面前脸）
   ------------------------------------------------------------
   机箱在展示里承担三件事：
     ① 结构：把 8 个件固定在各自位置（尺寸就是 CONTRACT 的基准，不可改）
     ② 风道：前进风 → CPU/GPU → 后出风 + 上出风，风从哪来、到哪去
     ③ 细节：钢板厚度、冲压网、理线孔、玻璃侧板、脚垫、I/O
   精修目标（对照"粗糙"的三个来源）：
     ① 表面：拉丝钢板（未喷粉的内衬）+ 喷粉外框 + 玻璃 + 蜂窝网
     ② 细零件：4 个机箱风扇、7 条 PCIe 挡片、9 颗主板铜柱、
        3 个理线孔橡胶护圈、HDD 笼、SSD 位、电源仓、脚垫、
        I/O 面板、魔术贴理线带、螺丝
     ③ 倒角：所有钢板/框架/挡片走 detail.parts.cbox
   拆解：上盖抬起 → 玻璃侧板外移 → 钢侧板外移 → 前脸前移 → 后板后退
         → 内部电源仓 / 硬盘笼小幅错位
   动画：风扇转速 + 前面板电源指示灯呼吸
   ============================================================ */

export default {
  id: 'case',
  name: '机箱',
  en: 'Case',
  hue: 0xb5b0a6,

  focus: { from: [2.35, 2.25, 1.30], look: [0, 0.80, 0], fov: 36 },

  build(kit) {
    const { THREE } = kit;
    const D = kit.detail;
    const group = new THREE.Group();

    /* ---------- 外部尺寸（世界基准，不可变） ----------
       X：宽 0.80（-X 钢侧板 / +X 玻璃侧板）
       Y：高 1.70（底面 y=0，顶面 y=1.70）
       Z：深 1.72（-Z 后面板 / +Z 前面板）           */
    const HX = 0.400;
    const HZ = 0.860;
    const T = 0.030;        // 钣金厚度（0.6~1.0mm 实机，这里夸张到看得见）
    const IN_X = 0.370;     // 内腔半宽
    const IN_Z = 0.830;     // 内腔半深
    const TRAY_X = -0.300;  // 主板托架平面

    /* ---------- 贴图 ---------- */
    const perfFront = D.tex.perf({ size: 128, step: 16, hole: 0.42, repeat: 3 });
    const perfTop = D.tex.perf({ size: 128, step: 16, hole: 0.42, repeat: 2 });
    const perfBottom = D.tex.perf({ size: 128, step: 16, hole: 0.42, repeat: 3 });
    // 冲孔网**不做真透孔**：屏幕上一个孔只剩 1~2 像素时，alphaTest + mipmap 会退化成
    // 满屏黑白噪点（这一版试过，远处整面板变成雪花）。网孔只用低频明暗示意，
    // 想要"看穿"的观感交给玻璃侧板 —— 那也是镜头主要看进去的那一面。
    const mkMesh = (over) => {
      const m = kit.mat('metalDark', over);
      m.side = THREE.DoubleSide;
      return m;
    };
    const meshFront = mkMesh({ color: 0x3d444c, roughness: 0.62, metalness: 0.38 });
    const meshTop = mkMesh({ color: 0x464d56, roughness: 0.72, metalness: 0.22 });
    const meshBottom = mkMesh({ color: 0x2a2f36, roughness: 0.72, metalness: 0.3 });

    /* ---------- 材质 ---------- */
    const M = {
      steel: D.mat.brushed(0x6e757e, { rough: 0.55, metal: 0.55, repeat: 2.6 }),
      steelIn: D.mat.brushed(0x8b929a, { rough: 0.48, metal: 0.60, repeat: 2 }),
      paint: D.mat.grain(0x3d444c, { rough: 0.74, bump: 0.35 }),
      paintLight: D.mat.grain(0x3e444c, { rough: 0.68 }),
      dark: D.mat.grain(0x24282e, { rough: 0.85 }),
      frame: kit.mat('plasticDark', { color: 0x23272c, roughness: 0.78 }),
      rubber: kit.mats.rubber,
      copper: kit.mat('gold', { color: 0xb08d57, roughness: 0.42, metalness: 0.72 }),
      screw: kit.mat('metal', { color: 0xb9bec4, roughness: 0.42, metalness: 0.65 }),
      blade: kit.mat('plasticMid', { color: 0x5d646c, roughness: 0.52 }),
      bladeDark: kit.mat('plasticMid', { color: 0x444b53, roughness: 0.56 }),
      fanFrame: kit.mat('plasticDark', { color: 0x262b31, roughness: 0.72 }),
      glass: kit.mat('glass'),
      grommet: kit.mat('rubber', { color: 0x14171a, roughness: 0.92 }),
      led: kit.glow(0xa8c8d8, 0.9),
      label: kit.mat('metal', { color: 0xc8cbce, roughness: 0.42, metalness: 0.5 }),
    };

    /* ---------- 小工具 ---------- */
    const put = (parent, mesh, x, y, z) => { mesh.position.set(x, y, z); parent.add(mesh); return mesh; };
    const screwAt = (parent, x, y, z, axis = 'y', r = 0.014, h = 0.006) => {
      const s = D.parts.screw(r, h, M.screw);
      s.position.set(x, y, z);
      if (axis === 'x') s.rotation.z = Math.PI / 2;
      else if (axis === 'z') s.rotation.x = Math.PI / 2;
      parent.add(s);
      return s;
    };
    const thumbscrew = (parent, x, y, z, axis = 'z', r = 0.024) => {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      const head = kit.cyl(r, r, 0.012, 14, M.screw);
      const knurl = kit.cyl(r * 1.08, r * 1.08, 0.006, 14, M.dark);
      knurl.position.y = 0.006;
      const shaft = kit.cyl(r * 0.42, r * 0.42, 0.026, 8, M.screw);
      shaft.position.y = -0.014;
      g.add(head, knurl, shaft);
      if (axis === 'z') g.rotation.x = Math.PI / 2;
      else if (axis === 'x') g.rotation.z = -Math.PI / 2;
      parent.add(g);
      return g;
    };
    const plateMat = (lines, o = {}) => {
      const tex = D.tex.plate(lines, {
        w: o.w ?? 256, h: o.h ?? 64,
        font: o.font ?? '600 30px "Microsoft YaHei", sans-serif',
        ink: o.ink ?? '#c9cdd0', bg: o.bg ?? null,
        align: o.align ?? 'center', barcode: !!o.barcode, seed: o.seed ?? 11,
      });
      return new THREE.MeshBasicMaterial({
        map: tex, transparent: true, opacity: o.opacity ?? 0.8,
        depthWrite: false, side: THREE.DoubleSide, toneMapped: true,
      });
    };
    const labelPlane = (parent, lines, w, h, pos, o = {}) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), plateMat(lines, o));
      m.position.set(pos[0], pos[1], pos[2]);
      if (o.rot) m.rotation.set(o.rot[0], o.rot[1], o.rot[2]);
      parent.add(m);
      return m;
    };

    /* ---------- 拆解 rigs ---------- */
    const rigs = [];
    const rig = (obj, t0, t1, off) => {
      rigs.push({ obj, t0, t1, off: new THREE.Vector3(off[0], off[1], off[2]) });
      return obj;
    };

    /* ============================================================
       1. 底部：脚垫 + 底板 + 底部进风滤网
       ============================================================ */
    const bottomG = new THREE.Group();
    group.add(bottomG);
    // 4 个脚垫（最底面 y=0，保证 min.y = 0）
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const foot = kit.cyl(0.050, 0.054, 0.012, 14, M.rubber);
      foot.position.set(sx * 0.300, 0.006, sz * 0.740);
      bottomG.add(foot);
      const ring = kit.cyl(0.058, 0.058, 0.004, 14, M.paint);
      ring.position.set(sx * 0.300, 0.012, sz * 0.740);
      bottomG.add(ring);
    }
    // 底板
    put(bottomG, D.parts.cbox(0.760, 0.018, 1.680, M.paint, 0.004, 0.008), 0, 0.021, 0);
    // 底框四边（把外形撑到 ±0.40 / ±0.86）
    put(bottomG, D.parts.cbox(0.050, 0.030, 1.700, M.paint, 0.004, 0.008), -0.375, 0.025, 0);
    put(bottomG, D.parts.cbox(0.050, 0.030, 1.700, M.paint, 0.004, 0.008), 0.375, 0.025, 0);
    put(bottomG, D.parts.cbox(0.760, 0.030, 0.050, M.paint, 0.004, 0.008), 0, 0.025, -0.835);
    put(bottomG, D.parts.cbox(0.760, 0.030, 0.050, M.paint, 0.004, 0.008), 0, 0.025, 0.835);
    // 底部进风网 + 滤网框
    const bMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.60, 1.20), meshBottom);
    bMesh.rotation.x = -Math.PI / 2;
    bMesh.position.set(0.02, 0.0315, 0.14);
    bottomG.add(bMesh);
    for (const sx of [-1, 1]) {
      put(bottomG, kit.box(0.020, 0.012, 1.24, M.frame), 0.02 + sx * 0.315, 0.033, 0.14);
    }
    for (const sz of [-1, 1]) {
      put(bottomG, kit.box(0.62, 0.012, 0.020, M.frame), 0.02, 0.033, 0.14 + sz * 0.625);
    }
    // 硬盘笼底部固定螺丝
    for (const sx of [-1, 1]) screwAt(bottomG, sx * 0.20, 0.031, 0.30, 'y', 0.012, 0.005);

    /* ============================================================
       2. 四角立柱 / 顶部框架 / 上盖
       ============================================================ */
    const frameG = new THREE.Group();
    group.add(frameG);
    // 四根立柱
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      put(frameG, D.parts.cbox(0.050, 1.640, 0.050, M.paint, 0.004, 0.008),
        sx * 0.372, 0.850, sz * 0.832);
    }
    // +X 侧玻璃的钢制窗框（玻璃比侧板短，四周要有框才不像开天窗）
    put(frameG, D.parts.cbox(0.014, 0.050, 1.700, M.paint, 0.003, 0.006), 0.393, 1.645, 0);
    put(frameG, D.parts.cbox(0.014, 0.050, 1.700, M.paint, 0.003, 0.006), 0.393, 0.075, 0);
    for (const sz of [-1, 1]) {
      put(frameG, D.parts.cbox(0.014, 1.520, 0.045, M.paint, 0.003, 0.006), 0.393, 0.860, sz * 0.8025);
    }
    // 背板内侧的托架导轨
    put(frameG, kit.box(0.012, 1.500, 0.060, M.steelIn), TRAY_X + 0.020, 0.860, -0.760);
    put(frameG, kit.box(0.012, 1.500, 0.060, M.steelIn), TRAY_X + 0.020, 0.860, 0.760);

    const topG = new THREE.Group();
    group.add(topG);
    // 上盖：只有外框 + 两片冲压网（网孔是真的，可透风）
    // 中间挖空观感：用两片蜂窝网盖住大部分，四周留 0.05 边框
    const tMeshA = new THREE.Mesh(new THREE.PlaneGeometry(0.320, 1.560), meshTop);
    tMeshA.rotation.x = -Math.PI / 2;
    tMeshA.position.set(-0.175, 1.690, 0);
    topG.add(tMeshA);
    const tMeshB = new THREE.Mesh(new THREE.PlaneGeometry(0.320, 1.560), meshTop);
    tMeshB.rotation.x = -Math.PI / 2;
    tMeshB.position.set(0.175, 1.690, 0);
    topG.add(tMeshB);
    // 中央加强梁 + 两侧边框条
    put(topG, D.parts.cbox(0.050, 0.018, 1.640, M.paint, 0.003, 0.006), 0, 1.691, 0);
    for (const sx of [-1, 1]) {
      put(topG, D.parts.cbox(0.045, 0.018, 1.640, M.paint, 0.003, 0.006), sx * 0.352, 1.690, 0);
    }
    for (const sz of [-1, 1]) {
      put(topG, D.parts.cbox(0.700, 0.018, 0.050, M.paint, 0.003, 0.006), 0, 1.691, sz * 0.828);
    }
    // 顶部两个 140mm 风扇位（暂不装扇，只留螺孔环 + 防尘网）
    for (const sx of [-1, 1]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.150, 0.012, 6, 30), M.frame);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(sx * 0.175, 1.676, 0.02);
      topG.add(ring);
      for (let i = 0; i < 4; i++) {
        const a = Math.PI / 4 + i * Math.PI / 2;
        screwAt(topG, sx * 0.175 + Math.cos(a) * 0.140, 1.678, 0.02 + Math.sin(a) * 0.140, 'y', 0.011, 0.005);
      }
    }
    // 上盖防尘网（磁吸框）
    for (const sz of [-1, 1]) {
      put(topG, kit.box(0.700, 0.006, 0.016, M.frame), 0, 1.696, sz * 0.700);
    }
    // 后部两颗手拧螺丝
    thumbscrew(topG, -0.330, 1.630, -0.820, 'z', 0.020);
    thumbscrew(topG, 0.330, 1.630, -0.820, 'z', 0.020);
    // 顶部品牌小牌
    labelPlane(topG, ['MID-TOWER', '2×140 TOP'], 0.24, 0.030, [-0.175, 1.6995, 0.640],
      { rot: [-Math.PI / 2, 0, 0], w: 320, h: 48, opacity: 0.45 });

    /* ============================================================
       3. 前面板：钢框 + 冲压网 + 3×120 进风 + I/O
       ============================================================ */
    const frontG = new THREE.Group();
    group.add(frontG);
    // 顶部 I/O 横梁、左右立柱、底部横梁（外框到 z=0.86）
    put(frontG, D.parts.cbox(0.740, 0.060, 0.020, M.paint, 0.004, 0.008), 0, 1.640, 0.850);
    put(frontG, D.parts.cbox(0.740, 0.050, 0.020, M.paint, 0.004, 0.008), 0, 0.055, 0.850);
    for (const sx of [-1, 1]) {
      put(frontG, D.parts.cbox(0.030, 1.640, 0.020, M.paint, 0.004, 0.008), sx * 0.385, 0.855, 0.850);
    }
    // 前面板冲压网
    const fMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.720, 1.460), meshFront);
    fMesh.position.set(0, 0.800, 0.852);
    frontG.add(fMesh);
    // 网面后方的加强筋（横向）
    for (const y of [0.36, 0.72, 1.08, 1.44]) {
      put(frontG, kit.box(0.700, 0.014, 0.012, M.frame), 0, y, 0.842);
    }
    // 前脸底部的进风滤网抽拉口
    put(frontG, D.parts.cbox(0.360, 0.020, 0.016, M.frame, 0.003, 0.006), -0.160, 0.018, 0.850);
    // I/O 面板
    const ioG = new THREE.Group();
    ioG.position.set(0.115, 1.575, 0.856);
    frontG.add(ioG);
    put(ioG, D.parts.cbox(0.300, 0.075, 0.008, M.paintLight, 0.003, 0.006), 0, 0, -0.002);
    // 电源键（发光环）
    const btn = kit.cyl(0.017, 0.017, 0.008, 16, M.frame);
    btn.rotation.x = Math.PI / 2;
    btn.position.set(-0.108, 0.0, -0.001);
    ioG.add(btn);
    const ledMat = M.led.clone();
    const btnLed = kit.cyl(0.011, 0.011, 0.003, 14, ledMat);
    btnLed.rotation.x = Math.PI / 2;
    btnLed.position.set(-0.108, 0.0, 0.002);
    ioG.add(btnLed);
    // 2× USB-A + 1× USB-C（与面板齐平的内凹口）
    const portBox = (x, w, h) => {
      put(ioG, kit.box(w, h, 0.002, M.screw), x, 0.0, 0.0);
      put(ioG, kit.box(w * 0.76, h * 0.62, 0.004, M.dark), x, 0.0, -0.003);
      put(ioG, kit.box(w * 0.62, h * 0.16, 0.002, M.label), x, -h * 0.15, 0.001);
    };
    portBox(-0.045, 0.034, 0.017);
    portBox(-0.002, 0.034, 0.017);
    portBox(0.043, 0.024, 0.012);
    // 音频孔 + 指示灯
    const jack = kit.cyl(0.010, 0.010, 0.006, 12, M.dark);
    jack.rotation.x = Math.PI / 2;
    jack.position.set(0.088, 0.0, 0.001);
    ioG.add(jack);
    for (let i = 0; i < 2; i++) {
      put(ioG, kit.sphere(0.004, 6, i === 0 ? M.led : kit.glow(0xd8b070, 0.7)), 0.112, 0.018 - i * 0.032, 0.000);
    }
    // 前面板品牌 / 型号丝印
    labelPlane(frontG, ['ATX MID-TOWER'], 0.34, 0.040, [-0.120, 1.470, 0.8595],
      { w: 384, h: 48, opacity: 0.50 });
    labelPlane(frontG, ['MESH FRONT · 3×120'], 0.28, 0.030, [0.030, 0.120, 0.8595],
      { w: 320, h: 48, opacity: 0.40 });

    // 3 个前置进气风扇（装在机架上的，前脸拆掉后露出来）
    const fanRigs = [];
    const addFan = (parent, x, y, z, r, bladeMat, spin = 1, face = 'z') => {
      const f = D.parts.fan({ r, blades: 11, hubR: r * 0.24, thick: r * 0.20, frameMat: M.fanFrame, bladeMat });
      const g = new THREE.Group();
      g.position.set(x, y, z);
      // D.parts.fan 默认轴沿 +Y（适合顶置）；前置/后置风扇转成沿 Z 出风
      if (face === 'z') g.rotation.x = Math.PI / 2;
      g.add(f.group);
      parent.add(g);
      // 四角橡胶减震垫
      for (let i = 0; i < 4; i++) {
        const a = Math.PI / 4 + i * Math.PI / 2;
        const pad = kit.cyl(r * 0.05, r * 0.05, 0.008, 10, M.rubber);
        pad.position.set(Math.cos(a) * r * 0.96, 0, Math.sin(a) * r * 0.96);
        g.add(pad);
      }
      fanRigs.push({ rotor: f.rotor, spin });
      return g;
    };
    for (let i = 0; i < 3; i++) {
      addFan(group, 0, 0.290 + i * 0.430, 0.790, 0.215, M.blade, 1);
    }

    // 顶部 2×140 排风扇（轴沿 Y，向上吹）
    for (const sx of [-1, 1]) {
      addFan(group, sx * 0.175, 1.600, 0.020, 0.150, M.bladeDark, -1, 'y');
    }

    /* ============================================================
       4. 后面板：I/O 挡板 + 7 条 PCIe 挡片 + 12cm 后出风
       ============================================================ */
    const rearG = new THREE.Group();
    group.add(rearG);
    put(rearG, D.parts.cbox(0.780, 1.660, 0.020, M.paint, 0.004, 0.008), 0, 0.850, -0.850);
    // 后部大面积出风网（CPU 背后的六角网）
    const rMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.62), meshFront);
    rMesh.rotation.y = Math.PI;
    rMesh.position.set(0.020, 1.300, -0.8595);
    rearG.add(rMesh);
    // 主板 I/O 挡板开口（黑化挡板 + 6 个接口）
    const ioShield = new THREE.Group();
    ioShield.position.set(-0.245, 1.080, -0.848);
    rearG.add(ioShield);
    put(ioShield, D.parts.cbox(0.170, 0.420, 0.010, M.frame, 0.003, 0.006), 0, 0, 0);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 2; j++) {
        put(ioShield, kit.box(0.040, 0.024, 0.006, M.dark), -0.048 + j * 0.075, 0.130 - i * 0.075, -0.006);
        put(ioShield, kit.box(0.044, 0.028, 0.003, M.screw), -0.048 + j * 0.075, 0.130 - i * 0.075, -0.010);
      }
    }
    // 7 条 PCIe 挡片（成排，用 InstancedMesh 批量做）
    const slotGeo = new THREE.BoxGeometry(0.230, 0.014, 0.018);
    const slots = new THREE.InstancedMesh(slotGeo, M.steelIn, 7);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 7; i++) {
      dummy.position.set(0.150, 0.600 + i * 0.082, -0.850);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      slots.setMatrixAt(i, dummy.matrix);
    }
    slots.instanceMatrix.needsUpdate = true;
    slots.castShadow = slots.receiveShadow = true;
    rearG.add(slots);
    // 挡片上的散热缝 + 固定螺丝
    for (let i = 0; i < 7; i++) {
      put(rearG, kit.box(0.070, 0.006, 0.004, M.dark), 0.170, 0.600 + i * 0.082, -0.858);
      screwAt(rearG, 0.272, 0.600 + i * 0.082, -0.856, 'z', 0.010, 0.005);
    }
    // 后出风风扇（12cm）+ 金属防护网
    addFan(group, 0.060, 1.450, -0.700, 0.215, M.bladeDark, -1);
    const guard = new THREE.Group();
    guard.position.set(0.060, 1.450, -0.852);
    rearG.add(guard);
    for (let i = 0; i < 3; i++) {
      const rr = new THREE.Mesh(new THREE.TorusGeometry(0.060 + i * 0.065, 0.004, 4, 26), M.steelIn);
      guard.add(rr);
    }
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + i * Math.PI / 2;
      screwAt(rearG, 0.060 + Math.cos(a) * 0.200, 1.450 + Math.sin(a) * 0.200, -0.852, 'z', 0.012, 0.006);
    }
    // 电源仓后部散热孔（PSU 自己会露出线面，这里只留网）
    const psuVent = new THREE.Mesh(new THREE.PlaneGeometry(0.30, 0.30), meshFront);
    psuVent.rotation.y = Math.PI;
    psuVent.position.set(0.000, 0.200, -0.8595);
    rearG.add(psuVent);
    // 后部手拧螺丝（两侧板固定）
    thumbscrew(rearG, -0.368, 0.560, -0.830, 'z');
    thumbscrew(rearG, -0.368, 1.140, -0.830, 'z');
    thumbscrew(rearG, 0.368, 0.560, -0.830, 'z');
    thumbscrew(rearG, 0.368, 1.140, -0.830, 'z');

    /* ============================================================
       5. 玻璃侧板（+X，磁吸/手拧）
       ============================================================ */
    const glassG = new THREE.Group();
    group.add(glassG);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.008, 1.520, 1.560), M.glass);
    glass.position.set(0.396, 0.860, 0);
    glassG.add(glass);
    // 内部加强框（喷黑边，10mm 玻璃边框的观感）
    for (const sy of [-1, 1]) {
      put(glassG, kit.box(0.004, 0.042, 1.560, M.dark), 0.393, 0.860 + sy * 0.739, 0);
    }
    for (const sz of [-1, 1]) {
      put(glassG, kit.box(0.004, 1.520, 0.042, M.dark), 0.393, 0.860, sz * 0.759);
    }
    // 四角小螺丝（齐平，不越出 x=0.400）
    for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      screwAt(glassG, 0.3965, 0.860 + sy * 0.735, sz * 0.755, 'x', 0.010, 0.005);
    }
    // 玻璃后缘的手拧螺丝 ×2（带安装耳，确保 x ≤ 0.400）
    for (const y of [0.330, 1.390]) {
      put(glassG, kit.box(0.018, 0.044, 0.052, M.steelIn), 0.383, y, -0.820);
      thumbscrew(glassG, 0.382, y, -0.820, 'z', 0.016);
    }
    // 玻璃上的小丝印
    labelPlane(glassG, ['TEMPERED GLASS'], 0.30, 0.026, [0.3915, 0.140, 0.560],
      { rot: [0, Math.PI / 2, 0], w: 320, h: 40, opacity: 0.32 });
    // 玻璃与机架之间的橡胶压条
    for (const sy of [-1, 1]) {
      put(glassG, kit.box(0.010, 0.014, 1.560, M.rubber), 0.386, 0.860 + sy * 0.744, 0);
    }

    /* ============================================================
       6. 钢侧板（-X）
       ============================================================ */
    const sideG = new THREE.Group();
    group.add(sideG);
    // 外框四条边（带折边，外表面在 x=-0.400）
    for (const sz of [-1, 1]) {
      put(sideG, D.parts.cbox(0.020, 1.640, 0.050, M.steel, 0.004, 0.008), -0.390, 0.850, sz * 0.825);
    }
    for (const sy of [-1, 1]) {
      put(sideG, D.parts.cbox(0.020, 0.050, 1.600, M.steel, 0.004, 0.008), -0.390, 0.850 + sy * 0.795, 0);
    }
    // 压凹中板（外表面 x=-0.394，比边框凹进 6mm，做出真实的冲压层次）
    put(sideG, D.parts.cbox(0.008, 1.540, 1.600, M.paint, 0.003, 0.006), -0.390, 0.850, 0);
    // 压凹边缘的凸筋
    for (const sz of [-1, 1]) {
      put(sideG, kit.box(0.008, 1.500, 0.018, M.steelIn), -0.396, 0.850, sz * 0.790);
    }
    for (const sy of [-1, 1]) {
      put(sideG, kit.box(0.008, 0.018, 1.560, M.steelIn), -0.396, 0.850 + sy * 0.770, 0);
    }
    // 侧板内衬的吸音棉（薄薄一层）
    put(sideG, kit.box(0.006, 1.420, 1.480, M.dark), -0.380, 0.850, 0);
    // 侧板后缘手拧螺丝 ×2（带安装耳）
    for (const y of [0.330, 1.390]) {
      put(sideG, kit.box(0.018, 0.044, 0.052, M.steelIn), -0.383, y, -0.820);
      thumbscrew(sideG, -0.382, y, -0.820, 'z', 0.016);
    }
    // 侧板丝印
    labelPlane(sideG, ['STEEL SIDE PANEL'], 0.30, 0.026, [-0.3955, 0.300, 0.300],
      { rot: [0, -Math.PI / 2, 0], w: 320, h: 40, opacity: 0.35 });

    /* ============================================================
       7. 内部：主板托架 / 铜柱 / 理线孔 / 电源仓 / 硬盘笼
       ============================================================ */
    const trayG = new THREE.Group();
    group.add(trayG);
    // 主板托架：上半大板（在电源仓上方）+ 前下小板（在电源仓前方），中间让开 PSU 仓
    put(trayG, D.parts.cbox(0.012, 1.200, 1.600, M.steelIn, 0.003, 0.006), TRAY_X, 1.040, 0);
    put(trayG, D.parts.cbox(0.012, 0.360, 0.880, M.steelIn, 0.003, 0.006), TRAY_X, 0.260, 0.360);
    // 托架的卷边
    for (const sz of [-1, 1]) {
      put(trayG, kit.box(0.026, 1.200, 0.020, M.steelIn), TRAY_X + 0.012, 1.040, sz * 0.795);
    }
    // 3 个理线孔：橡胶护圈 + 后方暗孔
    const grommet = (y, z, w, h) => {
      put(trayG, kit.box(0.044, h, w, M.dark), TRAY_X - 0.006, y, z);
      // 橡胶护圈（4 段）
      for (const sy of [-1, 1]) {
        put(trayG, D.parts.cbox(0.030, 0.016, w + 0.030, M.grommet, 0.004, 0.008),
          TRAY_X + 0.014, y + sy * (h / 2 + 0.004), z);
      }
      for (const sz of [-1, 1]) {
        put(trayG, D.parts.cbox(0.030, h + 0.030, 0.016, M.grommet, 0.004, 0.008),
          TRAY_X + 0.014, y, z + sz * (w / 2 + 0.004));
      }
      // 理线孔上的螺丝（真实机箱是卡扣，这里给两颗）
      for (const sz of [-1, 1]) {
        screwAt(trayG, TRAY_X + 0.028, y + h / 2 + 0.004, z + sz * (w / 2 - 0.030), 'x', 0.009, 0.004);
      }
    };
    grommet(1.300, 0.520, 0.200, 0.100);
    grommet(0.960, 0.470, 0.180, 0.090);
    grommet(0.620, 0.500, 0.220, 0.100);
    // 9 颗主板铜柱（六角，ATX 定位）
    const standoff = (y, z) => {
      const s = kit.cyl(0.018, 0.018, 0.026, 6, M.copper);
      s.rotation.z = Math.PI / 2;
      s.position.set(TRAY_X + 0.013, y, z);
      trayG.add(s);
      const top = kit.cyl(0.020, 0.020, 0.004, 6, M.copper);
      top.rotation.z = Math.PI / 2;
      top.position.set(TRAY_X + 0.028, y, z);
      trayG.add(top);
    };
    for (const p of [
      [1.200, -0.560], [1.200, 0.380], [1.050, 0.040],
      [0.860, -0.560], [0.860, 0.040], [0.860, 0.400],
      [0.560, -0.560], [0.560, -0.060], [0.560, 0.400],
    ]) standoff(p[0], p[1]);

    // 电源仓（把 PSU 盖住的罩子 + 顶部开口）
    const shroudG = new THREE.Group();
    group.add(shroudG);
    rig(shroudG, 0.45, 1.0, [0, 0.060, 0]);
    const SH_TOP = 0.418;
    // 顶部四边（中间留 PSU 开口 0.68×0.62）
    put(shroudG, D.parts.cbox(0.060, 0.016, 0.760, M.paint, 0.003, 0.006), -0.330, SH_TOP, -0.460);
    put(shroudG, D.parts.cbox(0.060, 0.016, 0.760, M.paint, 0.003, 0.006), 0.330, SH_TOP, -0.460);
    put(shroudG, D.parts.cbox(0.720, 0.016, 0.120, M.paint, 0.003, 0.006), 0, SH_TOP, -0.160);
    put(shroudG, D.parts.cbox(0.720, 0.016, 0.020, M.paint, 0.003, 0.006), 0, SH_TOP, -0.825);
    // 前脸（可拆）+ 3 条散热槽
    put(shroudG, D.parts.cbox(0.720, 0.390, 0.018, M.paint, 0.003, 0.006), 0, 0.215, -0.100);
    for (let i = 0; i < 3; i++) {
      put(shroudG, kit.box(0.540, 0.016, 0.008, M.dark), 0, 0.130 + i * 0.075, -0.091);
    }
    // 罩子上的"PSU"丝印 + 两颗螺丝
    labelPlane(shroudG, ['PSU'], 0.10, 0.040, [-0.250, 0.330, -0.089],
      { w: 128, h: 64, opacity: 0.45 });
    for (const sx of [-1, 1]) {
      screwAt(shroudG, sx * 0.320, 0.335, -0.091, 'z', 0.012, 0.005);
    }
    // 电源仓两侧的支撑筋
    for (const sx of [-1, 1]) {
      put(shroudG, kit.box(0.014, 0.360, 0.700, M.frame), sx * 0.344, 0.200, -0.470);
    }

    // 硬盘笼（底部前方，2×3.5"）
    const cageG = new THREE.Group();
    group.add(cageG);
    rig(cageG, 0.40, 1.0, [0, 0.020, 0.060]);
    put(cageG, D.parts.cbox(0.520, 0.018, 0.300, M.paint, 0.003, 0.006), -0.020, 0.042, 0.300);
    for (const sx of [-1, 1]) {
      put(cageG, D.parts.cbox(0.016, 0.260, 0.300, M.paint, 0.003, 0.006), -0.020 + sx * 0.250, 0.175, 0.300);
    }
    // 2 个 3.5" 硬盘托架（带橡胶减震垫 + 螺丝）
    for (let i = 0; i < 2; i++) {
      const y = 0.105 + i * 0.115;
      const tray = D.parts.cbox(0.440, 0.026, 0.180, M.steelIn, 0.003, 0.005);
      tray.position.set(-0.020, y, 0.300);
      cageG.add(tray);
      // 盘位导轨 + 减震垫
      for (const sx of [-1, 1]) {
        put(cageG, kit.box(0.014, 0.060, 0.180, M.frame), -0.020 + sx * 0.180, y + 0.042, 0.300);
        for (const sz of [-1, 1]) {
          put(cageG, kit.cyl(0.012, 0.012, 0.010, 8, M.rubber), -0.020 + sx * 0.220, y, 0.300 + sz * 0.060);
        }
      }
      // 硬盘笼螺丝
      for (const sx of [-1, 1]) {
        screwAt(cageG, -0.020 + sx * 0.246, y, 0.300 + 0.070, 'x', 0.010, 0.005);
      }
    }
    // 笼顶的 SSD 托架
    put(cageG, kit.box(0.440, 0.010, 0.170, M.paint), -0.020, 0.335, 0.300);
    for (const sx of [-1, 1]) {
      put(cageG, kit.box(0.090, 0.008, 0.150, M.steelIn), -0.020 + sx * 0.130, 0.342, 0.300);
      screwAt(cageG, -0.020 + sx * 0.130, 0.348, 0.300 + 0.062, 'y', 0.009, 0.004);
    }

    // 托架背面的 SSD 位 ×2
    for (let i = 0; i < 2; i++) {
      const y = 0.560 + i * 0.150;
      put(trayG, kit.box(0.010, 0.100, 0.160, M.steelIn), TRAY_X - 0.012, y, 0.300);
      for (const sz of [-1, 1]) {
        screwAt(trayG, TRAY_X - 0.018, y, 0.300 + sz * 0.062, 'x', 0.009, 0.004);
      }
    }

    // 理线通道 + 3 条魔术贴
    const chanG = new THREE.Group();
    group.add(chanG);
    put(chanG, kit.box(0.014, 1.300, 0.070, M.steelIn), -0.345, 0.850, 0.560);
    put(chanG, kit.box(0.014, 1.300, 0.070, M.steelIn), -0.345, 0.850, 0.700);
    for (let i = 0; i < 3; i++) {
      const y = 0.380 + i * 0.420;
      put(chanG, kit.box(0.040, 0.028, 0.180, M.frame), -0.345, y, 0.630);
      // 线束
      const strap = kit.trace([
        [-0.345, y - 0.090, 0.630], [-0.350, y, 0.615], [-0.345, y + 0.090, 0.630],
      ], 0.010, M.frame, 10);
      chanG.add(strap);
    }

    /* ============================================================
       8. 拆解 / 动画
       ============================================================ */

    return {
      group,
      legend: [
        { text: '钢架 + 冲压网', desc: '0.6~1.0mm 钢板折弯成骨架，前面板整片冲孔网让风直接进来' },
        { text: '玻璃侧板', desc: '钢化玻璃侧透，能看见里面的风扇、显卡和理线' },
        { text: '主板托架', desc: '9 颗铜柱把主板架空，背后开理线孔，线走背板不挡风道' },
        { text: '电源仓', desc: '底部独立仓把电源藏起来，顶部开 150×86 的检修口' },
        { text: '风道', desc: '前 3 进 + 后 1 出 + 顶 2 出，热空气从上方走，正压少积灰' },
      ],

      setExplode(t) {
        const eTop = kit.easeInOut(kit.clamp01(t / 0.42));
        topG.position.y = 0.160 * eTop;
        const eGlass = kit.easeInOut(kit.clamp01((t - 0.05) / 0.45));
        glassG.position.x = 0.160 * eGlass;
        const eSide = kit.easeInOut(kit.clamp01((t - 0.12) / 0.45));
        sideG.position.x = -0.140 * eSide;
        const eFront = kit.easeInOut(kit.clamp01((t - 0.18) / 0.50));
        frontG.position.z = 0.200 * eFront;
        const eRear = kit.easeInOut(kit.clamp01((t - 0.22) / 0.50));
        rearG.position.z = -0.120 * eRear;
        const eBot = kit.easeInOut(kit.clamp01((t - 0.30) / 0.60));
        bottomG.position.y = -0.100 * eBot;
        for (const r of rigs) {
          const p = kit.easeInOut(kit.clamp01((t - r.t0) / (r.t1 - r.t0)));
          r.obj.position.set(r.off.x * p, r.off.y * p, r.off.z * p);
        }
      },

      update(elapsed, dt, emphasis = 0) {
        const tt = Number.isFinite(elapsed) ? elapsed : 0;
        const em = Number.isFinite(emphasis) ? emphasis : 0;
        // 风扇：角度由 elapsed 直接算出（无累加，不会漂）
        for (const f of fanRigs) f.rotor.rotation.y = tt * f.spin * (2.0 + em * 2.8);
        // 电源指示灯呼吸
        ledMat.emissiveIntensity = 0.5 + 0.45 * Math.sin(tt * 1.5) * (0.6 + em * 0.8);
      },
    };
  },
};
