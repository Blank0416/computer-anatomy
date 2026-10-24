/* ============================================================
   cpu.js — 处理器（LGA1851 台式机 CPU）
   ------------------------------------------------------------
   实物参照（DETAIL-SPEC §2）：
     封装 45 × 37.5mm，Z-height 4.464 ± 0.133mm
     基板（PCB）≈1.1mm，IHS 顶盖 ≈1.3mm，顶面 ≈37 × 30mm、四角 R2
     LGA1851 触点阵列：0.9mm 间距、每个触点 Ø0.35
     基板上一圈 0402 / 0603 贴片元件；一角 2 × 2mm 防呆三角；2 × 1mm 定位缺口

   ── 坐标与尺寸约定 ──
     局部 X = 45mm 那条边（1.14），局部 Z = 37.5mm 那条边（0.95）
     → k = 1.14 / 45 = 0.02533 场景单位 / mm
     原点 = 包围盒中心；底面 y = -0.105、IHS 顶面 y = +0.105
     总高 0.21 是 layout.js 的锚定值（世界 X = -0.09 + 0.30 · 局部Y，
     顶面落在 -0.0585，正好被散热器底座压住），所以不能改。
     4.464mm × k = 0.113 —— 0.21 相当于把「厚度方向」放大 1.86×，
     属于 DETAIL-SPEC §0.3 允许的可读性放大：不放大时基板厚 0.028，
     在整机尺度下几乎是一片纸，看不出「基板 → 晶片 → 顶盖」的层次。

   ── 为什么要做「空腔 IHS」──
     真实顶盖是冲压的壳：周围一圈裙边站在基板上，中间是薄的顶板，
     晶片藏在里面。做成实心盒子拆开时只能看到一块砖，做成壳才能看见
     「晶片在盖子里」。这里的裙边 / 肩台 / 顶台三段也正好对上实物
     顶盖的两级台阶。

   ── 拆解（setExplode）──
     顶盖抬起并侧转、晶片组上浮、16 个核心从中向外散开、触点阵列下沉。
     所有位移都是 t 的直接函数（无累加、可逆）。
   ============================================================ */

