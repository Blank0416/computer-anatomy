/* ============================================================
   motherboard.js — 主板（ATX 305 × 244 mm）
   ------------------------------------------------------------
   v2 精修（对照 docs/DETAIL-SPEC.md 主板全节）：
     ① 表面：PCB 挂 D.mat.pcb 走线贴图；丝印铭牌（U7 / R12 / J1 / M.2_1 /
        CPU_FAN / DDR5_A1 / SATA6G / AUDIO）；板边贴片阵列 smdField
     ② 细零件：LGA 插座触点阵列 + 压杆 / DDR5 288pin ×4 + 卡扣 /
        PCIe x16（金属加固）+ x4 + x1 / M.2 2280×2 + 2230 短板位 /
        16 相供电（电感 + DrMOS + 固态电容）+ PWM 主控 /
        VRM 与芯片组装甲（斜纹鳍片 + 螺丝）/ 后置 I/O 12 口 /
        24pin + 2×EPS + SATA×4 + 前置面板 + 风扇×4 + ARGB×3 /
        音频屏蔽区 + CR2032 + BIOS 芯片 + 4 颗调试 LED / 9 个铜柱孔
     ③ 倒角：所有大块都走 D.parts.cbox —— 锐边接不住高光，0.4mm 倒角
        就能让轮廓立起来（这也是 gpu.js 的做法）。
   分层（DETAIL-SPEC「主板·分层拆解」5 层）：
     装甲 +0.18 → 插槽/接口 +0.06~0.12 → 板面元件 0 → PCB 本体 0
     → 后置 I/O 挡板沿 −X 抽出
   动画：26 条总线的信号光点 + 调试 LED 自检序列 + 芯片组心跳。
        拆解时走线层整体"提"起来悬空 —— 这是主板最好的教学点：
        板子自己不干活，它只负责让所有东西互相说话。
   ============================================================ */

