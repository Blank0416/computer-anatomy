/*
 * case.js —— 机箱（外壳 / 开口侧 / 前部进风 / 顶部与后部出风 / 主板托盘 / 电源仓 / 风道）
 *
 * 真实硬件里它是唯一一个“不参与计算”的元件：它只干三件事——
 *   ① 把主板、显卡、电源、硬盘固定在彼此正确的相对位置上（结构）
 *   ② 给它们送冷空气、把热空气排走（风道）
 *   ③ 把电磁辐射关在里面、顺便挡灰和降低噪声（屏蔽 / 防尘）
 * 所以这台机箱的拆解叙述是“从外到内一层层卸壳”，而持续动画是“风道”。
 *
 * 拆解顺序（setExplode t=0 → 1）：
 *   顶盖抬起 → 前面板前移（连同前部进风扇）→ 后部面板后移 → 封闭侧板向 -X 抽出
 *   → 电源仓罩抬起 → 主板托盘向开口侧滑出 → 硬盘架抬起
 *
 * 坐标系（装配态；**原点在底板中心，Y=0 就是地面**）：
 *   +Y 上（顶盖 / 顶部出风）
 *   -Z 后部（I/O 挡板、PCIe 挡板、后置出风扇）
 *   +Z 前部（进风口 / 前面板）
 *   +X = 打开侧板的那一侧 = 观众看进去的方向 —— 这一侧**没有任何侧板几何体**
 *        只保留上下导轨和两颗卡扣，内部一眼可见
 *
 * 外形（局部坐标，布局里 scale=1）：0.80(X) × 1.70(Y) × 1.72(Z)，壁厚 0.03
 *   内部空腔：X∈[-0.37,0.37]、Y∈[0.03,1.67]、Z∈[-0.83,0.83]
 * 主板托盘平面：平贴在 X≈-0.31 的竖板上（不是元件，是“主板坐的那块钢板”）
 * 电源仓：底部靠后，Z 偏 -0.6 一带，Y 0.03~0.40
 *
 * focus（相对本元件原点）：从 +X 开口侧、前上方看整机，
 *   from=[2.35,2.25,1.30]，look=[0,0.80,0]，fov=36 —— from 距 look ≈ 3.05，
 *   俯角约 28°，水平方向离 +X 轴约 29°，正好既看进开口侧内部、又带一点前面板。
 */

