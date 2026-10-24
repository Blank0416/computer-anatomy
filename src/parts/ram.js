/* ============================================================
   ram.js — 内存条（DDR5 UDIMM 32GB、288 pin、双面 16 颗 DRAM、铝齿马甲 + RGB 导光条）
   尺寸全部按真实毫米建模再统一换算：133.35 × 31.25 × 1.27mm 的 PCB，
   0.85mm 触点间距、5.5mm 触点高，单颗颗粒 9 × 11mm。

   拆解（DETAIL-SPEC §4.2 的五层）：顶部组件（顶脊 + 导光条）先抬走 →
   左右马甲连斜齿向两侧分开 → 导热垫贴出 → 16 颗颗粒浮起 → PCB 与金手指留在原位。
   动画：颗粒按"排"做读/写脉冲（正反面错开半个周期，一眼能看出是整排在走），
         金手指 → 颗粒之间跑数据流光点（正面写入 / 背面读出）。
   ============================================================ */

/**
 * 把一排 n 个触点按"防呆缺口"切成若干连续段，返回 [{ n, cx }]（cx = 该段中心）。
 * 真实 UDIMM 的键位缺口是板边上的一个物理豁口，落到触点排上就是缺掉几个位置。
 */
function pinRuns(n, pitch, gapC, gapH) {
  const xOf = (i) => (i - (n - 1) / 2) * pitch;
  const runs = [];
  let a = -1;
  for (let i = 0; i < n; i++) {
    const inGap = Math.abs(xOf(i) - gapC) < gapH;
    if (inGap) {
      if (a >= 0) { runs.push([a, i - 1]); a = -1; }
    } else if (a < 0) a = i;
  }
  if (a >= 0) runs.push([a, n - 1]);
  return runs.map(([s, e]) => ({ n: e - s + 1, cx: (xOf(s) + xOf(e)) / 2 }));
}