export default {
  id: 'motherboard',
  name: '主板',
  en: 'Motherboard',
  hue: 0x7fa3a8,

  // 机位相对本元件原点（build 末尾会把原点归到包围盒中心）
  // 从右前上方 31° 俯看：板面布局、厚度、后置 I/O 全在画面里
  focus: { from: [1.60, 1.36, 1.92], look: [0, 0.02, 0], fov: 34 },

  build(kit) {
    const { THREE } = kit;
    const D = kit.detail;
    const group = new THREE.Group();
    const hue = 0x7fa3a8;

    /* ============================================================
       0. 尺寸与布局（1 世界单位 ≈ 210mm，真 ATX 305 × 244）
       ============================================================ */
    const W = 1.44;          // 板宽（X）
    const DP = 1.16;         // 板深（Z）
    const T = 0.030;         // 板厚（1.6mm 实板，为可读性放大）
    const yTop = T / 2;      // 板面高度
    const yTr = 0.006;       // 走线层相对板面的高度

    const SOCK = { x: -0.35, z: -0.16, s: 0.40 };
    const DIMM_X = [0.08, 0.155, 0.23, 0.305];
    const DIMM_Z = -0.17, DIMM_L = 0.66;
    const PCIE = [
      { x: 0.04, z: 0.34, len: 0.80, n: 41, kind: 'x16' },
      { x: 0.30, z: 0.44, len: 0.30, n: 16, kind: 'x4' },
      { x: 0.34, z: 0.54, len: 0.20, n: 10, kind: 'x1' },
    ];
    const M2 = [
      { x: 0.24, z: 0.12, len: 0.44 },   // M.2_1：2280 主位
      { x: 0.16, z: 0.22, len: 0.36 },   // M.2_2：2280 次位
      { x: -0.27, z: 0.10, len: 0.22 },  // M.2_3：2230 短板位
    ];
    const CHIP = { x: 0.50, z: -0.30, s: 0.24 };
    const P24 = { x: 0.665, z: -0.33 };
    const EPS = [{ x: -0.620, z: -0.520 }, { x: -0.480, z: -0.520 }];
    const VRM = { z: -0.500, x0: -0.300, n: 12, step: 0.062, lx: -0.645, lz: -0.300 };

    // 9 个安装孔（ATX 网格：四角 + 两中 + 三点）
    const HOLES = [
      [-0.68, -0.50], [0.68, -0.50], [-0.68, 0.50], [0.68, 0.50],
      [-0.68, 0.06], [0.68, 0.06], [-0.10, -0.02], [0.44, -0.06], [-0.14, 0.50],
    ];

    /* ---------- 可拆解子系统登记表 ----------
       每个子系统 = 一个 Group：登记基准位 + 拆解位移。setExplode 完全由 t 现算 */
    const rigs = [];
    const rig = (g, dx, dy, dz) => {
      g.userData.base = g.position.clone();
      rigs.push({ g, d: new THREE.Vector3(dx, dy, dz) });
      return g;
    };

    /* ============================================================
       材质包（全部来自 kit / detail，不新建任何 *Material 之外的材质；
       贴纸类走 MeshBasicMaterial，同 gpu.js）
       ============================================================ */
    const M = {
      pcb: D.mat.pcb('#101215'),
      armor: D.mat.brushed(0x2b2e33, { rough: 0.42, metal: 0.60, repeat: 2.4 }),
      armor2: D.mat.brushed(0x363a41, { rough: 0.36, metal: 0.66, repeat: 3 }),
      slot: D.mat.grain(0x16171b, { rough: 0.72, bump: 0.55 }),
      slot2: D.mat.grain(0x24272c, { rough: 0.62, bump: 0.40 }),
      steel: D.mat.brushed(0x9aa0a6, { rough: 0.32, metal: 0.80, repeat: 2.2 }),
      nickel: kit.mat('metal', { color: 0xb9bdc2, roughness: 0.30, metalness: 0.90 }),
      alu: kit.mat('metal', { color: 0x8b9197, roughness: 0.40, metalness: 0.72 }),
      copper: kit.mat('copper', { roughness: 0.30, metalness: 0.86 }),
      gold: kit.mats.gold,
      ceramic: kit.mats.ceramic,
      silicon: kit.mat('silicon', { roughness: 0.32, metalness: 0.14 }),
      capAlu: kit.mat('metal', { color: 0x3d4248, roughness: 0.35, metalness: 0.85 }),
      black: kit.mat('plasticDark', { color: 0x141518, roughness: 0.70 }),
      pad: kit.mat('plastic', { color: 0x9fb4c0, roughness: 0.90, metalness: 0.0 }),
    };
    // 插槽卡扣：偏 hue 的识别色（低饱和，只用在卡扣这种小件上）
    const clipMat = kit.tint(kit.accent(hue, -0.20), { rough: 0.68, metal: 0.06 });

    const cbox = (w, h, d, mat, bevel = 0.005, r = 0.012) => D.parts.cbox(w, h, d, mat, bevel, r);

    /* 丝印铭牌（贴片式平面，走 MeshBasicMaterial 才像油墨；纯 Node 下降级为无贴图） */
    const decal = (lines, w, h, o = {}) => {
      const mat = new THREE.MeshBasicMaterial({
        map: D.tex.plate(lines, { w: 512, h: 128, ink: '#d8d8cf', ...o }),
        transparent: true, opacity: o.opacity ?? 0.5,
        depthWrite: false, toneMapped: true, side: THREE.DoubleSide,
      });
      return new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    };
    const silk = (lines, x, z, w, h, rotZ = 0, o = {}) => {
      const m = decal(lines, w, h, o);
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = rotZ;
      m.position.set(x, yTop + 0.0012, z);
      return m;
    };

    /* ============================================================
       1. PCB 基板（圆角 + 边倒角）+ 安装孔 + 贴片阵列 + 丝印
       ============================================================ */
    const boardG = new THREE.Group();
    group.add(boardG);

    const board = cbox(W, T, DP, M.pcb, 0.004, 0.010);
    boardG.add(board);

    // 9 个安装孔：铜环（铜柱接触面）+ 深色孔位
    for (const [hx, hz] of HOLES) {
      const ring = kit.cyl(0.029, 0.029, T + 0.002, 12, M.copper);
      ring.position.set(hx, 0, hz);
      boardG.add(ring);
      const hole = kit.cyl(0.016, 0.016, T + 0.005, 10, M.black);
      hole.position.set(hx, 0, hz);
      boardG.add(hole);
    }

    // 板边贴片元件阵列（看起来"电路很密"的关键，重复件一律 InstancedMesh）
    const smd = (n, x0, x1, z0, z1, seed) => {
      const f = D.parts.smdField(n, { w: 0.010, h: 0.006, d: 0.006 }, M.ceramic);
      f.userData.fill(x0, x1, z0, z1, yTop + 0.003, seed);
      boardG.add(f);
    };
    smd(110, -0.68, -0.42, 0.04, 0.26, 0x21);   // CPU 左侧、音频区上方
    smd(90, 0.50, 0.64, -0.16, 0.06, 0x37);     // 右中（24pin 与 SATA 之间）
    smd(70, -0.62, -0.40, 0.06, 0.20, 0x55);    // 左下单排

    // 丝印：元件位号 / 接口名（真实主板上最显眼的"信息层"）
    boardG.add(silk(['U7  R12  C48'], -0.02, -0.32, 0.22, 0.055, 0, { opacity: 0.42 }));
    boardG.add(silk(['DDR5_A1'], 0.043, -0.30, 0.13, 0.048, Math.PI / 2, { opacity: 0.5 }));
    boardG.add(silk(['M.2_1'], 0.24, 0.055, 0.11, 0.04, 0, { opacity: 0.5 }));
    boardG.add(silk(['M.2_2'], 0.10, 0.285, 0.10, 0.038, 0, { opacity: 0.42 }));
    boardG.add(silk(['PCIEX16_1'], 0.10, 0.300, 0.20, 0.045, 0, { opacity: 0.45 }));
    boardG.add(silk(['CPU_FAN'], -0.30, -0.435, 0.15, 0.042, 0, { opacity: 0.42 }));
    boardG.add(silk(['SATA6G'], 0.620, 0.045, 0.12, 0.040, Math.PI / 2, { opacity: 0.40 }));
    boardG.add(silk(['AUDIO'], -0.50, 0.335, 0.12, 0.038, 0, { opacity: 0.36 }));

    /* ============================================================
       2. CPU 插槽（LGA：底座 + 触点阵列 + 压杆 + 钢框）
       一平方厘米上挤着一千多根弹性针脚 —— 触点阵列必须用 InstancedMesh，
       真做 1851 根直接爆面数
       ============================================================ */
    const sockG = new THREE.Group();
    sockG.position.set(SOCK.x, yTop, SOCK.z);
    group.add(sockG);
    rig(sockG, 0, 0.12, 0);

    {
      const S = SOCK.s;
      // 塑料底座（中间留空给触点）
      const base = cbox(S, 0.018, S, M.slot, 0.003, 0.008);
      base.position.y = 0.009;
      sockG.add(base);

      // 触点阵列 20 × 20（真 LGA1851 有 1851 根，这里按"密度可见"取舍）
      const N = 20, field = S - 0.10, sp = field / (N - 1);
      const pins = new THREE.InstancedMesh(new THREE.BoxGeometry(0.008, 0.006, 0.008), M.gold, N * N);
      const m4 = new THREE.Matrix4();
      let n = 0;
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          pins.setMatrixAt(n++, m4.makeTranslation((i - (N - 1) / 2) * sp, 0.020, (j - (N - 1) / 2) * sp));
        }
      }
      pins.instanceMatrix.needsUpdate = true;
      pins.castShadow = pins.receiveShadow = true;
      sockG.add(pins);

      // 钢制压框（四根薄条，中间留窗露出触点）
      const bar = 0.046;
      const frameMat = M.steel;
      for (const [w, d, px, pz] of [
        [S, bar, 0, S / 2 - bar / 2],
        [S, bar, 0, -S / 2 + bar / 2],
        [bar, S - bar * 2, S / 2 - bar / 2, 0],
        [bar, S - bar * 2, -S / 2 + bar / 2, 0],
      ]) {
        const b = cbox(w, 0.026, d, frameMat, 0.003, 0.006);
        b.position.set(px, 0.052, pz);
        sockG.add(b);
      }
      // 压框铰链（后侧两根小立柱）
      for (const sx of [-1, 1]) {
        const hinge = kit.cyl(0.010, 0.010, 0.034, 8, M.steel);
        hinge.rotation.x = Math.PI / 2;
        hinge.position.set(sx * (S / 2 - 0.02), 0.050, -S / 2 + 0.004);
        sockG.add(hinge);
      }

      // 压杆（load lever）：扣下去把处理器压紧
      const lever = kit.cyl(0.008, 0.008, S + 0.045, 8, M.nickel);
      lever.rotation.z = Math.PI / 2;
      lever.position.set(0, 0.072, -S / 2 - 0.020);
      sockG.add(lever);
      const arm = kit.box(0.016, 0.010, 0.072, M.nickel);
      arm.position.set(-S / 2 - 0.020, 0.072, -S / 2 + 0.014);
      sockG.add(arm);

      // 金色三角：第一根针在哪个角
      const mark = kit.box(0.024, 0.003, 0.024, M.gold);
      mark.position.set(-S / 2 + 0.030, 0.030, -S / 2 + 0.030);
      sockG.add(mark);
    }

    /* ============================================================
       3. 内存插槽 ×4（DDR5 288pin：槽壳 + 卡扣 + 触点阵列）
       插槽里的金手指直连 CPU 内存控制器 —— 所以这四条一定离 CPU 最近
       ============================================================ */
    const dimmG = new THREE.Group();
    dimmG.position.set(0, yTop, 0);
    group.add(dimmG);
    rig(dimmG, 0, 0.16, 0);

    const dimmSlots = [];
    for (const sx of DIMM_X) {
      const slot = new THREE.Group();
      slot.position.set(sx, 0, DIMM_Z);
      slot.userData.baseX = sx;
      dimmG.add(slot);
      dimmSlots.push(slot);

      const body = cbox(0.028, 0.084, DIMM_L, M.slot, 0.003, 0.006);
      body.position.y = 0.042;
      slot.add(body);

      // 两端卡扣（按下去锁住内存条；也是这条件的识别色）
      for (const sz of [DIMM_L / 2 + 0.016, -DIMM_L / 2 - 0.016]) {
        const clip = cbox(0.034, 0.070, 0.026, clipMat, 0.003, 0.010);
        clip.position.set(0, 0.036, sz);
        slot.add(clip);
        const tooth = kit.box(0.020, 0.012, 0.010, M.black);
        tooth.position.set(0, 0.064, sz - Math.sign(sz) * 0.012);
        slot.add(tooth);
      }

      // 288pin 触点（DDR5 双面各 144 根，这里用一排 InstancedMesh 表现密度）
      const contact = D.parts.pinRow(80, (DIMM_L - 0.10) / 79, { w: 0.0055, h: 0.012, d: 0.010 }, M.gold);
      contact.rotation.y = Math.PI / 2;
      contact.position.y = 0.072;
      slot.add(contact);

      // 插槽端头的防呆缺口标记
      const key = kit.box(0.030, 0.004, 0.012, M.ceramic);
      key.position.set(0, 0.085, DIMM_L / 2 - 0.10);
      slot.add(key);
    }

    /* ============================================================
       4. PCIe 插槽（x16 金属加固 + x4 + x1）
       最长的 x16 直连 CPU（显卡专用），短的绕去芯片组
       ============================================================ */
    const pcieG = new THREE.Group();
    pcieG.position.set(0, yTop, 0);
    group.add(pcieG);
    rig(pcieG, 0, 0.10, 0);

    for (const s of PCIE) {
      // 塑料槽体
      const body = cbox(s.len, 0.066, 0.026, M.slot, 0.003, 0.005);
      body.position.set(s.x, 0.037, s.z);
      pcieG.add(body);

      if (s.kind === 'x16') {
        // 金属加固：底板 + 两端金属壳（真 x16 外面包着一层钢皮）
        const plate = cbox(s.len + 0.026, 0.012, 0.042, M.steel, 0.003, 0.006);
        plate.position.set(s.x, 0.006, s.z);
        pcieG.add(plate);
        for (const sx of [-1, 1]) {
          const cap = cbox(0.016, 0.076, 0.042, M.steel, 0.003, 0.006);
          cap.position.set(s.x + sx * (s.len / 2 + 0.005), 0.040, s.z);
          pcieG.add(cap);
        }
        // 尾部卡扣（显卡防脱）
        const latch = cbox(0.030, 0.048, 0.030, M.slot2, 0.003, 0.008);
        latch.position.set(s.x - s.len / 2 - 0.030, 0.030, s.z);
        pcieG.add(latch);
      } else {
        // 短槽：两端小挡块
        for (const sx of [-1, 1]) {
          const cap = kit.box(0.012, 0.062, 0.038, M.slot2);
          cap.position.set(s.x + sx * (s.len / 2 + 0.006), 0.032, s.z);
          pcieG.add(cap);
        }
      }

      // 金手指触点（沿 X 排）
      const pitch = (s.len - 0.10) / (s.n - 1);
      const pins = D.parts.pinRow(s.n, pitch, { w: 0.008, h: 0.012, d: 0.042 }, M.gold);
      pins.position.set(s.x, 0.064, s.z);
      pcieG.add(pins);
    }

    /* ============================================================
       5. M.2 插槽 ×3（2280 ×2 + 2230 短板位）
       贴着板子躺的固态硬盘位：连接器 + 铜柱 + M2 螺丝
       ============================================================ */
    const m2G = new THREE.Group();
    m2G.position.set(0, yTop, 0);
    group.add(m2G);
    rig(m2G, 0, 0.08, 0);

    for (const m of M2) {
      // 连接器（M key 缺口用两块错开的壳拼出来）
      const conn = cbox(0.024, 0.014, 0.105, M.slot, 0.003, 0.004);
      conn.position.set(m.x - m.len / 2 + 0.012, 0.007, m.z);
      m2G.add(conn);
      const keyGap = kit.box(0.026, 0.016, 0.014, M.black);
      keyGap.position.set(m.x - m.len / 2 + 0.012, 0.008, m.z + 0.020);
      m2G.add(keyGap);

      // 槽轨（画一条细线表示 22mm 宽的插槽）
      const rail = kit.box(m.len - 0.02, 0.004, 0.020, M.slot2);
      rail.position.set(m.x, 0.003, m.z);
      m2G.add(rail);

      // 尾端铜柱 + M2×3 螺丝
      const post = kit.cyl(0.013, 0.013, 0.012, 10, M.copper);
      post.position.set(m.x + m.len / 2 - 0.008, 0.006, m.z);
      m2G.add(post);
      const sc = D.parts.screw(0.012, 0.005);
      sc.position.set(m.x + m.len / 2 - 0.008, 0.014, m.z);
      m2G.add(sc);
    }

    /* ============================================================
       6. 芯片组（PCH）
       管 USB / SATA / 音频 / 网卡这些"慢"设备，主板的交通枢纽。
       这里只放裸 die + 周边小件，装甲在上面的 armorG
       ============================================================ */
    const chipG = new THREE.Group();
    chipG.position.set(CHIP.x, yTop, CHIP.z);
    group.add(chipG);
    rig(chipG, 0, 0.09, 0);

    let chipLedMat;
    {
      const S = CHIP.s;
      const die = cbox(S * 0.52, 0.012, S * 0.52, M.silicon, 0.003, 0.008);
      die.position.y = 0.008;
      chipG.add(die);
      // die 四周的围胶
      for (const [dx, dz, w, d] of [
        [0, S * 0.30, S * 0.60, 0.020], [0, -S * 0.30, S * 0.60, 0.020],
        [S * 0.30, 0, 0.020, S * 0.60], [-S * 0.30, 0, 0.020, S * 0.60],
      ]) {
        const ring = kit.box(w, 0.008, d, M.black);
        ring.position.set(dx, 0.010, dz);
        chipG.add(ring);
      }
      // 芯片组心跳灯（hue 标识色；材质 clone 出来单独调亮度）
      chipLedMat = kit.glow(hue, 0.9).clone();
      const led = kit.dot(S * 0.36, 0.012, S * 0.36, chipLedMat, 0.010);
      chipG.add(led);
    }

    /* ============================================================
       7. 供电（16 相：电感 + DrMOS + 固态电容 + PWM 主控）
       主板把电源的 12V 在这里切成一路路、降到 1V 出头喂给 CPU。
       一个"相位"= 一颗电感 + 一排电容；相数越多，电压越稳
       ============================================================ */
    const vrmG = new THREE.Group();
    vrmG.position.set(0, yTop, 0);
    group.add(vrmG);
    rig(vrmG, 0, 0.14, 0);

    const phases = [];
    for (let i = 0; i < VRM.n; i++) phases.push([VRM.x0 + i * VRM.step, VRM.z]);           // 上缘横排 12 相
    for (let i = 0; i < 4; i++) phases.push([VRM.lx, VRM.lz + i * 0.075]);                 // 插槽左侧竖排 4 相

    for (let k = 0; k < phases.length; k++) {
      const [px, pz] = phases[k];
      const ind = D.parts.inductor(0.052, 0.048, 0.052);
      ind.position.set(px, 0.026, pz);
      vrmG.add(ind);

      // DrMOS：贴在电感内侧（上桥 + 下桥合封成一颗）
      const isTop = k < VRM.n;
      const fet = kit.box(0.034, 0.010, 0.040, M.steel);
      fet.position.set(isTop ? px : px + 0.056, 0.006, isTop ? pz + 0.052 : pz);
      vrmG.add(fet);
      const fet2 = kit.box(0.030, 0.008, 0.020, M.black);
      fet2.position.set(isTop ? px : px + 0.056, 0.010, isTop ? pz + 0.052 : pz + (isTop ? 0.024 : 0));
      vrmG.add(fet2);
    }

    // 固态电容（Ø8：顶部十字防爆槽由 parts.capacitor 自带顶盖）
    const caps = [];
    for (let i = 0; i < 6; i++) caps.push([-0.20 + i * 0.062, -0.398]);   // 上排
    for (let i = 0; i < 4; i++) caps.push([-0.600, 0.020 + i * 0.038]);   // 左列
    for (let i = 0; i < 3; i++) caps.push([-0.560 + i * 0.058, 0.100]);   // 插槽下方
    for (const [cx, cz] of caps) {
      const cap = D.parts.capacitor(0.017, 0.034, 0x3d4248);
      cap.position.set(cx, 0.017, cz);
      vrmG.add(cap);
    }

    // PWM 主控
    const pwm = cbox(0.060, 0.010, 0.050, M.black, 0.002, 0.004);
    pwm.position.set(0.255, 0.006, -0.398);
    vrmG.add(pwm);
    const pwmPin = new THREE.InstancedMesh(new THREE.BoxGeometry(0.004, 0.002, 0.004), M.gold, 12);
    {
      const m4 = new THREE.Matrix4();
      for (let i = 0; i < 12; i++) {
        pwmPin.setMatrixAt(i, m4.makeTranslation(0.255 + ((i % 6) - 2.5) * 0.008, 0.010, -0.398 + (i < 6 ? 0.012 : -0.012)));
      }
      pwmPin.instanceMatrix.needsUpdate = true;
      vrmG.add(pwmPin);
    }

    /* ============================================================
       8. 后置 I/O 挡板 + 12 个接口
       机箱背后那一排口：USB / HDMI / DP / RJ45 / 音频，全都长在主板上。
       ATX 规定这块是 158.75 × 44.45 mm
       ============================================================ */
    const ioG = new THREE.Group();
    ioG.position.set(0, yTop, 0);
    group.add(ioG);
    rig(ioG, -0.130, 0.020, 0);

    {
      // 挡板（158.75 × 44.45 缩放后 ≈ 0.78 × 0.215）—— 所有口都开在它上面
      const plate = cbox(0.020, 0.215, 0.780, M.steel, 0.003, 0.010);
      plate.position.set(-0.735, 0.108, -0.020);
      ioG.add(plate);
      const px = -0.746;   // 挡板内侧（口从这里向外伸出）

      // USB-A ×4
      const usb = (z, y) => {
        const shell = cbox(0.048, 0.030, 0.058, M.steel, 0.002, 0.004);
        shell.position.set(px, y, z);
        ioG.add(shell);
        const mouth = kit.box(0.030, 0.020, 0.044, M.black);
        mouth.position.set(px - 0.016, y, z);
        ioG.add(mouth);
        const tongue = kit.box(0.026, 0.003, 0.036, M.ceramic);
        tongue.position.set(px - 0.008, y + 0.006, z);
        ioG.add(tongue);
      };
      usb(-0.340, 0.158);
      usb(-0.285, 0.158);
      usb(0.255, 0.158);
      usb(0.310, 0.158);

      // USB-C ×2（用通用 port() 的 type-c 分支，开口朝 -X 需转 180°）
      const portAt = (kind, z, y, w, h) => {
        const p = D.parts.port(kind, { w, h });
        p.rotation.y = Math.PI;
        p.position.set(px - 0.010, y, z);
        ioG.add(p);
      };
      portAt('type-c', -0.205, 0.160, 0.070, 0.030);
      portAt('type-c', -0.205, 0.092, 0.070, 0.030);

      // HDMI + DP（显示输出）
      portAt('hdmi', -0.095, 0.158, 0.150, 0.062);
      portAt('dp', -0.010, 0.158, 0.140, 0.064);

      // RJ45 网口
      const rj = cbox(0.050, 0.046, 0.058, M.steel, 0.003, 0.006);
      rj.position.set(px, 0.158, 0.115);
      ioG.add(rj);
      const rjMouth = kit.box(0.026, 0.032, 0.044, M.black);
      rjMouth.position.set(px - 0.018, 0.160, 0.115);
      ioG.add(rjMouth);
      const rjPins = new THREE.InstancedMesh(new THREE.BoxGeometry(0.010, 0.003, 0.004), M.gold, 8);
      {
        const m4 = new THREE.Matrix4();
        for (let i = 0; i < 8; i++) rjPins.setMatrixAt(i, m4.makeTranslation(px - 0.026, 0.176, 0.115 + ((i % 4) - 1.5) * 0.010));
      }
      rjPins.instanceMatrix.needsUpdate = true;
      ioG.add(rjPins);
      // 网口的 link 指示灯 ×2
      for (const dz of [-0.016, 0.016]) {
        const led = kit.box(0.006, 0.004, 0.006, kit.glow(0x6f9a76, 0.8));
        led.position.set(px - 0.022, 0.138, 0.115 + dz);
        ioG.add(led);
      }

      // 音频：3 个 Ø3.5 圆孔 + 光纤方口
      const jack = (z, y) => {
        const c = kit.cyl(0.017, 0.017, 0.036, 12, M.black);
        c.rotation.z = Math.PI / 2;
        c.position.set(px - 0.010, y, z);
        ioG.add(c);
        const bore = kit.cyl(0.009, 0.009, 0.040, 10, M.alu);
        bore.rotation.z = Math.PI / 2;
        bore.position.set(px - 0.012, y, z);
        ioG.add(bore);
      };
      jack(-0.360, 0.070);
      jack(-0.310, 0.070);
      jack(-0.260, 0.070);
      const opt = kit.box(0.026, 0.020, 0.026, M.black);
      opt.position.set(px - 0.006, 0.070, -0.205);
      ioG.add(opt);

      // 挡板固定螺丝 ×2
      for (const z of [-0.380, 0.340]) {
        const sc = D.parts.screw(0.013, 0.006);
        sc.position.set(-0.746, 0.208, z);
        ioG.add(sc);
      }
    }

    /* ============================================================
       9. 板边接口：24pin / 2×EPS / SATA×4 / 前置面板 / 风扇 / ARGB
       板边是"整块板最容易做糊"的地方 —— 这里全部做成
       "黑壳 + 露出金针"的统一语言
       ============================================================ */
    const connG = new THREE.Group();
    connG.position.set(0, yTop, 0);
    group.add(connG);
    rig(connG, 0, 0.07, 0);

    {
      // ---- 24pin ATX 主供电（2×12，4.2mm 间距）----
      const shell = cbox(0.046, 0.048, 0.250, M.slot, 0.003, 0.006);
      shell.position.set(P24.x, 0.024, P24.z);
      connG.add(shell);
      const p24 = new THREE.InstancedMesh(new THREE.BoxGeometry(0.010, 0.010, 0.012), M.gold, 24);
      {
        const m4 = new THREE.Matrix4();
        for (let i = 0; i < 24; i++) {
          p24.setMatrixAt(i, m4.makeTranslation(
            P24.x + (i < 12 ? -0.013 : 0.013),
            0.049,
            P24.z + ((i % 12) - 5.5) * 0.020,
          ));
        }
      }
      p24.instanceMatrix.needsUpdate = true;
      connG.add(p24);
      // 卡扣（线插上后按下去锁住）
      const latch = kit.box(0.010, 0.014, 0.020, M.slot2);
      latch.position.set(P24.x + 0.026, 0.040, P24.z);
      connG.add(latch);

      // ---- EPS 8pin ×2（CPU 供电，2×4）----
      for (const e of EPS) {
        const body = cbox(0.105, 0.048, 0.055, M.slot, 0.003, 0.005);
        body.position.set(e.x, 0.024, e.z);
        connG.add(body);
        const ep = new THREE.InstancedMesh(new THREE.BoxGeometry(0.010, 0.010, 0.010), M.gold, 8);
        const m4 = new THREE.Matrix4();
        for (let i = 0; i < 8; i++) {
          ep.setMatrixAt(i, m4.makeTranslation(
            e.x + ((i % 4) - 1.5) * 0.020,
            0.049,
            e.z + (i < 4 ? -0.012 : 0.012),
          ));
        }
        ep.instanceMatrix.needsUpdate = true;
        connG.add(ep);
      }

      // ---- SATA ×4（硬盘数据线）----
      for (let i = 0; i < 4; i++) {
        const z = 0.120 + i * 0.070;
        const body = cbox(0.070, 0.050, 0.042, M.slot, 0.003, 0.005);
        body.position.set(0.676, 0.025, z);
        connG.add(body);
        const lip = kit.box(0.026, 0.046, 0.030, M.slot2);
        lip.position.set(0.706, 0.024, z);
        connG.add(lip);
        const inner = kit.box(0.008, 0.016, 0.026, M.gold);
        inner.position.set(0.694, 0.028, z);
        connG.add(inner);
      }

      // ---- 前置面板排针（开机键 / 指示灯那一小撮线）----
      const fp = cbox(0.140, 0.024, 0.028, M.slot, 0.002, 0.004);
      fp.position.set(-0.160, 0.013, 0.545);
      connG.add(fp);
      const fpin = new THREE.InstancedMesh(new THREE.BoxGeometry(0.008, 0.012, 0.008), M.gold, 10);
      {
        const m4 = new THREE.Matrix4();
        for (let i = 0; i < 10; i++) {
          fpin.setMatrixAt(i, m4.makeTranslation(-0.160 + ((i % 5) - 2) * 0.018, 0.028, 0.545 + (i < 5 ? -0.006 : 0.006)));
        }
      }
      fpin.instanceMatrix.needsUpdate = true;
      connG.add(fpin);

      // ---- 风扇 4-pin ×4 + ARGB 3-pin ×3 ----
      const header = (x, z, rotY, pins, pinMat) => {
        const h = new THREE.Group();
        h.position.set(x, 0, z);
        h.rotation.y = rotY;
        const body = cbox(0.040, 0.024, 0.026, M.slot, 0.002, 0.004);
        body.position.y = 0.013;
        h.add(body);
        const pr = new THREE.InstancedMesh(new THREE.BoxGeometry(0.006, 0.010, 0.006), pinMat, pins);
        const m4 = new THREE.Matrix4();
        for (let i = 0; i < pins; i++) pr.setMatrixAt(i, m4.makeTranslation((i - (pins - 1) / 2) * 0.010, 0.030, 0));
        pr.instanceMatrix.needsUpdate = true;
        h.add(pr);
        connG.add(h);
      };
      header(0.500, -0.520, 0, 4, M.gold);            // 上缘（接 CPU 风扇）
      header(-0.680, -0.220, Math.PI / 2, 4, M.gold); // 左缘
      header(0.660, -0.100, -Math.PI / 2, 4, M.gold); // 右缘
      header(-0.400, 0.545, 0, 4, M.gold);            // 下缘
      header(0.560, -0.520, 0, 3, M.ceramic);         // ARGB
      header(-0.300, -0.060, 0, 3, M.ceramic);
      header(0.100, 0.545, 0, 3, M.ceramic);
    }

    /* ============================================================
       10. 板面小件：音频屏蔽区 + CR2032 + BIOS + 调试 LED
       ============================================================ */
    const miscG = new THREE.Group();
    miscG.position.set(0, yTop, 0);
    group.add(miscG);
    rig(miscG, 0, 0.05, 0);

    // ---- 音频区（高端板的标志：屏蔽罩 + 金色音频电容）----
    const audioShield = cbox(0.260, 0.016, 0.180, M.alu, 0.004, 0.014);
    audioShield.position.set(-0.520, 0.008, 0.420);
    miscG.add(audioShield);
    for (let i = 0; i < 3; i++) {
      const gold = kit.cyl(0.021, 0.021, 0.020, 14, M.gold);
      gold.position.set(-0.400, 0.010, 0.350 + i * 0.050);
      miscG.add(gold);
    }
    const audioLine = kit.box(0.004, 0.003, 0.180, M.ceramic);
    audioLine.position.set(-0.652, 0.004, 0.420);
    miscG.add(audioLine);

    // ---- CMOS 纽扣电池（CR2032：断电后靠它保住 BIOS 设置和时间）----
    const holder = cbox(0.128, 0.008, 0.128, M.black, 0.003, 0.020);
    holder.position.set(0.580, 0.004, 0.440);
    miscG.add(holder);
    const cell = kit.cyl(0.055, 0.055, 0.018, 18, M.alu);
    cell.position.set(0.580, 0.017, 0.440);
    miscG.add(cell);
    const clip = kit.box(0.090, 0.006, 0.014, M.steel);
    clip.position.set(0.580, 0.026, 0.500);
    miscG.add(clip);

    // ---- BIOS 闪存芯片（双 BIOS 是高端板的常见配置，这里做一颗 + 一颗备用）----
    const bios = cbox(0.055, 0.010, 0.040, M.black, 0.002, 0.004);
    bios.position.set(0.280, 0.006, -0.080);
    miscG.add(bios);
    for (let i = 0; i < 4; i++) {
      const leg = kit.box(0.006, 0.003, 0.004, M.gold);
      leg.position.set(0.256 + i * 0.016, 0.011, -0.080);
      miscG.add(leg);
    }

    // ---- 4 颗调试 LED（Q-LED：自检时依次点亮，故障停机在对应那颗）----
    const ledMats = [];
    const LED_COLORS = [0xb5655c, 0xbfae7a, 0xd8d8cf, 0x7fa88a];
    for (let i = 0; i < 4; i++) {
      const mat = kit.glow(LED_COLORS[i], 0.25).clone();
      ledMats.push(mat);
      const d = kit.dot(0.300 + i * 0.024, 0.008, -0.415, mat, 0.007);
      miscG.add(d);
    }

    /* ============================================================
       11. 散热装甲层（VRM 上下盖 + 芯片组盖 + M.2 三块盖板）
       DETAIL-SPEC 分层里的第 1 层，拆解时抬得最高
       ============================================================ */
    const armorG = new THREE.Group();
    armorG.position.set(0, yTop, 0);
    group.add(armorG);
    rig(armorG, 0, 0.18, 0);

    {
      // ---- VRM 上缘装甲（12 相上方）：底座 + 鳍片 + 螺丝 ----
      const padTop = kit.box(0.740, 0.006, 0.098, M.pad);
      padTop.position.set(0.040, 0.052, -0.500);
      armorG.add(padTop);
      const top = cbox(0.770, 0.062, 0.115, M.armor, 0.006, 0.016);
      top.position.set(0.040, 0.086, -0.500);
      armorG.add(top);
      const fins = new THREE.InstancedMesh(new THREE.BoxGeometry(0.006, 0.026, 0.100), M.armor2, 14);
      {
        const m4 = new THREE.Matrix4();
        for (let i = 0; i < 14; i++) fins.setMatrixAt(i, m4.makeTranslation(-0.340 + i * 0.0585, 0.114, -0.500));
      }
      fins.instanceMatrix.needsUpdate = true;
      fins.castShadow = fins.receiveShadow = true;
      armorG.add(fins);
      // 装甲上的斜切棱（让高光有"转折"）
      const bevelStrip = kit.box(0.740, 0.008, 0.010, M.armor2);
      bevelStrip.position.set(0.040, 0.120, -0.446);
      armorG.add(bevelStrip);

      // ---- VRM 左侧装甲（4 相上方）----
      const padL = kit.box(0.090, 0.006, 0.290, M.pad);
      padL.position.set(-0.645, 0.052, -0.188);
      armorG.add(padL);
      const left = cbox(0.120, 0.062, 0.315, M.armor, 0.006, 0.014);
      left.position.set(-0.645, 0.086, -0.188);
      armorG.add(left);
      const finsL = new THREE.InstancedMesh(new THREE.BoxGeometry(0.100, 0.026, 0.005), M.armor2, 6);
      {
        const m4 = new THREE.Matrix4();
        for (let i = 0; i < 6; i++) finsL.setMatrixAt(i, m4.makeTranslation(-0.645, 0.114, -0.320 + i * 0.052));
      }
      finsL.instanceMatrix.needsUpdate = true;
      finsL.castShadow = finsL.receiveShadow = true;
      armorG.add(finsL);

      // ---- 芯片组装甲（斜纹鳍 6 条 + 两颗螺丝 + hue 灯线）----
      const chipCover = cbox(CHIP.s, 0.040, CHIP.s, M.armor, 0.006, 0.020);
      chipCover.position.set(CHIP.x, 0.040, CHIP.z);
      armorG.add(chipCover);
      const diag = new THREE.InstancedMesh(new THREE.BoxGeometry(0.180, 0.012, 0.010), M.armor2, 6);
      {
        const dmy = new THREE.Object3D();
        const m4 = new THREE.Matrix4();
        for (let i = 0; i < 6; i++) {
          dmy.position.set(CHIP.x, 0.064, CHIP.z - 0.075 + i * 0.030);
          dmy.rotation.set(0, 0.55, 0);
          dmy.updateMatrix();
          m4.copy(dmy.matrix);
          diag.setMatrixAt(i, m4);
        }
      }
      diag.instanceMatrix.needsUpdate = true;
      diag.castShadow = diag.receiveShadow = true;
      armorG.add(diag);
      const chipGlow = kit.box(0.150, 0.004, 0.005, kit.glow(hue, 0.9));
      chipGlow.position.set(CHIP.x, 0.062, CHIP.z + 0.108);
      armorG.add(chipGlow);

      // ---- M.2 盖板 ×3（薄铝板 + 鳍 + 尾端螺丝）----
      for (const m of M2) {
        const cover = cbox(m.len * 0.92, 0.024, 0.100, M.armor, 0.004, 0.012);
        cover.position.set(m.x, 0.022, m.z);
        armorG.add(cover);
        const f = new THREE.InstancedMesh(new THREE.BoxGeometry(0.005, 0.014, 0.086), M.armor2, 6);
        {
          const m4 = new THREE.Matrix4();
          for (let i = 0; i < 6; i++) f.setMatrixAt(i, m4.makeTranslation(m.x - m.len * 0.42 + i * (m.len * 0.84 / 5), 0.040, m.z));
        }
        f.instanceMatrix.needsUpdate = true;
        f.castShadow = f.receiveShadow = true;
        armorG.add(f);
        const sc = D.parts.screw(0.011, 0.005);
        sc.position.set(m.x + m.len / 2 - 0.014, 0.036, m.z);
        armorG.add(sc);
      }

      // 装甲固定螺丝（VRM 上缘 ×3、左侧 ×2）
      for (const sx of [-0.320, 0.040, 0.400]) {
        const sc = D.parts.screw(0.011, 0.005);
        sc.position.set(sx, 0.120, -0.552);
        armorG.add(sc);
      }
      for (const sz of [-0.320, -0.040]) {
        const sc = D.parts.screw(0.011, 0.005);
        sc.position.set(-0.700, 0.120, sz);
        armorG.add(sc);
      }
      for (const dx of [-1, 1]) {
        const sc = D.parts.screw(0.010, 0.005);
        sc.position.set(CHIP.x + dx * 0.098, 0.062, CHIP.z - 0.098);
        armorG.add(sc);
      }
    }

    /* ============================================================
       12. 走线层 · 板子真正的"内容"
       CPU 出发的线连向内存、显卡、芯片组，芯片组再连向 I/O 与 SATA。
       拆解时整层被"提"起来悬空 —— 说明它们是电气连接，不是装饰。
       ============================================================ */
    const traceG = new THREE.Group();
    traceG.position.set(0, yTop, 0);
    group.add(traceG);
    rig(traceG, 0, 0.26, 0);

    const traceMat = kit.glow(hue, 0.5);
    const routes = [];
    const addRoute = (pts) => {
      const line = kit.trace(pts, 0.006, traceMat, 10);
      traceG.add(line);
      routes.push(line);
    };
    const y = yTr;

    // ① CPU → 内存（8 条并行通道：真内存总线是一整把线一起走的，
    //    这一段是整块板走线最密的地方，往外越走越稀）
    for (let i = 0; i < 8; i++) {
      addRoute([
        [SOCK.x + SOCK.s / 2 - 0.02, y, SOCK.z - 0.10 + i * 0.044],
        [0.00, y, -0.300 + i * 0.044],
        [0.060 + i * 0.016, y, 0.120],
      ]);
    }
    // ② CPU → PCIe x16（直连显卡的两条）
    addRoute([[SOCK.x + 0.10, y, SOCK.z + SOCK.s / 2 - 0.02], [-0.160, y, 0.200], [-0.100, y, 0.315]]);
    addRoute([[SOCK.x + 0.02, y, SOCK.z + SOCK.s / 2 - 0.02], [-0.260, y, 0.240], [-0.260, y, 0.315]]);
    // ③ CPU → M.2_1
    addRoute([[SOCK.x + 0.16, y, SOCK.z - 0.02], [0.040, y, 0.020], [0.120, y, 0.075]]);
    // ④ 芯片组 → PCIe x4 / x1 / SATA
    addRoute([[0.400, y, -0.200], [0.340, y, 0.120], [0.300, y, 0.425]]);
    addRoute([[0.460, y, -0.200], [0.420, y, 0.200], [0.360, y, 0.525]]);
    addRoute([[0.580, y, -0.220], [0.640, y, 0.020], [0.640, y, 0.090]]);
    // ⑤ 芯片组 → 后置 I/O
    addRoute([[0.360, y, -0.360], [-0.100, y, -0.400], [-0.700, y, -0.380]]);
    // ⑥ 24pin → VRM（电源先把电送到这里，再分给 CPU）
    addRoute([[0.640, y, -0.300], [0.300, y, -0.440], [0.140, y, -0.468]]);
    addRoute([[0.640, y, -0.400], [0.240, y, -0.470], [0.020, y, -0.468]]);
    // ⑦ 24pin → 芯片组
    addRoute([[0.640, y, -0.280], [0.560, y, -0.240], [0.560, y, -0.200]]);
    // ⑧ CPU → VRM（供电相位就贴在插槽边上）
    addRoute([[SOCK.x - 0.10, y, SOCK.z - SOCK.s / 2 - 0.02], [-0.360, y, -0.460], [-0.240, y, -0.468]]);
    // ⑨ 芯片组 → 音频区
    addRoute([[CHIP.x - 0.06, y, -0.160], [-0.100, y, 0.240], [-0.400, y, 0.340]]);
    // ⑩ 芯片组 → M.2（同样是 PCIe 通道，只是跑在板子中间）
    addRoute([[0.400, y, -0.180], [0.300, y, 0.020], [0.240, y, 0.072]]);
    addRoute([[0.440, y, -0.180], [0.360, y, 0.040], [0.300, y, 0.172]]);
    // ⑪ 24pin → 内存供电（沿板边绕上去）
    addRoute([[0.640, y, -0.240], [0.500, y, -0.140], [0.330, y, -0.120]]);
    addRoute([[0.640, y, -0.220], [0.470, y, -0.100], [0.330, y, -0.050]]);
    // ⑫ 板缘稀疏区：前置面板与 SATA 的线（和 CPU 区形成密度对比）
    addRoute([[-0.400, y, 0.300], [-0.380, y, 0.500], [-0.220, y, 0.545]]);
    addRoute([[0.620, y, -0.120], [0.634, y, 0.020], [0.640, y, 0.100]]);

    /* ---------- 信号光点：沿着每一条走线跑 ---------- */
    const flowMat = kit.glow(hue, 2.3);
    const flows = [];
    routes.forEach((line, i) => {
      const d = kit.dot(0, 0, 0, flowMat, 0.012);
      d.userData.line = line;
      d.userData.t = (i * 0.37) % 1;
      d.userData.k = 0.85 + (i % 4) * 0.16;   // 每条线速度略不同，才像真的并行总线
      traceG.add(d);
      flows.push(d);
    });

    /* ============================================================
       原点归位：让"原点 = 包围盒中心"（契约 §1.5）。
       只挪最外层容器，各子系统的 userData.base 不受影响。
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
        { text: 'DDR5 内存插槽', desc: '直连 CPU 内存控制器，四条车道一起跑' },
        { text: 'PCIe x16 插槽', desc: '显卡的高速通道，金属壳是给 300W 显卡加固的' },
        { text: '16 相供电装甲', desc: '把 12V 切成一路路降到 1V 出头，装甲同时兼散热' },
        { text: '板层走线', desc: '板子自己不干活，只负责让所有元件互相说话' },
      ],

      /** t: 0 = 合拢，1 = 完全拆解。纯函数，可来回擦洗 */
      setExplode(t) {
        const e = kit.easeInOut(t);

        // 各子系统按登记的位移分层抬升（装甲最高、接口次之、走线层悬空）
        for (const r of rigs) {
          const b = r.g.userData.base, d = r.d;
          r.g.position.set(b.x + d.x * e, b.y + d.y * e, b.z + d.z * e);
        }

        // 内存插槽：除了整体抬起，还要左右散开，露出各自连向 CPU 的走线
        for (const s of dimmSlots) s.position.x = s.userData.baseX * (1 + 0.28 * e);
      },

      /** 持续动画：信号光点 + 调试 LED 自检 + 芯片组心跳（全部由 elapsed 现算） */
      update(elapsed, dt, emphasis = 0) {
        // 走线上的数据流
        const spd = 0.24 + emphasis * 0.32;
        for (const f of flows) {
          f.userData.t = (f.userData.t + dt * spd * f.userData.k) % 1;
          f.position.copy(kit.pointOn(f.userData.line, f.userData.t));
          // 两端淡出，避免光点凭空出现/消失
          const edge = Math.min(f.userData.t, 1 - f.userData.t);
          f.visible = edge > 0.05;
        }

        // Q-LED 自检：四颗依次点亮，然后循环
        for (let i = 0; i < ledMats.length; i++) {
          const ph = (elapsed * 0.55 + i * 0.22) % 1;
          ledMats[i].emissiveIntensity = 0.10 + Math.exp(-ph * 7) * (1.05 + emphasis * 0.75);
        }

        // 芯片组心跳
        chipLedMat.emissiveIntensity = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(elapsed * 2.6)) + emphasis * 0.3;
      },
    };
  },
};