export default {
  id: 'case',
  name: '机箱',
  en: 'Case',
  hue: 0xb5b0a6,

  // 机位（相对机箱原点）：+X 开口侧的前上方，距离 ≈3.0，look 在机箱中高位置
  focus: { from: [2.35, 2.25, 1.30], look: [0, 0.80, 0], fov: 36 },

  build(kit) {
    const T = kit.THREE;
    const group = new T.Group();

    /* ================= 尺寸常量（对外硬指标，不要改） ================= */
    const W = 0.80;        // 外形宽（X）
    const H = 1.70;        // 外形高（Y）—— Y=0 是地面
    const D = 1.72;        // 外形深（Z）
    const T0 = 0.03;       // 壁厚
    const HX = W / 2;      // 0.40
    const HZ = D / 2;      // 0.86
    const TRAY_X = -0.31;  // 主板托盘平面（主板就贴在这块钢板的 +X 面上）

    /* ================= 材质（一律走 kit 材质库） ================= */
    const steel = kit.mat('metal', { roughness: 0.58, metalness: 0.50, color: 0x5f666e }); // 磨砂钢构件
    const sheet = kit.mat('metal', { roughness: 0.66, metalness: 0.42, color: 0x464d55 }); // 冲压外板 / 托盘
    const dark = kit.mat('plasticDark', { roughness: 0.85, color: 0x1d2126 });             // 挡板 / 结构件
    const mesh = kit.mat('plasticDark', { roughness: 0.95, color: 0x14171b });             // 防尘网 / 深色开口
    const bezel = kit.mat('plasticDark', { roughness: 0.78, color: 0x2a2f36 });            // 前面板边框
    const blade = kit.mat('plasticMid', { roughness: 0.68, metalness: 0.05, color: 0x878e96 }); // 扇叶
    const rubber = kit.mat('rubber', {});                                                   // 减震垫
    const screw = kit.mat('metal', { roughness: 0.40, metalness: 0.60, color: 0xb9bec4 });  // 手拧螺丝
    const accent = kit.tint(0xb5b0a6, { rough: 0.45, metal: 0.25 });                        // 外壳标识色（只做点缀）

    /* 风道光点：每个粒子要独立淡入淡出，所以 clone 一份 kit.glow 再改 opacity */
    const AIR_COLD = new T.Color(0xa8bcc8); // 冷空气
    const AIR_HOT = new T.Color(0xc99a74);  // 吸过热之后的空气

    /* =====================================================================
     * 1. 底板与四角立柱 —— 整机的承重结构
     * ===================================================================*/
    const floor = kit.box(W, T0, D, steel);
    floor.position.set(0, T0 / 2, 0); // Y 0~0.03：地面基准，min.y 必须是 0
    group.add(floor);

    // 底板加强筋（冲压出来的凸起，藏在箱内）
    for (let i = 0; i < 3; i++) {
      const rib = kit.box(W - 2 * T0, 0.006, 0.02, sheet);
      rib.position.set(0, T0 + 0.002, -0.55 + i * 0.45);
      group.add(rib);
    }

    // 四角立柱：把底板和顶框连成一副“笼子”
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const post = kit.box(T0, H - 2 * T0, T0, steel);
        post.position.set(sx * (HX - T0 / 2), H / 2, sz * (HZ - T0 / 2));
        group.add(post);
      }
    }

    // 四角橡胶脚垫（整机垫高一点，底部进风口才吸得到风）
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const foot = kit.box(0.07, 0.004, 0.07, rubber);
        foot.position.set(sx * 0.32, 0.002, sz * 0.78);
        group.add(foot);
      }
    }

    /* ------------- 开口侧（+X）：只有导轨与卡扣，没有侧板 ------------- */
    for (const y of [0.045, H - T0 - 0.015]) {
      const rail = kit.box(0.02, 0.03, D - 2 * T0, sheet);
      rail.position.set(HX - 0.01, y, 0);
      group.add(rail);
    }
    for (const sz of [-1, 1]) {
      const latch = kit.box(0.018, 0.05, 0.018, dark); // 侧板卡扣：侧板就是扣在这两颗上的
      latch.position.set(HX - 0.012, 0.85, sz * 0.80);
      group.add(latch);
    }

    /* =====================================================================
     * 2. 顶盖与顶部出风（拆解时整体抬起）
     * ===================================================================*/
    const topG = new T.Group();

    // 顶框四条边
    for (const sx of [-1, 1]) {
      const rail = kit.box(T0, T0, D - 2 * T0, steel);
      rail.position.set(sx * (HX - T0 / 2), H - T0 / 2, 0);
      topG.add(rail);
    }
    for (const sz of [-1, 1]) {
      const rail = kit.box(W - 2 * T0, T0, T0, steel);
      rail.position.set(0, H - T0 / 2, sz * (HZ - T0 / 2));
      topG.add(rail);
    }

    // 顶部出风槽：11 条细缝（InstancedMesh，不逐条 new box）
    const m4 = new T.Matrix4();
    const ventGeo = new T.BoxGeometry(0.64, 0.014, 0.030);
    const vents = new T.InstancedMesh(ventGeo, dark, 11);
    vents.castShadow = true;
    vents.receiveShadow = true;
    for (let i = 0; i < 11; i++) {
      m4.makeTranslation(0, H - 0.014, (i - 5) * 0.11);
      vents.setMatrixAt(i, m4);
    }
    vents.instanceMatrix.needsUpdate = true;
    topG.add(vents);

    // 顶盖内侧防尘网（热风往上走，这里最容易积灰）
    const topMesh = kit.box(0.64, 0.006, 1.24, mesh);
    topMesh.position.set(0, H - 0.028, 0);
    topG.add(topMesh);

    // 顶盖两颗手拧螺丝（拆机第一件事就是拧这两颗）
    for (const sx of [-1, 1]) {
      const thumb = kit.cyl(0.016, 0.016, 0.010, 10, screw);
      thumb.position.set(sx * 0.345, H - 0.005, -0.80);
      topG.add(thumb);
    }

    /* =====================================================================
     * 3. 前面板：进风 + 前置 I/O（拆解时整体前移）
     * ===================================================================*/
    const frontG = new T.Group();

    // 上横梁（含前置 I/O）与下横梁
    const beamTop = kit.box(W - 2 * T0, 0.10, T0, bezel);
    beamTop.position.set(0, 1.62, HZ - T0 / 2);
    frontG.add(beamTop);
    const beamBot = kit.box(W - 2 * T0, 0.06, T0, bezel);
    beamBot.position.set(0, 0.06, HZ - T0 / 2);
    frontG.add(beamBot);

    // 前面板标识色条（机箱的“身份色”只做一小条点缀）
    const badge = kit.box(W - 2 * T0 - 0.04, 0.012, 0.006, accent);
    badge.position.set(0, 0.095, HZ - 0.004);
    frontG.add(badge);

    // 进风栅：14 条横向细缝（整块前面板的进风面积）
    const slatGeo = new T.BoxGeometry(0.72, 0.028, 0.022);
    const slats = new T.InstancedMesh(slatGeo, bezel, 14);
    slats.castShadow = true;
    slats.receiveShadow = true;
    for (let i = 0; i < 14; i++) {
      m4.makeTranslation(0, 0.13 + i * 0.107, HZ - 0.016);
      slats.setMatrixAt(i, m4);
    }
    slats.instanceMatrix.needsUpdate = true;
    frontG.add(slats);

    // 栅格后面的防尘网
    const frontMesh = kit.box(0.74, 1.46, 0.006, mesh);
    frontMesh.position.set(0, 0.83, HZ - 0.045);
    frontG.add(frontMesh);

    // 前置 I/O：电源键 + 2 个 USB + 2 颗指示灯
    const power = kit.cyl(0.022, 0.022, 0.010, 16, kit.mat('plasticMid', { color: 0xc8ccd2 }));
    power.rotation.x = Math.PI / 2;
    power.position.set(0.30, 1.62, HZ - 0.007);
    frontG.add(power);
    for (const x of [0.14, 0.19]) {
      const usb = kit.box(0.032, 0.012, 0.010, mesh);
      usb.position.set(x, 1.62, HZ - 0.007);
      frontG.add(usb);
    }
    const ledMats = [kit.glow(0x7fe0a8, 1.4), kit.glow(0x8fc4ff, 1.2)];
    for (let i = 0; i < 2; i++) {
      const led = kit.sphere(0.005, 8, ledMats[i]);
      led.position.set(-0.30 + i * 0.03, 1.62, HZ - 0.006);
      frontG.add(led);
    }

    /* =====================================================================
     * 4. 风扇（前部 3 个进风、后部 1 个出风）—— 风道的动力
     *    扇叶角度 = 转速 × elapsed，不做累加，保证任意时刻可重现
     * ===================================================================*/
    const makeFan = (size) => {
      const holder = new T.Group();
      const half = (size - 0.03) / 2;

      // 外框四条边
      const frameSpec = [
        [size, 0.03, 0.02, 0, half],
        [size, 0.03, 0.02, 0, -half],
        [0.03, size - 0.06, 0.02, -half, 0],
        [0.03, size - 0.06, 0.02, half, 0],
      ];
      for (const [w, h, d, x, y] of frameSpec) {
        const edge = kit.box(w, h, d, dark);
        edge.position.set(x, y, 0);
        holder.add(edge);
      }

      // 四角橡胶减震垫（风扇振动会变成噪声，全靠这四个垫子隔开）
      for (const sx of [-1, 1]) {
        for (const sy of [-1, 1]) {
          const pad = kit.cyl(0.016, 0.016, 0.024, 10, rubber);
          pad.rotation.x = Math.PI / 2;
          pad.position.set(sx * half, sy * half, 0);
          holder.add(pad);
        }
      }

      // 轮毂 + 7 片扇叶（扇叶绕局部 Z 轴转，即风扇轴向 = Z）
      const hub = kit.cyl(0.045, 0.045, 0.022, 16, dark);
      holder.add(hub);
      const blades = new T.Group();
      for (let i = 0; i < 7; i++) {
        // 叶片：径向 0.145（从轮毂伸出去）、切向 0.085（弦长）、轴向只有 0.006
        // 绕径向轴（局部 X）倾 0.42 rad 就是攻角——叶片把旋转搅成轴向气流
        const b = kit.box(0.145, 0.085, 0.006, blade);
        b.position.set(0.10, 0.007, 0);
        b.rotation.x = 0.42;
        const arm = new T.Group();
        arm.rotation.z = (i / 7) * Math.PI * 2;
        arm.add(b);
        blades.add(arm);
      }
      holder.add(blades);
      return { holder, blades };
    };

    // 前部 3 个进风扇（装在前面板后面，轴向 = Z，往箱内吸风）
    const frontFanG = new T.Group();
    const frontBlades = [];
    for (let i = 0; i < 3; i++) {
      const f = makeFan(0.43);
      f.holder.position.set(0, 0.32 + i * 0.48, 0.805);
      frontFanG.add(f.holder);
      frontBlades.push(f.blades);
    }

    /* =====================================================================
     * 5. 后部面板：I/O、PCIe、电源三个开口（拆解时整体后移）
     * ===================================================================*/
    const backG = new T.Group();
    const backZ = -(HZ - T0 / 2); // -0.845，板厚 0.03 → Z∈[-0.86,-0.83]

    // 边框：上、下、左、右 + 中横梁 + I/O 与风扇之间的竖梁
    const backFrame = [
      [W - 2 * T0, 0.08, T0, 0, 1.63, backZ],
      [W - 2 * T0, 0.06, T0, 0, 0.06, backZ],
      [0.055, H - 2 * T0, T0, -0.3425, 0.85, backZ],
      [0.045, H - 2 * T0, T0, 0.3475, 0.85, backZ],
      [W - 2 * T0, 0.07, T0, 0, 0.985, backZ],
      [0.06, 0.57, T0, -0.135, 1.305, backZ],
    ];
    for (const [w, h, d, x, y, z] of backFrame) {
      const p = kit.box(w, h, d, steel);
      p.position.set(x, y, z);
      backG.add(p);
    }

    // I/O 挡板：一块冲压钢片，主板的所有外设接口从这里伸出去
    const ioShield = kit.box(0.15, 0.57, 0.008, kit.mat('metal', { roughness: 0.38, metalness: 0.70, color: 0x59616a }));
    ioShield.position.set(-0.24, 1.305, backZ);
    backG.add(ioShield);

    // 接口凸包（2 列 × 3 行：USB / 网口 / 音频都从这个方向出去）
    const portGeo = new T.BoxGeometry(0.045, 0.030, 0.014);
    const ports = new T.InstancedMesh(portGeo, kit.mat('metal', { roughness: 0.5, metalness: 0.5, color: 0x3f464e }), 6);
    let pi = 0;
    for (const py of [1.10, 1.24, 1.38]) {
      for (const px of [-0.275, -0.205]) {
        m4.makeTranslation(px, py, -0.852);
        ports.setMatrixAt(pi++, m4);
      }
    }
    ports.instanceMatrix.needsUpdate = true;
    backG.add(ports);

    // 扩展槽区：7 条 PCIe 挡板（一条对应一个槽位，显卡/网卡就从这里露出）
    const pciePlate = kit.box(W - 2 * T0, 0.60, 0.006, mesh);
    pciePlate.position.set(0, 0.65, -0.838);
    backG.add(pciePlate);
    const slotGeo = new T.BoxGeometry(0.44, 0.066, 0.010);
    const slots = new T.InstancedMesh(slotGeo, kit.mat('metal', { roughness: 0.5, metalness: 0.5, color: 0x6b7278 }), 7);
    slots.castShadow = true;
    for (let i = 0; i < 7; i++) {
      m4.makeTranslation(-0.09, 0.398 + i * 0.076, -0.850);
      slots.setMatrixAt(i, m4);
    }
    slots.instanceMatrix.needsUpdate = true;
    backG.add(slots);
    for (let i = 0; i < 7; i++) {
      const s = kit.box(0.012, 0.012, 0.008, screw);
      s.position.set(0.12, 0.398 + i * 0.076, -0.850);
      backG.add(s);
    }

    // 电源区出风：网孔 + 5 条格栅（电源的热风也从后面走）
    const psuMesh = kit.box(0.62, 0.24, 0.006, mesh);
    psuMesh.position.set(0, 0.22, -0.838);
    backG.add(psuMesh);
    const grilleGeo = new T.BoxGeometry(0.60, 0.014, 0.008);
    const grille = new T.InstancedMesh(grilleGeo, mesh, 5);
    for (let i = 0; i < 5; i++) {
      m4.makeTranslation(0, 0.13 + i * 0.045, -0.848);
      grille.setMatrixAt(i, m4);
    }
    grille.instanceMatrix.needsUpdate = true;
    backG.add(grille);

    // 后置出风扇（轴向 = Z，把箱内热风抽出去）
    const rearFan = makeFan(0.43);
    rearFan.holder.position.set(0.11, 1.30, -0.805);
    backG.add(rearFan.holder);
    const rearDisc = kit.cyl(0.215, 0.215, 0.006, 32, mesh);
    rearDisc.rotation.x = Math.PI / 2;
    rearDisc.position.set(0.11, 1.30, -0.842);
    backG.add(rearDisc);
    const barGeo = new T.BoxGeometry(0.44, 0.008, 0.006);
    const bars = new T.InstancedMesh(barGeo, kit.mat('metal', { roughness: 0.45, metalness: 0.60, color: 0x767d85 }), 6);
    for (let i = 0; i < 6; i++) {
      m4.makeTranslation(0.11, 1.30 + (i - 2.5) * 0.07, -0.852);
      bars.setMatrixAt(i, m4);
    }
    bars.instanceMatrix.needsUpdate = true;
    backG.add(bars);
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        const s = kit.cyl(0.008, 0.008, 0.006, 8, screw);
        s.rotation.x = Math.PI / 2;
        s.position.set(0.11 + sx * 0.19, 1.30 + sy * 0.19, -0.852);
        backG.add(s);
      }
    }

    /* =====================================================================
     * 6. 封闭侧板（-X）：拆解时向 -X 抽出；开口侧（+X）不放任何板
     * ===================================================================*/
    const sideG = new T.Group();
    const sidePanel = kit.box(T0, H - 2 * T0, D - 2 * T0, sheet);
    sidePanel.position.set(-(HX - T0 / 2), H / 2, 0);
    sideG.add(sidePanel);
    // 侧板压筋（冲压加强，也方便手指抠住推拉）
    const groove = kit.box(0.004, H - 2 * T0 - 0.12, 0.02, steel);
    groove.position.set(-(HX - T0) - 0.002, H / 2, 0.30);
    sideG.add(groove);
    // 侧板后端两颗手拧螺丝
    for (const y of [0.35, 1.35]) {
      const s = kit.cyl(0.015, 0.015, 0.010, 10, screw);
      s.rotation.z = Math.PI / 2;
      s.position.set(-(HX - T0 / 2) - 0.006, y, -0.78);
      sideG.add(s);
    }

    /* =====================================================================
     * 7. 主板托盘 + 理线位（-X 侧那块竖板；主板贴它的 +X 面）
     *    中间特意留出 CPU 背板开窗（换散热器要拆背板）
     * ===================================================================*/
    const trayG = new T.Group();
    const trayParts = [
      [0.02, 0.56, 1.56, TRAY_X, 0.70, -0.05], // 下半板 Y 0.42~0.98
      [0.02, 0.32, 0.38, TRAY_X, 1.14, -0.64], // 开窗后半段
      [0.02, 0.32, 0.76, TRAY_X, 1.14, 0.35],  // 开窗前半段
      [0.02, 0.16, 1.56, TRAY_X, 1.38, -0.05], // 上沿
    ];
    for (const [w, h, d, x, y, z] of trayParts) {
      const p = kit.box(w, h, d, sheet);
      p.position.set(x, y, z);
      trayG.add(p);
    }

    // 六颗铜柱：把主板架离钢板，同时把主板地、机箱地连成同一个地
    const standoffs = [
      [0.50, -0.70], [0.50, -0.02], [0.50, 0.60],
      [1.34, -0.70], [1.34, 0.60], [0.92, 0.60],
    ];
    for (const [y, z] of standoffs) {
      const st = kit.cyl(0.018, 0.018, 0.022, 10, kit.mats.copper);
      st.rotation.z = Math.PI / 2;
      st.position.set(TRAY_X + 0.021, y, z);
      trayG.add(st);
    }

    // 三个理线孔（橡胶护圈）：线从前/上走，尽量别横在风道上
    for (const [y, z] of [[0.56, 0.60], [1.02, 0.60], [1.24, 0.20]]) {
      const hole = kit.box(0.008, 0.10, 0.07, mesh);
      hole.position.set(TRAY_X - 0.001, y, z);
      trayG.add(hole);
      const ring = kit.cyl(0.055, 0.055, 0.016, 16, rubber, true);
      ring.rotation.z = Math.PI / 2;
      ring.position.set(TRAY_X - 0.002, y, z);
      trayG.add(ring);
    }

    // 背线槽 + 三根理线带
    const channel = kit.box(0.04, 1.30, 0.06, dark);
    channel.position.set(-0.35, 0.80, 0.66);
    trayG.add(channel);
    for (const y of [0.45, 0.85, 1.25]) {
      const strap = kit.box(0.05, 0.02, 0.02, kit.mat('rubber', { color: 0x33383e }));
      strap.position.set(-0.35, y, 0.66);
      trayG.add(strap);
    }

    /* =====================================================================
     * 8. 电源仓（底部靠后）+ 硬盘架（底部前方）
     * ===================================================================*/
    const shroudG = new T.Group();
    const shroudTop = kit.box(0.72, 0.02, 0.62, dark);
    shroudTop.position.set(-0.01, 0.345, -0.51); // 顶板：把电源和上方显卡区隔开
    shroudG.add(shroudTop);
    const shroudFace = kit.box(0.72, 0.31, 0.02, dark);
    shroudFace.position.set(-0.01, 0.19, -0.20); // 前立面
    shroudG.add(shroudFace);
    for (const z of [-0.72, -0.36]) {
      const rail = kit.box(0.56, 0.012, 0.03, steel); // 电源滑轨
      rail.position.set(0, 0.052, z);
      shroudG.add(rail);
      const pad = kit.box(0.56, 0.010, 0.05, rubber); // 仓底减震垫
      pad.position.set(0, 0.036, z);
      shroudG.add(pad);
    }

    const cageG = new T.Group();
    const cageW = 0.52;
    const cageD = 0.62;
    const cageZ = 0.36;
    const cageBase = kit.box(cageW, 0.010, cageD, steel);
    cageBase.position.set(0, 0.040, cageZ);
    cageG.add(cageBase);
    for (const sx of [-1, 1]) {
      const rail = kit.box(0.02, 0.075, cageD, steel); // 两侧导轨：3.5" 硬盘直接滑进去
      rail.position.set(sx * (cageW / 2 - 0.01), 0.075, cageZ);
      cageG.add(rail);
    }
    const cageFace = kit.box(cageW, 0.09, 0.02, dark);
    cageFace.position.set(0, 0.075, cageZ - cageD / 2);
    cageG.add(cageFace);
    for (const sx of [-1, 1]) {
      const pad = kit.box(0.02, 0.02, 0.10, rubber); // 硬盘减震垫
      pad.position.set(sx * (cageW / 2 - 0.01), 0.048, cageZ);
      cageG.add(pad);
    }

    /* =====================================================================
     * 9. 风道粒子 —— 机箱唯一的“原理”，必须一眼看懂
     *    路线用 [y,z] 航点描述，x 由车道给出；粒子全程待在箱体内部（不破坏包围盒）
     * ===================================================================*/
    const ROUTES = [
      // A：前面板下沿进 → 经过主板/散热器 → 从顶部出风
      [[0.26, 0.80], [0.52, 0.36], [0.88, -0.06], [1.24, -0.34], [1.50, -0.18], [1.62, 0.10]],
      // B：底部前方进 → 经过显卡区 → 从后部出风
      [[0.12, 0.72], [0.20, 0.22], [0.34, -0.34], [0.58, -0.66], [0.92, -0.80], [1.18, -0.78]],
    ];
    const LANES = [[-0.22, -0.08, 0.06, 0.20], [0.14, 0.30]];

    // 在折线上按 u∈[0,1) 取点（按时间推进，不依赖帧率）
    const sampleRoute = (route, u) => {
      const segs = route.length - 1;
      const f = Math.min(0.9999, Math.max(0, u)) * segs;
      const i = Math.floor(f);
      const k = f - i;
      const a = route[i];
      const b = route[Math.min(segs, i + 1)];
      return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
    };

    const particles = [];
    const AIR_N = 18;
    for (let i = 0; i < AIR_N; i++) {
      const r = i % 2;
      const lanes = LANES[r];
      const x = lanes[(i >> 1) % lanes.length];
      const mat = kit.glow(i < 9 ? 0xa8bcc8 : 0xc4d3dc, 1.15).clone();
      mat.transparent = true;
      mat.opacity = 0;
      mat.depthWrite = false;
      const p = kit.sphere(0.013, 8, mat);
      p.userData = { route: r, x, ph: (i * 0.137) % 1, sp: 0.070 + (i % 3) * 0.008 };
      const s = sampleRoute(ROUTES[r], p.userData.ph);
      p.position.set(x, s[0], s[1]);
      group.add(p);
      particles.push(p);
    }

    /* =====================================================================
     * 10. 拆解：各功能组登记基准位移，setExplode(t) 直接由 t 算出位置
     * ===================================================================*/
    const rig = (g, x, y, z) => {
      g.userData.base = { x, y, z };
      g.position.set(0, 0, 0); // t=0 时归零；位移只由 setExplode(t) 算出
      group.add(g);
      return g;
    };
    rig(topG, 0, 0.30, 0.03);      // 顶盖抬起
    rig(frontG, 0, 0, 0.26);       // 前面板前移
    rig(frontFanG, 0, 0.02, 0.12); // 前部进风扇跟着面板让开
    rig(backG, 0, 0, -0.24);       // 后部面板后移
    rig(sideG, -0.20, 0, 0);       // 封闭侧板向 -X 抽出
    rig(shroudG, 0, 0.12, 0);      // 电源仓罩抬起
    rig(trayG, 0.10, 0, 0);        // 主板托盘从开口侧滑出
    rig(cageG, 0, 0.06, 0.06);     // 硬盘架抬起
    const rigged = [topG, frontG, frontFanG, backG, sideG, shroudG, trayG, cageG];

    return {
      group,

      setExplode(t) {
        const e = kit.easeInOut(t);
        for (const g of rigged) {
          const b = g.userData.base;
          g.position.set(b.x * e, b.y * e, b.z * e);
        }
      },

      update(elapsed, dt, emphasis = 0) {
        const boost = 1 + 1.5 * emphasis; // 被选中时风扇转快、气流也快

        // 风扇：角度 = 转速 × elapsed（绝不累加，保证与时间轴一致、可反复回放）
        for (let i = 0; i < frontBlades.length; i++) {
          frontBlades[i].rotation.z = elapsed * (4.6 + i * 0.15) * boost;
        }
        rearFan.blades.rotation.z = -elapsed * 5.1 * boost;

        // 风道：冷空气被吸进来 → 经过热源变暖 → 排出（用色温 + 淡出表达）
        for (const p of particles) {
          const d = p.userData;
          const u = (elapsed * d.sp * boost + d.ph) % 1;
          const s = sampleRoute(ROUTES[d.route], u);
          p.position.set(d.x, s[0], s[1]);
          const m = p.material;
          m.color.lerpColors(AIR_COLD, AIR_HOT, Math.min(1, u * 1.25));
          m.emissive.copy(m.color);
          m.opacity = Math.min(1, u / 0.08) * Math.min(1, (1 - u) / 0.18);
          m.emissiveIntensity = 1.15 * m.opacity;
        }
      },

      legend: [
        { text: '外框与立柱', desc: '一副钢笼子：所有零件的相对位置都由它决定，装机就是“往这个笼子里塞”。' },
        { text: '前面板进风', desc: '冷空气只从前面板（和箱底）进来，栅格后面是一整张防尘网。' },
        { text: '顶盖与后部出风', desc: '热空气更轻，从上面和后面排走；后置风扇负责把箱内热气抽出去。' },
        { text: '主板托盘与铜柱', desc: '主板用六颗铜柱架离钢板：既留出背线空间，也让主板地和机箱地连成同一个地。' },
        { text: '风道', desc: '前面进、后面出，一路带走 CPU 和显卡的热量——机箱本身不干活，它只负责让风走对路。' },
      ],
    };
  },
};