export default {
  id: 'ram',
  name: '内存',
  en: 'RAM',
  hue: 0x8fa2be,

  // 机位相对本元件原点：约 30° 俯角、距离约 2.10。
  // 从右前上方看，能同时看到马甲外侧斜齿、顶部导光条和下沿金手指。
  focus: { from: [1.10, 1.20, 1.40], look: [0, 0.05, 0], fov: 34 },

  build(kit) {
    const { THREE } = kit;
    const D = kit.detail;
    const group = new THREE.Group();
    const hue = 0x8fa2be;

    /* ---------- 比例 ---------- */
    const K = 0.010873;                 // 1 场景单位 ≈ 92mm（DETAIL-SPEC §0.2）
    const L = 133.35 * K;               // 1.4499 = 条长 133.35mm
    const PCB_H = 31.25 * K;            // 0.3398 = 板高 31.25mm
    const PCB_T = 0.032;                // 板厚（真实 1.27mm，为可读性放大 ~2.5×，见 §0.3）
    const yTop = PCB_H / 2;             // +0.1699
    const yBot = -PCB_H / 2;            // -0.1699
    const zFace = PCB_T / 2;            // ±0.016

    /* ---------- 材质（一律走 kit / D，不新造 MeshStandardMaterial） ---------- */
    const M = {
      pcb: D.mat.pcb('#0f1013'),
      gold: kit.mat('gold', { color: 0xc9a227, roughness: 0.26, metalness: 1.0 }),
      armor: D.mat.brushed(0x3b3e44, { rough: 0.35, metal: 0.75, repeat: 2.6 }),
      tooth: kit.mat('metalDark', { color: 0x2a2c30, roughness: 0.45, metalness: 0.62 }),
      pad: kit.mat('plasticMid', { color: 0x93b6c9, roughness: 0.90, metalness: 0.02 }),
      chip: kit.mat('plasticDark', { color: 0x16171a, roughness: 0.45, metalness: 0.15 }),
      die: kit.mats.silicon,
      dark: kit.mat('plasticDark', { color: 0x0b0c0e, roughness: 0.82, metalness: 0.05 }),
      ceramic: kit.mat('ceramic', { color: 0x6f5b46, roughness: 0.72, metalness: 0.05 }),
      // 导光条：乳白半透（rough 0.18），开灯时按 hue 泛光
      bar: kit.mat('plastic', {
        color: 0xf2f3f5, roughness: 0.18, metalness: 0.02,
        emissive: new THREE.Color(hue), emissiveIntensity: 0.20,
        transparent: true, opacity: 0.62, depthWrite: false,
      }),
    };
    // 长条板：走线贴图沿长边重复 3 次，否则纹理被拉成横条纹
    for (const t of [M.pcb.map, M.pcb.roughnessMap, M.pcb.normalMap]) {
      if (t) t.repeat.set(3, 1);
    }

    /* ---------- 1. PCB 板本体（做成两块 + 豁口，才有真的防呆缺口） ---------- */
    const FINGER_H = 5.5 * K;           // 0.0598 = 触点区高 5.5mm
    const NOTCH_C = -0.075;             // 键位缺口中心：DDR5 偏中
    const NOTCH_GAP = 0.0105;           // 缺口半宽（物理豁口 ≈1.9mm）
    const yFinTop = yBot + FINGER_H;    // -0.110 触点区与芯片区的分界

    // 主板体：从触点区顶边一直到板上沿
    const boardMain = D.parts.cbox(L, PCB_H - FINGER_H, PCB_T, M.pcb, 0.002, 0.012);
    boardMain.position.set(0, (yTop + yFinTop) / 2, 0);
    group.add(boardMain);

    // 底部两条窄条：中间留出豁口 → 金手指区真的有缺口
    const nL = (NOTCH_C - NOTCH_GAP) + L / 2;             // 左段宽
    const nR = L - nL - NOTCH_GAP * 2;                    // 右段宽
    const bl = D.parts.cbox(nL, FINGER_H, PCB_T, M.pcb, 0.0015, 0.005);
    bl.position.set(-L / 2 + nL / 2, (yFinTop + yBot) / 2, 0);
    const br = D.parts.cbox(nR, FINGER_H, PCB_T, M.pcb, 0.0015, 0.005);
    br.position.set(L / 2 - nR / 2, (yFinTop + yBot) / 2, 0);
    group.add(bl, br);

    /* ---------- 2. 金手指：288 个触点，真密度 0.85mm 间距 ---------- */
    const PITCH = 0.85 * K;             // 0.009241 = 0.85mm 触点间距
    const NPIN = 144;                   // 单面 144 → 双面共 288
    const FINGER_W = 0.50 * PITCH;      // 触点宽 ≈0.42mm
    const FINGER_D = PCB_T * 0.42;      // 镀金层只在板面一层
    const yFin = yBot + FINGER_H / 2 + 0.0008;
    const zFin = zFace - FINGER_D / 2 + 0.0004;           // 略凸出板面

    for (const side of [1, -1]) {
      // 正反面错半个间距 —— 真实 DIMM 两排触点就是这样交错的
      const off = side > 0 ? 0 : PITCH / 2;
      for (const r of pinRuns(NPIN, PITCH, NOTCH_C - off, NOTCH_GAP + PITCH * 0.5)) {
        const row = D.parts.pinRow(r.n, PITCH, { w: FINGER_W, h: FINGER_H, d: FINGER_D }, M.gold);
        row.position.set(r.cx + off, yFin, side * zFin);
        group.add(row);
      }
    }

    /* ---------- 3. 板面丝印（长条板上的型号字，MeshBasicMaterial 贴片） ---------- */
    const inkMat = (lines, w, h, o = {}) => {
      const tex = D.tex.plate(lines, { w, h, ...o });
      return new THREE.MeshBasicMaterial({
        map: tex, transparent: true, opacity: o.opacity ?? 0.7,
        depthWrite: false, toneMapped: true, side: THREE.DoubleSide,
      });
    };
    // 颗粒共用同一张丝印（真实条子上 16 颗颗粒印的是同一行字，共用材质也更省）
    const chipSilkMat = inkMat(['HMCG88', 'DDR5-6400'], 256, 128, {
      w: 256, h: 128, ink: '#9a9a96', align: 'center', font: '600 26px "Microsoft YaHei", sans-serif',
    });

    /* ---------- 4. DRAM 颗粒：8 颗 × 正反两面 = 16 颗 ----------
       颗粒要整排脉冲，所以每颗 clone 一份 kit 材质自己发光（契约允许的唯一场景）。 */
    const CHIP_W = 9 * K;               // 0.0979 = 9mm
    const CHIP_H = 11 * K;              // 0.1196 = 11mm
    const CHIP_T = 0.014;               // 封装厚（真实 0.9mm，为可读性放大）
    const CHIP_N = 8;
    const CHIP_PITCH = 0.132;
    const CHIP_Y = 0.020;
    const chipProto = kit.mat('plasticDark', {
      color: 0x16171a, roughness: 0.45, metalness: 0.15,
      emissive: new THREE.Color(hue), emissiveIntensity: 0.05,
    });

    const chips = [];
    for (let side = 0; side < 2; side++) {
      const sz = side === 0 ? 1 : -1;
      for (let i = 0; i < CHIP_N; i++) {
        const x = (i - (CHIP_N - 1) / 2) * CHIP_PITCH;    // -0.462 … +0.462
        const mat = chipProto.clone();
        const chip = new THREE.Group();
        chip.position.set(x, CHIP_Y, sz * (zFace + CHIP_T / 2));
        chip.rotation.y = sz > 0 ? 0 : Math.PI;           // 让局部 +Z 恒朝外

        // 封装本体（倒角，接得住高光）
        chip.add(D.parts.cbox(CHIP_W, CHIP_H, CHIP_T, mat, 0.004, 0.006));
        // 开窗露出的裸 die
        const die = kit.box(CHIP_W * 0.64, CHIP_H * 0.46, 0.0035, M.die);
        die.position.z = CHIP_T / 2 + 0.0012;
        chip.add(die);
        // 激光丝印：型号与速率
        const silk = new THREE.Mesh(new THREE.PlaneGeometry(CHIP_W * 0.84, CHIP_H * 0.20), chipSilkMat);
        silk.position.set(0, CHIP_H * 0.34, CHIP_T / 2 + 0.0020);
        chip.add(silk);

        chip.userData.base = chip.position.clone();
        chip.userData.rotY = chip.rotation.y;
        chip.userData.mat = mat;
        chip.userData.side = sz;
        // "排"相位：背面第 i 颗与正面第 i+4 颗同时到峰 → 两排交替推进
        chip.userData.wave = side === 0
          ? i / CHIP_N
          : ((i + CHIP_N / 2) % CHIP_N) / CHIP_N;
        chips.push(chip);
        group.add(chip);
      }
    }

    /* ---------- 5. SPD Hub + PMIC + 电感：放在两端（马甲缩短，露出来给人看） ---------- */
    const spd = D.parts.cbox(0.032, 0.021, 0.010, M.dark, 0.0015, 0.003);   // 2 × 3mm
    spd.position.set(-0.690, 0.078, zFace + 0.005);
    group.add(spd);

    const pmic = D.parts.cbox(0.032, 0.032, 0.012, M.dark, 0.0015, 0.003); // 3 × 3mm
    pmic.position.set(0.690, 0.078, zFace + 0.006);
    group.add(pmic);
    for (const dx of [-0.024, 0.024]) {
      const ind = D.parts.inductor(0.018, 0.014, 0.018);
      ind.position.set(0.690 + dx, 0.030, zFace + 0.007);
      group.add(ind);
    }
    for (const dx of [-0.026, 0.026]) {
      const cap = D.parts.capacitor(0.008, 0.014, 0x3a4048);
      cap.position.set(0.690 + dx, -0.045, zFace + 0.007);
      group.add(cap);
    }

    /* ---------- 6. 去耦电容 / 排阻阵列（InstancedMesh，一片 SMD 全场） ----------
       smdField 是按"水平面"铺的，这里整片绕 X 转 90° 立起来贴到板面上。 */
    const capMat = kit.mat('ceramic', { color: 0x5e5346, roughness: 0.68, metalness: 0.06 });
    const capF = D.parts.smdField(22, { w: 0.011, h: 0.004, d: 0.006 }, capMat);
    capF.userData.fill(-0.560, 0.560, -0.006, 0.006, 0.002, 11);
    capF.rotation.x = Math.PI / 2;
    capF.position.set(0, 0.140, zFace);
    group.add(capF);
    const capB = D.parts.smdField(22, { w: 0.011, h: 0.004, d: 0.006 }, capMat);
    capB.userData.fill(-0.560, 0.560, -0.006, 0.006, 0.002, 29);
    capB.rotation.x = -Math.PI / 2;
    capB.position.set(0, 0.140, -zFace);
    group.add(capB);

    /* ---------- 7. 散热马甲：两片带斜齿的铝板 + 导热垫 ---------- */
    const ARM_Y0 = -0.112;              // 下沿（刚好让开金手指）
    const ARM_Y1 = 0.205;               // 上沿
    const PLATE_H = ARM_Y1 - ARM_Y0;    // 0.317
    const PLATE_CY = (ARM_Y0 + ARM_Y1) / 2;
    const PLATE_L = L * 0.90;           // 缩短 10%：两端 SPD / PMIC 才露得出来
    const SHELL_T = 0.0135;             // 马甲板厚（真实 1.2mm）
    const PAD_T = 0.0065;               // 导热垫 0.5mm（略放大）
    const zChipOut = zFace + CHIP_T;    // 0.030 颗粒外表面
    const zPad = zChipOut + PAD_T / 2;
    const zPlate = zChipOut + PAD_T + SHELL_T / 2;
    const zPlateOut = zChipOut + PAD_T + SHELL_T;   // 0.050
    const TEETH = 10;

    const makeArm = (sz) => {
      const g = new THREE.Group();
      // 主面板：外面板 + 内侧齿根
      const plate = D.parts.cbox(PLATE_L, PLATE_H, SHELL_T, M.armor, 0.0035, 0.012);
      plate.position.set(0, PLATE_CY, sz * zPlate);
      g.add(plate);
      // 外侧一排斜齿（不是平板 —— 齿才是马甲散热的真身）
      for (let i = 0; i < TEETH; i++) {
        const tooth = kit.box(0.011, 0.290, 0.016, M.tooth);
        tooth.position.set(-PLATE_L / 2 + (i + 0.5) * (PLATE_L / TEETH), PLATE_CY + 0.004, sz * (zPlateOut + 0.007));
        tooth.rotation.z = -sz * 0.20;      // 斜齿：齿顶沿条长方向倒一点
        g.add(tooth);
      }
      // 下沿折边卡爪：真实马甲靠这段折边夹住 PCB 下沿
      const claw = D.parts.cbox(PLATE_L, 0.016, 0.030, M.armor, 0.002, 0.006);
      claw.position.set(0, ARM_Y0 - 0.008, sz * 0.029);
      g.add(claw);
      return g;
    };
    const armF = makeArm(1);
    const armB = makeArm(-1);
    group.add(armF, armB);

    // 导热垫：颗粒与马甲之间那层软硅胶
    const makePad = (sz) => {
      const g = new THREE.Group();
      const pad = D.parts.cbox(0.940, 0.070, PAD_T, M.pad, 0.0012, 0.004);
      pad.position.set(0, PLATE_CY - 0.010, sz * zPad);
      g.add(pad);
      return g;
    };
    const padF = makePad(1);
    const padB = makePad(-1);
    group.add(padF, padB);

    /* ---------- 8. 顶部组件：顶脊 + RGB 导光条 + 8 颗 LED ---------- */
    const cap = new THREE.Group();
    const spineY = ARM_Y1 + 0.009;                       // 0.214
    const spine = D.parts.cbox(PLATE_L, 0.018, PLATE_L * 0 + 2 * zPlateOut + 0.002, M.armor, 0.003, 0.010);
    spine.position.set(0, spineY, 0);
    cap.add(spine);

    const BAR_H = 0.017;
    const barY = spineY + 0.009 + BAR_H / 2;             // 0.2315
    const bar = D.parts.cbox(PLATE_L * 0.90, BAR_H, 0.050, M.bar, 0.004, 0.007);
    bar.position.set(0, barY, 0);
    cap.add(bar);

    const leds = [];
    for (let i = 0; i < 8; i++) {
      const lm = kit.glow(hue, 0.9).clone();
      const led = kit.box(0.014, 0.008, 0.014, lm);
      led.position.set((i - 3.5) * 0.132, barY, 0);
      led.userData.mat = lm;
      led.userData.k = i;
      cap.add(led);
      leds.push(led);
    }
    group.add(cap);

    /* ---------- 9. 板面走线 + 数据流光点 ---------- */
    const traceMat = kit.glow(hue, 0.55);
    const flowMat = kit.glow(hue, 2.4);
    const laneOf = (sz) => kit.trace([
      [-0.688, yFin + 0.010, sz * 0.008],
      [-0.690, yBot + 0.030, sz * 0.020],
      [-0.560, yBot + 0.026, sz * 0.030],
      [-0.470, -0.010, sz * 0.034],
      [-0.360, 0.106, sz * 0.034],
      [0.160, 0.118, sz * 0.034],
      [0.560, 0.118, sz * 0.034],
      [0.690, 0.070, sz * 0.030],
    ], 0.0045, traceMat, 22);
    const lanes = [laneOf(1), laneOf(-1)];
    for (const l of lanes) group.add(l);

    const flows = [];
    for (let k = 0; k < 8; k++) {
      const d = kit.dot(0, 0, 0, flowMat, 0.013);
      d.userData.t = k / 8;
      d.userData.trace = lanes[k % 2];
      d.userData.rev = (k % 2) === 1;                     // 正面写入 / 背面读出
      d.userData.speed = 0.20 + (k % 3) * 0.045;
      group.add(d);
      flows.push(d);
    }

    /* ---------- 拆解 / 动画 ---------- */
    return {
      group,
      legend: [
        { text: '金手指', desc: '底沿 288 个触点（0.85mm 间距），把地址和数据送上主板' },
        { text: 'DRAM 颗粒', desc: '真正的存储单元，一颗颗电容上的电荷就是 0 和 1' },
        { text: '散热马甲', desc: '两片带斜齿的铝板，把 16 颗颗粒的热摊到整条上' },
        { text: '导热垫', desc: '软硅胶填掉颗粒与铝板之间的空气缝，热才走得出去' },
        { text: 'RGB 导光条', desc: '顶部一条乳白导光条，8 颗 LED 的光在里面摊匀' },
        { text: '防呆缺口', desc: '板边那个豁口，插反了根本按不下去' },
      ],

      /** t: 0 = 合拢，1 = 完全拆解。纯函数，可来回擦洗 */
      setExplode(t) {
        // ① 顶部组件：最先整个抬起来（顶脊 + 导光条是一体件）
        const eTop = kit.easeInOut(kit.clamp01(t / 0.34));
        cap.position.set(0, 0.200 * eTop, 0);

        // ② 左右马甲：连斜齿、卡爪一起向两侧分开并微抬
        const eArm = kit.easeInOut(kit.clamp01((t - 0.15) / 0.55));
        armF.position.set(0, 0.050 * eArm, 0.140 * eArm);
        armB.position.set(0, 0.050 * eArm, -0.140 * eArm);

        // ③ 导热垫：马甲让开之后才贴出来
        const ePad = kit.easeInOut(kit.clamp01((t - 0.25) / 0.50));
        padF.position.set(0, 0.050 * ePad, 0.072 * ePad);
        padB.position.set(0, 0.050 * ePad, -0.072 * ePad);

        // ④ 颗粒：从 35% 开始浮起，两端略高、正反两面各向外让开 → 摊成一片阵列
        const eChip = kit.easeInOut(kit.clamp01((t - 0.35) / 0.65));
        for (const c of chips) {
          const b = c.userData.base;
          const sz = c.userData.side;
          const rad = Math.abs(b.x) / 0.52;                 // 0（中间）… 1（两端）
          c.position.set(
            b.x * (1 + 0.04 * eChip),
            b.y + (0.11 + rad * 0.04) * eChip,
            b.z + sz * (0.045 + rad * 0.005) * eChip,
          );
          c.rotation.y = c.userData.rotY + 0.10 * eChip * sz;
        }

        // 金手指：不单独移动。288 个触点是蚀刻在板边上的，
        // 整排飞走就不像拆解、像掉件了；它和 PCB 一起当整条内存的基准面。
      },

      /** 持续动画：整排读/写脉冲 + 导光条呼吸 + 数据流光点
       *  注意：位置一律由 setExplode 负责，这里只改发光强度和光点自身位置。 */
      update(elapsed, dt, emphasis = 0) {
        // "行激活"波前：沿条长扫过 8 列，正 / 背面错开半周期 → 能看出是整排在动
        const phase = (elapsed * 0.5) % 1;
        for (const c of chips) {
          const d0 = Math.abs(c.userData.wave - phase);
          const d = Math.min(d0, 1 - d0);
          const spike = Math.max(0, 1 - d * 5.5);           // 窄峰：同时亮 1~2 列
          const idle = 0.05 + emphasis * 0.05;
          c.userData.mat.emissiveIntensity = idle + spike * (0.75 + emphasis * 0.9);
        }

        // 导光条：整体呼吸；8 颗 LED 依次点亮 → 一条灯带在跑
        const breathe = 0.20 + 0.10 * Math.sin(elapsed * 1.7);
        M.bar.emissiveIntensity = breathe + emphasis * 0.35;
        for (const l of leds) {
          const p = (elapsed * 0.32 + l.userData.k * 0.125) % 1;
          const lit = Math.max(0, Math.cos((p - 0.5) * Math.PI * 2));
          l.userData.mat.emissiveIntensity = 0.28 + lit * 1.35 + emphasis * 0.6;
        }

        // 数据流：光点沿走线从金手指跑向颗粒（背面那条反向跑，表示"读出"）
        for (const f of flows) {
          f.userData.t = (f.userData.t + dt * f.userData.speed * (0.5 + emphasis * 1.1)) % 1;
          const u = f.userData.rev ? 1 - f.userData.t : f.userData.t;
          f.position.copy(kit.pointOn(f.userData.trace, u));
          const edge = Math.min(f.userData.t, 1 - f.userData.t);
          f.visible = edge > 0.04;                          // 两端淡出，避免凭空出现
        }
      },
    };
  },
};
