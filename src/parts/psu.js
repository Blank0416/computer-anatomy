/* ============================================================
   psu.js — 电脑八大件 · 电源（ATX 3.1 / 全模组 / 12V-2x6）
   ------------------------------------------------------------
   精修目标（对照"粗糙"的三个来源）：
     ① 表面：钢板拉丝+压筋、蜂窝出风网、模组面板丝印、铭牌
     ② 细零件：135mm 11 叶风扇、EMI 滤波、桥堆、PFC 电感、
        2 颗大电解、主变压器、同步整流散热片、12 颗固态电容、
        16 个模组接口（24pin/12V-2x6/EPS×2/PCIe×4/SATA×6/Molex×2）、
        螺丝/铜柱/线束/热缩套管
     ③ 倒角：外壳、风扇框、模组接口、散热片全部走 detail.parts.cbox
   拆解：上盖+风扇抬起 → 两侧板外张 → 后面板/模组面板让位 →
         内部按 AC→DC 顺序（EMI→整流→PFC→电解→变压器→整流→输出）
         依次升高并轻微前移
   动画：AC→DC 能量流沿主回路跑 + 电容呼吸 + 风扇转速
   ============================================================ */

export default {
  id: 'psu',
  name: '电源',
  en: 'PSU',
  hue: 0x8ea3b0,

  focus: { from: [1.43, 1.30, 1.65], look: [0, 0.02, 0], fov: 34 },

  build(kit) {
    const { THREE } = kit;
    const D = kit.detail;
    const group = new THREE.Group();
    // 所有零件都挂在 content 下，最后按包围盒把 content 摆正到原点
    const content = new THREE.Group();
    group.add(content);

    /* ---------- 机身尺寸（1 单位 ≈ 116mm 实机） ----------
       X = 进深（-X 后面板 AC 进线，+X 全模组输出）
       Y = 高度，Z = 宽度（150mm 那一面）                    */
    const HX = 0.60;        // 半进深
    const HY = 0.3535;      // 半高（86mm）
    const HZ = 0.611;       // 半宽（150mm）
    const T = 0.020;        // 钢板厚
    const Y_PCB = -0.288;   // 主 PCB 高度
    const Y_TOP = Y_PCB + 0.009;   // PCB 上表面

    /* ---------- 材质包 ---------- */
    const perfFan = D.tex.perf({ size: 128, step: 12, hole: 0.40, repeat: 2 });
    const perfHex = D.tex.perf({ size: 128, step: 10, hole: 0.37, repeat: 3 });
    const meshFan = kit.mat('metalDark', { color: 0x323840, roughness: 0.48, metalness: 0.55 });
    if (perfFan) { meshFan.transparent = true; meshFan.alphaTest = 0.42; meshFan.side = THREE.DoubleSide; meshFan.alphaMap = perfFan; }
    const meshHex = kit.mat('metalDark', { color: 0x2c3239, roughness: 0.52, metalness: 0.52 });
    if (perfHex) { meshHex.transparent = true; meshHex.alphaTest = 0.42; meshHex.side = THREE.DoubleSide; meshHex.alphaMap = perfHex; }

    const M = {
      steel: D.mat.brushed(0x5b636c, { rough: 0.38, metal: 0.72, repeat: 2.4 }),
      steelDark: D.mat.brushed(0x434a52, { rough: 0.50, metal: 0.62, repeat: 2 }),
      inner: D.mat.brushed(0x858d96, { rough: 0.42, metal: 0.68, repeat: 2 }),
      alu: D.mat.brushed(0xa8aeb5, { rough: 0.32, metal: 0.78, repeat: 3 }),
      pcb: D.mat.pcb('#15302b'),
      pcbDark: D.mat.pcb('#1b2f33'),
      copper: kit.mat('copper', { roughness: 0.28, metalness: 0.85 }),
      enamel: kit.mat('copper', { color: 0xa4603c, roughness: 0.40, metalness: 0.60 }),
      gold: kit.mats.gold,
      ceramic: kit.mats.ceramic,
      black: D.mat.grain(0x191d21, { rough: 0.82, bump: 0.35 }),
      sleeve: D.mat.grain(0x252b33, { rough: 0.88 }),
      sleeveBlue: D.mat.grain(0x2b3a50, { rough: 0.86 }),
      conn: kit.mat('plasticDark', { color: 0x22262b, roughness: 0.60 }),
      capSkin: kit.mat('plasticDark', { color: 0x24384f, roughness: 0.54 }),
      ferrite: kit.mat('plasticDark', { color: 0x2a2d31, roughness: 0.72 }),
      rubber: kit.mats.rubber,
      tape: kit.mat('plastic', { color: 0xbfb184, roughness: 0.72, metalness: 0.02 }),
      label: kit.mat('metal', { color: 0xc6c9cd, roughness: 0.40, metalness: 0.52 }),
      fanFrame: kit.mat('plasticDark', { color: 0x2b3037, roughness: 0.70 }),
      blade: kit.mat('plasticMid', { color: 0x6b727a, roughness: 0.52 }),
      ledCold: kit.glow(0x9fd2e6, 1.0),
      ledWarm: kit.glow(0xe6a877, 1.0),
    };

    /* ---------- 小工具 ---------- */
    const put = (parent, mesh, x, y, z) => { mesh.position.set(x, y, z); parent.add(mesh); return mesh; };
    const screwAt = (parent, x, y, z, axis, r = 0.015, h = 0.007) => {
      const s = D.parts.screw(r, h, M.steel);
      s.position.set(x, y, z);
      if (axis === 'x') s.rotation.z = Math.PI / 2;
      else if (axis === 'z') s.rotation.x = Math.PI / 2;
      parent.add(s);
      return s;
    };
    const plateMat = (lines, o = {}) => {
      const tex = D.tex.plate(lines, {
        w: o.w ?? 256, h: o.h ?? 64,
        font: o.font ?? '600 30px "Microsoft YaHei", sans-serif',
        ink: o.ink ?? '#d3d7d9', bg: o.bg ?? null,
        align: o.align ?? 'center', barcode: !!o.barcode, seed: o.seed ?? 7,
      });
      return new THREE.MeshBasicMaterial({
        map: tex, transparent: true, opacity: o.opacity ?? 0.86,
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

    /* ---------- 拆解 rigs（可逆：位置 = 基准 + 偏移·进度） ---------- */
    const rigs = [];
    const rig = (obj, t0, t1, off) => {
      rigs.push({ obj, t0, t1, off: new THREE.Vector3(off[0], off[1], off[2]) });
      return obj;
    };

    /* ============================================================
       1. 底板 / 侧板 / 后面板 / 模组面板（钣金外壳）
       ============================================================ */
    const shellG = new THREE.Group();
    content.add(shellG);

    // 底板 + 加强筋
    put(shellG, D.parts.cbox(1.16, T, 1.18, M.steel, 0.004, 0.010), 0, -HY + T / 2, 0);
    for (let i = 0; i < 3; i++) {
      put(shellG, kit.box(1.05, 0.015, 0.028, M.steelDark), 0, -HY + T + 0.008, -0.36 + i * 0.36);
    }
    // 底板四角橡胶垫（藏在外壳内，不越过 min.y）
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      put(shellG, kit.cyl(0.045, 0.045, 0.012, 10, M.rubber), sx * 0.40, -HY + T + 0.006, sz * 0.44);
    }

    // 左右侧板（各自成组，拆解时外张）
    const sideRigs = [];
    for (const s of [-1, 1]) {
      const g = new THREE.Group();
      content.add(g);
      sideRigs.push({ g, z: s * 0.088 });
      put(g, D.parts.cbox(1.17, 0.690, T, M.steel, 0.004, 0.008), 0, 0, s * (HZ - T / 2));
      // 内侧压筋（增加钢板"有厚度"的观感）
      put(g, kit.box(0.98, 0.055, 0.013, M.steelDark), 0, 0.055, s * (HZ - T - 0.014));
      put(g, kit.box(0.86, 0.012, 0.010, M.steelDark), 0, -0.10, s * (HZ - T - 0.010));
      // 侧板螺丝
      for (const x of [-0.46, 0.46]) {
        screwAt(g, x, -0.265, s * (HZ - 0.002), 'z');
      }
      // 侧板上的 ATX 3.1 标识（丝印）
      labelPlane(g, ['ATX 3.1'], 0.20, 0.045, [0.30, 0.115, s * (HZ + 0.002)],
        { w: 256, h: 64, opacity: 0.55 });
    }

    // 后面板（-X）：AC 插座 + 开关 + 蜂窝出风网
    const backG = new THREE.Group();
    content.add(backG);
    put(backG, D.parts.cbox(T, 0.690, 1.19, M.steel, 0.004, 0.010), -HX + T / 2, 0, 0);

    // 蜂窝出风网（alphaMap 镂空，便宜且真像冲压网）
    const rearVent = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.48), meshHex);
    rearVent.rotation.y = -Math.PI / 2;
    rearVent.position.set(-HX - 0.001, -0.02, -0.27);
    backG.add(rearVent);

    // IEC C14 进线座
    const inlet = new THREE.Group();
    inlet.position.set(-HX - 0.001, 0.175, 0.335);
    backG.add(inlet);
    put(inlet, D.parts.cbox(0.018, 0.108, 0.098, M.black, 0.003, 0.010), -0.009, 0, 0);
    put(inlet, kit.box(0.016, 0.088, 0.078, M.black), 0.002, 0, 0);
    put(inlet, kit.box(0.010, 0.030, 0.007, M.gold), -0.005, 0.008, -0.016);
    put(inlet, kit.box(0.010, 0.030, 0.007, M.gold), -0.005, 0.008, 0.016);
    put(inlet, kit.box(0.010, 0.008, 0.030, M.gold), -0.005, -0.026, 0);
    labelPlane(inlet, ['AC IN'], 0.075, 0.024, [-0.001, 0.075, 0],
      { rot: [0, -Math.PI / 2, 0], w: 128, h: 48, opacity: 0.5 });

    // 电源开关（带红点）
    const sw = new THREE.Group();
    sw.position.set(-HX - 0.004, 0.175, 0.205);
    backG.add(sw);
    put(sw, kit.box(0.020, 0.062, 0.046, M.black), -0.002, 0, 0);
    const rocker = put(sw, kit.box(0.014, 0.040, 0.032, kit.mat('plastic', { color: 0x2b3036, roughness: 0.66 })), -0.012, 0.004, 0);
    rocker.rotation.z = 0.16;
    put(sw, kit.box(0.006, 0.007, 0.007, kit.tint(0xc0503f, { rough: 0.45 })), -0.019, 0.017, 0);

    // 铭牌（80 PLUS GOLD / 全模组 / ATX 3.1）
    labelPlane(backG,
      ['80 PLUS GOLD', 'FULLY MODULAR', 'ATX 3.1 · 12V-2x6'],
      0.26, 0.10, [-HX - 0.002, -0.155, 0.30],
      { rot: [0, -Math.PI / 2, 0], w: 384, h: 160, opacity: 0.80, ink: '#d9d3bf' });
    // 序列号小贴
    labelPlane(backG, ['SN 3A11-2026'], 0.13, 0.030, [-HX - 0.002, -0.235, 0.30],
      { rot: [0, -Math.PI / 2, 0], w: 192, h: 48, opacity: 0.6, barcode: true });
    // 四角螺丝
    for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      screwAt(backG, -HX - 0.006, sy * 0.305, sz * 0.545, 'x', 0.016, 0.008);
    }

    // 模组输出面板（+X）
    const modG = new THREE.Group();
    content.add(modG);
    put(modG, D.parts.cbox(T, 0.690, 1.19, M.steelDark, 0.004, 0.010), HX - T / 2, 0, 0);
    // 面板内侧铜排（拆开上盖能看见）
    for (let i = 0; i < 4; i++) {
      put(modG, kit.box(0.052, 0.010, 0.24, M.copper), HX - T - 0.030 - i * 0.008, 0.10 - i * 0.07, -0.26 + i * 0.10);
    }
    // 四角螺丝
    for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      screwAt(modG, HX + 0.004, sy * 0.305, sz * 0.545, 'x', 0.016, 0.008);
    }

    /* ---------------- 模组接口工厂 ----------------
       开口朝 +X；引脚用 InstancedMesh 批量生成（成排零件不逐个建 mesh） */
    const connectors = [];
    const mkConn = (o) => {
      const { y, z, cols, rows = 2, pitch = 0.036, hero = false, slim = false } = o;
      const g = new THREE.Group();
      g.position.set(0, y, z);
      modG.add(g);
      const w = cols * pitch + 0.026;
      const h = rows * pitch + (slim ? 0.024 : 0.040);
      const depth = slim ? 0.026 : 0.034;
      const body = hero
        ? D.parts.cbox(depth, h, w, M.conn, 0.003, 0.006)
        : kit.box(depth, h, w, M.conn);
      body.position.x = HX + depth / 2 - 0.004;
      g.add(body);
      // 深色 Wafer 面
      put(g, kit.box(0.005, h - 0.010, w - 0.010, M.black), HX + depth - 0.005, 0, 0);
      // 引脚（沿 X 方向伸出，4.45mm ≈ 0.038）
      const pinD = 0.038;
      for (let r = 0; r < rows; r++) {
        const row = D.parts.pinRow(cols, pitch, { w: 0.011, h: 0.009, d: pinD }, M.gold);
        row.rotation.y = Math.PI / 2;
        row.position.set(HX + depth + pinD * 0.30, (r - (rows - 1) / 2) * pitch, 0);
        g.add(row);
      }
      connectors.push(g);
      return g;
    };

    // 第一排：24pin 主供电 + 12V-2x6（16pin）
    mkConn({ y: 0.222, z: -0.345, cols: 12, rows: 2, pitch: 0.036, hero: true });   // 24PIN
    const c16 = mkConn({ y: 0.222, z: 0.300, cols: 6, rows: 2, pitch: 0.036, hero: true }); // 12V-2x6
    // 12V-2x6 的 4 根 sideband 小针
    for (let r = 0; r < 2; r++) {
      const row = D.parts.pinRow(2, 0.020, { w: 0.008, h: 0.007, d: 0.030 }, M.gold);
      row.rotation.y = Math.PI / 2;
      row.position.set(HX + 0.040, -0.052 + r * 0.017, 0);
      c16.add(row);
    }

    // 第二排：EPS 8pin ×2 + PCIe 8pin ×2
    mkConn({ y: 0.072, z: -0.402, cols: 4, rows: 2 });
    mkConn({ y: 0.072, z: -0.204, cols: 4, rows: 2 });
    mkConn({ y: 0.072, z: 0.020, cols: 4, rows: 2 });
    mkConn({ y: 0.072, z: 0.218, cols: 4, rows: 2 });
    // 第三排：PCIe 8pin ×2 + SATA
    mkConn({ y: -0.078, z: -0.300, cols: 4, rows: 2 });
    mkConn({ y: -0.078, z: -0.102, cols: 4, rows: 2 });
    mkConn({ y: -0.078, z: 0.140, cols: 6, rows: 1, pitch: 0.015, slim: true });
    mkConn({ y: -0.078, z: 0.300, cols: 6, rows: 1, pitch: 0.015, slim: true });
    // 第四排：SATA ×2 + Molex ×2 + SATA ×2
    mkConn({ y: -0.232, z: -0.455, cols: 6, rows: 1, pitch: 0.015, slim: true });
    mkConn({ y: -0.232, z: -0.295, cols: 6, rows: 1, pitch: 0.015, slim: true });
    mkConn({ y: -0.232, z: -0.105, cols: 4, rows: 1, pitch: 0.028, slim: true });  // Molex
    mkConn({ y: -0.232, z: 0.130, cols: 6, rows: 1, pitch: 0.015, slim: true });
    mkConn({ y: -0.232, z: 0.290, cols: 6, rows: 1, pitch: 0.015, slim: true });
    mkConn({ y: -0.232, z: 0.450, cols: 4, rows: 1, pitch: 0.028, slim: true });   // Molex

    // 模组面板丝印
    const ml = (txt, y, z, w = 0.13) => labelPlane(modG, [txt], w, 0.032, [HX + 0.002, y, z],
      { rot: [0, Math.PI / 2, 0], w: 256, h: 56, opacity: 0.60 });
    ml('24PIN', 0.300, -0.345, 0.15);
    ml('12V-2x6', 0.300, 0.300, 0.18);
    ml('EPS', 0.148, -0.402, 0.075);
    ml('EPS', 0.148, -0.204, 0.075);
    ml('PCIe', 0.148, 0.020, 0.080);
    ml('PCIe', 0.148, 0.218, 0.080);
    ml('SATA', -0.318, 0.200, 0.075);
    ml('MOLEX', -0.318, -0.105, 0.100);
    ml('FULLY MODULAR', -0.168, 0.020, 0.24);

    /* ============================================================
       2. 上盖 + 135mm 风扇
       ============================================================ */
    const topG = new THREE.Group();
    content.add(topG);

    // 外框四边
    const rail = (w, d, x, z) => {
      put(topG, D.parts.cbox(w, 0.020, d, M.steel, 0.004, 0.008), x, HY - 0.010, z);
    };
    rail(1.16, 0.050, 0, 0.586);
    rail(1.16, 0.050, 0, -0.586);
    rail(0.050, 1.162, 0.585, 0);
    rail(0.050, 1.162, -0.585, 0);
    // 四角加强角块
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      put(topG, kit.box(0.10, 0.018, 0.10, M.steelDark), sx * 0.545, HY - 0.026, sz * 0.545);
    }
    // 风扇圆环 + 连接桥
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.500, 0.030, 6, 44), M.steelDark);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = HY - 0.032;
    topG.add(ring);
    for (const s of [-1, 1]) {
      put(topG, D.parts.cbox(0.13, 0.016, 0.048, M.steelDark, 0.003, 0.006), 0, HY - 0.012, s * 0.545);
      put(topG, D.parts.cbox(0.048, 0.016, 0.13, M.steelDark, 0.003, 0.006), s * 0.545, HY - 0.012, 0);
    }
    // 冲压蜂窝网（alphaMap）
    const grille = new THREE.Mesh(new THREE.CircleGeometry(0.492, 44), meshFan);
    grille.rotation.x = -Math.PI / 2;
    grille.position.y = HY + 0.001;
    topG.add(grille);
    // 上盖四颗螺丝（与盖面齐平，避免顶出 Y 包围盒）
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      screwAt(topG, sx * 0.545, HY - 0.004, sz * 0.545, 'y', 0.016, 0.008);
    }
    // 上盖小铭牌
    labelPlane(topG, ['135mm FAN · ATX 3.1'], 0.26, 0.034, [-0.30, HY + 0.003, 0.583],
      { rot: [-Math.PI / 2, 0, 0], w: 384, h: 56, opacity: 0.55 });

    // 风扇（135mm ≈ 0.47 半径；11 叶，转子单独转）
    const fanAsm = D.parts.fan({
      r: 0.470, blades: 11, hubR: 0.088, thick: 0.046,
      frameMat: M.fanFrame, bladeMat: M.blade,
    });
    fanAsm.group.position.y = HY - 0.075;
    topG.add(fanAsm.group);
    // 风扇线束
    const fanWire = kit.trace([
      [0.06, HY - 0.085, 0.30], [0.16, HY - 0.10, 0.40], [0.24, HY - 0.14, 0.46], [0.26, Y_TOP + 0.02, 0.42],
    ], 0.007, M.sleeve, 20);
    topG.add(fanWire);

    /* ============================================================
       3. 主 PCB 与内部元件（按 AC→DC 顺序分组成 rig）
       ============================================================ */
    const pcbG = new THREE.Group();
    content.add(pcbG);

    // 主 PCB
    put(pcbG, D.parts.cbox(1.06, 0.018, 1.12, M.pcb, 0.003, 0.005), 0.02, Y_PCB, 0);
    // 四角铜柱 + 固定螺丝
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      put(pcbG, kit.cyl(0.026, 0.026, 0.042, 10, M.copper), 0.46 * sx, -0.312, 0.48 * sz);
      screwAt(pcbG, 0.46 * sx, Y_PCB + 0.014, 0.48 * sz, 'y', 0.013, 0.006);
    }
    // 贴片元件阵列（一片铺开，便宜）
    const smd = D.parts.smdField(210, { w: 0.014, h: 0.009, d: 0.009 }, M.ceramic);
    pcbG.add(smd);
    smd.userData.fill(-0.52, 0.50, -0.54, 0.54, Y_TOP + 0.004, 0x71b);

    // 3.1 EMI 滤波（最靠近 AC 进线）
    const emiG = new THREE.Group();
    pcbG.add(emiG);
    rig(emiG, 0.35, 1.0, [-0.030, 0.090, 0]);
    put(emiG, D.parts.cbox(0.14, 0.100, 0.34, M.steelDark, 0.004, 0.008), -0.470, -0.225, 0.02);
    for (const z of [-0.10, 0.12]) {
      const choke = new THREE.Mesh(new THREE.TorusGeometry(0.046, 0.020, 6, 16), M.enamel);
      choke.rotation.x = Math.PI / 2;
      choke.position.set(-0.470, Y_TOP + 0.020, z);
      emiG.add(choke);
      put(emiG, kit.cyl(0.020, 0.020, 0.026, 10, M.ferrite), -0.470, Y_TOP + 0.006, z);
    }
    // X 电容 / Y 电容 / 保险丝 / MOV
    for (const z of [-0.055, 0.065]) {
      put(emiG, kit.box(0.032, 0.030, 0.014, M.ceramic), -0.512, Y_TOP + 0.015, z);
    }
    put(emiG, kit.cyl(0.012, 0.012, 0.052, 8, M.ceramic), -0.512, Y_TOP + 0.026, -0.16).rotation.z = Math.PI / 2;
    put(emiG, kit.cyl(0.012, 0.012, 0.030, 8, M.label), -0.520, Y_TOP + 0.026, 0.18);
    put(emiG, kit.cyl(0.020, 0.020, 0.010, 10, M.ceramic), -0.500, Y_TOP + 0.005, 0.19);

    // 3.2 整流桥 + 独立小散热片
    const rectG = new THREE.Group();
    pcbG.add(rectG);
    rig(rectG, 0.35, 1.0, [-0.010, 0.115, 0]);
    put(rectG, D.parts.cbox(0.085, 0.050, 0.095, M.black, 0.003, 0.005), -0.360, Y_TOP + 0.025, -0.165);
    for (const dz of [-0.02, 0.02]) {
      put(rectG, kit.box(0.075, 0.006, 0.006, M.gold), -0.360, Y_TOP + 0.003, -0.165 + dz);
    }
    const rectFin = D.parts.finStack({ count: 14, spanX: 0.17, y: 0, h: 0.150, zLen: 0.170, thick: 0.006 }, M.alu);
    rectFin.position.set(-0.360, Y_TOP + 0.095, -0.165);
    rectG.add(rectFin);
    put(rectG, D.parts.cbox(0.175, 0.020, 0.175, M.alu, 0.003, 0.005), -0.360, Y_TOP + 0.020, -0.165);

    // 3.3 PFC 电感 + 升压管散热片
    const pfcG = new THREE.Group();
    pcbG.add(pfcG);
    rig(pfcG, 0.40, 1.0, [0.010, 0.140, 0]);
    put(pfcG, D.parts.cbox(0.165, 0.030, 0.165, M.ceramic, 0.003, 0.006), -0.220, Y_TOP + 0.015, 0.170);
    const pfcCoil = new THREE.Mesh(new THREE.TorusGeometry(0.072, 0.028, 8, 22), M.enamel);
    pfcCoil.rotation.x = Math.PI / 2;
    pfcCoil.position.set(-0.220, Y_TOP + 0.060, 0.170);
    pfcG.add(pfcCoil);
    put(pfcG, kit.cyl(0.050, 0.050, 0.040, 12, M.ferrite), -0.220, Y_TOP + 0.040, 0.170);
    const pfcFin = D.parts.finStack({ count: 16, spanX: 0.19, y: 0, h: 0.150, zLen: 0.180, thick: 0.006 }, M.alu);
    pfcFin.position.set(-0.220, Y_TOP + 0.090, -0.140);
    pfcG.add(pfcFin);
    put(pfcG, D.parts.cbox(0.195, 0.020, 0.185, M.alu, 0.003, 0.005), -0.220, Y_TOP + 0.012, -0.140);

    // 3.4 两颗大电解电容（主动 PFC 的储能罐）
    const bulkG = new THREE.Group();
    pcbG.add(bulkG);
    rig(bulkG, 0.40, 1.0, [0.020, 0.165, 0]);
    for (const z of [-0.175, 0.175]) {
      const g = new THREE.Group();
      g.position.set(-0.045, Y_TOP, z);
      bulkG.add(g);
      // 套管（略大的圆柱）+ 底部橡胶座 + 顶部铝盖
      put(g, kit.cyl(0.088, 0.088, 0.250, 16, M.capSkin), 0, 0.128, 0);
      put(g, kit.cyl(0.090, 0.090, 0.020, 16, M.rubber), 0, 0.010, 0);
      put(g, kit.cyl(0.082, 0.082, 0.022, 16, M.alu), 0, 0.262, 0);
      // 顶部十字防爆纹
      put(g, kit.box(0.086, 0.004, 0.008, M.steelDark), 0, 0.274, 0);
      put(g, kit.box(0.008, 0.004, 0.086, M.steelDark), 0, 0.274, 0);
      // 侧面白色标识条 + 丝印
      put(g, kit.box(0.010, 0.170, 0.004, M.label), 0.074, 0.130, 0.048).rotation.y = 0.55;
      labelPlane(g, ['PFC 470µF', '105°C'], 0.10, 0.05, [0, 0.150, 0.090],
        { rot: [0, 0, 0], w: 192, h: 64, opacity: 0.5 });
      // 底部引脚
      for (const dz of [-0.03, 0.03]) {
        put(g, kit.box(0.008, 0.026, 0.008, M.gold), -0.028, -0.006, dz);
      }
    }

    // 3.5 主变压器 + 铜带屏蔽
    const xfmrG = new THREE.Group();
    pcbG.add(xfmrG);
    rig(xfmrG, 0.45, 1.0, [0.030, 0.190, 0]);
    put(xfmrG, D.parts.cbox(0.175, 0.190, 0.195, M.ferrite, 0.004, 0.010), 0.100, Y_TOP + 0.095, 0);
    put(xfmrG, kit.box(0.150, 0.115, 0.205, M.enamel), 0.100, Y_TOP + 0.090, 0);
    for (let i = 0; i < 3; i++) {
      put(xfmrG, kit.box(0.156, 0.008, 0.208, M.copper), 0.100, Y_TOP + 0.055 + i * 0.032, 0);
    }
    put(xfmrG, kit.box(0.180, 0.028, 0.200, M.tape), 0.100, Y_TOP + 0.168, 0);
    put(xfmrG, kit.box(0.058, 0.045, 0.195, M.copper), 0.100, Y_TOP + 0.090, 0.0);
    labelPlane(xfmrG, ['MAIN XFMR'], 0.11, 0.030, [0.100, Y_TOP + 0.186, 0.060],
      { rot: [-Math.PI / 2, 0, 0], w: 192, h: 48, opacity: 0.5 });
    for (const dz of [-0.055, -0.020, 0.020, 0.055]) {
      put(xfmrG, kit.box(0.006, 0.022, 0.006, M.gold), 0.060, Y_TOP + 0.003, dz);
    }

    // 3.6 同步整流：散热片 + MOSFET + 输出电感 + 固态电容
    const secG = new THREE.Group();
    pcbG.add(secG);
    rig(secG, 0.50, 1.0, [0.040, 0.150, 0]);
    const secFin = D.parts.finStack({ count: 20, spanX: 0.22, y: 0, h: 0.150, zLen: 0.200, thick: 0.005 }, M.alu);
    secFin.position.set(0.255, Y_TOP + 0.085, -0.215);
    secG.add(secFin);
    put(secG, D.parts.cbox(0.225, 0.018, 0.205, M.alu, 0.003, 0.005), 0.255, Y_TOP + 0.012, -0.215);
    for (let i = 0; i < 4; i++) {
      put(secG, kit.box(0.030, 0.012, 0.026, M.black), 0.255, Y_TOP + 0.020, -0.150 + i * 0.055);
    }
    for (let i = 0; i < 4; i++) {
      const ind = D.parts.inductor(0.052, 0.042, 0.052);
      ind.position.set(0.290 + (i % 2) * 0.070, Y_TOP + 0.021, -0.020 + Math.floor(i / 2) * 0.070);
      secG.add(ind);
    }
    for (let i = 0; i < 5; i++) {
      const cap = D.parts.capacitor(0.030, 0.085, 0x2c3b4d);
      cap.position.set(0.370 + (i % 3) * 0.045, Y_TOP + 0.043, 0.130 + Math.floor(i / 3) * 0.055);
      secG.add(cap);
    }
    // 铜排（把大电流送到模组板）
    for (let i = 0; i < 3; i++) {
      put(secG, kit.box(0.155, 0.010, 0.040, M.copper), 0.425, Y_TOP + 0.030 + i * 0.015, -0.030 + i * 0.040);
    }

    // 3.7 输出端：固态电容组 + 磁珠 + 母板连接
    const outG = new THREE.Group();
    pcbG.add(outG);
    rig(outG, 0.55, 1.0, [0.050, 0.120, 0]);
    for (let i = 0; i < 6; i++) {
      const cap = D.parts.capacitor(0.028, 0.070, 0x33405a);
      cap.position.set(0.470, Y_TOP + 0.036, -0.330 + i * 0.130);
      outG.add(cap);
    }
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(new THREE.TorusGeometry(0.030, 0.012, 6, 14), M.enamel);
      m.rotation.x = Math.PI / 2;
      m.position.set(0.445, Y_TOP + 0.030, -0.130 + i * 0.085);
      outG.add(m);
    }
    // 垂直模组母板
    put(pcbG, D.parts.cbox(0.020, 0.620, 1.120, M.pcbDark, 0.003, 0.005), 0.545, -0.020, 0);
    for (let i = 0; i < 5; i++) {
      put(outG, kit.box(0.070, 0.010, 0.055, M.copper), 0.490, Y_TOP + 0.024 + i * 0.012, -0.360 + i * 0.170);
    }
    // 模组母板上的电感/电容（从开口能看到）
    for (let i = 0; i < 6; i++) {
      const cap = D.parts.capacitor(0.026, 0.060, 0x2b3a4e);
      cap.position.set(0.525, -0.240 + i * 0.085, 0.410);
      outG.add(cap);
    }
    // 输出状态灯（呼吸）
    const ledMatA = M.ledCold.clone();
    const ledMatB = M.ledWarm.clone();
    put(pcbG, kit.box(0.012, 0.010, 0.008, ledMatA), 0.505, -0.130, -0.300);
    put(pcbG, kit.box(0.012, 0.010, 0.008, ledMatB), 0.505, -0.130, -0.270);
    put(pcbG, kit.cyl(0.014, 0.014, 0.012, 8, M.conn), 0.505, -0.145, -0.285);

    // 内部线束：PCB ↔ 模组母板
    const harness = [
      [[0.30, Y_TOP + 0.02, 0.300], [0.42, -0.130, 0.360], [0.510, -0.090, 0.360]],
      [[0.18, Y_TOP + 0.02, 0.420], [0.36, -0.180, 0.440], [0.505, -0.220, 0.430]],
      [[0.16, Y_TOP + 0.02, -0.470], [0.40, -0.150, -0.480], [0.505, -0.120, -0.450]],
    ];
    for (const pts of harness) pcbG.add(kit.trace(pts, 0.009, M.sleeveBlue, 22));

    /* ============================================================
       4. 模组线束（从接口往外走一小段就出画面，不越出机箱）
       ============================================================ */
    const cables = new THREE.Group();
    content.add(cables);
    const cableRun = (pts, r) => cables.add(kit.trace(pts, r, M.sleeve, 22));
    cableRun([[0.655, 0.222, -0.345], [0.678, 0.205, -0.300], [0.690, 0.100, -0.240], [0.660, -0.020, -0.180]], 0.024);
    for (const dy of [-0.020, 0, 0.020]) {
      cableRun([[0.655, 0.222 + dy, 0.300], [0.678, 0.190 + dy, 0.300], [0.688, 0.060 + dy, 0.270], [0.660, -0.080 + dy, 0.220]], 0.011);
    }
    cableRun([[0.655, 0.072, -0.402], [0.676, 0.030, -0.430], [0.672, -0.090, -0.430], [0.646, -0.190, -0.400]], 0.019);
    cableRun([[0.655, 0.072, 0.218], [0.674, 0.020, 0.250], [0.670, -0.110, 0.250], [0.646, -0.200, 0.220]], 0.019);
    // 理线魔术贴
    for (const z of [-0.215, 0.235]) {
      put(cables, kit.box(0.035, 0.020, 0.052, M.sleeveBlue), 0.686, 0.095, z);
    }

    /* ============================================================
       5. 能量流（AC → EMI → 整流 → PFC → 电解 → 变压器 → 整流 → 输出）
       ============================================================ */
    const lanePts = [
      [-0.600, 0.175, 0.335], [-0.540, 0.090, 0.260], [-0.480, -0.150, 0.120],
      [-0.400, -0.230, 0.020], [-0.300, -0.230, -0.060], [-0.200, -0.220, 0.060],
      [-0.070, -0.190, 0.140], [0.040, -0.170, 0.030], [0.130, -0.170, -0.030],
      [0.250, -0.190, -0.120], [0.360, -0.220, 0.000], [0.470, -0.190, 0.020],
      [0.545, -0.070, 0.000],
    ];
    const lane = kit.trace(lanePts, 0.0055, kit.mat('gold', {
      transparent: true, opacity: 0.24, roughness: 0.35, metalness: 0.4,
    }), 64);
    content.add(lane);

    const flows = [];
    const dotMats = [];
    for (let i = 0; i < 12; i++) {
      const mat = kit.glow(i % 3 === 0 ? 0xe8a86b : 0x9fd2e6, 1.0).clone();
      dotMats.push(mat);
      const d = kit.dot(0, 0, 0, mat, 0.016);
      d.userData.phase = i / 12;
      d.userData.k = i;
      content.add(d);
      flows.push(d);
    }

    /* ---------- 整体居中：让电源原点落在包围盒中心 ---------- */
    const bb = new THREE.Box3().setFromObject(content);
    const c = bb.getCenter(new THREE.Vector3());
    content.position.set(-c.x, -c.y, -c.z);

    /* ============================================================
       拆解 / 动画
       ============================================================ */
    let explodeT = 0;
    const rotors = [fanAsm.rotor];

    return {
      group,
      legend: [
        { text: 'EMI 滤波', desc: '交流电一进来先过电感与电容，把电网里的杂波挡在机器外面' },
        { text: '整流 + 主动 PFC', desc: '交流整成直流，再升压并校正功率因数，让电流波形跟电压同相' },
        { text: '大电解电容', desc: '两只储能罐把整流后的直流抹平，是"电"的蓄水池' },
        { text: '12V-2x6 接口', desc: '16 针新标准，12 根供电针长 4.45mm，比老 12VHPWR 插得更稳' },
        { text: '全模组输出', desc: '24pin / EPS / PCIe / SATA / Molex 按需插，多余的线不用塞进机箱' },
      ],

      setExplode(t) {
        explodeT = t;
        // 上盖先抬（罩住的东西最多）
        const et = kit.easeInOut(kit.clamp01(t / 0.45));
        topG.position.set(0, 0.24 * et, 0);
        // 两侧板外张
        const es = kit.easeInOut(kit.clamp01((t - 0.05) / 0.50));
        for (const s of sideRigs) s.g.position.z = s.z * es;
        // 后面板 / 模组面板让位
        const eb = kit.easeInOut(kit.clamp01((t - 0.10) / 0.50));
        backG.position.x = -0.12 * eb;
        modG.position.x = 0.14 * eb;
        // 内部级联：各自窗口，位置 = 基准 + 偏移·进度（纯函数，可逆）
        for (const r of rigs) {
          const p = kit.easeInOut(kit.clamp01((t - r.t0) / (r.t1 - r.t0)));
          r.obj.position.set(r.off.x * p, r.off.y * p, r.off.z * p);
        }
      },

      update(elapsed, dt, emphasis = 0) {
        const tt = Number.isFinite(elapsed) ? elapsed : 0;
        const em = Number.isFinite(emphasis) ? emphasis : 0;
        // 能量流：位置由 elapsed 直接算出（不累加，不会漂）
        const speed = 0.20 * (0.8 + em * 1.2);
        for (const d of flows) {
          const u = (tt * speed + d.userData.phase) % 1;
          const p = lane.userData.curve.getPointAt(u);
          d.position.set(p.x, p.y, p.z);
          d.material.emissiveIntensity = 0.75 + 0.55 * Math.sin((u + tt * 0.3) * Math.PI * 2);
          d.visible = explodeT < 0.55;
        }
        // 风扇
        for (const r of rotors) r.rotation.y = tt * (2.4 + em * 2.6);
        // 输出指示灯呼吸
        ledMatA.emissiveIntensity = 0.55 + 0.45 * Math.sin(tt * 1.6);
        ledMatB.emissiveIntensity = 0.45 + 0.40 * Math.sin(tt * 1.6 + 1.9);
        // 大电解顶部微光（表示"带电"）
        if (dotMats.length) dotMats[0].emissiveIntensity = 1.0;
      },
    };
  },
};
