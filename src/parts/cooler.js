/* ============================================================
   cooler.js — 散热器（塔式风冷）
   拆解：底座 → 热管 → 鳍片阵列 → 风扇
   动画：风扇转；一串光点从底座沿着热管"爬"到鳍片顶端，色温由暖转冷。
        这一步是散热器最容易被误解的地方：热量是被【传导】走的，
        不是被吹走的 —— 风扇只负责最后把鳍片上的热交给空气。
   ============================================================ */

export default {
  id: 'cooler',
  name: '散热器',
  en: 'Cooler',
  hue: 0x9bb2c4,

  // 机位相对本元件原点（main.js 会加上元件在世界里的位置）
  // 从右前上方 31° 俯看：底座、热管、鳍片、风扇四层都能分辨
  // 机位随原点归位一起补偿，保证画面构图和设计时一致
  focus: { from: [1.35, 1.28, 1.47], look: [0, -0.01, -0.08], fov: 34 },

  build(kit) {
    const { THREE } = kit;
    const group = new THREE.Group();
    const hue = 0x9bb2c4;

    /* ---------- 尺寸 ---------- */
    const BASE = 0.46;        // 底座边长（真散热器底座比 CPU 顶盖略大）
    const BASE_T = 0.055;     // 底座厚
    const yBase = -0.60;      // 底座中心高度
    const FIN_W = 0.86;       // 鳍片宽（沿 x，热管排成一列的方向）
    const FIN_D = 0.46;       // 鳍片厚（沿 z，风穿过的方向）
    const FIN_T = 0.005;      // 单片鳍片厚度
    const FIN_N = 42;         // 42 片，够密但不爆面
    const FIN_Y0 = -0.12, FIN_Y1 = 0.58;
    const PIPE_X = [-0.27, -0.09, 0.09, 0.27];   // 4 根热管的 x
    const FAN_Y = 0.24, FAN_Z = 0.34, FAN_S = 0.62;

    /* ---------- 可拆解子系统登记表 ---------- */
    const rigs = [];
    const rig = (g, dx, dy, dz) => {
      g.userData.base = g.position.clone();
      rigs.push({ g, d: new THREE.Vector3(dx, dy, dz) });
      return g;
    };

    /* ============================================================
       1. 底座：抛光铜底，直接压在 CPU 顶盖上
       它只做一件事 —— 把晶片那点小面积上的热，摊到热管里去。
       ============================================================ */
    const baseG = new THREE.Group();
    group.add(baseG);
    rig(baseG, 0, -0.06, 0);

    {
      const plate = kit.box(BASE, BASE_T, BASE, kit.mats.copper);
      plate.position.y = yBase;
      baseG.add(plate);
      // 与 CPU 接触的那一面：抛光得更亮、更平（接触不好热就传不过去）
      const face = kit.box(BASE * 0.78, 0.008, BASE * 0.78, kit.mat('metal', { roughness: 0.20, metalness: 0.92, color: 0x8f7860 }));
      face.position.y = yBase - BASE_T / 2 - 0.003;
      baseG.add(face);
      // 固定底座顶盖的 6 颗螺丝
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.4;
        const s = kit.cyl(0.014, 0.014, 0.008, 6, kit.mats.metalDark);
        s.position.set(Math.cos(a) * 0.16, yBase + BASE_T / 2 + 0.003, Math.sin(a) * 0.16);
        baseG.add(s);
      }

      // 扣具（压在 CPU 插座上的那副金属架 + 两颗弹簧螺丝）
      const bracket = kit.box(0.56, 0.020, 0.070, kit.mats.metalDark);
      bracket.position.set(0, yBase - 0.020, 0.16);
      baseG.add(bracket);
      const bracket2 = kit.box(0.56, 0.020, 0.070, kit.mats.metalDark);
      bracket2.position.set(0, yBase - 0.020, -0.16);
      baseG.add(bracket2);
      for (const sx of [-0.25, 0.25]) {
        const spring = kit.cyl(0.019, 0.019, 0.055, 8, kit.mats.metal);
        spring.position.set(sx, yBase - 0.035, 0.16);
        baseG.add(spring);
      }
    }

    /* ============================================================
       2. 热管 ×4：铜壳里抽成低压，里面那点液体一受热就蒸发，
       顺着管子往上跑，到冷的那头冷凝成液体再靠毛细结构流回来。
       它就是一根"热的传送带"，不靠重力也不靠电。
       ============================================================ */
    const pipes = [];
    for (const px of PIPE_X) {
      const p = kit.trace([
        [px, yBase - 0.028, 0.030],
        [px, yBase + 0.070, 0.010],
        [px, 0.10, 0],
        [px, 0.60, 0],
      ], 0.028, kit.mats.copper, 16);
      group.add(p);
      pipes.push(p);
    }

    /* ============================================================
       3. 鳍片阵列：42 片薄铝片
       一片片的间隙加起来，是很大一块表面积 —— 空气从这里穿过去，
       才带得走热。鳍片本身不产生冷，它只是"把热摊开"。
       ============================================================ */
    const finG = new THREE.Group();
    group.add(finG);
    rig(finG, 0, 0.26, 0);

    {
      const geo = new THREE.BoxGeometry(FIN_W, FIN_T, FIN_D);
      // 鳍片基色用深铝灰：整塔若铺浅色，在原本一圈深色元件里会亮成一块白砖
      const finMat = kit.mat('metalDark', { roughness: 0.52, metalness: 0.55, color: 0x5f676e });
      const inst = new THREE.InstancedMesh(geo, finMat, FIN_N);
      const m4 = new THREE.Matrix4();
      // 底下的鳍片靠近热端 → 偏暖；顶上的鳍片 → 偏冷。
      // instanceColor 是和材质颜色相乘的，所以这里存"相对基色的比例"。
      const base = new THREE.Color(finMat.color);
      const warm = new THREE.Color(0x8a6a52), cool = new THREE.Color(0x5d6d78);
      const tmp = new THREE.Color();
      for (let i = 0; i < FIN_N; i++) {
        const y = FIN_Y0 + (i / (FIN_N - 1)) * (FIN_Y1 - FIN_Y0);
        inst.setMatrixAt(i, m4.makeTranslation(0, y, 0));
        tmp.copy(warm).lerp(cool, i / (FIN_N - 1));
        inst.setColorAt(i, new THREE.Color(tmp.r / base.r, tmp.g / base.g, tmp.b / base.b));
      }
      inst.instanceMatrix.needsUpdate = true;
      inst.instanceColor.needsUpdate = true;
      inst.castShadow = inst.receiveShadow = true;
      finG.add(inst);

      // 鳍片两侧的折边（真鳍片是冲压出来的，边缘卷一圈才够硬）
      for (const sz of [FIN_D / 2 - 0.006, -FIN_D / 2 + 0.006]) {
        const edge = kit.box(0.012, FIN_Y1 - FIN_Y0, 0.012, kit.mats.metalDark);
        edge.position.set(FIN_W / 2 - 0.006, (FIN_Y0 + FIN_Y1) / 2, sz);
        finG.add(edge);
        const edge2 = kit.box(0.012, FIN_Y1 - FIN_Y0, 0.012, kit.mats.metalDark);
        edge2.position.set(-FIN_W / 2 + 0.006, (FIN_Y0 + FIN_Y1) / 2, sz);
        finG.add(edge2);
      }
    }

    /* ============================================================
       4. 风扇：装在鳍片一侧，把空气推过鳍片缝
       ============================================================ */
    const fanG = new THREE.Group();
    fanG.position.set(0, FAN_Y, FAN_Z);
    group.add(fanG);
    rig(fanG, 0, 0.10, 0.42);

    // 风扇内部按"绕 y 轴转"来搭，最后把整个 holder 转 90° 让轴线朝向 z
    const holder = new THREE.Group();
    holder.rotation.x = -Math.PI / 2;
    fanG.add(holder);

    let blades;
    {
      const frameMat = kit.mat('plasticDark', { roughness: 0.74, metalness: 0.04 });
      const bar = 0.055;
      const S = FAN_S;
      // 方形外框（四边）
      for (const [w, d, px, pz] of [[S, bar, 0, S / 2 - bar / 2], [S, bar, 0, -S / 2 + bar / 2], [bar, S - bar * 2, S / 2 - bar / 2, 0], [bar, S - bar * 2, -S / 2 + bar / 2, 0]]) {
        const b = kit.box(w, 0.10, d, frameMat);
        b.position.set(px, 0, pz);
        holder.add(b);
      }
      // 四角减震脚垫（橡胶，防止震动传到鳍片上发出嗡嗡声）
      for (const [px, pz] of [[S / 2 - 0.03, S / 2 - 0.03], [S / 2 - 0.03, -S / 2 + 0.03], [-S / 2 + 0.03, S / 2 - 0.03], [-S / 2 + 0.03, -S / 2 + 0.03]]) {
        const pad = kit.cyl(0.028, 0.028, 0.02, 8, kit.mats.rubber);
        pad.position.set(px, 0, pz);
        holder.add(pad);
      }
      // 轮毂
      const hub = kit.cyl(0.075, 0.075, 0.075, 16, frameMat);
      holder.add(hub);
      const cap = kit.cyl(0.040, 0.040, 0.012, 12, kit.mats.metal);
      cap.position.y = 0.042;
      holder.add(cap);
      const led = kit.dot(0.055, 0.046, 0, kit.glow(hue, 1.8), 0.012);
      holder.add(led);

      // 7 片扇叶
      blades = new THREE.Group();
      holder.add(blades);
      const bladeMat = kit.mat('plastic', { roughness: 0.70, metalness: 0.03, color: 0x565d64 });
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const b = kit.box(0.250, 0.010, 0.115, bladeMat);
        b.position.set(Math.cos(a) * 0.205, 0.010, Math.sin(a) * 0.205);
        b.rotation.y = -a;
        b.rotation.z = 0.44;
        blades.add(b);
        const arm = kit.box(0.105, 0.014, 0.050, frameMat);
        arm.position.set(Math.cos(a) * 0.115, 0.008, Math.sin(a) * 0.115);
        arm.rotation.y = -a;
        blades.add(arm);
      }
    }

    /* ============================================================
       5. 热量爬升的光点：从底座出发，沿 4 根热管爬到鳍片顶端
       颜色从暖（有热）渐变到冷（热已经交出去了）。
       ============================================================ */
    const HEAT_N = 14;
    const heat = [];
    for (let i = 0; i < HEAT_N; i++) {
      const m = kit.glow(0xd8a077, 1.8).clone();     // 每个光点一份材质，才能各自变色
      const d = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), m);
      d.userData.pipe = pipes[i % pipes.length];
      d.userData.t = (i / HEAT_N) % 1;
      d.userData.mat = m;
      group.add(d);
      heat.push(d);
    }

    // 色温两端：靠近 CPU 那头是"有热"的暖，鳍片顶端是"交完热"的冷
    const COL_HOT = new THREE.Color(0xd9a077);
    const COL_COLD = new THREE.Color(0x8fb4c6);
    const _c = new THREE.Color();

    /* ============================================================
       原点归位：整体平移到包围盒中心（契约 §1.5）
       风扇往 +z 探出去一块，重心因此偏后，这一步补回来。
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
        { text: '底座（接触面）', desc: '抛光铜底，紧贴 CPU 顶盖把热吸出来' },
        { text: '热管', desc: '里面液体受热蒸发往上跑，把热搬到鳍片那头' },
        { text: '鳍片阵列', desc: '把热摊到很大一片面积上，空气才带得走' },
        { text: '风扇', desc: '把空气推过鳍片缝 —— 它只负责最后一步' },
      ],

      /** t: 0 = 合拢，1 = 完全拆解。纯函数，可来回擦洗 */
      setExplode(t) {
        const e = kit.easeInOut(t);
        for (const r of rigs) {
          const b = r.g.userData.base, d = r.d;
          r.g.position.set(b.x + d.x * e, b.y + d.y * e, b.z + d.z * e);
        }
        // 热管留在原地：它一头焊在底座上、一头穿着鳍片 ——
        // 拆开后鳍片顺着热管滑上去，正好看出"热是从这根管子里上来的"
      },

      /** 持续动画：风扇转 + 热沿热管往上爬 */
      update(elapsed, dt, emphasis = 0) {
        // 角度直接由 elapsed 算出（不累加），保证任何时刻都能重现同一帧
        blades.rotation.y = elapsed * 3.4;

        const spd = 0.13 + emphasis * 0.13;
        for (const d of heat) {
          d.userData.t = (d.userData.t + dt * spd) % 1;
          const u = d.userData.t;
          d.position.copy(kit.pointOn(d.userData.pipe, u));
          // 越往上越冷：颜色由暖到冷，亮度也降下来
          _c.copy(COL_HOT).lerp(COL_COLD, u);
          d.userData.mat.color.copy(_c);
          d.userData.mat.emissive.copy(_c);
          d.userData.mat.emissiveIntensity = (2.2 - u * 1.5) * (1 + emphasis * 0.4);
          const edge = Math.min(u, 1 - u);
          d.visible = edge > 0.03;
        }
      },
    };
  },
};