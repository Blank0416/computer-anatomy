/* ============================================================
   storage.js — 固态硬盘（M.2 2280、PCIe 5.0 x4、单面 4 颗 NAND）
   尺寸按真实毫米建模再统一换算：22 × 80mm 的板、0.8mm 板厚，
   卡边缘 75 个触点位置里 M-key 让出 8 个 → 67 pin，螺丝端一个半圆缺口。

   拆解（DETAIL-SPEC §5.2 的四层）：散热马甲（含 2 颗 M2 螺丝）先整个抬起 →
   导热垫贴出 → 主控 / 缓存 / 4 颗 NAND 各自浮起。PCB 与金手指留在原位当基准面。
   动画：4 颗 NAND 内部共 16 个 die 做阶梯写入（一颗一颗往下写），
         金手指 → 主控 → NAND 之间跑数据流光点。
   ============================================================ */

/**
 * M.2 2280 的板形轮廓（XY 平面、逆时针）：
 *   · 螺丝端（+X 端）一个半圆缺口（固定螺丝位）
 *   · 连接器端（-X 端）一个 M-key 矩形豁口
 *   · 四角圆角
 * 由 ExtrudeGeometry 沿 Z 挤出后转成"板面在 XZ、厚度沿 Y"。
 */
function m2Shape(THREE, L, W, rr, zn, nr, keyZ1, keyZ2, keyD) {
  const s = new THREE.Shape();
  const hw = W / 2;
  const lx = -L / 2;
  const rx = L / 2;

  s.moveTo(lx + rr, -hw);
  s.lineTo(rx - rr, -hw);                                          // 下边
  s.absarc(rx - rr, -hw + rr, rr, -Math.PI / 2, 0, false);         // 右下角
  s.lineTo(rx, zn - nr);                                           // 尾边下段
  s.absarc(rx, zn, nr, -Math.PI / 2, Math.PI / 2, true);           // 半圆缺口（向板内凹）
  s.lineTo(rx, hw - rr);                                           // 尾边上段
  s.absarc(rx - rr, hw - rr, rr, 0, Math.PI / 2, false);           // 右上角
  s.lineTo(lx + rr, hw);                                           // 上边
  s.absarc(lx + rr, hw - rr, rr, Math.PI / 2, Math.PI, false);     // 左上角
  s.lineTo(lx, keyZ2);                                             // 连接器边上段
  s.lineTo(lx + keyD, keyZ2);                                      // M-key 豁口
  s.lineTo(lx + keyD, keyZ1);
  s.lineTo(lx, keyZ1);
  s.lineTo(lx, -hw + rr);                                          // 连接器边下段
  s.absarc(lx + rr, -hw + rr, rr, Math.PI, Math.PI * 1.5, false);  // 左下角
  return s;
}