export default {
  id: 'cpu',
  name: '处理器',
  en: 'CPU',
  hue: 0xc9a98a,
  focus: { from: [1.55, 1.15, 1.95], look: [0, 0.30, 0], fov: 32 },

  build(kit) {
    const { THREE } = kit;
    const D = kit.detail;
    const group = new THREE.Group();

    /* ---------- 0. 尺寸常量（单位：场景单位；括号里是真实 mm） ---------- */
    const SUB_W = 1.14;                 // 45mm
    const SUB_D = 0.95;                 // 37.5mm
    const Y_BOT = -0.105;               // 触点底面
    const PAD_T = 0.012;                // 触点高
    const SUB_T = 0.058;                // 基板厚（1.1mm，放大 1.86×）
    const Y_SUB_TOP = Y_BOT + PAD_T + SUB_T;    // -0.035

    const DIE_W = 0.62;                 // 晶片 ≈24.5mm
    const DIE_D = 0.50;
    const DIE_T = 0.021;
    const Y_DIE_BOT = Y_SUB_TOP;
    const Y_DIE_TOP = Y_DIE_BOT + DIE_T;        // -0.014
    const CORE_T = 0.006;                       // 核心在晶片表面上微微凸起
    const CORE_N = 4;                           // 4 × 4 = 16 个核心

    const LID_W = 1.10;                 // 顶盖投影（略小于基板，留一圈基板边）
    const LID_D = 0.92;
    const LID_RIM_T = 0.05;             // 裙边壁厚
    const Y_RIM_TOP = 0.040;            // 裙边顶 = 肩台底
    const SHOULDER_T = 0.022;
    const Y_SHOULDER_TOP = Y_RIM_TOP + SHOULDER_T;      // 0.062
    const PLATEAU_W = 0.937;            // 顶台 37mm
    const PLATEAU_D = 0.76;             // 顶台 30mm
    const Y_TOP = 0.105;                // IHS 顶面（layout 锚点）

    const PAD_COLS = 45;                // 45 × 41 = 1845 个触点（LGA1851）
    const PAD_ROWS = 41;
    const PAD_PITCH = 0.0228;           // 0.9mm
    const PAD_SIZE = 0.0105;            // Ø0.35mm 的方形焊盘

    /* ---------- 1. 材质（全部走 kit 缓存 / detail 派生） ---------- */
    const M = {
      pcb: D.mat.pcb('#1a2a20'),                                  // 深绿基板
      pcbEdge: D.mat.grain(0x16241b, { rough: 0.82, bump: 0.4 }),  // 基板侧壁（板边更暗）
      gold: kit.mat('gold', { color: 0xd8b25e, roughness: 0.28, metalness: 0.95 }),
      silicon: kit.mat('silicon', { color: 0x3d4552, roughness: 0.30, metalness: 0.55 }),
      dieEdge: kit.mat('metalDark', { color: 0x2b303a, roughness: 0.45, metalness: 0.7 }),
      coreFrame: kit.mat('plasticDark', { color: 0x22252b, roughness: 0.62, metalness: 0.35 }), // 晶片围胶框
      nickel: kit.mat('metal', { color: 0xd2d6da, roughness: 0.16, metalness: 1.0 }),
      lidSide: D.mat.brushed(0xb9bdc2, { rough: 0.30, metal: 0.92, repeat: 2.4 }),
      smd: kit.mat('ceramic', { color: 0x6b6257, roughness: 0.72 }),
      black: kit.mat('plasticDark', { color: 0x14171b, roughness: 0.85 }),
      capTop: kit.mat('metalDark', { color: 0x4a4f56, roughness: 0.5, metalness: 0.8 }),
    };

    /* ---------- 2. 小工具 ---------- */
    const rigs = [];
    const rig = (obj, dx, dy, dz) => {
      obj.userData.base = obj.position.clone();
      rigs.push({ obj, d: new THREE.Vector3(dx, dy, dz) });
      return obj;
    };

    /** 贴纸：MeshBasicMaterial（贴图在 Node 下是 null，不报错，见 detail.js） */
    const sticker = (lines, w, h, o = {}) => {
      const tex = D.tex.plate(lines, { w: 512, h: 128, ...o });
      const mat = new THREE.MeshBasicMaterial({
        map: tex, transparent: true, opacity: o.opacity ?? 0.62,
        depthWrite: false, toneMapped: true, side: THREE.DoubleSide,
      });
      return new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    };

    const dummy = new THREE.Object3D();

    /* ---------- 3. 触点阵列（InstancedMesh：1845 个焊盘一条 draw call） ---------- */
    const padGroup = new THREE.Group();
    group.add(padGroup);
    const padGeo = new THREE.BoxGeometry(PAD_SIZE, PAD_T, PAD_SIZE);
    const pads = new THREE.InstancedMesh(padGeo, M.gold, PAD_COLS * PAD_ROWS);
    pads.castShadow = pads.receiveShadow = true;
    let pi = 0;
    for (let c = 0; c < PAD_COLS; c++) {
      for (let r = 0; r < PAD_ROWS; r++) {
        dummy.position.set(
          (c - (PAD_COLS - 1) / 2) * PAD_PITCH,
          Y_BOT + PAD_T / 2,
          (r - (PAD_ROWS - 1) / 2) * PAD_PITCH,
        );
        dummy.updateMatrix();
        pads.setMatrixAt(pi++, dummy.matrix);
      }
    }
    pads.instanceMatrix.needsUpdate = true;
    padGroup.add(pads);
    rig(padGroup, 0, -0.30, 0);

    /* ---------- 4. 基板（PCB）+ 板面元件 ---------- */
    const subGroup = new THREE.Group();
    group.add(subGroup);

    // 基板本体：45 × 37.5，四角 45° 定位切角（真实 LGA 基板靠切角 + 边缺口保证装不反）。
    // 用 Shape + ExtrudeGeometry 自建，变换与 D.chamferGeo 完全一致，保证总高 = SUB_T。
    const subBevel = 0.006;
    const subShape = new THREE.Shape();
    {
      const hw = SUB_W / 2 - subBevel;
      const hd = SUB_D / 2 - subBevel;
      const ch = 0.050;                                  // 2mm 的 45° 切角
      subShape.moveTo(-hw + ch, -hd);
      subShape.lineTo(hw - ch, -hd);
      subShape.lineTo(hw, -hd + ch);
      subShape.lineTo(hw, hd - ch);
      subShape.lineTo(hw - ch, hd);
      subShape.lineTo(-hw + ch, hd);
      subShape.lineTo(-hw, hd - ch);
      subShape.lineTo(-hw, -hd + ch);
      subShape.closePath();
    }
    const subGeo = new THREE.ExtrudeGeometry(subShape, {
      depth: Math.max(SUB_T - subBevel * 2, 0.0008),
      bevelEnabled: true, bevelThickness: subBevel, bevelSize: subBevel,
      bevelSegments: 1, steps: 1, curveSegments: 2,
    });
    subGeo.rotateX(-Math.PI / 2);
    subGeo.translate(0, -(SUB_T / 2 - subBevel), 0);
    const sub = new THREE.Mesh(subGeo, M.pcb);
    sub.castShadow = sub.receiveShadow = true;
    sub.position.y = Y_BOT + PAD_T + SUB_T / 2;
    subGroup.add(sub);

    // （板边倒角由 ExtrudeGeometry 的 bevel 负责：侧壁比顶面暗一档，正好是裸 FR4 的感觉）

    // 基板顶面、晶片两侧的贴片元件（真实顶面的 0402/0603 都被顶盖压着，
    // 只有拆开才看得见 —— 所以摆在 die 与顶盖裙边之间的带区里，避开裙边）
    const smdBands = [];
    for (const side of [-1, 1]) {
      const field = D.parts.smdField(15, { w: 0.026, h: 0.012, d: 0.016 }, M.smd);
      field.castShadow = field.receiveShadow = true;
      field.userData.fill(
        side * 0.34, side * 0.47, -0.34, 0.34, Y_SUB_TOP + 0.006, 7 + side,
      );
      subGroup.add(field);
      smdBands.push(field);
    }
    // 靠 -Z 板边一排小电容（三颗一组的供电滤波）
    for (let i = 0; i < 5; i++) {
      const cap = D.parts.capacitor(0.018, 0.016, 0x5b544c);
      cap.position.set((i - 2) * 0.075, Y_SUB_TOP + 0.008, -0.36);
      subGroup.add(cap);
    }
    // 板角防呆三角（2 × 2mm 的金属标记，装反了会顶住插座）
    const triShape = new THREE.Shape();
    triShape.moveTo(-0.026, -0.022);
    triShape.lineTo(0.026, -0.022);
    triShape.lineTo(0, 0.022);
    triShape.closePath();
    const tri = new THREE.Mesh(new THREE.ShapeGeometry(triShape), M.gold);
    tri.rotation.x = -Math.PI / 2;
    tri.position.set(0.505, Y_SUB_TOP + 0.0015, -0.395);
    subGroup.add(tri);

    // 基板两侧的定位缺口（2 × 1mm）：在板边压两条与板边齐平的暗槽示意
    for (const sz of [-1, 1]) {
      const notch = kit.box(0.070, 0.014, 0.018, M.black);
      notch.position.set(0, Y_BOT + PAD_T + SUB_T * 0.5, sz * (SUB_D / 2 - 0.009));
      subGroup.add(notch);
    }

    /* ---------- 5. 晶片 + 16 个核心（拆开后从顶盖里露出来） ---------- */
    const dieGroup = new THREE.Group();
    group.add(dieGroup);

    const die = D.parts.cbox(DIE_W, DIE_T, DIE_D, M.silicon, 0.0025, 0.010);
    die.position.y = Y_DIE_BOT + DIE_T / 2;
    dieGroup.add(die);

    // 晶片边缘一圈深色围墙（真实 die 四周是基板焊盘区，视觉上压一道暗边）
    for (const s of [-1, 1]) {
      const wall = kit.box(DIE_W + 0.012, 0.005, 0.012, M.dieEdge);
      wall.position.set(0, Y_DIE_BOT + 0.004, s * (DIE_D / 2 + 0.004));
      dieGroup.add(wall);
    }

    // 16 个核心：共享几何 + 各自一份 kit 派生材质（要单独做波前发光），
    // 每个核心外面再套一圈「围胶框」—— 真实 die 上每个 tile 边缘都有一道
    // 环氧围胶/金属堤，把它框住。tile 与围胶一起做成 Group，拆解时整块飞出去。
    const CORE_W = 0.100;
    const CORE_D = 0.074;
    const coreGeo = D.chamferGeo(CORE_W, CORE_T, CORE_D, 0.0016, 0.007);

    /** 圆角矩形轮廓（核心围胶框 = 外框挖掉内框，挤出成一圈堤） */
    const rrShape = (w, d, r) => {
      const s = new THREE.Shape();
      const hw = w / 2;
      const hd = d / 2;
      s.moveTo(-hw + r, -hd);
      s.lineTo(hw - r, -hd); s.quadraticCurveTo(hw, -hd, hw, -hd + r);
      s.lineTo(hw, hd - r); s.quadraticCurveTo(hw, hd, hw - r, hd);
      s.lineTo(-hw + r, hd); s.quadraticCurveTo(-hw, hd, -hw, hd - r);
      s.lineTo(-hw, -hd + r); s.quadraticCurveTo(-hw, -hd, -hw + r, -hd);
      return s;
    };
    const ringOuter = rrShape(CORE_W + 0.007, CORE_D + 0.007, 0.010);
    ringOuter.holes.push(rrShape(CORE_W - 0.001, CORE_D - 0.001, 0.008));
    const ringGeo = new THREE.ExtrudeGeometry(ringOuter, {
      depth: 0.0045, bevelEnabled: false, curveSegments: 3, steps: 1,
    });
    ringGeo.rotateX(-Math.PI / 2);
    ringGeo.translate(0, -0.00225, 0);

    const coreMatBase = kit.mat('silicon', {
      color: 0x5c6675, roughness: 0.24, metalness: 0.62,
      emissive: 0xffb066, emissiveIntensity: 0.18,
    });
    const cores = [];
    const corePitchX = (DIE_W - 0.18) / CORE_N;         // 0.110
    const corePitchZ = (DIE_D - 0.16) / CORE_N;         // 0.085
    for (let i = 0; i < CORE_N; i++) {
      for (let j = 0; j < CORE_N; j++) {
        const mat = coreMatBase.clone();
        const grp = new THREE.Group();
        grp.position.set(
          (i - (CORE_N - 1) / 2) * corePitchX,
          Y_DIE_TOP + CORE_T / 2,
          (j - (CORE_N - 1) / 2) * corePitchZ,
        );

        const core = new THREE.Mesh(coreGeo, mat);
        core.castShadow = core.receiveShadow = true;
        grp.add(core);

        const ring = new THREE.Mesh(ringGeo, M.coreFrame);
        ring.position.y = -0.0008;
        ring.castShadow = ring.receiveShadow = true;
        grp.add(ring);

        grp.userData.base = grp.position.clone();
        grp.userData.mat = mat;
        grp.userData.wave = (i + j) / (2 * (CORE_N - 1));   // 对角波前 0→1
        dieGroup.add(grp);
        cores.push(grp);
      }
    }

    // 核心之间的 L3 缓存条（视觉上把 16 核连成一片，也让 die 不至于太空）
    for (const s of [-1, 1]) {
      const l3 = kit.box(DIE_W - 0.16, 0.004, 0.026, M.dieEdge);
      l3.position.set(0, Y_DIE_TOP + 0.002, s * (DIE_D / 2 - 0.035));
      dieGroup.add(l3);
    }
    // 一侧的 I/O + 内存控制器带（沿 die 的 -X 边，避开 16 核阵列）
    const io = kit.box(0.040, 0.004, DIE_D - 0.20, M.dieEdge);
    io.position.set(-(DIE_W / 2 - 0.045), Y_DIE_TOP + 0.002, 0);
    dieGroup.add(io);

    rig(dieGroup, 0, 0.26, 0);

    /* ---------- 6. IHS 顶盖（空腔壳：裙边 → 肩台 → 顶台，两段台阶） ---------- */
    const lid = new THREE.Group();
    group.add(lid);
    const rimTop = Y_RIM_TOP;
    const rimH = rimTop - Y_SUB_TOP;                 // 裙边高度
    const rimY = Y_SUB_TOP + rimH / 2;

    for (const sz of [-1, 1]) {
      const wall = D.parts.cbox(LID_W, rimH, LID_RIM_T, M.nickel, 0.004, 0.010);
      wall.position.set(0, rimY, sz * (LID_D / 2 - LID_RIM_T / 2));
      lid.add(wall);
    }
    for (const sx of [-1, 1]) {
      const wall = D.parts.cbox(LID_RIM_T, rimH, LID_D - LID_RIM_T * 2, M.nickel, 0.004, 0.010);
      wall.position.set(sx * (LID_W / 2 - LID_RIM_T / 2), rimY, 0);
      lid.add(wall);
    }

    // 肩台（顶盖的一级台阶）
    const shoulder = D.parts.cbox(LID_W, SHOULDER_T, LID_D, M.lidSide, 0.006, 0.026);
    shoulder.position.y = Y_RIM_TOP + SHOULDER_T / 2;
    lid.add(shoulder);

    // 顶台（37 × 30mm、四角 R2 的二级台阶）
    const plateau = D.parts.cbox(PLATEAU_W, Y_TOP - Y_SHOULDER_TOP, PLATEAU_D, M.lidSide, 0.010, 0.050);
    plateau.position.y = (Y_SHOULDER_TOP + Y_TOP) / 2;
    lid.add(plateau);

    // 顶盖上的激光刻字（型号 / 规格 / 一维码）
    const etch = sticker(['LGA1851   24C / 32T', '5.8 GHz TURBO  ·  125 W'], 0.80, 0.18, {
      ink: '#8a8f95', opacity: 0.55,
    });
    etch.rotation.x = -Math.PI / 2;
    etch.position.set(-0.02, Y_TOP + 0.0008, 0.10);
    lid.add(etch);

    const code = sticker(['2D', 'CODE'], 0.20, 0.12, { ink: '#9aa0a6', opacity: 0.5, barcode: true });
    code.rotation.x = -Math.PI / 2;
    code.position.set(0.33, Y_TOP + 0.0008, -0.22);
    lid.add(code);

    // 刻字边缘的一圈细线（真实顶盖上有道压痕）
    const seam = kit.box(PLATEAU_W - 0.06, 0.0016, 0.002, M.black);
    seam.position.set(0, Y_TOP + 0.0006, -PLATEAU_D / 2 + 0.035);
    lid.add(seam);

    /* ---------- 7. 拆解 / 动画 / 图例 ---------- */
    let explodeT = 0;
    function setExplode(t) {
      explodeT = kit.clamp01(t);
      const e = kit.easeInOut(explodeT);
      for (const r of rigs) {
        const b = r.obj.userData.base;
        r.obj.position.set(b.x + r.d.x * e, b.y + r.d.y * e, b.z + r.d.z * e);
      }
      // 顶盖：抬起 + 侧转（转一点就能看见里面是空壳）
      lid.position.y = 0.52 * e;
      lid.rotation.z = -0.10 * e;
      lid.rotation.y = 0.14 * e;
      // 16 个核心：一边上浮一边从中向外散开
      for (const c of cores) {
        const b = c.userData.base;
        const rad = Math.hypot(b.x, b.z) / 0.36;
        c.position.set(b.x * (1 + 0.20 * e), b.y + (0.06 + rad * 0.10) * e, b.z * (1 + 0.20 * e));
      }
    }

    function update(elapsed, dt, emphasis = 0) {
      // 对角波前扫过 16 个核心：只由 elapsed 决定，无状态
      const phase = (elapsed * 0.42) % 1;
      for (const c of cores) {
        const w = c.userData.wave;
        const d = Math.abs(w - phase);
        const k = Math.max(0, 1 - Math.min(d, 1 - d) * 7);
        c.userData.mat.emissiveIntensity = 0.16 + k * (0.85 + emphasis * 0.9);
      }
    }

    setExplode(0);

    const legend = [
      { text: '顶盖 IHS', desc: '金属壳把晶片的热量摊开，再交给散热器底座' },
      { text: '晶片 Die', desc: '真正的硅片，几十亿个晶体管刻在这块小方片上' },
      { text: '核心阵列', desc: '16 个独立运算单元并排工作，谁热谁降温' },
      { text: '基板与触点', desc: '1845 个金属触点，把信号和电送到主板插座' },
      { text: '贴片元件', desc: '盖子底下那圈小电容，给核心供电做滤波' },
    ];

    return { group, setExplode, update, legend };
  },
};
