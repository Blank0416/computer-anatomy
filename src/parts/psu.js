/* ============================================================
   psu.js — 电源（PSU）
   拆解：外壳 → 风扇 → EMI 滤波 → 整流 / 变压器 → 电容组 → 模组输出口
   动画：AC 侧 → DC 侧的"能量流"，以及电容组缓慢的充放电呼吸。
   注意：刻意不出现任何电压数字/警示标识 —— 这里只讲清一件事：
        市电是交流、且方向乱变，电源把它整流成直流，再切成高频、
        用变压器降到低压，最后再整流滤波一遍送给整机。
   ============================================================ */

export default {
  id: 'psu',
  name: '电源',
  en: 'PSU',
  hue: 0xbfa089,

  // 机位相对本元件原点（main.js 会加上元件在世界里的位置）
  // 从右前上方 31° 俯看，外壳顶盖的风扇和内部的元件分层都能看到
  // 机位随原点归位一起补偿，保证画面构图和设计时一致
  focus: { from: [1.43, 1.30, 1.65], look: [-0.02, 0.02, 0], fov: 34 },

  build(kit) {
    const { THREE } = kit;
    const group = new THREE.Group();
    const hue = 0xbfa089;

    /* ---------- 尺寸（真电源 150×86×140mm，等比缩到 1.22×0.70×1.14） ---------- */
    const HL = 0.57;    // x 半长（前后方向）
    const HH = 0.35;    // y 半高
    const HW = 0.61;    // z 半宽
    const SH = 0.020;   // 钢板厚

    /* ---------- 可拆解子系统登记表 ---------- */
    const rigs = [];
    const rig = (g, dx, dy, dz) => {
      g.userData.base = g.position.clone();
      rigs.push({ g, d: new THREE.Vector3(dx, dy, dz) });
      return g;
    };

    const steelMat = kit.mat('metalDark', { roughness: 0.55, metalness: 0.62 });
    const steelMat2 = kit.mat('metalDark', { roughness: 0.48, metalness: 0.70, color: 0x4c5259 });
    // 深色钢：整流桥、散热片、电容顶盖 —— 浅色金属只留给标签面，否则整个电源会亮成浅盒子
    const steelMat3 = kit.mat('metalDark', { roughness: 0.44, metalness: 0.72, color: 0x565d66 });

    /* ============================================================
       1. 底板 / 背板（钢板机壳，顺带当散热片和屏蔽层）
       ============================================================ */
    const chassisG = new THREE.Group();
    group.add(chassisG);
    rig(chassisG, 0, 0, 0);   // 底板不动，作为整个元件的参照

    const floor = kit.box(HL * 2, SH, HW * 2, steelMat);
    floor.position.y = -HH + SH / 2;
    chassisG.add(floor);

    // 背板：市电就是从这里进来的
    const backG = new THREE.Group();
    backG.position.set(-HL + SH / 2, 0, 0);
    group.add(backG);
    rig(backG, -0.10, 0, 0);
    {
      const back = kit.box(SH, HH * 2, HW * 2, steelMat);
      backG.add(back);
      // 品字插口（电源线插这儿）+ 开关
      const sock = kit.box(0.070, 0.220, 0.260, kit.mat('plasticDark', { roughness: 0.75 }));
      sock.position.set(-0.040, 0.02, -0.30);
      backG.add(sock);
      const sw = kit.box(0.050, 0.090, 0.070, kit.mat('plasticMid', { roughness: 0.72 }));
      sw.position.set(-0.038, 0.02, -0.02);
      backG.add(sw);
      // 蜂窝状出风孔
      const geo = new THREE.BoxGeometry(0.014, 0.030, 0.030);
      const vent = new THREE.InstancedMesh(geo, steelMat2, 24);
      const m4 = new THREE.Matrix4();
      let n = 0;
      for (let r = 0; r < 6; r++) for (let c = 0; c < 4; c++)
        vent.setMatrixAt(n++, m4.makeTranslation(-0.014, -0.24 + r * 0.055, 0.06 + c * 0.062));
      vent.instanceMatrix.needsUpdate = true;
      backG.add(vent);
    }

    /* ============================================================
       2. 侧板 —— 拆解时向两侧让开，露出内部的一整条"流水线"
       ============================================================ */
    for (const dir of [1, -1]) {
      const sideG = new THREE.Group();
      sideG.position.set(0, 0, dir * (HW - SH / 2));
      group.add(sideG);
      rig(sideG, 0, 0.10, dir * 0.15);
      const plate = kit.box(HL * 2, HH * 2, SH, steelMat);
      sideG.add(plate);
      // 侧面的冲压加强筋
      const rib = kit.box(HL * 1.7, 0.030, SH + 0.004, steelMat2);
      rib.position.y = 0.14;
      sideG.add(rib);
    }

    /* ============================================================
       3. 顶盖 + 风扇
       电源装在机箱底部时风扇朝上，把机箱里的空气抽进来吹过所有元件。
       ============================================================ */
    const topG = new THREE.Group();
    topG.position.y = HH - SH / 2;   // = 0.34，顶盖就架在壳体上沿
    group.add(topG);
    rig(topG, 0, 0.38, 0);

    {
      // 四边框（中间留出风扇的圆孔）
      const bars = [[HL * 2, SH, 0.10, 0, HW - 0.05], [HL * 2, SH, 0.10, 0, -HW + 0.05],
                    [0.10, SH, HW * 2 - 0.20, HL - 0.05, 0], [0.10, SH, HW * 2 - 0.20, -HL + 0.05, 0]];
      for (const [w, h, d, px, pz] of bars) {
        const b = kit.box(w, h, d, steelMat);
        b.position.set(px, 0, pz);
        topG.add(b);
      }
      // 风扇外的圆形护圈
      const ring = kit.cyl(0.46, 0.46, SH + 0.006, 24, steelMat, true);
      topG.add(ring);
      // 四角螺丝
      for (const [px, pz] of [[0.44, 0.44], [0.44, -0.44], [-0.44, 0.44], [-0.44, -0.44]]) {
        const sc = kit.cyl(0.022, 0.022, SH + 0.014, 8, kit.mats.metal);
        sc.position.set(px, 0, pz);
        topG.add(sc);
      }
    }

    /* ---------- 风扇（轴向抽风，绕 y 轴转） ---------- */
    const fanGroup = new THREE.Group();
    fanGroup.position.y = HH - 0.09;
    group.add(fanGroup);
    rig(fanGroup, 0, 0.38, 0);
    let blades;
    {
      const hubMat = kit.mat('plasticDark', { roughness: 0.72, metalness: 0.04 });
      const hub = kit.cyl(0.085, 0.085, 0.075, 16, hubMat);
      fanGroup.add(hub);
      // 中心轴标
      const cap = kit.cyl(0.045, 0.045, 0.012, 12, kit.mats.metal);
      cap.position.y = 0.042;
      fanGroup.add(cap);

      // 7 片扇叶，每片是一块带扭转的薄板 —— 转动时就靠这个倾角推空气
      blades = new THREE.Group();
      fanGroup.add(blades);
      const bladeMat = kit.mat('plastic', { roughness: 0.70, metalness: 0.03, color: 0x565d64 });
      for (let i = 0; i < 7; i++) {
        const b = kit.box(0.300, 0.010, 0.130, bladeMat);
        const a = (i / 7) * Math.PI * 2;
        b.position.set(Math.cos(a) * 0.235, 0.012, Math.sin(a) * 0.235);
        b.rotation.y = -a;
        b.rotation.z = 0.42;      // 叶片倾角
        blades.add(b);
      }
      // 让每片叶子都贴着轮毂连出去：加一圈连杆
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const arm = kit.box(0.120, 0.014, 0.055, hubMat);
        arm.position.set(Math.cos(a) * 0.13, 0.010, Math.sin(a) * 0.13);
        arm.rotation.y = -a;
        blades.add(arm);
      }
    }

    /* ============================================================
       4. 内部：一整条能量流水线，从左（AC）到右（DC）
       每个子系统是一个 Group，拆解时沿 x 向外摊开成一条线。
       ============================================================ */
    const chain = [];   // 摊开用：{g, baseX}

    const link = (g, x) => {
      g.position.set(x, -HH + SH, 0);
      g.userData.baseX = x;
      chain.push(g);
      return g;
    };

    // 内部底板（电路板本体）
    const pcb = kit.box(1.02, 0.014, 1.08, kit.mats.pcb);
    pcb.position.set(0, -HH + SH + 0.007, 0);
    group.add(pcb);
    rig(pcb, 0, 0, 0);

    /* ---------- 4.1 EMI 滤波：把插座进来的杂波挡住 ---------- */
    const emiG = new THREE.Group();
    group.add(emiG);
    link(emiG, -0.44);
    {
      const y0 = 0.020;   // 相对内部底板
      const coilMat = kit.mats.copper;
      const coreMat = kit.mat('plasticDark', { roughness: 0.80, metalness: 0.05 });
      for (const z of [0.18, -0.18]) {
        const core = kit.cyl(0.070, 0.070, 0.048, 16, coreMat);
        core.position.set(0, y0 + 0.024, z);
        emiG.add(core);
        // 绕在磁环上的铜线：用一圈细管表示
        const w = kit.cyl(0.078, 0.078, 0.040, 20, coilMat, true);
        w.position.set(0, y0 + 0.024, z);
        emiG.add(w);
      }
      // X 电容 / 共模电感那一排小黑块
      for (let i = 0; i < 3; i++) {
        const c = kit.box(0.075, 0.045, 0.035, kit.mats.ceramic);
        c.position.set(0.03, y0 + 0.022, -0.05 + i * 0.075);
        emiG.add(c);
      }
    }

    /* ---------- 4.2 整流桥：交流 → 脉动直流 ---------- */
    const rectG = new THREE.Group();
    group.add(rectG);
    link(rectG, -0.30);
    {
      const body = kit.box(0.100, 0.075, 0.150, steelMat3);
      body.position.set(0, 0.055, 0.10);
      rectG.add(body);
      // 四只脚
      for (let i = 0; i < 4; i++) {
        const leg = kit.box(0.014, 0.045, 0.012, kit.mats.gold);
        leg.position.set((i % 2 ? 0.026 : -0.026), 0.022, 0.10 + (i < 2 ? 0.035 : -0.035));
        rectG.add(leg);
      }
      // 旁边一片小散热片：放在靠 +z 的一侧，
      // 让开后面那只大电容的直径（电容很粗，挤不得）
      const hs = kit.box(0.030, 0.090, 0.170, steelMat3);
      hs.position.set(0.085, 0.065, 0.10);
      rectG.add(hs);
    }

    /* ---------- 4.3 主电容：把脉动直流先"抹平"一次 ---------- */
    const bulkG = new THREE.Group();
    group.add(bulkG);
    link(bulkG, -0.28);   // 往左让开变压器的线包：这只电容直径最大，最容易撞
    {
      const body = kit.cyl(0.078, 0.078, 0.300, 20, kit.mat('plasticDark', { roughness: 0.70, color: 0x39404a }));
      body.position.set(0, 0.168, -0.10);
      bulkG.add(body);
      // 电容顶部的泄压纹 + 正极
      const top = kit.cyl(0.070, 0.078, 0.018, 20, steelMat3);
      top.position.set(0, 0.326, -0.10);
      bulkG.add(top);
      const sleeve = kit.cyl(0.080, 0.080, 0.055, 20, kit.mat('plasticDark', { roughness: 0.62, color: 0x6d5f52 }), true);
      sleeve.position.set(0, 0.150, -0.10);
      bulkG.add(sleeve);
      // 第二只小一点的（往 +z 错开，别跟大电容叠在一起）
      const b2 = kit.cyl(0.055, 0.055, 0.170, 14, kit.mat('plasticDark', { roughness: 0.70, color: 0x39404a }));
      b2.position.set(0, 0.105, 0.30);
      bulkG.add(b2);
    }

    /* ---------- 4.4 高频变压器：整台电源的心脏 ----------
       初级这边是高压高频方波，次级那边匝数少，感应出来的就是低压大电流。 */
    const xfmrG = new THREE.Group();
    group.add(xfmrG);
    link(xfmrG, 0.03);
    {
      const coreMat = kit.mat('plasticDark', { roughness: 0.82, metalness: 0.08, color: 0x353a41 });
      // EE 型铁氧体磁芯：上下两块 + 中间的中柱
      const top = kit.box(0.300, 0.075, 0.270, coreMat);
      top.position.set(0, 0.235, 0);
      xfmrG.add(top);
      const bot = kit.box(0.300, 0.075, 0.270, coreMat);
      bot.position.set(0, 0.075, 0);
      xfmrG.add(bot);
      const mid = kit.box(0.085, 0.090, 0.270, coreMat);
      mid.position.set(0, 0.152, 0);
      xfmrG.add(mid);
      // 初级/次级线包：两只铜色线轴
      const w1 = kit.cyl(0.098, 0.098, 0.150, 16, kit.mats.copper);
      w1.position.set(-0.02, 0.152, -0.115);
      xfmrG.add(w1);
      const w2 = kit.cyl(0.086, 0.086, 0.150, 16, kit.mats.copper);
      w2.position.set(-0.02, 0.152, 0.115);
      xfmrG.add(w2);
      // 包在外面的绝缘胶带
      const tape = kit.box(0.215, 0.105, 0.290, kit.mats.ceramic);
      tape.position.set(-0.075, 0.152, 0);
      xfmrG.add(tape);
    }

    /* ---------- 4.5 二次侧：再整流一次 + 输出电感 ---------- */
    const secG = new THREE.Group();
    group.add(secG);
    link(secG, 0.27);
    {
      const hsMat = steelMat3;
      for (const z of [0.16, -0.16]) {
        const base = kit.box(0.075, 0.020, 0.240, hsMat);
        base.position.set(0, 0.105, z);
        secG.add(base);
        const geo = new THREE.BoxGeometry(0.016, 0.075, 0.230);
        const inst = new THREE.InstancedMesh(geo, hsMat, 5);
        const m4 = new THREE.Matrix4();
        for (let i = 0; i < 5; i++) inst.setMatrixAt(i, m4.makeTranslation(-0.026 + i * 0.013, 0.152, z));
        inst.instanceMatrix.needsUpdate = true;
        inst.castShadow = true;
        secG.add(inst);
      }
      // 输出储能电感：两只立式磁环
      for (const z of [0.02, -0.02]) {
        const ind = kit.cyl(0.055, 0.055, 0.070, 14, kit.mat('plasticDark', { roughness: 0.78, color: 0x3d434b }));
        // 立在两排散热片之间的空档里：左边是变压器磁芯、右边是电容排
        ind.position.set(-0.01, 0.055, z * 6);
        secG.add(ind);
      }
    }

    /* ---------- 4.6 输出滤波电容组：最后一道"抹平" ----------
       这一排电容的呼吸 = 它们在反复充电、放电，把脉动抹成平稳的直流。 */
    const capG = new THREE.Group();
    group.add(capG);
    link(capG, 0.42);
    let capGlowMat;
    {
      const n = 10;
      const bodyMat = kit.mat('plasticDark', { roughness: 0.70, color: 0x3a414b });
      const geo = new THREE.CylinderGeometry(0.042, 0.042, 0.175, 12);
      const inst = new THREE.InstancedMesh(geo, bodyMat, n);
      const m4 = new THREE.Matrix4();
      for (let i = 0; i < n; i++) inst.setMatrixAt(i, m4.makeTranslation((i % 2) * 0.09 - 0.045, 0.088, (i - (n - 1) / 2) * 0.105));
      inst.instanceMatrix.needsUpdate = true;
      inst.castShadow = true;
      capG.add(inst);
      // 顶部的银色正极
      const geo2 = new THREE.CylinderGeometry(0.036, 0.042, 0.014, 12);
      const tops = new THREE.InstancedMesh(geo2, steelMat3, n);
      for (let i = 0; i < n; i++) tops.setMatrixAt(i, m4.makeTranslation((i % 2) * 0.09 - 0.045, 0.180, (i - (n - 1) / 2) * 0.105));
      tops.instanceMatrix.needsUpdate = true;
      capG.add(tops);

      // "电量条"：一排会呼吸的发光点（clone 一份 kit 材质，才能单独改亮度）
      capGlowMat = kit.glow(hue, 1.0).clone();
      const bar = new THREE.InstancedMesh(new THREE.BoxGeometry(0.014, 0.014, 0.086), capGlowMat, n);
      for (let i = 0; i < n; i++) bar.setMatrixAt(i, m4.makeTranslation((i % 2) * 0.09 - 0.045, 0.20, (i - (n - 1) / 2) * 0.105));
      bar.instanceMatrix.needsUpdate = true;
      capG.add(bar);
    }

    /* ---------- 4.7 模组输出口：要哪路线就插哪路 ---------- */
    const modG = new THREE.Group();
    group.add(modG);
    link(modG, 0.545);
    {
      const panel = kit.box(0.030, 0.560, 1.000, steelMat2);
      panel.position.set(0.10, 0.28, 0);
      modG.add(panel);
      const sokMat = kit.mat('plasticDark', { roughness: 0.74 });
      const socMat = kit.mat('plasticMid', { roughness: 0.72 });
      const geo = new THREE.BoxGeometry(0.055, 0.150, 0.115);
      const inst = new THREE.InstancedMesh(geo, sokMat, 6);
      const m4 = new THREE.Matrix4();
      let n = 0;
      for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++)
        inst.setMatrixAt(n++, m4.makeTranslation(0.075, 0.145 + r * 0.185, (c - 1) * 0.285));
      inst.instanceMatrix.needsUpdate = true;
      inst.castShadow = true;
      modG.add(inst);
      // 每个口里的金针
      const pinGeo = new THREE.BoxGeometry(0.020, 0.012, 0.012);
      const pins = new THREE.InstancedMesh(pinGeo, kit.mats.gold, 6 * 8);
      let p = 0;
      for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++)
        for (let i = 0; i < 8; i++)
          pins.setMatrixAt(p++, m4.makeTranslation(0.050, 0.100 + r * 0.185 + (i % 4) * 0.028, (c - 1) * 0.285 + (i < 4 ? -0.024 : 0.024)));
      pins.instanceMatrix.needsUpdate = true;
      modG.add(pins);
      const label = kit.dot(0.115, 0.50, -0.42, kit.glow(hue, 1.6), 0.018);
      modG.add(label);
    }

    /* ============================================================
       5. 能量流：从 AC 口一路走到模组输出口
       航点绑在"会动的子系统"上，所以拆解摊开后，光流依然一个部件一个部件地穿过去。
       ============================================================ */
    const flowMat = kit.glow(0xd8b48a, 2.0);
    const flowMat2 = kit.glow(hue, 1.6).clone();   // 直流侧：换成元件标识色
    const flows = [];
    const nod = (g, y, z) => ({ g, off: new THREE.Vector3(0, y, z) });
    const lane = [
      { g: backG, off: new THREE.Vector3(-0.02, 0.02, -0.30) },
      nod(emiG, 0.05, -0.18),
      nod(rectG, 0.06, 0.10),
      nod(bulkG, 0.32, -0.10),
      nod(xfmrG, 0.15, 0.05),
      nod(secG, 0.14, 0.02),
      nod(capG, 0.16, 0.05),
      nod(modG, 0.22, -0.28),
    ];
    for (let i = 0; i < 9; i++) {
      const m = i < 4 ? flowMat.clone() : flowMat2.clone();
      const d = new THREE.Mesh(new THREE.SphereGeometry(0.019, 8, 6), m);
      d.userData.t = (i / 9) % 1;
      d.userData.k = 0.85 + (i % 3) * 0.15;
      d.userData.mat = m;
      group.add(d);
      flows.push(d);
    }

    /* ---------- 采样：把 lane 上的 u∈[0,1] 换成当前实际位置 ---------- */
    const _p = new THREE.Vector3();
    const _a = new THREE.Vector3();
    const _b = new THREE.Vector3();
    function sampleLane(u) {
      const s = kit.clamp01(u) * (lane.length - 1);
      const i = Math.min(Math.floor(s), lane.length - 2);
      const f = s - i;
      _a.copy(lane[i].g.position).add(lane[i].off);
      _b.copy(lane[i + 1].g.position).add(lane[i + 1].off);
      return _p.copy(_a).lerp(_b, f);
    }

    /* ============================================================
       原点归位：整体平移到包围盒中心（契约 §1.5）
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
        { text: 'EMI 滤波', desc: '挡住插座进来的杂波，也挡住自己发出的干扰' },
        { text: '整流与变压器', desc: '先把交流整成直流，再切成高频降到低压' },
        { text: '电容组', desc: '把脉动的电流抹平，输出才平稳' },
        { text: '模组输出口', desc: '用哪路插哪路，机箱里少一堆废线' },
      ],

      /** t: 0 = 合拢，1 = 完全拆解。纯函数，可来回擦洗 */
      setExplode(t) {
        const e = kit.easeInOut(t);

        // 顶盖 + 风扇：整体掀起
        for (const r of rigs) {
          const b = r.g.userData.base, d = r.d;
          r.g.position.set(b.x + d.x * e, b.y + d.y * e, b.z + d.z * e);
        }

        // 内部流水线：各组沿 x 向外摊开（越靠边的走得越远），像把内部摊在桌面上
        // 摊开系数 0.32（原 0.40）：模组口和 EMI 滤波是两端最外的部件，0.40 会把
        // 拆解态撑到 1.63×1.09×1.52，超过 1.6 的尺寸上限；0.32 让相邻级的间距仍清晰可辨。
        for (const g of chain) g.position.x = g.userData.baseX * (1 + 0.32 * e);
      },

      /** 持续动画：能量流 + 电容组呼吸 */
      update(elapsed, dt, emphasis = 0) {
        const spd = 0.20 + emphasis * 0.26;
        for (const f of flows) {
          f.userData.t = (f.userData.t + dt * spd * f.userData.k) % 1;
          f.position.copy(sampleLane(f.userData.t));
          // 越靠后（越接近输出端）越亮，颜色也从"暖"过渡到元件标识色
          const u = Math.min(f.userData.t, 1);
          const edge = Math.min(u, 1 - u);
          f.visible = edge > 0.03;
          f.userData.mat.emissiveIntensity = 1.0 + u * 0.8 + emphasis * 0.6;
        }

        // 电容组缓慢充放电：0.55Hz 的呼吸，选中时更明显
        const breath = 0.5 + 0.5 * Math.sin(elapsed * 3.4);
        capGlowMat.emissiveIntensity = 0.35 + breath * (0.55 + emphasis * 0.9);
      },
    };
  },
};