export default {
  id: 'storage',
  name: '硬盘',
  en: 'Storage',
  hue: 0xa79bb8,

  // 机位相对本元件原点：长条板躺平，从右前上方约 34° 俯视，
  // 既看得见散热马甲顶面的长槽，也看得见前端的金手指和尾端的螺丝缺口。
  focus: { from: [0.86, 1.26, 1.38], look: [0.02, 0.03, 0], fov: 33 },

  build(kit) {
    const { THREE } = kit;
    const D = kit.detail;
    const group = new THREE.Group();
    const hue = 0xa79bb8;

    /* ---------- 比例 ---------- */
    const K = 0.018125;              // 1 场景单位 ≈ 55.2mm（DETAIL-SPEC §0.2）
    const L = 80 * K;                // 1.45 = 板长 80mm
    const W = 22 * K;                // 0.39875 = 板宽 22mm
    const PCB_T = 0.024;             // 板厚（真实 0.8mm，为可读性放大 ~1.65×，见 §0.3）
    const yFace = PCB_T / 2;         // +0.012 元件面
    const hw = W / 2;

    /* ---------- 材质（全部走 kit / D，不新造 MeshStandardMaterial） ---------- */
    const M = {
      pcb: D.mat.pcb('#101014'),
      gold: kit.mat('gold', { color: 0xc9a227, roughness: 0.24, metalness: 1.0 }),
      ctrl: kit.mat('plasticDark', { color: 0x141519, roughness: 0.38, metalness: 0.20 }),
      nand: kit.mat('plasticDark', { color: 0x1b1c20, roughness: 0.50, metalness: 0.12 }),
      dram: kit.mat('plasticDark', { color: 0x1a1b1f, roughness: 0.45, metalness: 0.12 }),
      hs: D.mat.brushed(0x2c2f34, { rough: 0.38, metal: 0.65, repeat: 3.0 }),
      hsDark: kit.mat('metalDark', { color: 0x1d2024, roughness: 0.52, metalness: 0.55 }),
      pad: kit.mat('plasticMid', { color: 0x8fb4c9, roughness: 0.90, metalness: 0.02 }),
      steel: kit.mat('metal', { color: 0xb9bdc3, roughness: 0.30, metalness: 0.95 }),
      die: kit.mats.silicon,
      cap: kit.mat('ceramic', { color: 0x5a5044, roughness: 0.68, metalness: 0.06 }),
    };
    // 长条板：走线贴图沿长边重复，避免一整个 1024 贴图被拉平
    for (const t of [M.pcb.map, M.pcb.roughnessMap, M.pcb.normalMap]) {
      if (t) t.repeat.set(1.5, 2.0);
    }

    /* ---------- 1. PCB 本体（真的把 M-key 豁口和螺丝缺口切出来） ---------- */
    /* 卡边缘 75 个触点位置。DETAIL-SPEC §5 记的 0.5mm 是插座一侧的标称间距，
       但 75 × 0.5mm = 37.5mm，比 22mm 的板宽还长 —— 装不下。
       所以这里按"75 个位置铺满 22mm 板宽"取有效间距 22/75 ≈ 0.293mm，
       视觉上才是真实的细密金手指；总数仍按 75 − 8(M-key) = 67 pin。 */
    const NPOS = 75;                 // 卡边缘 75 个位置
    const PITCH = W / NPOS;          // 0.005317 ≈ 0.293mm 有效间距
    const KEY_A = 11;                // M-key 让出的位置区间 [11, 18]
    const KEY_B = 18;
    const zOf = (k) => -hw + (k + 0.5) * PITCH;
    const NOTCH_R = 1.6 * K;         // 0.029 = 螺丝缺口 R1.6mm
    const NOTCH_Z = -0.045;          // 缺口偏键位一侧（不是正中）
    const KEY_D = 3.0 * K;           // M-key 豁口深 3mm
    const RR = 1.1 * K;              // 四角圆角

    const shape = m2Shape(THREE, L, W, RR, NOTCH_Z, NOTCH_R,
      zOf(KEY_A) - PITCH / 2, zOf(KEY_B) + PITCH / 2, KEY_D);
    const boardGeo = new THREE.ExtrudeGeometry(shape, {
      depth: PCB_T, bevelEnabled: true, bevelThickness: 0.0016, bevelSize: 0.0016,
      bevelSegments: 1, curveSegments: 4, steps: 1,
    });
    boardGeo.rotateX(-Math.PI / 2);          // 板面转到 XZ 平面，厚度沿 +Y
    boardGeo.translate(0, -PCB_T / 2, 0);    // 板厚居中（±0.012）
    const board = new THREE.Mesh(boardGeo, M.pcb);
    group.add(board);

    /* ---------- 2. 金手指：67 pin（75 位置 − M-key 让出的 8 个）----------
       两排触点双面错位 —— 一面压在另一面的缝上，插座才两面都吃得着。 */
    const FINGER_L = 4.2 * K;        // 触点长 4.2mm（沿板长方向）
    const FINGER_W = PITCH * 0.62;
    const FINGER_T = 0.0045;
    const runs = [];
    {
      let a = -1;
      for (let k = 0; k < NPOS; k++) {
        const inKey = k >= KEY_A && k <= KEY_B;
        if (inKey) { if (a >= 0) { runs.push([a, k - 1]); a = -1; } }
        else if (a < 0) a = k;
      }
      if (a >= 0) runs.push([a, NPOS - 1]);
    }
    let pinCount = 0;
    for (const side of [1, -1]) {
      const shift = side > 0 ? 0 : PITCH / 2;      // 双面错位半间距
      for (const [s, e] of runs) {
        const n = e - s + 1;
        pinCount += n;
        const row = D.parts.pinRow(n, PITCH,
          { w: FINGER_W, h: FINGER_T, d: FINGER_L }, M.gold);
        row.rotation.y = Math.PI / 2;              // pinRow 沿局部 X 排 → 转到沿 Z 排
        row.position.set(
          -L / 2 + FINGER_L / 2 + 0.0012,
          side * (yFace + FINGER_T / 2),
          (zOf(s) + zOf(e)) / 2 + shift,
        );
        group.add(row);
      }
    }

    /* ---------- 3. 主控（12 × 12mm）+ 裸 die + 丝印 ---------- */
    const inkMat = (lines, w, h, o = {}) => {
      const tex = D.tex.plate(lines, { w, h, ...o });
      return new THREE.MeshBasicMaterial({
        map: tex, transparent: true, opacity: o.opacity ?? 0.68,
        depthWrite: false, toneMapped: true, side: THREE.DoubleSide,
      });
    };

    const CTRL = { x: -0.490, z: 0, w: 12 * K, d: 12 * K, h: 0.020 };
    const ctrlGroup = new THREE.Group();
    const ctrlMat = M.ctrl.clone();
    ctrlMat.emissive = new THREE.Color(hue);
    ctrlMat.emissiveIntensity = 0.10;
    const ctrl = D.parts.cbox(CTRL.w, CTRL.h, CTRL.d, ctrlMat, 0.0025, 0.010);
    ctrl.position.y = CTRL.h / 2;
    ctrlGroup.add(ctrl);
    const ctrlDie = kit.box(CTRL.w * 0.52, 0.0035, CTRL.d * 0.52, M.die);
    ctrlDie.position.y = CTRL.h + 0.0012;
    ctrlGroup.add(ctrlDie);
    const ctrlSilk = new THREE.Mesh(new THREE.PlaneGeometry(CTRL.w * 0.8, CTRL.d * 0.22),
      inkMat(['88SS1322', 'PCIe 5.0 x4'], 256, 96, { w: 256, h: 96, ink: '#b9bcb6', align: 'center', font: '600 24px "Microsoft YaHei", sans-serif' }));
    ctrlSilk.rotation.x = -Math.PI / 2;
    ctrlSilk.position.set(0, CTRL.h + 0.0028, -CTRL.d * 0.28);
    ctrlGroup.add(ctrlSilk);
    ctrlGroup.position.set(CTRL.x, yFace, CTRL.z);
    group.add(ctrlGroup);

    /* ---------- 4. 4 颗 NAND（2×2 交错）+ 每颗 4 个 die 块（共 16 块）----------
       16 个 die 块是"阶梯写入"动画的本体，所以每块 clone 一份材质自己发光。 */
    const NAND = { w: 8 * K, d: 10 * K, h: 0.020 };
    const nandZ = [-0.0966, 0.0966];                 // 两列紧挨着，只留 ~0.7mm 缝
    const nandX = [0.280, 0.462];                    // 两行，第二行略微错位 → 2×2 交错
    const blockProto = kit.mat('plasticDark', {
      color: 0x24262b, roughness: 0.44, metalness: 0.10,
      emissive: new THREE.Color(hue), emissiveIntensity: 0.06,
    });
    const blocks = [];
    const nandGroups = [];
    let k = 0;
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 2; col++) {
        const g = new THREE.Group();
        const body = D.parts.cbox(NAND.w, NAND.h, NAND.d, M.nand, 0.0025, 0.008);
        body.position.y = NAND.h / 2;
        g.add(body);
        // 一颗封装里叠了 4 个 die（真实是 4 层堆叠），顶面看到的是第一条 die 带
        for (let b = 0; b < 4; b++) {
          const bm = blockProto.clone();
          const bx = ((b % 2) - 0.5) * NAND.w * 0.46;
          const bz = (Math.floor(b / 2) - 0.5) * NAND.d * 0.46;
          const blk = kit.box(NAND.w * 0.40, 0.0035, NAND.d * 0.40, bm);
          blk.position.set(bx, NAND.h + 0.0012 + b * 0.0004, bz);
          blk.userData.mat = bm;
          blk.userData.k = k;
          g.add(blk);
          blocks.push(blk);
          k++;
        }
        g.position.set(nandX[row] - col * 0, yFace, nandZ[col]);
        g.position.x = nandX[row] + col * 0.014;     // 交错：列与列之间再错开一点
        g.userData.base = g.position.clone();
        group.add(g);
        nandGroups.push(g);
      }
    }

    /* ---------- 5. 缓存 DRAM（8×8mm）+ PMIC + 电感 + 大电容 ---------- */
    const dramGroup = new THREE.Group();
    const dramMat = M.dram;
    const dram = D.parts.cbox(8 * K, 0.016, 8 * K, dramMat, 0.002, 0.006);
    dram.position.y = 0.008;
    dramGroup.add(dram);
    const dramSilk = new THREE.Mesh(new THREE.PlaneGeometry(8 * K * 0.76, 8 * K * 0.26),
      inkMat(['LPDDR4X', '2GB'], 192, 64, { w: 192, h: 64, ink: '#a9aca6', align: 'center', font: '600 20px "Microsoft YaHei", sans-serif' }));
    dramSilk.rotation.x = -Math.PI / 2;
    dramSilk.position.set(0, 0.0166, 0);
    dramGroup.add(dramSilk);
    dramGroup.position.set(-0.280, yFace, -0.090);
    dramGroup.userData.base = dramGroup.position.clone();
    group.add(dramGroup);

    // 电源管理：PMIC + 2 颗电感，排在 +Z 侧那条窄走廊里（让开主控和 NAND）
    const pmicGroup = new THREE.Group();
    const pmic = D.parts.cbox(4 * K, 0.010, 4 * K, M.ctrl, 0.0015, 0.004);
    pmic.position.set(0, 0.005, 0);
    pmicGroup.add(pmic);
    for (const dx of [0.062, 0.126]) {
      const ind = D.parts.inductor(3 * K, 3 * K, 3 * K);
      ind.position.set(dx, 0.004, 0);
      pmicGroup.add(ind);
    }
    pmicGroup.position.set(-0.610, yFace, 0.149);
    pmicGroup.userData.base = pmicGroup.position.clone();
    group.add(pmicGroup);

    // 两颗钽电容（体积大、位置醒目的那种）
    for (const [dx, dz] of [[-0.560, -0.150], [-0.505, -0.158]]) {
      const cap = D.parts.capacitor(0.012, 0.020, 0x3a4048);
      cap.position.set(dx, yFace + 0.010, dz);
      group.add(cap);
    }

    /* ---------- 6. SMD 小件（InstancedMesh，沿两条板边铺开）---------- */
    for (const [count, x0, x1, z0, z1, seed] of [
      [14, -0.330, 0.185, 0.130, 0.186, 7],
      [14, -0.190, 0.185, -0.186, -0.130, 19],
      [10, -0.620, -0.395, -0.190, -0.172, 31],
    ]) {
      const f = D.parts.smdField(count, { w: 0.010, h: 0.004, d: 0.005 }, M.cap);
      f.userData.fill(x0, x1, z0, z1, 0.002, seed);
      f.position.y = yFace;
      group.add(f);
    }

    /* ---------- 7. 走线 + 数据流光点 ---------- */
    const traceMat = kit.glow(hue, 0.70);
    const flowMat = kit.glow(hue, 2.4);
    const yTrace = yFace + 0.0016;

    // 4 条 PCIe lane：金手指 → 主控
    const lanes = [];
    for (let i = 0; i < 4; i++) {
      const z0 = -0.150 + i * 0.040;
      const lane = kit.trace([
        [-0.700, yTrace, z0],
        [-0.660, yTrace, z0],
        [-0.628, yTrace, z0 * 0.55],
        [-0.606, yTrace, z0 * 0.20],
      ], 0.0035, traceMat, 8);
      lanes.push(lane);
      group.add(lane);
    }

    // 4 条总线：主控 → NAND
    const buses = [];
    for (let i = 0; i < 4; i++) {
      const z1 = (i < 2 ? -1 : 1) * (0.030 + (i % 2) * 0.045);
      const bus = kit.trace([
        [-0.378, yTrace, z1 * 0.5],
        [-0.330, yTrace, z1],
        [-0.100, yTrace, z1],
        [0.170, yTrace, z1 * 0.7],
        [0.200, yTrace, z1 * 0.4],
      ], 0.0030, traceMat, 14);
      buses.push(bus);
      group.add(bus);
    }

    const flows = [];
    for (let i = 0; i < 8; i++) {
      const d = kit.dot(0, 0, 0, flowMat, 0.011);
      const onLane = i < 4;
      d.userData.t = i / 8;
      d.userData.trace = onLane ? lanes[i % 4] : buses[i % 4];
      d.userData.speed = 0.34 + (i % 3) * 0.07;
      group.add(d);
      flows.push(d);
    }

    /* ---------- 8. 贴纸：NAND 顶面的型号条码贴 + 背面的认证标签 ---------- */
    // NAND 顶面那张（贴在两颗 NAND 上，散热垫压着它；拆开才看得见）
    const nandLabel = new THREE.Mesh(
      new THREE.PlaneGeometry(0.300, 0.132),
      inkMat(['990 PRO  2TB', 'PCIe 5.0 NVMe  M.2 2280'], 512, 256, {
        w: 512, h: 256, ink: '#c8cbc4', barcode: true, align: 'left',
        opacity: 0.80,
      }),
    );
    nandLabel.rotation.x = -Math.PI / 2;
    nandLabel.position.set(0.371, yFace + NAND.h + 0.0012, 0.0966);
    group.add(nandLabel);

    // 背面白色标签（容量/型号/认证标志）
    const backLabel = new THREE.Mesh(
      new THREE.PlaneGeometry(0.360, 0.240),
      inkMat(['NVMe SSD 2TB', 'M.2 2280  PCIe 5.0 x4', 'S/N 0A24-8842'], 512, 320, {
        w: 512, h: 320, bg: '#e9e7e1', ink: '#1a1a1a', align: 'left',
        barcode: true, opacity: 0.92,
      }),
    );
    backLabel.rotation.x = Math.PI / 2;
    backLabel.position.set(0.320, -yFace - 0.0012, 0);
    group.add(backLabel);

    /* ---------- 9. 散热马甲：铝板 + 7 条长槽筋 + 2 颗 M2 螺丝 ---------- */
    const HS = {
      L: 1.240,          // 68mm
      T: 0.036,          // 2mm 铝板
      W: 0.394,
      y0: yFace + NAND.h + 0.018,   // 0.050 = 导热垫顶面
    };
    const hs = new THREE.Group();

    const hsPlate = D.parts.cbox(HS.L, HS.T, HS.W, M.hs, 0.006, 0.020);
    hsPlate.position.y = HS.y0 + HS.T / 2;
    hs.add(hsPlate);

    // 7 条筋 ⇒ 中间 6 条槽（真实马甲就是这个长槽结构，把热摊到整个顶面）
    const RIB_N = 7;
    for (let i = 0; i < RIB_N; i++) {
      const rib = kit.box(HS.L * 0.965, 0.015, 0.0135, M.hsDark);
      rib.position.set(0, HS.y0 + HS.T + 0.0075, (i - (RIB_N - 1) / 2) * 0.0544);
      hs.add(rib);
    }
    // 两端收边
    for (const sx of [-1, 1]) {
      const rim = D.parts.cbox(0.016, 0.020, HS.W * 0.99, M.hs, 0.002, 0.004);
      rim.position.set(sx * (HS.L / 2 - 0.008), HS.y0 + HS.T + 0.002, 0);
      hs.add(rim);
    }
    // 2 颗 M2×3 螺丝（对角压在板上，正好落进两条筋之间的槽里）
    for (const [sx, sz] of [[-1, 1], [1, -1]]) {
      const s = D.parts.screw(0.019, 0.008, M.steel);
      s.position.set(sx * (HS.L / 2 - 0.055), HS.y0 + HS.T + 0.004, sz * 0.145);
      hs.add(s);
    }
    group.add(hs);

    // 导热垫：压在颗粒与铝板之间（拆解时单独贴出来）
    const pad = D.parts.cbox(1.180, 0.018, 0.330, M.pad, 0.002, 0.006);
    const PAD_Y = yFace + NAND.h + 0.008;      // 0.040
    pad.position.set(0, PAD_Y, 0);
    const padGroup = new THREE.Group();
    padGroup.add(pad);
    group.add(padGroup);

    /* ---------- 拆解 / 动画 ---------- */
    return {
      group,
      legend: [
        { text: '金手指', desc: '卡边缘 67 个触点，PCIe 5.0 x4 的通道全从这里进出' },
        { text: '主控', desc: '整个硬盘的大脑，负责把读写命令翻译成闪存操作' },
        { text: 'NAND 闪存', desc: '4 颗颗粒叠了 16 层 die，断电也不会丢数据的仓库' },
        { text: '缓存 DRAM', desc: '存放闪存地址对照表，命中率直接决定写入速度' },
        { text: '散热马甲', desc: '铝板加长槽筋，把主控和颗粒的热摊到整个顶面' },
        { text: '半圆缺口', desc: '尾端那个缺口压在固定螺丝下，一按就定死位置' },
      ],

      /** t: 0 = 合拢，1 = 完全拆解。纯函数，可来回擦洗 */
      setExplode(t) {
        // ① 散热马甲（含 2 颗螺丝）先整个抬起
        const eHs = kit.easeInOut(kit.clamp01(t / 0.34));
        hs.position.set(0, 0.220 * eHs, 0);

        // ② 导热垫随后贴出
        const ePad = kit.easeInOut(kit.clamp01((t - 0.18) / 0.40));
        padGroup.position.set(0, 0.110 * ePad, 0);

        // ③ 主控 / 缓存 / 电源 各自浮起
        const eC = kit.easeInOut(kit.clamp01((t - 0.30) / 0.55));
        ctrlGroup.position.set(CTRL.x - 0.020 * eC, yFace + 0.100 * eC, CTRL.z + 0.020 * eC);

        const eD = kit.easeInOut(kit.clamp01((t - 0.34) / 0.52));
        const bD = dramGroup.userData.base;
        dramGroup.position.set(bD.x - 0.016 * eD, bD.y + 0.128 * eD, bD.z - 0.040 * eD);

        const eP = kit.easeInOut(kit.clamp01((t - 0.30) / 0.50));
        const bP = pmicGroup.userData.base;
        pmicGroup.position.set(bP.x, bP.y + 0.070 * eP, bP.z + 0.026 * eP);

        // ④ 4 颗 NAND 阶梯错开浮起（错位摆放，拆开后还看得出 2×2）
        const eN = kit.easeInOut(kit.clamp01((t - 0.32) / 0.58));
        nandGroups.forEach((g, i) => {
          const b = g.userData.base;
          const row = Math.floor(i / 2);
          const col = i % 2;
          g.position.set(
            b.x + (row * 0.020 + col * 0.010) * eN,
            b.y + (0.088 + i * 0.026) * eN,
            b.z + (col === 0 ? -0.030 : 0.030) * eN,
          );
          g.rotation.y = (col === 0 ? 0.10 : -0.10) * eN;
        });
      },

      /** 持续动画：16 块 die 的阶梯写入 + 主控呼吸 + 数据流
       *  位置一律由 setExplode 负责，这里只改发光强度和光点自身位置。 */
      update(elapsed, dt, emphasis = 0) {
        // 写入波前沿 16 块 die 依次推进，写完一块余辉按指数衰减
        const head = ((elapsed * 0.55) % 1) * blocks.length;
        for (const b of blocks) {
          const age = head - b.userData.k;
          const v = age >= 0
            ? 0.10 + 0.90 * Math.exp(-age * 0.34)
            : 0.06;                                  // 还没轮到它
          b.userData.mat.emissiveIntensity = v * (0.75 + emphasis * 0.7);
        }

        // 主控：轻微呼吸，强调时更亮
        ctrlMat.emissiveIntensity = 0.08 + 0.06 * Math.sin(elapsed * 2.1) + emphasis * 0.12;

        // 数据流：光点沿走线跑（lane 从金手指进主控，bus 从主控往颗粒）
        for (const f of flows) {
          f.userData.t = (f.userData.t + dt * f.userData.speed * (0.5 + emphasis * 1.1)) % 1;
          f.position.copy(kit.pointOn(f.userData.trace, f.userData.t));
          const edge = Math.min(f.userData.t, 1 - f.userData.t);
          f.visible = edge > 0.04;
        }
      },
    };
  },
};
