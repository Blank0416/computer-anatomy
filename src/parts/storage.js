/* ============================================================
   storage.js — 固态硬盘（M.2 2280 NVMe）
   拆解：M.2 板 → 主控芯片 → 4 颗 NAND 闪存颗粒 → 缓存 DRAM → 金手指接口
   动画：数据以"块"为单位一格一格写入 NAND（阶梯式点亮，和内存那种连续脉冲
         刻意做出对比）；主控到闪存之间有 PCIe 通道 / 通道总线的数据流光点。
   ============================================================ */

export default {
  id: 'storage',
  name: '硬盘',
  en: 'SSD',
  hue: 0xa79bb8,

  // 机位相对本元件原点：约 39° 俯角、距离约 2.20。
  // 从右前上方看，既能看到板上布局，也能看到板厚和右侧的固定螺孔。
  focus: { from: [0.80, 1.40, 1.50], look: [0, 0.02, 0], fov: 34 },

  build(kit) {
    const { THREE } = kit;
    const group = new THREE.Group();
    const hue = 0xa79bb8;

    /* ---------- 尺寸 ----------
       一条 22mm × 80mm 的 M.2 2280；这里 1 世界单位 ≈ 52mm。 */
    const L = 1.45;            // 板长（沿 X，金手指在左端）
    const W = 0.42;            // 板宽（沿 Z）
    const T = 0.030;           // 板厚（沿 Y）
    const yFace = T / 2;       // 板面 +0.015
    const yBack = -T / 2;      // 板背 -0.015

    /* ---------- 1. M.2 板本体 + 右端固定缺口 ---------- */
    group.add(kit.box(L, T, W, kit.mats.pcb).translateX(-0.025));
    // 右端收窄成安装凸耳：真实 2280 的尾端就是一个半圆缺口 + 螺丝固定点
    group.add(kit.box(0.075, T, 0.30, kit.mats.pcb).translateX(0.7375));
    // 螺孔：用一圈金属环表达被切出来的半圆缺口
    const hole = new THREE.Mesh(
      new THREE.TorusGeometry(0.035, 0.010, 6, 14),
      kit.mat('metalDark', { roughness: 0.5 })
    );
    hole.rotation.x = Math.PI / 2;
    hole.position.set(0.7375, 0, 0);
    hole.castShadow = hole.receiveShadow = true;
    group.add(hole);

    /* ---------- 2. 金手指接口（左端短边，PCIe x4） ----------
       真实 M.2 的触点做在板子短边的正反两面；这里 64 个触点，中间留一个缺口键。 */
    const padMat = kit.mats.gold;
    const padY = yFace + 0.0035;
    const padParts = [
      { z: -0.145, n: 10 },     // 缺口左侧一段
      { z: 0.085, n: 22 },      // 缺口右侧一段
    ];
    for (const sz of [1, -1]) {
      for (const p of padParts) {
        const row = kit.pins(p.n, 0.010, padMat, { w: 0.007, h: 0.007, d: 0.070 });
        row.rotation.y = Math.PI / 2;                 // 把"一排"从 X 方向转成 Z 方向
        row.position.set(-0.71, sz * padY, p.z);
        group.add(row);
      }
    }

    /* ---------- 3. 主控芯片（板上最大的那颗，SSD 的大脑） ---------- */
    const CTRL = { x: -0.50, y: 0.025, z: 0 };
    // 主控要单独做"工作中"的呼吸发光，所以 clone 一份 kit 材质自己管
    const ctrlMat = kit.mat('plasticDark', {
      emissive: new THREE.Color(hue),
      emissiveIntensity: 0.10,
    }).clone();
    const ctrl = kit.box(0.24, 0.020, 0.20, ctrlMat);
    ctrl.position.set(CTRL.x, CTRL.y, CTRL.z);
    group.add(ctrl);
    // 封装上开窗露出的裸 die（主控真正的硅片）
    const ctrlDie = kit.box(0.16, 0.005, 0.13, kit.mats.silicon);
    ctrlDie.position.set(CTRL.x, 0.0375, CTRL.z);
    group.add(ctrlDie);

    /* ---------- 4. 缓存 DRAM（存闪存映射表，查表不用每次翻颗粒） ---------- */
    const DRAM = { x: -0.25, y: 0.023, z: -0.08 };
    const dram = kit.box(0.11, 0.016, 0.115, kit.mat('plasticDark', { roughness: 0.8 }));
    dram.position.set(DRAM.x, DRAM.y, DRAM.z);
    group.add(dram);

    /* ---------- 5. PMIC 与配套电感（板右后侧的供电小件） ---------- */
    const pmicGroup = new THREE.Group();
    const pmic = kit.box(0.09, 0.014, 0.07, kit.mats.plasticDark);
    pmic.position.set(-0.27, 0.022, 0.15);
    pmicGroup.add(pmic);
    for (let i = 0; i < 2; i++) {
      const ind = kit.cyl(0.018, 0.018, 0.016, 8, kit.mats.plasticDark);
      ind.position.set(-0.375 - i * 0.05, 0.023, 0.15);
      pmicGroup.add(ind);
    }
    group.add(pmicGroup);

    /* ---------- 6. NAND 闪存颗粒：4 颗封装 × 4 个 die 块 = 16 个"块" ----------
       每个小块一份独立材质，才能一块一块地阶梯点亮（写入动画）。
       这是契约里唯一允许自建材质的场景，做法与 cpu.js 的核心阵列一致。 */
    const NAND = { w: 0.185, h: 0.022, d: 0.19, y: 0.026 };
    const blockProto = kit.mat('plasticDark', {
      emissive: new THREE.Color(hue),
      emissiveIntensity: 0.06,
    });
    const nandX = [-0.060, 0.162, 0.384, 0.606];
    const packs = [];
    const blocks = [];
    for (let i = 0; i < nandX.length; i++) {
      const pack = new THREE.Group();
      pack.position.set(nandX[i], NAND.y, 0);
      pack.userData.base = pack.position.clone();

      const body = kit.box(NAND.w, NAND.h, NAND.d, kit.mat('plasticDark', { roughness: 0.76 }));
      pack.add(body);

      // 每颗封装里有 2×2 个 die 块，块与块之间留出封装台阶
      for (let b = 0; b < 4; b++) {
        const bx = ((b % 2) - 0.5) * 0.087;
        const bz = (Math.floor(b / 2) - 0.5) * 0.091;
        const mat = blockProto.clone();               // 独立发光
        const blk = kit.box(0.079, 0.006, 0.082, mat);
        blk.position.set(bx, NAND.h / 2 + 0.003, bz);
        blk.userData.mat = mat;
        blk.userData.k = i * 4 + b;                   // 全局块序号：写入顺序 0…15
        pack.add(blk);
        blocks.push(blk);
      }
      packs.push(pack);
      group.add(pack);
    }

    /* ---------- 7. 底面：标签区 + 几颗贴片件 ---------- */
    const bottom = new THREE.Group();
    const label = kit.box(0.90, 0.004, 0.30, kit.mat('plastic', { roughness: 0.86, color: 0x6f747b }));
    label.position.set(0.10, yBack - 0.002, 0);
    bottom.add(label);
    const rng = kit.rng(20261025);
    for (let i = 0; i < 6; i++) {
      const c = kit.box(0.020, 0.012, 0.016, rng() > 0.5 ? kit.mats.ceramic : kit.mats.plasticMid);
      c.position.set(-0.60 + i * 0.038, yBack - 0.006, (rng() - 0.5) * 0.26);
      bottom.add(c);
    }
    group.add(bottom);

    /* ---------- 8. 标识色走线：PCIe 通道 + 主控到闪存的总线 ---------- */
    const traceMat = kit.glow(hue, 0.7);
    const yTrace = yFace + 0.0025;

    // 金手指 → 主控：4 条 PCIe 通道
    const lanes = [];
    for (let k = 0; k < 4; k++) {
      const z = (k - 1.5) * 0.05;
      const t = kit.trace([
        [-0.735, yTrace, z],
        [-0.680, yTrace, z],
        [-0.625, yTrace + 0.0005, z * 0.9],
      ], 0.0035, traceMat, 12);
      lanes.push(t);
      group.add(t);
    }

    // 主控 → 4 颗 NAND：左右两条总线走在板边空档里，再分支进每颗封装
    const buses = [];
    for (const sz of [1, -1]) {
      const bus = kit.trace([
        [-0.40, yTrace, sz * 0.190],
        [0.10, yTrace, sz * 0.190],
        [0.660, yTrace, sz * 0.190],
      ], 0.0035, traceMat, 16);
      buses.push(bus);
      group.add(bus);
      for (const x of nandX) {
        const stub = kit.trace([
          [x, yTrace, sz * 0.190],
          [x, yTrace, sz * 0.150],
          [x, yTrace, sz * 0.098],
        ], 0.0028, traceMat, 10);
        group.add(stub);
      }
    }

    /* ---------- 9. 2280 标尺：沿板边每 10mm 一道刻度 ----------
       "2280" 就是 22mm 宽 × 80mm 长，把它画出来比写文字直观。 */
    const tickMat = kit.mat('metal', { roughness: 0.62, metalness: 0.1, color: 0xb6bbc0 });
    for (let k = 1; k <= 7; k++) {
      const tick = kit.box(0.008, 0.004, 0.014, tickMat);
      tick.position.set(-0.75 + k * 0.19, yFace + 0.002, 0.203);
      group.add(tick);
    }

    /* ---------- 10. 数据流光点 ---------- */
    const flowMat = kit.glow(hue, 2.4);
    const flows = [];
    // 4 颗：数据从主板进来，沿 PCIe 通道进入主控
    for (let k = 0; k < 4; k++) {
      const d = kit.dot(0, 0, 0, flowMat, 0.013);
      d.userData.t = k / 4;
      d.userData.trace = lanes[k];
      d.userData.rev = false;                       // 向内跑 = 写入方向
      d.userData.speed = 0.55 + k * 0.05;
      group.add(d);
      flows.push(d);
    }
    // 6 颗：从主控沿总线奔向 NAND（正反两面各 3 颗）
    for (let k = 0; k < 6; k++) {
      const d = kit.dot(0, 0, 0, flowMat, 0.013);
      d.userData.t = k / 6;
      d.userData.trace = buses[k % 2];
      d.userData.rev = false;
      d.userData.speed = 0.24 + (k % 3) * 0.05;
      group.add(d);
      flows.push(d);
    }

    /* ---------- 拆解 / 动画 ---------- */
    return {
      group,
      legend: [
        { text: '金手指接口', desc: '插进主板的 M.2 插槽，靠 PCIe 通道和 CPU 说话' },
        { text: '主控芯片', desc: 'SSD 的大脑，负责读写调度、纠错和磨损均衡' },
        { text: 'NAND 闪存颗粒', desc: '真正存数据的地方，断电也不会丢' },
        { text: '缓存 DRAM', desc: '存放闪存映射表，查地址不用每次翻颗粒' },
        { text: '2280 规格', desc: '22mm 宽 × 80mm 长，这个尺寸就叫 2280' },
      ],

      /** t: 0 = 合拢，1 = 完全拆解。纯函数，可来回擦洗 */
      setExplode(t) {
        const e = kit.easeInOut(t);

        // 主控：抬得最高 —— 装配时它是最后盖上去的那颗
        ctrl.position.set(CTRL.x, CTRL.y + 0.46 * e, CTRL.z);
        ctrlDie.position.set(CTRL.x, 0.0375 + 0.46 * e, CTRL.z);
        ctrl.rotation.y = 0.22 * e;

        // 缓存 DRAM：抬起来并向板后侧让开
        dram.position.set(DRAM.x, DRAM.y + 0.30 * e, DRAM.z - 0.16 * e);

        // 供电小件：整体抬一点点
        pmicGroup.position.y = 0.24 * e;
        pmicGroup.position.z = 0.05 * e;

        // 4 颗 NAND：阶梯式浮起（越靠右浮得越高），并沿板长微微拉开
        for (let i = 0; i < packs.length; i++) {
          const b = packs[i].userData.base;
          packs[i].position.set(
            b.x + (i - 1.5) * 0.030 * e,
            b.y + (0.20 + i * 0.060) * e,
            b.z
          );
          packs[i].rotation.y = 0.16 * e * (i % 2 ? 1 : -1);
        }

        // 底面贴片与标签：向下降落，露出板面
        bottom.position.y = -0.16 * e;
      },

      /** 持续动画：数据"块"写入 NAND + 主控工作呼吸 + 数据流光点
       *  注意：位置一律由 setExplode 负责，这里只改发光强度。 */
      update(elapsed, dt, emphasis = 0) {
        // 写入头以"块"为单位前进：扫过 16 块约 1.8 秒，走过的块按顺序衰减成阶梯
        const head = ((elapsed * 0.55) % 1) * 16;
        for (const blk of blocks) {
          const age = head - blk.userData.k;
          let v;
          if (age >= 0) v = 0.10 + 0.90 * Math.exp(-age * 0.34);
          else v = 0.06;                                  // 还没写到的块保持微亮
          blk.userData.mat.emissiveIntensity = v * (0.75 + emphasis * 0.7);
        }

        // 主控：读写时的轻微呼吸，提示"它在忙"
        ctrlMat.emissiveIntensity = 0.08 + 0.06 * Math.sin(elapsed * 2.1)
          + emphasis * 0.10;

        // 数据流：光点沿走线跑
        for (const f of flows) {
          f.userData.t = (f.userData.t + dt * f.userData.speed * (0.5 + emphasis * 1.1)) % 1;
          const u = f.userData.rev ? 1 - f.userData.t : f.userData.t;
          f.position.copy(kit.pointOn(f.userData.trace, u));
          const edge = Math.min(f.userData.t, 1 - f.userData.t);
          f.visible = edge > 0.05;
        }
      },
    };
  },
};