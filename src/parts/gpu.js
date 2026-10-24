/* ============================================================
   gpu.js — 独立显卡（双槽三风扇级）
   ------------------------------------------------------------
   v2 的精修点（对照"粗糙"的三个来源）：
     ① 表面：PCB 走线/丝印/过孔（kit 的 pcb 贴图）+ 拉丝背板 + 磨砂外壳
     ② 细零件：8 颗热管、64 片鳍片、14 相供电、12 颗显存、16 pin 供电口、
        3 个显示接口（HDMI + 2×DP）、螺丝/弹簧、板边贴片元件阵列
     ③ 倒角：外壳、背板、供电口全部走 detail.parts.cbox（锐边接不住高光，
        0.5mm 倒角就能让轮廓立起来）
   拆解：外壳总成先让位 → 晶片抬起 → 显存向外散开 → 背板下沉
   动画：SM 阵列波前 + 显存依次点亮 + 晶片↔显存数据流 + 双风扇转速
   ============================================================ */

export default {
  id: 'gpu',
  name: '显卡',
  en: 'GPU',
  hue: 0x93ae94,

  focus: { from: [1.24, 1.42, 1.58], look: [0, 0.06, 0], fov: 34 },

  build(kit) {
    const { THREE } = kit;
    const D = kit.detail;
    const group = new THREE.Group();
    const hue = 0x93ae94;

    /* ---------- 尺寸（1 世界单位 ≈ 180mm 实机） ---------- */
    const PCB_W = 1.50;        // 板长（X，挡板在 -X）
    const PCB_T = 0.050;       // 板厚（≈1.6mm 实板 + 夸张）
    const PCB_D = 1.10;        // 板宽（Z，金手指在 -Z）
    const yTop = PCB_T / 2;

    /* ---------- 材质包（本件专用，都带细节层） ---------- */
    const M = {
      pcb: kit.detail.mat.pcb('#1d2b2a'),
      shroud: D.mat.grain(0x2b3037, { rough: 0.68, bump: 0.5 }),
      shroudEdge: D.mat.grain(0x353b43, { rough: 0.55 }),
      back: D.mat.brushed(0x6c737b, { rough: 0.40, metal: 0.66, repeat: 2.2 }),
      fin: D.mat.brushed(0x9aa0a6, { rough: 0.32, metal: 0.76, repeat: 3 }),
      copper: kit.mat('copper', { roughness: 0.26, metalness: 0.84 }),
      copperDark: kit.mat('copper', { roughness: 0.44, metalness: 0.7, color: 0x8a5f47 }),
      silicon: kit.mat('silicon', { roughness: 0.28, metalness: 0.2 }),
      gold: kit.mats.gold,
      steel: D.mat.brushed(0x848b93, { rough: 0.36, metal: 0.75, repeat: 2 }),
      black: kit.mat('plasticDark', { color: 0x171a1e, roughness: 0.86 }),
      slot: kit.mat('plasticDark', { color: 0x2a2f36, roughness: 0.7 }),
      ceramic: kit.mats.ceramic,
    };

    /* ---------- 1. PCB 本体（带倒角，四周露出板边） ---------- */
    const pcb = D.parts.cbox(PCB_W, PCB_T, PCB_D, M.pcb, 0.004, 0.006);
    group.add(pcb);

    // 板边的丝印铭牌（贴片式平面，走 MeshBasic 才像油墨）
    const plateMat = (lines, w, h, o = {}) => {
      const tex = D.tex.plate(lines, { w: 512, h: 128, ...o });
      return new THREE.MeshBasicMaterial({
        map: tex, transparent: true, opacity: o.opacity ?? 0.62,
        depthWrite: false, toneMapped: true, side: THREE.DoubleSide,
      });
    };
    const silk1 = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.105), plateMat(['GRAPHICS', 'VC-24G  GDDR7'], 512, 128, { ink: '#a8aea9' }));
    silk1.rotation.x = -Math.PI / 2;
    silk1.position.set(0.60, yTop + 0.0015, 0.40);
    group.add(silk1);

    /* ---------- 2. 金属背板（加强 + 均热） ---------- */
    const backplate = D.parts.cbox(1.42, 0.018, 0.98, M.back, 0.005, 0.02);
    backplate.position.set(0, -0.036, 0);
    group.add(backplate);
    // 背板开窗（8 个出风口）：深色内凹，视觉上就是"挖穿了"
    for (let i = 0; i < 4; i++) {
      for (const sz of [1, -1]) {
        const vent = kit.box(0.20, 0.006, 0.055, M.black);
        vent.position.set(-0.34 + i * 0.23, -0.046, sz * 0.30);
        group.add(vent);
      }
    }
    // 背板 8 颗螺丝
    for (const sx of [-0.62, -0.20, 0.24, 0.62]) {
      for (const sz of [-0.42, 0.42]) {
        const s = D.parts.screw(0.017, 0.007);
        s.position.set(sx, -0.047, sz);
        group.add(s);
      }
    }
    // 背面铭牌
    const bpLabel = new THREE.Mesh(new THREE.PlaneGeometry(0.30, 0.075), plateMat(['VC-24G', 'SN 0000-0000'], 384, 96, { ink: '#9fa6a1', opacity: 0.55 }));
    bpLabel.rotation.x = Math.PI / 2;
    bpLabel.position.set(0.42, -0.0465, -0.16);
    group.add(bpLabel);

    /* ---------- 3. PCIe 金手指（含防呆缺口与板边倒角） ---------- */
    // 连接器条：压在板面下方，避免和显存、板边元件打架
    group.add(kit.box(1.00, 0.045, 0.05, M.slot).translateX(-0.21).translateY(-0.0055).translateZ(-0.575));
    const padY = -0.032;
    // 短边 13 针 + 防呆缺口 + 长边 65 针
    const segL = D.parts.pinRow(13, 0.012, { w: 0.010, h: 0.009, d: 0.048 }, M.gold);
    segL.position.set(-0.605, padY, -0.575);
    group.add(segL);
    const segR = D.parts.pinRow(65, 0.012, { w: 0.010, h: 0.009, d: 0.048 }, M.gold);
    segR.position.set(-0.116, padY, -0.575);
    group.add(segR);
    // 金手指上方的丝印定位线
    const keyMark = kit.box(0.020, 0.002, 0.030, M.ceramic);
    keyMark.position.set(-0.545, yTop + 0.001, -0.545);
    group.add(keyMark);

    /* ---------- 4. 挡板与三个显示接口 ---------- */
    const bracket = D.parts.cbox(0.026, 0.215, 1.12, M.steel, 0.004, 0.012);
    bracket.position.set(-0.759, 0.056, 0);
    group.add(bracket);
    // 挡板上沿的固定耳 + 螺丝
    for (const z of [-0.44, 0.44]) {
      const tab = kit.box(0.030, 0.030, 0.075, M.steel);
      tab.position.set(-0.759, 0.170, z);
      group.add(tab);
      const ts = D.parts.screw(0.013, 0.006);
      ts.position.set(-0.759, 0.180, z);
      group.add(ts);
    }
    // 三个接口：HDMI + 2×DP
    const ports = [
      { kind: 'hdmi', y: 0.086, z: -0.30, w: 0.165 },
      { kind: 'dp', y: 0.086, z: 0.02, w: 0.150 },
      { kind: 'dp', y: 0.086, z: 0.31, w: 0.150 },
    ];
    for (const p of ports) {
      const port = D.parts.port(p.kind, { w: p.w, h: 0.078 });
      port.position.set(-0.768, p.y, p.z);
      group.add(port);
      // 挡板上开的窗口内壁
      const hole = kit.box(0.012, 0.070, p.w * 0.92, M.black);
      hole.position.set(-0.751, p.y, p.z);
      group.add(hole);
    }
    // 挡板上部的散热网槽
    for (let i = 0; i < 5; i++) {
      const slot = kit.box(0.028, 0.006, 0.11, kit.mat('metalDark', { color: 0x2b3037 }));
      slot.position.set(-0.759, 0.128 + i * 0.010, 0.31);
      group.add(slot);
    }

    /* ---------- 5. GPU 晶片封装 ---------- */
    const DIE = { x: -0.08, y: 0.0425, z: 0, w: 0.86, h: 0.030, d: 0.78 };
    const dieGroup = new THREE.Group();
    group.add(dieGroup);

    // 封装基板（比晶片大一圈，绿褐色）
    const subst = D.parts.cbox(DIE.w + 0.06, 0.016, DIE.d + 0.06, kit.mat('pcb', { color: 0x5c5850 }), 0.003, 0.008);
    subst.position.set(DIE.x, yTop + 0.016, DIE.z);
    dieGroup.add(subst);

    // 裸晶片
    const die = D.parts.cbox(DIE.w, DIE.h, DIE.d, M.silicon, 0.004, 0.01);
    die.position.set(DIE.x, DIE.y + 0.012, DIE.z);
    dieGroup.add(die);
    // 晶片四周的围胶（一圈深色中框）
    for (const [dx, dz, w, d] of [
      [0, (DIE.d / 2 + 0.014), DIE.w + 0.07, 0.024],
      [0, -(DIE.d / 2 + 0.014), DIE.w + 0.07, 0.024],
      [(DIE.w / 2 + 0.014), 0, 0.024, DIE.d + 0.07],
      [-(DIE.w / 2 + 0.014), 0, 0.024, DIE.d + 0.07],
    ]) {
      const ring = kit.box(w, 0.012, d, M.black);
      ring.position.set(DIE.x + dx, yTop + 0.020, DIE.z + dz);
      dieGroup.add(ring);
    }

    /* ---------- 6. SM 流处理器阵列（8×8 = 64） ---------- */
    const N = 8;
    const CELL = 0.092;
    const smBase = kit.mat('plasticDark', { color: 0x2f3740, emissive: new THREE.Color(hue), emissiveIntensity: 0.04 });
    const sms = [];
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const mat = smBase.clone();
        const sm = kit.box(0.072, 0.008, 0.072, mat);
        sm.position.set(
          DIE.x + (i - (N - 1) / 2) * CELL,
          yTop + 0.040,
          DIE.z + (j - (N - 1) / 2) * CELL,
        );
        sm.userData.mat = mat;
        sm.userData.wave = (i + j) / (2 * N - 2);
        dieGroup.add(sm);
        sms.push(sm);
      }
    }

    /* ---------- 7. L2 缓存环 + 显存控制器 ---------- */
    const l2Mat = kit.mat('plasticMid', { color: 0x4a525a, roughness: 0.6, metalness: 0.2 });
    for (const sz of [1, -1]) {
      const bar = kit.box(0.80, 0.010, 0.040, l2Mat);
      bar.position.set(DIE.x, yTop + 0.040, DIE.z + sz * 0.362);
      dieGroup.add(bar);
    }
    for (const sx of [1, -1]) {
      const bar = kit.box(0.040, 0.010, 0.74, l2Mat);
      bar.position.set(DIE.x + sx * 0.384, yTop + 0.040, DIE.z);
      dieGroup.add(bar);
    }
    for (const sz of [1, -1]) {
      for (let k = 0; k < 6; k++) {
        const phy = D.parts.cbox(0.044, 0.012, 0.018, M.steel, 0.002, 0.004);
        phy.position.set(DIE.x + (k - 2.5) * 0.10, 0.036, DIE.z + sz * 0.418);
        dieGroup.add(phy);
      }
    }
    // 晶片外围的贴片电容排（每边 8 颗）
    for (const sz of [1, -1]) {
      for (let k = 0; k < 8; k++) {
        const c = kit.box(0.012, 0.008, 0.006, M.ceramic);
        c.position.set(DIE.x + (k - 3.5) * 0.10, yTop + 0.030, DIE.z + sz * 0.442);
        dieGroup.add(c);
      }
    }

    /* ---------- 8. 显存颗粒 × 12 ---------- */
    const VRAM = { w: 0.115, h: 0.028, d: 0.100, y: 0.040 };
    const vramBase = kit.mat('plasticDark', { color: 0x23282e, emissive: new THREE.Color(hue), emissiveIntensity: 0.04, roughness: 0.62 });
    const winMat = kit.mat('silicon', { roughness: 0.5 });
    const vrams = [];
    const vramPlan = [];
    for (const x of [-0.32, -0.16, 0.00, 0.16]) {
      vramPlan.push({ x, z: 0.478, ox: 0, oz: 0.16 });
      vramPlan.push({ x, z: -0.478, ox: 0, oz: -0.16 });
    }
    for (const z of [-0.07, 0.07]) {
      vramPlan.push({ x: 0.452, z, ox: 0.10, oz: 0 });
      vramPlan.push({ x: -0.602, z, ox: -0.10, oz: 0 });
    }
    for (let k = 0; k < vramPlan.length; k++) {
      const p = vramPlan[k];
      const mat = vramBase.clone();
      const chip = D.parts.cbox(VRAM.w, VRAM.h, VRAM.d, mat, 0.003, 0.01);
      chip.position.set(p.x, VRAM.y, p.z);
      chip.userData.base = chip.position.clone();
      chip.userData.off = new THREE.Vector3(p.ox, 0.22, p.oz);
      chip.userData.mat = mat;
      chip.userData.k = k;
      group.add(chip);
      // 封装开窗的裸 die
      const win = kit.box(0.068, 0.004, 0.058, winMat);
      win.position.set(p.x, VRAM.y + VRAM.h / 2 + 0.002, p.z);
      chip.userData.win = win;
      group.add(win);
      vrams.push(chip);
    }

    /* ---------- 9. 供电：14 相电感 + MOSFET + 电容 + 主控 ---------- */
    const vrms = [];
    for (let k = 0; k < 14; k++) {
      const z = -0.44 + k * 0.068;
      const ind = D.parts.inductor(0.052, 0.048, 0.052);
      ind.position.set(0.646, 0.062, z);
      group.add(ind);
      vrms.push(ind);

      // 每相两颗 MOSFET（上下桥）
      for (const dx of [0.0, -0.052]) {
        const fet = D.parts.cbox(0.038, 0.014, 0.040, M.steel, 0.002, 0.006);
        fet.position.set(0.596 + dx, 0.034, z);
        group.add(fet);
      }
    }
    // 供电滤波电容排（贴着板边）
    for (let k = 0; k < 9; k++) {
      const cap = D.parts.capacitor(0.016, 0.038, 0x30363d);
      cap.position.set(0.698, 0.024, -0.42 + k * 0.105);
      group.add(cap);
    }
    // PWM 主控
    const pwm = D.parts.cbox(0.06, 0.012, 0.06, M.black, 0.002, 0.006);
    pwm.position.set(0.60, 0.030, 0.30);
    group.add(pwm);

    /* ---------- 10. 12VHPWR 供电口（16 pin） ---------- */
    const pwrShell = D.parts.cbox(0.22, 0.105, 0.105, M.black, 0.005, 0.012);
    pwrShell.position.set(0.40, 0.078, 0.512);
    group.add(pwrShell);
    for (const yy of [0.055, 0.101]) {
      const p = D.parts.pinRow(8, 0.022, { w: 0.012, h: 0.012, d: 0.034 }, M.gold);
      p.position.set(0.40, yy, 0.566);
      group.add(p);
    }
    // 卡扣
    const latch = kit.box(0.05, 0.014, 0.02, M.shroudEdge);
    latch.position.set(0.40, 0.134, 0.512);
    group.add(latch);

    /* ---------- 11. 板边贴片元件阵列（看起来"电路很密"的关键） ---------- */
    const mlcc = D.parts.smdField(150, { w: 0.011, h: 0.007, d: 0.007 }, M.ceramic);
    mlcc.userData.fill(-0.70, 0.34, -0.50, -0.40, yTop + 0.006, 0x77);
    group.add(mlcc);
    const mlcc2 = D.parts.smdField(90, { w: 0.009, h: 0.006, d: 0.006 }, M.ceramic);
    mlcc2.userData.fill(-0.70, -0.46, -0.36, 0.36, yTop + 0.006, 0x31);
    group.add(mlcc2);
    // 几个大一点的固态电容（板面左侧）
    for (let k = 0; k < 6; k++) {
      const cap = D.parts.capacitor(0.021, 0.030, 0x333a42);
      cap.position.set(-0.66, 0.020, -0.30 + k * 0.115);
      group.add(cap);
    }

    /* ---------- 12. 散热器总成 ---------- */
    const cooler = new THREE.Group();

    // 铜冷板（压在晶片上）
    const cold = D.parts.cbox(0.92, 0.026, 0.84, M.copper, 0.006, 0.02);
    cold.position.set(DIE.x, 0.090, 0);
    cooler.add(cold);
    // 冷板四角固定螺丝 + 弹簧
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const post = kit.cyl(0.012, 0.012, 0.036, 8, M.steel);
        post.position.set(DIE.x + sx * 0.40, 0.108, sz * 0.36);
        cooler.add(post);
        const spring = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.0035, 4, 10), M.steel);
        spring.rotation.x = Math.PI / 2;
        spring.position.set(DIE.x + sx * 0.40, 0.118, sz * 0.36);
        cooler.add(spring);
        const sc = D.parts.screw(0.014, 0.006);
        sc.position.set(DIE.x + sx * 0.40, 0.132, sz * 0.36);
        cooler.add(sc);
      }
    }

    // 8 根热管：从冷板两侧穿出，压进鳍片堆
    for (const sz of [1, -1]) {
      for (let i = 0; i < 4; i++) {
        const dz = sz * (0.11 + i * 0.13);
        const pipe = D.parts.heatpipe([
          [DIE.x - 0.30, 0.098, dz * 0.8],
          [DIE.x - 0.05, 0.106, dz],
          [DIE.x + 0.28, 0.112, dz * 0.96],
          [0.50 - i * 0.05, 0.118, dz * 0.86],
        ], 0.025, M.copper);
        cooler.add(pipe);
      }
    }

    // 鳍片：64 片，密度接近实卡（间距 ≈1.1mm 缩放后）
    const fins = D.parts.finStack(
      { count: 64, spanX: 1.20, y: 0.155, h: 0.105, zLen: 0.86, thick: 0.0032 },
      M.fin,
    );
    cooler.add(fins);
    // 鳍片两端的护齿（防止手指摸到，实卡都有）
    for (const sx of [-1, 1]) {
      const comb = kit.box(0.016, 0.115, 0.88, M.fin);
      comb.position.set(sx * 0.606, 0.155, 0);
      cooler.add(comb);
    }

    // 外壳：两条侧裙 + 风扇环 + 中间桥
    const shroudY = 0.408;
    for (const sz of [1, -1]) {
      const skirt = D.parts.cbox(1.26, 0.20, 0.014, M.shroud, 0.004, 0.012);
      skirt.position.set(0, 0.318, sz * 0.514);
      cooler.add(skirt);
      // 裙板上的斜向棱线（纯粹为了"有设计感"）
      for (let i = 0; i < 3; i++) {
        const rib = kit.box(0.30, 0.028, 0.004, M.shroudEdge);
        rib.position.set(-0.42 + i * 0.42, 0.30 + i * 0.012, sz * 0.522);
        rib.rotation.z = 0.10;
        cooler.add(rib);
      }
    }
    // 风扇环（用 RingGeometry 留出开口）+ 顶部桥
    const fanX = [-0.335, 0.315];
    const fanR = 0.205;
    for (const fx of fanX) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(fanR * 1.02, fanR * 1.34, 32), M.shroud);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(fx, shroudY, 0);
      ring.castShadow = ring.receiveShadow = true;
      cooler.add(ring);
    }
    // 中间与两端的横梁
    for (const x of [-0.66, -0.02, 0.66]) {
      const bar = D.parts.cbox(0.075, 0.016, 1.05, M.shroudEdge, 0.003, 0.01);
      bar.position.set(x, shroudY, 0);
      cooler.add(bar);
    }
    for (const sz of [1, -1]) {
      const bar = D.parts.cbox(1.34, 0.016, 0.045, M.shroudEdge, 0.003, 0.01);
      bar.position.set(0, shroudY, sz * 0.525);
      cooler.add(bar);
    }
    // 顶沿灯条（hue 只用在强调件上）
    const lightBar = kit.box(1.06, 0.008, 0.030, kit.glow(hue, 0.85));
    lightBar.position.set(0, shroudY + 0.013, 0.51);
    cooler.add(lightBar);
    // 外壳螺丝
    for (const sx of [-0.62, 0.62]) {
      for (const sz of [-1, 1]) {
        const s = D.parts.screw(0.011, 0.005);
        s.position.set(sx, shroudY + 0.011, sz * 0.50);
        cooler.add(s);
      }
    }

    // 双风扇（11 叶弧面桨叶）
    const rotors = [];
    for (const fx of fanX) {
      const fan = D.parts.fan({
        r: fanR, blades: 11, hubR: 0.052, thick: 0.062,
        frameMat: M.shroudEdge, bladeMat: kit.mat('plasticMid', { color: 0x6a7078, roughness: 0.5 }),
      });
      fan.group.position.set(fx, 0.352, 0);
      cooler.add(fan.group);
      rotors.push(fan.rotor);
    }

    group.add(cooler);

    /* ---------- 13. 晶片 ↔ 显存的数据流 ---------- */
    const flowMat = kit.glow(hue, 2.6);
    const flows = [];
    for (const v of vrams) {
      const b = v.userData.base;
      const isZ = Math.abs(b.z) > 0.30;
      let pts;
      if (isZ) {
        const sz = Math.sign(b.z);
        pts = [
          [b.x, yTop + 0.037, sz * 0.34],
          [b.x, yTop + 0.045, sz * 0.405],
          [b.x, yTop + 0.032, sz * 0.478],
        ];
      } else {
        const sx = Math.sign(b.x);
        pts = [
          [DIE.x + sx * 0.43, yTop + 0.037, b.z],
          [sx * 0.54, yTop + 0.045, b.z],
          [b.x, yTop + 0.032, b.z],
        ];
      }
      const path = kit.trace(pts, 0.0030, flowMat, 8);
      group.add(path);
      const dot = kit.dot(0, 0, 0, flowMat, 0.014);
      dot.userData.t = (v.userData.k % 4) / 4;
      dot.userData.trace = path;
      dot.userData.rev = v.userData.k % 2 === 1;
      dot.userData.speed = 0.5 + (v.userData.k % 3) * 0.12;
      group.add(dot);
      flows.push(dot);
    }

    /* ---------- 拆解 / 动画 ---------- */
    let explodeT = 0;

    return {
      group,
      legend: [
        { text: 'GPU 晶片', desc: '显卡的大脑，上百个流处理器簇都刻在这块硅片上' },
        { text: 'SM 流处理器阵列', desc: '画面里每束光、每个像素，都是这些 SM 簇算出来的' },
        { text: '显存颗粒', desc: '把贴图和模型放在 GPU 手边，带宽比内存大得多' },
        { text: '供电电感与 MOSFET', desc: '把主板的 12V 压成 GPU 要的低压大电流' },
        { text: '热管 / 鳍片 / 双风扇', desc: '热管把晶片的热搬进鳍片阵，两个风扇再把热吹出去' },
      ],

      setExplode(t) {
        explodeT = t;
        const e = kit.easeInOut(t);

        // 散热器最先让开（罩住的东西最多），抬得也最高
        const ec = kit.easeInOut(kit.clamp01(t / 0.40));
        cooler.position.set(0, 0.80 * ec, -0.10 * ec);
        cooler.rotation.set(-0.10 * ec, 0, 0.06 * ec);

        // 晶片随后抬起
        const ed = kit.clamp01(t / 0.50);
        dieGroup.position.y = 0.16 * ed;

        // 显存最后向外散开
        const ev = kit.clamp01((t - 0.30) / 0.70);
        for (const v of vrams) {
          const b = v.userData.base;
          const o = v.userData.off;
          v.position.set(b.x + o.x * ev, b.y + o.y * ev, b.z + o.z * ev);
          v.userData.win.position.set(b.x + o.x * ev, b.y + VRAM.h / 2 + 0.002 + o.y * ev, b.z + o.z * ev);
        }

        // 背板下沉
        backplate.position.y = -0.036 - 0.03 * e;
      },

      update(elapsed, dt, emphasis = 0) {
        // SM 波前：斜向扫过整片阵列
        const phase = (elapsed * 0.32) % 1;
        for (const sm of sms) {
          const d = Math.abs(((phase - sm.userData.wave + 0.5) % 1) - 0.5);
          const spike = Math.max(0, 1 - d * 6);
          sm.userData.mat.emissiveIntensity = 0.04 + spike * (0.85 + emphasis * 0.5);
        }

        // 显存依次点亮
        for (const v of vrams) {
          const ph = (elapsed * 0.55 + v.userData.k * 0.083) % 1;
          v.userData.mat.emissiveIntensity = 0.04 + Math.exp(-ph * 9) * (0.7 + emphasis * 0.5);
        }

        // 数据流
        for (const f of flows) {
          f.userData.t = (f.userData.t + dt * f.userData.speed * (0.5 + emphasis * 1.1)) % 1;
          const u = f.userData.rev ? 1 - f.userData.t : f.userData.t;
          f.position.copy(kit.pointOn(f.userData.trace, u));
          f.visible = explodeT < 0.6 && Math.min(f.userData.t, 1 - f.userData.t) > 0.06;
        }

        // 风扇：角度由 elapsed 直接算出，不做累加
        const rpm = 2.6 + emphasis * 2.2;
        for (const r of rotors) r.rotation.y = elapsed * rpm;
      },
    };
  },
};
