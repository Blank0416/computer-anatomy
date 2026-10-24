/* ============================================================
   motherboard.js — 主板（ATX 大板）
   拆解：基板 → CPU 插槽 → 内存插槽 → PCIe 插槽 → 芯片组
        → 供电相位阵列 → 后置 I/O → 24pin 供电口
   动画：沿走线奔跑的信号光点；拆解时所有走线整体"提"起来悬空 ——
        这是主板最好的教学点：板子自己不干活，它只负责让所有东西互相说话。
   ============================================================ */

export default {
  id: 'motherboard',
  name: '主板',
  en: 'Motherboard',
  hue: 0x7fa3a8,

  // 机位相对本元件原点（main.js 会加上元件在世界里的位置）
  // 从右前上方 31° 俯看，能同时看到板面布局和板子的厚度
  // 机位随原点归位一起补偿，保证画面构图和设计时一致
  focus: { from: [1.62, 1.38, 1.95], look: [0.02, -0.10, 0], fov: 34 },

  build(kit) {
    const { THREE } = kit;
    const group = new THREE.Group();
    const hue = 0x7fa3a8;

    /* ---------- 尺寸（真 ATX 是 305×244mm，这里等比缩到 1.44×1.16） ---------- */
    const W = 1.44;        // 板宽（长边）
    const D = 1.16;        // 板深
    const T = 0.030;       // 板厚
    const yTop = T / 2;    // 板面高度：所有元件都坐在它上面
    const yTr = yTop + 0.006;   // 走线贴着板面走（阻焊层下面那层铜）

    /* ---------- 布局坐标：照着真 ATX 的相对位置摆 ---------- */
    const SOCK = { x: -0.39, z: -0.17, s: 0.42 };       // CPU 插槽（左后）
    const DIMM_X = [0.10, 0.175, 0.25, 0.325];          // 4 条内存插槽的 x
    const DIMM_Z = -0.16, DIMM_L = 0.66;                // 插槽中心 z / 长度
    const PCIE = [                                      // 长的一条 + 短的两条
      { z: 0.24, x: 0.04, len: 0.80, n: 40 },           // x16（显卡那条）
      { z: 0.36, x: 0.21, len: 0.30, n: 16 },           // x4
      { z: 0.44, x: 0.21, len: 0.30, n: 10 },           // x1
    ];
    const CHIPSET = { x: 0.50, z: 0.02, s: 0.22 };
    const P24 = { x: 0.65, z: -0.31 };                  // 24pin 主供电
    const EPS = { x: -0.45, z: -0.52 };                 // CPU 8pin 供电
    const VRM_Z = -0.50, VRM_X0 = -0.26, VRM_N = 8, VRM_STEP = 0.062;

    /* ---------- 可拆解子系统登记表 ----------
       每个子系统是一个 Group：登记基准位置 + 拆解时的位移向量。
       setExplode 完全由 t 现算，不读上一次的值 —— 保证 0→1→0 能复原。 */
    const rigs = [];
    const rig = (g, dx, dy, dz) => {
      g.userData.base = g.position.clone();
      rigs.push({ g, d: new THREE.Vector3(dx, dy, dz) });
      return g;
    };

    /* ============================================================
       1. 基板 · PCB
       六层环氧玻璃布板，里面压着十几层铜箔走线；四周那圈孔是拧机箱铜柱的。
       ============================================================ */
    const board = kit.box(W, T, D, kit.mats.pcb);
    group.add(board);

    // 四角 + 中部的固定螺丝孔
    const holeMat = kit.mat('metalDark', { roughness: 0.62, metalness: 0.5 });
    for (const [hx, hz] of [[-0.62, -0.48], [-0.62, 0.48], [0.62, -0.48], [0.62, 0.48], [-0.10, 0.50], [0.62, 0.06]]) {
      const h = kit.cyl(0.026, 0.026, T + 0.014, 10, holeMat);
      h.position.set(hx, yTop, hz);
      group.add(h);
    }

    // 板面上的零散贴片（电阻/小电容），让板子不像一块空白塑料
    // 中间那条走廊留给走线层，贴片避开它，免得和走线插在一起
    const rng = kit.rng(20261024);
    for (let i = 0; i < 34; i++) {
      const x = (rng() - 0.5) * (W - 0.14);
      const z = (rng() - 0.5) * (D - 0.14);
      if (x > -0.46 && x < 0.38 && z > -0.10 && z < 0.28) continue;
      const w = 0.022 + rng() * 0.018, h = 0.010 + rng() * 0.010, d = 0.030 + rng() * 0.024;
      const c = kit.box(w, h, d, rng() > 0.5 ? kit.mats.ceramic : kit.mats.plasticDark);
      c.position.set(x, yTop + h / 2, z);
      group.add(c);
    }

    /* ============================================================
       2. CPU 插槽 · LGA 插座
       一平方厘米上挤着一千多根弹性针脚，处理器放上去、压杆一扣就通了一千路电。
       ============================================================ */
    const sockG = new THREE.Group();
    sockG.position.set(SOCK.x, yTop, SOCK.z);
    group.add(sockG);
    rig(sockG, 0, 0.14, 0);

    {
      const S = SOCK.s, bar = 0.040, H = 0.060;
      const frameMat = kit.mat('plasticDark', { roughness: 0.70, metalness: 0.05 });
      // 四边塑料框（中间是空的，好让针脚露出来）
      for (const [w, d, px, pz] of [[S, bar, 0, S / 2 - bar / 2], [S, bar, 0, -S / 2 + bar / 2], [bar, S - bar * 2, S / 2 - bar / 2, 0], [bar, S - bar * 2, -S / 2 + bar / 2, 0]]) {
        const b = kit.box(w, H, d, frameMat);
        b.position.set(px, H / 2, pz);
        sockG.add(b);
      }
      // 针脚面阵：20×20，用 InstancedMesh 一次性画完（400 根 ≈ 4.8k 面）
      const N = 20, field = S - 0.10, sp = field / (N - 1);
      const pGeo = new THREE.BoxGeometry(0.012, 0.008, 0.012);
      const pins = new THREE.InstancedMesh(pGeo, kit.mats.gold, N * N);
      const m4 = new THREE.Matrix4();
      let n = 0;
      for (let j = 0; j < N; j++)
        for (let i = 0; i < N; i++)
          pins.setMatrixAt(n++, m4.makeTranslation((i - (N - 1) / 2) * sp, H * 0.45, (j - (N - 1) / 2) * sp));
      pins.instanceMatrix.needsUpdate = true;
      pins.castShadow = pins.receiveShadow = true;
      sockG.add(pins);

      // 压杆（load lever）：真插座旁边那根金属杆，扣下去把 CPU 压紧
      const leverMat = kit.mat('metal', { roughness: 0.35, metalness: 0.9 });
      const lever = kit.cyl(0.009, 0.009, S + 0.05, 6, leverMat);
      lever.rotation.z = Math.PI / 2;
      lever.position.set(0, H + 0.012, -S / 2 - 0.018);
      sockG.add(lever);
      const arm = kit.box(0.016, 0.010, 0.07, leverMat);
      arm.position.set(-S / 2 - 0.020, H + 0.012, -S / 2 + 0.012);
      sockG.add(arm);

      // 左上角的金色三角：告诉装机的人"第一根针在哪个角"
      const mark = kit.box(0.026, 0.006, 0.026, kit.mats.gold);
      mark.position.set(-S / 2 + 0.030, H + 0.004, -S / 2 + 0.030);
      sockG.add(mark);
    }

    /* ============================================================
       3. 内存插槽 ×4 · DIMM
       插槽里的金手指直接连到 CPU 的内存控制器 —— 内存条是"直连"处理器的，
       所以这四条插槽一定是全板离 CPU 最近的部件。
       ============================================================ */
    const dimmG = new THREE.Group();
    dimmG.position.set(0, yTop, 0);
    group.add(dimmG);
    rig(dimmG, 0, 0.20, 0);

    const dimmSlots = [];    // 每条单独登记，拆解时向左右散开
    const clipMat = kit.tint(kit.accent(hue, -0.18), { rough: 0.70, metal: 0.05 });
    const slotMat = kit.mat('plasticDark', { roughness: 0.72, metalness: 0.05 });
    for (const sx of DIMM_X) {
      const slot = new THREE.Group();
      slot.position.set(sx, 0, DIMM_Z);
      slot.userData.baseX = sx;
      dimmG.add(slot);
      dimmSlots.push(slot);

      const body = kit.box(0.030, 0.085, DIMM_L, slotMat);
      body.position.y = 0.0425;
      slot.add(body);

      // 两端卡扣（按下去把内存条锁住，也是偏 hue 的识别色）
      for (const sz of [DIMM_L / 2 + 0.014, -DIMM_L / 2 - 0.014]) {
        const clip = kit.box(0.036, 0.072, 0.026, clipMat);
        clip.position.set(0, 0.036, sz);
        slot.add(clip);
      }

      // 槽里的金手指触点（每槽 40 个，四条槽一起才 1.9k 面）
      const n = 40;
      const geo = new THREE.BoxGeometry(0.010, 0.014, 0.013);
      const inst = new THREE.InstancedMesh(geo, kit.mats.gold, n);
      const m4 = new THREE.Matrix4();
      for (let i = 0; i < n; i++)
        inst.setMatrixAt(i, m4.makeTranslation(0, 0.070, (i - (n - 1) / 2) * (DIMM_L - 0.10) / (n - 1)));
      inst.instanceMatrix.needsUpdate = true;
      inst.castShadow = true;
      slot.add(inst);
    }

    /* ============================================================
       4. PCIe 插槽 · 显卡/扩展卡的高速通道
       下面那条最长的 x16 直接连 CPU（显卡专用），短的几条绕去芯片组。
       ============================================================ */
    const pcieG = new THREE.Group();
    pcieG.position.set(0, yTop, 0);
    group.add(pcieG);
    rig(pcieG, 0, 0.26, 0);

    {
      const pcieMat = kit.mat('plasticDark', { roughness: 0.70, metalness: 0.06 });
      const winMat = kit.mat('plasticMid', { roughness: 0.68, metalness: 0.05 });
      const contacts = [];
      for (const s of PCIE) {
        const body = kit.box(s.len, 0.070, 0.030, pcieMat);
        body.position.set(s.x, 0.035, s.z);
        pcieG.add(body);
        // 长槽那端多出来的一截（显卡尾部卡扣）
        if (s.n === 40) {
          const tail = kit.box(0.045, 0.055, 0.032, winMat);
          tail.position.set(s.x - s.len / 2 - 0.028, 0.028, s.z);
          pcieG.add(tail);
        }
        for (let i = 0; i < s.n; i++)
          contacts.push([s.x - s.len / 2 + 0.03 + i * ((s.len - 0.06) / (s.n - 1)), s.z]);
      }
      const geo = new THREE.BoxGeometry(0.012, 0.016, 0.010);
      const inst = new THREE.InstancedMesh(geo, kit.mats.gold, contacts.length);
      const m4 = new THREE.Matrix4();
      contacts.forEach(([x, z], i) => inst.setMatrixAt(i, m4.makeTranslation(x, 0.060, z)));
      inst.instanceMatrix.needsUpdate = true;
      inst.castShadow = true;
      pcieG.add(inst);
    }

    /* ============================================================
       5. M.2 插槽 + 散热片（贴着板子躺的固态硬盘位）
       ============================================================ */
    {
      // 摆在 PCIe 短槽下方那条空带上（真板子上 M.2 也常藏在插槽之间）
      const m2 = kit.box(0.60, 0.012, 0.032, slotMat);
      m2.position.set(-0.10, yTop + 0.006, 0.52);
      group.add(m2);
      const hs = kit.box(0.58, 0.070, 0.098, kit.mat('metalDark', { roughness: 0.50, metalness: 0.60, color: 0x4e565e }));
      hs.position.set(-0.10, yTop + 0.044, 0.52);
      group.add(hs);
      // 散热片上的几道槽：立起来的槽才有高度，掠射角下也看得出是个"块"
      const finMat = kit.mat('metalDark', { roughness: 0.46, metalness: 0.66, color: 0x5b636b });
      const geo = new THREE.BoxGeometry(0.56, 0.030, 0.014);
      const inst = new THREE.InstancedMesh(geo, finMat, 4);
      const m4 = new THREE.Matrix4();
      for (let i = 0; i < 4; i++) inst.setMatrixAt(i, m4.makeTranslation(-0.10, yTop + 0.092, 0.485 + i * 0.024));
      inst.instanceMatrix.needsUpdate = true;
      inst.castShadow = true;
      group.add(inst);
    }

    /* ============================================================
       6. 芯片组 · Chipset（PCH）
       管 USB、SATA、音频、网卡这些"慢"设备，是主板的交通枢纽。
       ============================================================ */
    const chipG = new THREE.Group();
    chipG.position.set(CHIPSET.x, yTop, CHIPSET.z);
    group.add(chipG);
    rig(chipG, 0, 0.12, 0);

    {
      const S = CHIPSET.s;
      const die = kit.box(S * 0.62, 0.014, S * 0.62, kit.mats.silicon);
      die.position.y = 0.007;
      chipG.add(die);

      // 芯片上的小散热片（一排薄片，用 InstancedMesh 控制面数）
      const hsMat = kit.mat('metalDark', { roughness: 0.46, metalness: 0.62, color: 0x545c64 });
      const base = kit.box(S, 0.055, S, hsMat);
      base.position.y = 0.040;
      chipG.add(base);
      const geo = new THREE.BoxGeometry(S * 0.96, 0.055, 0.016);
      const inst = new THREE.InstancedMesh(geo, hsMat, 6);
      const m4 = new THREE.Matrix4();
      for (let i = 0; i < 6; i++) inst.setMatrixAt(i, m4.makeTranslation(0, 0.095, (i - 2.5) * (S * 0.15)));
      inst.instanceMatrix.needsUpdate = true;
      inst.castShadow = true;
      chipG.add(inst);

      // 芯片旁边一颗常亮的指示灯（元件标识色）
      const led = kit.dot(S * 0.62, 0.010, S * 0.62, kit.glow(hue, 2.4), 0.011);
      chipG.add(led);
    }

    /* ============================================================
       7. 供电相位阵列 · VRM
       主板把电源送来的 12V，在这里切成一路路、降到 1V 出头喂给 CPU。
       一个"相位"= 一颗电感 + 一排电容；相数越多，电压越稳、越不容易发烫。
       ============================================================ */
    const vrmG = new THREE.Group();
    vrmG.position.set(0, yTop, 0);
    group.add(vrmG);
    rig(vrmG, 0, 0.18, 0);

    {
      const indMat = kit.mat('metalDark', { roughness: 0.52, metalness: 0.6 });
      const capMat = kit.mat('ceramic', { roughness: 0.64, metalness: 0.04 });
      const phases = [];
      // 横排 8 相（沿着板子上缘）
      for (let i = 0; i < VRM_N; i++) phases.push([VRM_X0 + i * VRM_STEP, VRM_Z]);
      // 竖排 3 相（CPU 插槽左侧，真板子上也常是 L 形）
      for (let i = 0; i < 3; i++) phases.push([-0.64, -0.36 + i * 0.075]);

      for (const [px, pz] of phases) {
        const ind = kit.cyl(0.030, 0.030, 0.055, 10, indMat);
        ind.position.set(px, 0.028, pz);
        vrmG.add(ind);
        const top = kit.cyl(0.024, 0.030, 0.012, 10, kit.mats.metal);
        top.position.set(px, 0.058, pz);
        vrmG.add(top);
      }
      // 每相配的固态电容：一排小圆柱，InstancedMesh 一把画完
      const capGeo = new THREE.CylinderGeometry(0.017, 0.017, 0.034, 8);
      const caps = new THREE.InstancedMesh(capGeo, capMat, phases.length + 6);
      const m4 = new THREE.Matrix4();
      let n = 0;
      for (let i = 0; i < phases.length; i++) {
        const [px, pz] = phases[i];
        caps.setMatrixAt(n++, m4.makeTranslation(px, 0.017, pz + 0.055));
      }
      for (let i = 0; i < 6; i++) caps.setMatrixAt(n++, m4.makeTranslation(VRM_X0 + i * VRM_STEP * 1.35, 0.017, VRM_Z + 0.10));
      caps.instanceMatrix.needsUpdate = true;
      caps.castShadow = true;
      vrmG.add(caps);

      // 盖在相位阵列上的散热片（做高，再压几道立筋 —— 平躺的板子全靠它们撑轮廓）
      const hsMat = kit.mat('metalDark', { roughness: 0.44, metalness: 0.62, color: 0x565e66 });
      const hs1 = kit.box(VRM_N * VRM_STEP + 0.06, 0.085, 0.105, hsMat);
      hs1.position.set(VRM_X0 + (VRM_N - 1) * VRM_STEP / 2, 0.110, VRM_Z + 0.03);
      vrmG.add(hs1);
      const hs2 = kit.box(0.105, 0.085, 0.30, hsMat);
      hs2.position.set(-0.64, 0.110, -0.30);
      vrmG.add(hs2);
      const ribGeo = new THREE.BoxGeometry(0.012, 0.030, 0.090);
      const ribs = new THREE.InstancedMesh(ribGeo, hsMat, VRM_N);
      for (let i = 0; i < VRM_N; i++) ribs.setMatrixAt(i, m4.makeTranslation(VRM_X0 + i * VRM_STEP, 0.168, VRM_Z + 0.03));
      ribs.instanceMatrix.needsUpdate = true;
      ribs.castShadow = true;
      vrmG.add(ribs);

      // CPU 8pin 供电口（在板子上缘，从电源单独拉一路过来）
      const eps = kit.box(0.16, 0.085, 0.110, kit.mat('plasticDark', { roughness: 0.72 }));
      eps.position.set(EPS.x, 0.043, EPS.z);
      vrmG.add(eps);
      const pinGeo = new THREE.BoxGeometry(0.012, 0.014, 0.012);
      const ep = new THREE.InstancedMesh(pinGeo, kit.mats.gold, 8);
      for (let i = 0; i < 8; i++) ep.setMatrixAt(i, m4.makeTranslation(EPS.x + (i % 4 - 1.5) * 0.030, 0.090, EPS.z + (i < 4 ? -0.022 : 0.022)));
      ep.instanceMatrix.needsUpdate = true;
      vrmG.add(ep);
    }

    /* ============================================================
       8. 后置 I/O 挡板 + 接口
       机箱背后那一排口：USB、网口、HDMI、音频，全都长在主板上。
       ============================================================ */
    const ioG = new THREE.Group();
    ioG.position.set(0, yTop, 0);
    group.add(ioG);
    // 左移量压到 0.075：I/O 挡板本来就贴在板子最左缘（-W/2），再移 0.16 会让整机
    // 拆解态包围盒冲到 1.64（超过 1.6 的尺寸上限）。0.075 既看得出"整块背板被抽出来"，
    // 又保证 t=1 时 x 方向 ≈1.55。
    rig(ioG, -0.075, 0.10, 0);

    {
      const plate = kit.box(0.020, 0.240, 0.680, kit.mat('metalDark', { roughness: 0.42, metalness: 0.68, color: 0x646c74 }));
      plate.position.set(-W / 2 - 0.010, 0.120, 0);
      ioG.add(plate);

      const portMat = kit.mat('plasticDark', { roughness: 0.72, metalness: 0.04 });
      const usbMat = kit.mat('plasticMid', { roughness: 0.70, metalness: 0.04 });
      // 接口摆位：[z 左右, y 高度, 宽, 高, 深, 材质]
      // 挡板本身在局部 y ∈ [0, 0.24]，所有口都落在里面
      const ports = [
        [-0.24, 0.175, 0.020, 0.055, 0.095, usbMat],   // USB-A ×2
        [0.10, 0.175, 0.020, 0.055, 0.095, usbMat],
        [-0.10, 0.175, 0.020, 0.048, 0.080, portMat],  // HDMI
        [0.24, 0.170, 0.022, 0.070, 0.090, portMat],   // 网口 RJ45
        [0.20, 0.080, 0.018, 0.032, 0.045, usbMat],    // Type-C
        [-0.10, 0.080, 0.020, 0.030, 0.055, portMat],  // 音频
        [-0.02, 0.080, 0.020, 0.030, 0.055, portMat],
      ];
      for (const [pz, py, w, h, d, m] of ports) {
        const b = kit.box(w, h, d, m);
        b.position.set(-W / 2 - 0.026, py, pz);
        ioG.add(b);
      }
      // USB / 网口里的金属触点
      const geo = new THREE.BoxGeometry(0.010, 0.008, 0.010);
      const inst = new THREE.InstancedMesh(geo, kit.mats.gold, 16);
      const m4 = new THREE.Matrix4();
      for (let i = 0; i < 16; i++) {
        const z = i < 8 ? -0.24 + (i % 4) * 0.016 - 0.024 : 0.24 + ((i - 8) % 4) * 0.016 - 0.024;
        inst.setMatrixAt(i, m4.makeTranslation(-W / 2 - 0.034, 0.175 + (i % 2 ? 0.012 : -0.012), z));
      }
      inst.instanceMatrix.needsUpdate = true;
      ioG.add(inst);
    }

    /* ============================================================
       9. 24pin 主供电口 + SATA + 前面板插针
       ============================================================ */
    const connMat = kit.mat('plasticDark', { roughness: 0.72, metalness: 0.04 });
    {
      // 24pin：电源最大的一根线插这里
      const p24 = kit.box(0.110, 0.095, 0.420, connMat);
      p24.position.set(P24.x, yTop + 0.048, P24.z);
      group.add(p24);
      const geo = new THREE.BoxGeometry(0.014, 0.012, 0.014);
      const inst = new THREE.InstancedMesh(geo, kit.mats.gold, 24);
      const m4 = new THREE.Matrix4();
      for (let i = 0; i < 24; i++)
        inst.setMatrixAt(i, m4.makeTranslation(P24.x + (i < 12 ? -0.028 : 0.028), yTop + 0.100, P24.z + ((i % 12) - 5.5) * 0.032));
      inst.instanceMatrix.needsUpdate = true;
      group.add(inst);

      // SATA：硬盘数据线，一排 4 个 L 形口
      for (let i = 0; i < 4; i++) {
        const z = 0.14 + i * 0.080;
        const body = kit.box(0.095, 0.052, 0.048, connMat);
        body.position.set(0.655, yTop + 0.026, z);
        group.add(body);
        const lip = kit.box(0.060, 0.026, 0.030, connMat);
        lip.position.set(0.685, yTop + 0.014, z);
        group.add(lip);
      }
      // 前面板插针（开机键、指示灯那一小撮线）
      const fp = kit.box(0.030, 0.024, 0.150, connMat);
      fp.position.set(0.30, yTop + 0.012, 0.50);
      group.add(fp);
      const fpin = new THREE.InstancedMesh(new THREE.BoxGeometry(0.010, 0.012, 0.010), kit.mats.gold, 10);
      const m5 = new THREE.Matrix4();
      for (let i = 0; i < 10; i++) fpin.setMatrixAt(i, m5.makeTranslation(0.30 + (i % 2 ? 0.012 : -0.012), yTop + 0.030, 0.435 + Math.floor(i / 2) * 0.028));
      fpin.instanceMatrix.needsUpdate = true;
      group.add(fpin);

      // CMOS 纽扣电池：断电后靠它保住 BIOS 设置和时间
      const cell = kit.cyl(0.055, 0.055, 0.020, 16, kit.mat('metal', { roughness: 0.30, metalness: 0.92 }));
      cell.position.set(0.52, yTop + 0.012, -0.44);
      group.add(cell);
      const holder = kit.cyl(0.062, 0.062, 0.008, 16, kit.mats.plasticDark);
      holder.position.set(0.52, yTop + 0.004, -0.44);
      group.add(holder);
    }

    /* ============================================================
       10. 走线层 · 板子真正的"内容"
       这一层是主板的核心：从 CPU 出发的线连向内存、显卡、芯片组，
       芯片组再连向 I/O 和 SATA。拆解时整层会被"提"起来悬空，
       说明它们是电气连接，不是装饰。
       ============================================================ */
    const traceG = new THREE.Group();
    group.add(traceG);
    rig(traceG, 0, 0.30, 0);

    const traceMat = kit.glow(hue, 0.55);
    const routes = [];
    const addRoute = (pts) => {
      const t = kit.trace(pts, 0.007, traceMat, 14);
      traceG.add(t);
      routes.push(t);
    };

    // ① CPU → 内存通道（4 条）
    DIMM_X.forEach((dx, i) => addRoute([
      [SOCK.x + SOCK.s / 2 - 0.02, yTr, SOCK.z - 0.14 + i * 0.09],
      [dx - 0.10, yTr, SOCK.z + 0.02 + i * 0.05],
      [dx, yTr, DIMM_Z + DIMM_L / 2 + 0.03],
    ]));
    // ② CPU → PCIe（3 条）
    addRoute([[SOCK.x + 0.10, yTr, SOCK.z + SOCK.s / 2 - 0.02], [-0.14, yTr, 0.14], [-0.10, yTr, PCIE[0].z - 0.03]]);
    addRoute([[SOCK.x + 0.02, yTr, SOCK.z + SOCK.s / 2 - 0.02], [-0.30, yTr, 0.20], [-0.30, yTr, PCIE[0].z - 0.03]]);
    addRoute([[SOCK.x - 0.06, yTr, SOCK.z + SOCK.s / 2 - 0.02], [-0.10, yTr, 0.34], [PCIE[1].x - 0.12, yTr, PCIE[1].z - 0.03]]);
    // ③ 芯片组 → PCIe 短槽 / I/O（芯片组是低速设备的集散地）
    addRoute([[CHIPSET.x - 0.12, yTr, CHIPSET.z + 0.06], [0.40, yTr, 0.22], [PCIE[1].x + 0.16, yTr, PCIE[1].z - 0.03]]);
    addRoute([[CHIPSET.x - 0.06, yTr, CHIPSET.z - 0.12], [0.10, yTr, -0.44], [-W / 2 + 0.06, yTr, -0.30]]);
    // ④ 24pin → VRM：电源先把电送到这里，再分给 CPU
    addRoute([[P24.x, yTr, P24.z + 0.22], [0.50, yTr, -0.40], [VRM_X0 + VRM_N * VRM_STEP - 0.06, yTr, VRM_Z]]);
    addRoute([[P24.x - 0.06, yTr, P24.z + 0.10], [0.02, yTr, -0.30], [VRM_X0 + 0.06, yTr, VRM_Z + 0.06]]);
    // ⑤ CPU → VRM（供电相位就贴在插槽边上）
    addRoute([[SOCK.x - 0.10, yTr, SOCK.z - SOCK.s / 2 - 0.02], [-0.40, yTr, VRM_Z + 0.10], [VRM_X0 + 0.10, yTr, VRM_Z + 0.08]]);

    /* ---------- 信号光点：沿着每一条走线跑 ---------- */
    const flowMat = kit.glow(hue, 2.2);
    const flows = [];
    routes.forEach((line, i) => {
      const d = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 6), flowMat);
      d.userData.line = line;
      d.userData.t = (i * 0.37) % 1;
      d.userData.k = 0.8 + (i % 4) * 0.18;      // 每条线的速度略不同，看起来才像真的并行总线
      traceG.add(d);
      flows.push(d);
    });

    /* ============================================================
       原点归位
       主板是块平板，但立起来的后置 I/O 挡板把几何重心顶高了；
       这里整体平移一次，让"原点 = 包围盒中心"（契约 §1.5）。
       注意：只挪最外层容器，各子系统的 userData.base 不受影响。
       ============================================================ */
    {
      const c = new THREE.Box3().setFromObject(group).getCenter(new THREE.Vector3());
      if (c.lengthSq() > 1e-10) {
        const inner = new THREE.Group();
        inner.position.copy(c).negate();
        for (const child of [...group.children]) inner.add(child);
        group.add(inner);
      }
    }

    /* ============================================================
       拆解 / 动画
       ============================================================ */
    return {
      group,
      legend: [
        { text: 'CPU 插槽', desc: '上千根弹性针脚，把处理器和主板接通' },
        { text: '内存插槽', desc: '直连 CPU 的内存控制器，不绕路' },
        { text: 'PCIe 插槽', desc: '显卡等扩展卡的高速通道' },
        { text: '芯片组', desc: 'USB、硬盘、音频这些慢设备的总集线器' },
        { text: '供电相位阵列', desc: '把 12V 切成一路路降到 1V 出头，喂给 CPU' },
      ],

      /** t: 0 = 合拢，1 = 完全拆解。纯函数，可来回擦洗 */
      setExplode(t) {
        const e = kit.easeInOut(t);

        // 各子系统统一按登记的位移平移
        for (const r of rigs) {
          const b = r.g.userData.base, d = r.d;
          r.g.position.set(b.x + d.x * e, b.y + d.y * e, b.z + d.z * e);
        }

        // 内存插槽：除了整体抬起，还要左右散开，露出它们各自连向 CPU 的走线
        for (const s of dimmSlots) s.position.x = s.userData.baseX * (1 + 0.30 * e);
      },

      /** 持续动画：信号光点沿着走线跑（走线被提起来时光点跟着一起悬空） */
      update(elapsed, dt, emphasis = 0) {
        const spd = 0.26 + emphasis * 0.34;
        for (const f of flows) {
          f.userData.t = (f.userData.t + dt * spd * f.userData.k) % 1;
          f.position.copy(kit.pointOn(f.userData.line, f.userData.t));
          // 两端淡出，避免光点凭空出现/消失
          const edge = Math.min(f.userData.t, 1 - f.userData.t);
          f.visible = edge > 0.04;
        }
      },
    };
  },
};