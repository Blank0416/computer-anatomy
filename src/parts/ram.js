/* ============================================================
   ram.js — 内存条（DDR5 UDIMM，16 颗 DRAM 颗粒）
   拆解：PCB 长条 → 金手指 → 16 颗颗粒逐颗浮起成阵列 → 散热马甲抬起
   动画：颗粒按"排"做读/写脉冲（前、后两排错开半个周期，一眼能看出是整排在走，
         不是乱闪）；金手指 → 颗粒之间跑数据流光点（正面写入 / 背面读出）。
   ============================================================ */

export default {
  id: 'ram',
  name: '内存',
  en: 'RAM',
  hue: 0x8fa2be,

  // 机位相对本元件原点：约 32° 俯角、距离约 2.29。
  // 从右前上方看，能同时看到马甲顶面、右侧面和下沿金手指。
  focus: { from: [1.15, 1.30, 1.50], look: [0, 0.10, 0], fov: 34 },

  build(kit) {
    const { THREE } = kit;
    const group = new THREE.Group();
    const hue = 0x8fa2be;

    /* ---------- 尺寸 ----------
       一条 133mm × 31mm 的 DDR5 无缓冲内存条；这里 1 世界单位 ≈ 90mm。 */
    const L = 1.50;           // 条长（沿 X，金手指方向）
    const PCB_H = 0.34;       // 板高（沿 Y）
    const PCB_T = 0.055;      // 板厚（沿 Z）
    const yTop = PCB_H / 2;   // 板上沿 +0.17
    const yBot = -PCB_H / 2;  // 板下沿 -0.17
    const zFace = PCB_T / 2;  // 板面 +0.0275

    /* ---------- 1. PCB 板本体 ---------- */
    group.add(kit.box(L, PCB_H, PCB_T, kit.mats.pcb));

    // 板面信号走线：标识色只用在少量强调上，不把整条内存染成灰蓝
    const traceMat = kit.glow(hue, 0.5);
    const busTrace = kit.trace([
      [-0.66, yBot + 0.032, zFace + 0.004],
      [-0.30, yBot + 0.054, zFace + 0.004],
      [0.34, yBot + 0.054, zFace + 0.004],
      [0.68, yBot + 0.028, zFace + 0.004],
    ], 0.0045, traceMat, 20);
    group.add(busTrace);

    // 板上沿 / 下沿的贴片小件（去耦电容、排阻），让板子看着像真板
    const rng = kit.rng(20261024);
    for (let i = 0; i < 16; i++) {
      const w = 0.020 + rng() * 0.012;
      const h = 0.010 + rng() * 0.008;
      const c = kit.box(w, h, 0.012, rng() > 0.5 ? kit.mats.plasticMid : kit.mats.ceramic);
      const x = -0.62 + (i / 15) * 1.24 + (rng() - 0.5) * 0.03;
      const top = i % 3 === 0;                              // 少数贴在板上沿
      c.position.set(x, top ? yTop - 0.018 : yBot + 0.016, zFace + 0.008);
      group.add(c);
    }

    /* ---------- 2. 金手指（底沿触点）+ 缺口键 ----------
       真实 DDR5 有 288 个触点、键位缺口偏左。这里用两段触点之间的空隙表达缺口。 */
    const yFin = yBot - 0.024;                              // 触点中心
    const fingers = new THREE.Group();
    const segA = kit.pins(26, 0.022, kit.mats.gold, { w: 0.012, h: 0.048, d: 0.050 });
    segA.position.set(-0.430, yFin, 0);
    const segB = kit.pins(36, 0.022, kit.mats.gold, { w: 0.012, h: 0.048, d: 0.050 });
    segB.position.set(0.330, yFin, 0);
    fingers.add(segA, segB);
    // 缺口键：塑料隔断，真实内存条靠它防插反、也把 DDR4 / DDR5 区分开
    const key = kit.box(0.070, 0.044, 0.052, kit.mat('plasticDark', { roughness: 0.8 }));
    key.position.set(-0.100, yFin, 0);
    fingers.add(key);
    group.add(fingers);

    /* ---------- 3. DRAM 颗粒：8 颗 × 正反两面 = 16 颗 ----------
       每颗要独立发光（整排做脉冲），所以从 kit 材质 clone 出母版再逐颗复制 —— 
       这是契约里唯一允许自建材质的场景，做法与 cpu.js 的核心阵列一致。 */
    const CHIP_W = 0.135, CHIP_H = 0.105, CHIP_T = 0.020;
    const CHIP_Y = 0.030;                                   // 颗粒中心（下方留给金手指）
    const CHIP_N = 8, CHIP_GAP = 0.175;
    const chipProto = kit.mat('plasticDark', {
      emissive: new THREE.Color(hue),
      emissiveIntensity: 0.05,
    });
    const lidMat = kit.mat('plasticMid', { roughness: 0.66 });

    const chips = [];
    for (let side = 0; side < 2; side++) {
      const sz = side === 0 ? 1 : -1;                       // +Z 正面 / -Z 背面
      const zc = sz * (zFace + CHIP_T / 2);                 // 紧贴板面
      for (let i = 0; i < CHIP_N; i++) {
        const x = (i - (CHIP_N - 1) / 2) * CHIP_GAP;        // -0.6125 … +0.6125
        const mat = chipProto.clone();                      // 独立发光，能逐颗打脉冲
        const chip = kit.box(CHIP_W, CHIP_H, CHIP_T, mat);
        chip.position.set(x, CHIP_Y, zc);
        chip.userData.base = chip.position.clone();
        // "排"相位：背面的第 i 颗 = 正面的第 i+4 颗同时到波峰 → 两排交替推进
        chip.userData.wave = side === 0
          ? i / CHIP_N
          : ((i + CHIP_N / 2) % CHIP_N) / CHIP_N;
        chip.userData.mat = mat;
        chip.userData.side = sz;
        chips.push(chip);
        group.add(chip);

        // 封装外侧的丝印小盖，纯装饰，用共享材质（不参与脉冲）。
        // 必须挂成颗粒的子物体：拆解时颗粒会浮起来，盖子得跟着走，否则会留在板上。
        const lid = kit.box(CHIP_W * 0.62, CHIP_H * 0.62, 0.005, lidMat);
        lid.position.set(0, 0, sz * (CHIP_T / 2 + 0.0015));
        chip.add(lid);
      }
    }

    /* ---------- 4. SPD 信息芯片 + PMIC 供电芯片（板左端小件） ----------
       SPD 存这一条的时序参数；DDR5 把供电稳压器（PMIC）直接搬到了条子上。 */
    const spd = kit.box(0.055, 0.045, 0.016, kit.mats.plasticDark);
    spd.position.set(-0.712, 0.105, zFace + 0.008);
    group.add(spd);
    const pmic = kit.box(0.062, 0.058, 0.018, kit.mats.plasticDark);
    pmic.position.set(-0.715, -0.060, zFace + 0.008);
    group.add(pmic);
    const spdTrace = kit.trace([
      [-0.712, 0.082, zFace + 0.004],
      [-0.560, 0.100, zFace + 0.004],
      [-0.100, 0.140, zFace + 0.004],
      [0.640, 0.140, zFace + 0.004],
    ], 0.0035, traceMat, 18);
    group.add(spdTrace);

    /* ---------- 5. 散热马甲：一整片，拆卸时整体抬起 ---------- */
    const shell = new THREE.Group();
    group.add(shell);

    const SHELL_T = 0.014;                                  // 马甲板厚
    const PLATE_Y = 0.020;                                  // 前后面板的中心高度
    const PLATE_H = 0.300;                                  // 面板高度（下沿露金手指）
    const zPlate = zFace + CHIP_T + 0.002 + SHELL_T / 2;    // 面板中心 z
    const shellMat = kit.mat('metal', { roughness: 0.36, metalness: 0.86, color: 0x9ba3ac });
    const ribMat = kit.mat('metal', { roughness: 0.46, metalness: 0.78, color: 0x878e96 });

    for (const sz of [1, -1]) {
      // 前 / 后面板
      const plate = kit.box(L * 0.973, PLATE_H, SHELL_T, shellMat);
      plate.position.set(0, PLATE_Y, sz * zPlate);
      shell.add(plate);
      // 下沿折边卡爪：真实马甲靠这段折边夹住 PCB 下沿
      const claw = kit.box(L * 0.973, 0.014, 0.028, shellMat);
      claw.position.set(0, PLATE_Y - PLATE_H / 2 - 0.007, sz * (zPlate - 0.008));
      shell.add(claw);
      // 面板上的压筋（真实马甲冲压出来的加强筋）
      for (let i = 0; i < 7; i++) {
        const rib = kit.box(0.022, PLATE_H * 0.80, 0.006, ribMat);
        rib.position.set((i - 3) * 0.20, PLATE_Y, sz * (zPlate + SHELL_T / 2 + 0.003));
        shell.add(rib);
      }
    }
    // 顶脊：把前后两块面板折在一起，拆的时候整片一起走
    const spine = kit.box(L * 0.973, 0.020, zPlate * 2 + SHELL_T, shellMat);
    spine.position.set(0, PLATE_Y + PLATE_H / 2 + 0.010, 0);
    shell.add(spine);
    // 顶脊上的标识色灯条（只这一条，不当主体色用）
    const bar = kit.box(L * 0.86, 0.008, 0.030, kit.glow(hue, 1.0));
    bar.position.set(0, PLATE_Y + PLATE_H / 2 + 0.022, 0);
    shell.add(bar);

    /* ---------- 6. 数据流光点：金手指 → 颗粒 ----------
       正 / 背面各一条走线。走线特意走两颗颗粒之间的空档，避免穿过芯片。 */
    const flowMat = kit.glow(hue, 2.4);
    const laneOf = (sz) => kit.trace([
      [-0.705, yFin + 0.008, sz * 0.022],
      [-0.640, yFin + 0.026, sz * 0.036],
      [-0.545, yBot + 0.014, sz * 0.042],
      [-0.525, -0.030, sz * 0.042],
      [-0.525, 0.112, sz * 0.042],
      [-0.100, 0.118, sz * 0.042],
      [0.500, 0.118, sz * 0.042],
      [0.680, 0.098, sz * 0.042],
    ], 0.0055, traceMat, 26);
    const lanes = [laneOf(1), laneOf(-1)];
    for (const l of lanes) group.add(l);

    const flows = [];
    for (let k = 0; k < 8; k++) {
      const d = kit.dot(0, 0, 0, flowMat, 0.014);
      d.userData.t = k / 8;
      d.userData.trace = lanes[k % 2];
      d.userData.rev = (k % 2) === 1;                       // 正面写入（内跑）/ 背面读出（外跑）
      d.userData.speed = 0.20 + (k % 3) * 0.045;
      group.add(d);
      flows.push(d);
    }

    /* ---------- 拆解 / 动画 ---------- */
    return {
      group,
      legend: [
        { text: '金手指', desc: '底沿 288 个触点，把地址和数据送上主板' },
        { text: 'DRAM 颗粒', desc: '真正的存储单元，靠电容上的电荷存 0 和 1' },
        { text: '散热马甲', desc: '把颗粒的热量摊到整片金属板上带走' },
        { text: 'SPD 与 PMIC', desc: 'SPD 存这一条的时序参数，PMIC 就地给它稳压' },
        { text: '缺口键', desc: '防插反，也把 DDR4 和 DDR5 区分开' },
      ],

      /** t: 0 = 合拢，1 = 完全拆解。纯函数，可来回擦洗 */
      setExplode(t) {
        const e = kit.easeInOut(t);

        // 马甲：前 45% 就完全让开（它得先走，否则会挡住浮起的颗粒）
        const eShell = kit.easeInOut(kit.clamp01(t / 0.45));
        shell.position.set(0, 0.62 * eShell, -0.06 * eShell);
        shell.rotation.x = -0.12 * eShell;
        shell.rotation.z = 0.06 * eShell;

        // 颗粒：从 35% 开始逐颗浮起，两端略高、正反两面各拉开成一排 → 摊成一片阵列
        const eChip = kit.easeInOut(kit.clamp01((t - 0.35) / 0.65));
        for (const c of chips) {
          const b = c.userData.base;
          const sz = c.userData.side;
          const rad = Math.abs(b.x) / (CHIP_GAP * 3.5);       // 0（中间）… 1（两端）
          c.position.set(
            b.x * (1 + 0.05 * eChip),
            b.y + (0.11 + rad * 0.05) * eChip,
            b.z + sz * (0.045 + rad * 0.010) * eChip          // 正反面各向外让开
          );
          c.rotation.y = 0.12 * eChip * sz;
        }

        // 金手指：不单独移动。288 个触点是蚀刻在板边上的，整排飞走就不像拆解、
        // 像掉件了；它和 PCB 一起作为整条内存的基准面（legend 里单独讲它）。
      },

      /** 持续动画：整排读/写脉冲 + 数据流光点
       *  注意：位置一律由 setExplode 负责，这里只改发光强度和光点自身位置。 */
      update(elapsed, dt, emphasis = 0) {
        // "行激活"波前：沿条长扫过 8 列，正 / 背面错开半周期 → 能看出是整排在动
        const phase = (elapsed * 0.5) % 1;
        for (const c of chips) {
          const d0 = Math.abs(c.userData.wave - phase);
          const d = Math.min(d0, 1 - d0);
          const spike = Math.max(0, 1 - d * 5.5);              // 窄峰：同时亮 1~2 列
          const idle = 0.05 + emphasis * 0.05;
          c.userData.mat.emissiveIntensity = idle + spike * (0.75 + emphasis * 0.9);
        }

        // 数据流：光点沿走线从金手指跑向颗粒（背面那条反向跑，表示"读出"）
        for (const f of flows) {
          f.userData.t = (f.userData.t + dt * f.userData.speed * (0.5 + emphasis * 1.1)) % 1;
          const u = f.userData.rev ? 1 - f.userData.t : f.userData.t;
          f.position.copy(kit.pointOn(f.userData.trace, u));
          const edge = Math.min(f.userData.t, 1 - f.userData.t);
          f.visible = edge > 0.04;                             // 两端淡出，避免凭空出现
        }
      },
    };
  },
};