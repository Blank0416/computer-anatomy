# 电脑八大件 · 精细建模规格书

> 读者：负责 `src/parts/*.js` 的 8 个建模 agent。
> 目标：把「形体对但没细节」的 v1.0.0 升级成「近看有零件、有纹理、有工艺痕迹」的高端整机。
> 本文只给**数据与做法**，不规定架构；所有尺寸默认 **真实毫米（mm）**，需要转成场景单位时用 §0.2 的缩放表。

---

## 0. 怎么用这份文档

### 0.1 数字可信度标记（重要，别把估算当事实）

| 标记 | 含义 | 用法 |
|---|---|---|
| 带 **来源链接** | 厂商规格页 / 标准文件 / 实测拆解 | 可以直接写进代码，也可写进 `copy.js` 的参数文案 |
| **（估算）** | 未公开，按行业常识或比例反推 | 只用于**视觉**，不要写成"官方参数"给用户看 |
| **（实测量级）** | 来自评测拆解的单体样本 | 可当典型值，但注明"典型" |

> 我在每件末尾列了「查不到的项」，那些就是估算，别当事实。

### 0.2 单位换算表（先定缩放，再摆零件）

约束来自 `CONTRACT.md`：`t=0` 整体 ≤ **1.6**（case ≤ 2.2），拆解态最大轴 ≤ **1.8**（case ≤ 2.4）。
建议做法：**按真实 mm 建模 → 给 group 一个统一缩放**，这样本文所有数字可以 1:1 抄进代码。

| 元件 | 真实最大尺寸 mm | 目标最大轴（场景单位） | 缩放 k | 1 场景单位 ≈ |
|---|---|---|---|---|
| cpu | 45.0 | 1.45 | 0.03222 | 31.0 mm |
| motherboard | 305 | 1.45 | 0.004754 | 210.3 mm |
| ram | 133.35 | 1.45 | 0.010873 | 92.0 mm |
| storage | 80 | 1.45 | 0.018125 | 55.2 mm |
| gpu | 304 | 1.45 | 0.004770 | 209.6 mm |
| psu | 150 | 1.45 | 0.009667 | 103.4 mm |
| cooler | 157 | 1.45 | 0.009236 | 108.3 mm |
| case | 480.9（深） | 2.00 | 0.004159 | 240.4 mm |

（留 0.15–0.35 的余量给拆解位移；`focus.from` 里的距离要按缩放后的尺寸调。）

### 0.3 薄板别用厚度撑细节（关键经验）

按上表缩放后，很多真实薄件会变成"纸片"：

| 真实厚度 | 缩放后（主板为例） | 屏幕上大约 |
|---|---|---|
| PCB 1.6 mm | 0.0076 u | 约 4–5 px |

所以：
- **PCB / 挡板 / 鳍片 / 玻璃** 的"厚度感"靠 **轮廓线 + 贴图明暗 + 边缘高光**，不要指望几何厚度；
- 几何只负责**层与层之间的缝隙**（0.5–2 mm 的真实缝，缩放后仍有 2–5 px，够读）；
- **鳍片/网孔** 允许为了可读性**放大 1.5–2×**（并在代码注释里写明"为可读性放大"，别标成真实值）。

### 0.4 三角面预算分配（单件 ≤ 60k，别平均分）

| 元件 | 建议上限 | 理由 |
|---|---|---|
| gpu | 45k | 视觉中心，三风扇+鳍片+热管 |
| cooler | 30k | 鳍片多但单体便宜，主要是数量 |
| motherboard | 26k | 细节靠贴图，几何只做接口/散热片 |
| case | 24k | 大件、面少、别雕花 |
| psu | 18k | 内部只能看到一部分 |
| ram | 12k | 小件，288 pin 用贴图 |
| cpu | 10k | 触点阵列**必须**用贴图 |
| storage | 10k | 小件 |

> 通用做法：**数量 > 30 的重复件一律 InstancedMesh 或单张贴图**。1851 个触点、288 根金手指、600 个过孔，全部走贴图。

### 0.5 材质表达的三层法（8 件共用语言）

1. **基础 PBR 参数**：color / roughness / metalness —— 先保证整体色调统一（低饱和）。
2. **程序化贴图**（§1）：PCB 走线、拉丝、磨砂、网孔、丝印文字、触点阵列。
3. **几何微结构**：倒角层、缝隙、螺丝、卡扣、接口凹槽 —— 只在**离相机最近的 1–2 个面**上做。

---

## 1. 通用材质库与程序化贴图配方

### 1.1 材质参数基准表（可直接抄进 `kit.mat` 的 over）

| 材质 | hex | roughness | metalness | 备注 |
|---|---|---|---|---|
| 阳极氧化铝（深灰） | `#2a2d31` | 0.42 | 0.60 | 主板装甲、显卡外壳 |
| 阳极氧化铝（黑） | `#1c1d1f` | 0.50 | 0.40 | 机箱钢板、电源外壳 |
| 拉丝铝（亮） | `#c4c8cd` | 0.30 | 0.92 | 散热鳍片、CPU 顶盖 |
| 镀镍铜 | `#cfd3d7` | 0.22 | 1.00 | CPU IHS、热管、散热底座 |
| 裸铜 | `#b87333` | 0.28 | 1.00 | 热管切口、未镀镍底 |
| 镀金触点 | `#c9a227` | 0.26 | 1.00 | 金手指、CPU 触点、插座针 |
| 黑色阻焊 PCB | `#101215` | 0.62 | 0.05 | 主板、显卡、SSD |
| 绿色阻焊 PCB | `#1b3a2b` | 0.62 | 0.05 | 备选（老式主板） |
| 工程塑料（黑） | `#16171b` | 0.72 | 0.02 | 插槽、风扇叶、接口壳 |
| 哑光黑漆 | `#141518` | 0.60 | 0.10 | 风扇框、线材 |
| 钢化玻璃 | `#0b0d12` | 0.06 | 0.00 | 透射 ~0.85，微绿边 |
| 硅脂 / 导热垫 | `#9fb4c0` | 0.90 | 0.00 | 浅灰蓝，哑光 |
| 丝印白 | `#e6e6dd` | 0.80 | 0.00 | 文字、框线 |
| 橡胶 | `#131313` | 0.90 | 0.00 | 护线圈、脚垫 |
| 电解电容铝壳 | `#3d4248` | 0.35 | 0.85 | 主板/电源电容 |

### 1.2 六张程序化贴图（Canvas 生成，禁外部图片）

> 全部用 `CanvasTexture`，生成一次缓存复用；分辨率够用就行，别开 4096。

**(1) PCB 走线图 `pcb_trace` — 1024×1024，repeat 1**
- 底：`#101215` 平涂。
- 走线：随机曼哈顿路径（水平/垂直/45°），线宽 2–4 px，颜色 `#1e2a22`（比底亮 8–12%），约 120–180 条；其中 8–12 条加宽到 6–8 px 当"电源层"。
- 过孔：Ø5 px 圆点，外环 `#8a7a3a`、内孔 `#0a0b0d`，散布 400–600 个，只落在走线端点。
- 丝印：`#d8d8cf` 的 1 px 元件框 + 10–14 px 文字（`R12` `C48` `U7` `J1` `M.2_1`）。
- 焊盘：Ø10 px 金环 `#a98f3f`，按 0.85 mm 网格散布（内存槽/PCIe 槽两侧）。
- 关键：**走向要"近处密、远处疏"**，靠近 CPU 插座和内存槽的区域加密 2×，这是真实主板最明显的特征。

**(2) 金属拉丝 `metal_brush` — 512×512，repeat 2–4**
- 底 `#ffffff`（当 map 的乘数用）。
- 画 400–600 条水平 1 px 线，亮度随机 ±6%，长 200–512 px 随机起点。
- 再叠 3–5 条 2 px 深色划痕（`#d8d8d8`）。
- 用途：IHS 顶面、显卡外壳、机箱钢板。同时可当 `roughnessMap`（亮度→粗糙度），拉丝方向沿 UV 的 x。

**(3) 阳极氧化磨砂 `metal_matte` — 512×512，repeat 2**
- 白底 + 每像素 ±3% 随机噪声，再叠 20 px 尺度的低频斑块 ±2%。
- 用途：插槽外壳、风扇框、黑色铝件，避免"纯色塑料感"。

**(4) 六边形网孔 `mesh_hex` — 256×256，repeat 6–10，带 alpha**
- 六边形孔：对边距 3 px、孔间距 4 px、开孔率 ≈ 42%（真实机箱/电源网罩量级）。
- 白色=实体、黑色=孔；同时导出 alphaMap。
- 用途：电源风扇网罩、机箱前面板、顶盖防尘网。

**(5) 丝印铭牌 `label_text` — 512×256，带 alpha**
- 白/浅灰文字 + 细横线，2–3 行参数（型号 / 电压 / 认证标）。
- 用途：电源铭牌、显卡背板、内存条标签、SSD 主控丝印。
- **字体只能用系统 sans-serif 或 canvas 默认字**，不许加载外部字体（离线约束）。

**(6) 触点/金手指阵列 `contact_array` — 512×512，带 alpha**
- 规则网格：金点 `#c9a227`，点 6×6 px、间距 10 px；或长条金手指 4×40 px、间距 8 px。
- 用途：CPU 底面 1851 触点、DDR5 288 金手指、PCIe 164 pin、M.2 67 pin。
- **这是省三角面的关键**：一张贴图替代 2000 个 box。

### 1.3 倒角与缝隙的统一做法

- `kit.box` 没有 bevel，用**两层 box 叠出倒角**：外层 100% 尺寸、内层 96% 且略高 0.3–0.5 mm。
- 相邻两层之间**永远留 0.3–0.8 mm 缝**（缩放后 ~2–4 px），否则同面 z-fighting 会闪。
- 螺丝孔用**深色小圆片**（`kit.cyl` 6 段）+ 中心十字两条细 box，成本 8 tri/个。

---

## 2. 处理器 CPU

**高端参考**：Intel Core Ultra 9 285K（LGA1851）/ AMD Ryzen 9 9950X（AM5）。
选 **LGA1851 45×37.5 mm 矩形封装**更好看，也比正方形更像 2024–2026 的高端件。

### 2.1 真实尺寸

| 项 | 数值 | 来源 / 备注 |
|---|---|---|
| 封装外形 | **45.0 × 37.5 mm** | [Intel 官方 datasheet·Package Support](https://edc.intel.com/content/www/us/en/design/products/platforms/details/arrow-lake-s/core-ultra-200s-series-processors-datasheet-volume-1-of-2/package-support/) |
| 封装总高 Z-height | **4.464 ± 0.133 mm** | 同上 |
| 触点 | LGA1851，1851 个 | [Intel 规格页](https://www.intel.co.id/content/www/id/id/products/sku/241876/intel-core-ultra-5-processor-245-24m-cache-up-to-5-10-ghz/specifications.html) |
| 基板厚 | ≈1.1 mm（估算，由总高反推） | **估算** |
| IHS 顶面 | ≈37 × 30 mm，圆角 R2，四边倒角 0.4（估算） | **估算** |
| IHS 厚 | ≈1.3 mm（估算） | **估算** |
| 裸 die 参考区 | 37.5 × 30.2 mm 区内的 tile 布局 | [Intel·Package Mechanical Attributes](https://edc.intel.com/content/www/us/en/design/products/platforms/details/arrow-lake-s/core-ultra-200s-series-processors-datasheet-volume-1-of-2/007/package-mechanical-attributes/) |
| 散热器孔距 | 78 × 78 mm（LGA1700/1851 同孔距，估算） | **估算** |
| 边缘 SMD | 0402（1.0×0.5 mm）/ 0603（1.6×0.8 mm），两侧各 8–14 颗 | **估算** |
| AM5 对照（若要画 AMD） | 40 × 40 mm 正方形、LGA1718、IHS 突出 | [XFastest](https://news.xfastest.com/94985/amd-zen4-am5%e6%8f%92%e6%a7%bd%e6%9b%9d%e5%85%89-%e5%91%8a%e5%88%a5%e8%84%86%e5%bc%b1%e7%9a%84%e9%87%9d%e8%85%b3/)、[EET-China](https://www.eet-china.com/mp/a54261.html) |

### 2.2 分层拆解（6 层，建议沿 +Y 抬起）

| # | 层 | 真实厚度 | 拆解位移（场景单位） | 内容 |
|---|---|---|---|---|
| 1 | IHS 顶盖 | 1.3 mm | +0.13 | 镀镍铜、激光刻字、四边倒角 |
| 2 | 钎焊 TIM | 0.05–0.1 mm | +0.06 | 银灰薄片，边缘略溢出（真实感的来源） |
| 3 | 裸 die + tile | 0.78 mm | +0.02 | 1 大 3 小 tile，镜面硅，彩虹反光 |
| 4 | 基板 PCB | 1.1 mm | 0 | 绿/黑阻焊，边缘金焊盘环 |
| 5 | 触点阵列 | 0.1 mm | −0.04 | **贴图**，1851 点 |
| 6 | 侧边 SMD | 0.5 mm | ±X 0.06 | 电容/电阻小方块 |

### 2.3 可程序化细节清单

| 部件 | 尺寸 mm | 数量 | 排布 / 做法 |
|---|---|---|---|
| IHS | 45 × 37.5 × 1.3 | 1 | 3 层 box 叠倒角：45×37.5 / 44.4×36.9 / 43.8×36.3，各差 0.3 高 |
| IHS 刻字 | 字高 2.2 mm，3 行 | 1 张 | Canvas 512×256 alpha 贴顶面：`intel` / `CORE ULTRA 9` / `285K SRQxx` |
| 顶面拉丝 | — | 1 张 | `metal_brush` repeat(3,2) |
| 基板 | 45 × 37.5 × 1.1 | 1 | 圆角 R1，四边倒角 0.3 |
| 基板金焊盘环 | 宽 0.6 mm 边框 | 1 | 一圈 box 或贴图描边 |
| die 阵列 | 大 tile 20×14、3 小 tile 8×6（估算） | 4 | 高 0.78，`#2b2f3a` + 微 emissive 彩虹（0.02） |
| 触点阵列 | 0.9 mm 间距（估算），点 0.35 mm | 1851 | **必须用 `contact_array` 贴图**，别建几何（1851×12 tri ≈ 22k） |
| 定位缺口 | 2 × 1 mm | 2 | 两侧对称，深色凹槽 |
| 三角定位标 | 2 × 2 mm | 1 | 左下角，金色 |
| SMD 电容 | 0402：1.0×0.5×0.5 | 两侧各 10–14 | `kit.grid` 沿边缘排，间距 1.6 mm，颜色 `#8a6b4b` |
| 基板丝印 | 字高 0.8 mm | 1 张 | 型号 + 批次 + 无铅标 |

### 2.4 表面材质

| 面 | 材质 | 要点 |
|---|---|---|
| IHS 顶 | 镀镍铜 `#cfd3d7`，rough 0.22，metal 1.0 | 拉丝沿 x；边缘提亮（倒角面 rough 0.15） |
| IHS 侧 | 略暗 `#b9bdc1`，rough 0.35 | 制造"顶面抛光、侧面磨砂"的真实对比 |
| 基板 | 黑 `#101215` 或绿 `#1b3a2b`，rough 0.62 | 边缘一圈金色焊盘 |
| die | 硅 `#2b2f3a`，rough 0.10，metal 0.30 | 加极弱 emissive 彩虹，近看有油膜感 |
| 触点 | 金 `#c9a227` | 贴图，别用几何 |
| SMD | 陶瓷棕 `#8a6b4b`，rough 0.60 | 两端银白色焊端 `#c9c9c4` |

**查不到 / 估算**：基板层数、IHS 具体厚度、tile 精确尺寸、SMD 数量、散热孔距。

---

## 3. 主板 Motherboard

**高端参考**：ASUS ROG Crosshair X870E Hero / MSI MEG X870E ACE。
主板是**细节密度的标杆**：它一细，整机就显得高级。

### 3.1 真实尺寸

| 项 | 数值 | 来源 / 备注 |
|---|---|---|
| 板型 | **ATX 305 × 244 mm** | [ATX 规格（305 × max 244）](https://archive.shuttle.eu/2004/de/atx$.htm) |
| PCB 厚 | **1.6 mm**（行业标准，估算） | **估算**；高端 8–10 层（估算） |
| 安装孔 | 9 个，6-32 UNC 螺丝 | [孔数估算]；螺纹规格 [Profesional Review](https://www.profesionalreview.com/2018/11/06/tipos-de-tornillos-placas-base-y-pc/) |
| 螺丝 | 大径 3.51 mm，32 牙/英寸 | 同上 |
| 铜柱 | 高 ≥6.5 mm，外轮廓在孔周 10×10 mm 内 | [ATX 2.1 引述](https://superuser.com/revisions/20a0a3c3-d0f1-4177-9004-164e776da898/view-source) |
| 后置 I/O 区 | **158.75 × 44.45 mm**（板厚 0.94–1.32） | [ATX 背板](https://es.wikipedia.org/wiki/Panel_trasero_ATX)、[挡板件](https://en.iczoom.com/product/k13-24809153-10004-1A-2.html) |
| 24-pin 供电 | Mini-Fit Jr，**4.2 mm** 间距，2×12 | **估算**（连接器标准） |
| EPS 8-pin | 4.2 mm 间距，2×4，×2 个 | **估算** |
| DDR5 槽 | ×4，288 pin，**0.85 mm** 间距 | [TE 规格页](https://www.findchips.com/detail/2-2355626-1/TE-Connectivity)、[JPC](https://dnt.jpcconnectivity.com/lang/en/product/find/DDR5__R_LR_DIMM_SMT_Connector) |
| PCIe 槽 | x16（**164 pin**）×1–2，x4/x1 | [Amphenol Gen3](https://www.digikey.co.il/en/product-highlight/a/amphenol-fci/pci-express-gen-3-card-edge-connectors) |
| 槽间距 | **20.32 mm**（0.8 英寸） | [StackExchange 引述](https://electronics.stackexchange.com/revisions/30a9f917-e8d4-4e97-abf2-27add1385f54/view-source) |
| M.2 槽 | 2280 ×3–4，M2×3 螺丝，铜柱 4.5 mm | [M.2 螺丝](https://support1.starfivetech.com/t/what-kind-of-ssd-can-be-used/886/31) |
| VRM | 16+2+2 相（估算），电感 6.3×6.3×5 | **估算** |
| 电容 | 固态 Ø8×8 / Ø10×10 | **估算** |
| 纽扣电池 | CR2032，Ø20 × 3.2 mm | 通用规格 |

### 3.2 分层拆解（5 层）

| # | 层 | 厚度 | 拆解位移 | 内容 |
|---|---|---|---|---|
| 1 | 散热装甲 | 6–10 mm | +0.10 | VRM 上/下盖、M.2 盖 ×3、芯片组盖 |
| 2 | 插槽与接口 | 8–12 mm | +0.05 | DDR5 槽、PCIe 槽、24-pin、SATA、风扇针 |
| 3 | PCB 正面元件 | ~5 mm | 0 | 电感、MOS、电容、芯片、丝印 |
| 4 | PCB 本体 | 1.6 mm | 0 | 走线、过孔、金焊盘 |
| 5 | 后置 I/O 挡板 | 0.9–1.3 mm | −0.08 / 沿 −Z | 158.75 × 44.45，端口开孔 |

### 3.3 可程序化细节清单

| 部件 | 尺寸 mm | 数量 | 排布 / 做法 |
|---|---|---|---|
| PCB | 305 × 244 × 1.6 | 1 | 圆角 R3；四边倒角 0.3 |
| 安装孔 | Ø3.5（孔） | 9 | 位置按 ATX 网格；周围 8 mm 禁布圈（贴图） |
| 铜柱 | Ø6.5 × 6.5 | 9 | 只在拆解态露出一半；`kit.cyl` 8 段 |
| 走线 | 宽 0.2 / 0.3 / 0.5 | 80–140 条 | **贴图** `pcb_trace`（几何做不出密度） |
| 过孔 | Ø0.3 | 400–600 | 贴图；只在走线端点 |
| 丝印 | 字高 0.8–1.2 | 1 张 | `U7` `R12` `J1` `CPU_FAN` `M.2_1` |
| 24-pin | 53 × 12 × 10（估算） | 1 | 2×12 方格，4.2 mm 间距，黑壳 + 金色针 |
| EPS 8-pin | 22 × 10 × 12 | 2 | 2×4，位于左上 VRM 旁 |
| DDR5 槽 | 138 × 8 × 10（估算） | 4 | 长条壳 + 288 金手指贴图 + 两端卡扣（2 个 8×6 小件） |
| PCIe x16 槽 | 89 × 8 × 10（估算） | 2 | 金属加固罩（`#b9bdc2`）+ 卡扣 + 164 pin 贴图 |
| M.2 槽 | 22 × 80 卡位 | 3–4 | M key 缺口 + 铜柱 + M2×3 螺丝 |
| 电感 | 6.3 × 6.3 × 5 | 16 | 黑色方块，顶部 2 行白字（型号） |
| DrMOS | 5 × 6 × 1 | 16 | 贴电感旁，`#1a1b1e` 亮面 |
| 固态电容 | Ø8 × 8 / Ø10 × 10 | 12–20 | 顶面十字防爆槽（4 条细 box 或贴图） |
| 芯片组散热片 | 60 × 60 × 8（估算） | 1 | 斜纹/几何纹，螺丝 2 颗 |
| VRM 散热片 | 90 × 25 × 18（估算） | 2 | 鳍片 12 条 @2 mm（真实密度 1.5–2 mm） |
| 音频区 | 屏蔽罩 40 × 30，金电容 Ø10 ×4 | 1 组 | 金色电容 + 分割线丝印（高端板标志） |
| 纽扣电池座 | Ø20 × 4 | 1 | 银色弹片 + 电池 `#d8d4c8` |
| 后置 I/O 端口 | USB-A 14×7、USB-C 9×4、RJ45 16×14、音频 Ø6 ×5 | ~14 个 | 按 158.75 × 44.45 区内排布 |
| I/O 挡板 | 158.75 × 44.45 × 1 | 1 | 端口开孔 + 导电弹片（8 段小齿） |
| 板边接口 | SATA ×4、风扇 4-pin ×6、ARGB 3-pin ×3、前置 USB | ~16 | 统一"黑壳 + 露出金针"语言 |
| 调试 LED | 2 × 2 × 1 | 4 | 红/黄/白/绿，可 emissive 自检动画 |

### 3.4 表面材质

| 面 | 材质 | 要点 |
|---|---|---|
| PCB 正面 | `#101215` rough 0.62 | `pcb_trace` 贴图，靠近插槽加密 |
| PCB 背面 | 同色但更暗 `#0b0c0e` | 只有焊点亮点（Ø0.8 银点 40–80 个） |
| VRM/芯片组装甲 | 阳极黑 `#2b2e33` metal 0.6 rough 0.42 | 拉丝 + 边缘倒角高光 |
| 插槽壳 | `#16171b` rough 0.72 | 磨砂贴图 |
| 金手指/针 | `#c9a227` metal 1.0 rough 0.26 | 贴图 |
| 电感 | `#1a1b1e` rough 0.35 metal 0.2 | 顶面丝印白字 |
| 电容 | `#3d4248` metal 0.85 rough 0.35 | 顶部十字槽、侧面亮环 |
| 丝印 | `#e6e6dd` rough 0.8 | 1 px 框线 + 文字 |

**查不到 / 估算**：PCB 层数、孔数（9 为常见值）、VRM 相数、电感/电容数量、槽具体长度。

---

## 4. 内存 RAM

**高端参考**：G.Skill Trident Z5 RGB / Corsair Dominator Titanium（带马甲 + RGB 导光条）。

### 4.1 真实尺寸

| 项 | 数值 | 来源 / 备注 |
|---|---|---|
| 模块 PCB | **133.35 × 31.25 × 1.27 mm**（+0.45/−0.15 等公差） | [Micron 模块指南](https://my.avnet.com/wcm/connect/b6e4d9f8-d5c7-4b2d-8daf-d1f7ad18f372/Micron+DRAM+Module+Form+Factors+Quick+Reference+Guide.pdf)、[HogeStorage](https://en.hogestorage.com/product_details/30.html) |
| 引脚 | **288 pin**，0.85 mm 间距 | [TE/Molex 规格](https://www.findchips.com/detail/2044731134/Molex) |
| 带马甲总高 | 42–44 mm（估算，含 RGB 条） | **估算** |
| 带马甲总厚 | 7–9 mm（估算） | **估算** |
| 单颗 DRAM | 约 9 × 11 × 0.9 mm（估算） | **估算** |
| 16 GB 单面 | 8 颗 ×8 颗粒 | **估算** |
| 32 GB 双面 | 16 颗 | **估算** |
| PMIC | 3 × 3 mm（估算） | **估算**（DDR5 板载 PMIC） |
| SPD Hub | 2 × 3 mm（估算） | **估算** |
| 金手指高 | 5.5 mm（估算） | **估算** |
| 导热垫 | 0.5 mm | **估算** |

### 4.2 分层拆解（5 层）

| # | 层 | 厚度 | 拆解位移 | 内容 |
|---|---|---|---|---|
| 1 | RGB 导光条 | 3–5 mm | +0.16 | 乳白半透 + 8 颗 LED |
| 2 | 左右马甲 | 1.2 mm 铝 + 齿 | ±X 0.10 | 阳极铝，齿 8–12 条 |
| 3 | 导热垫 | 0.5 mm | ±X 0.06 | 浅蓝灰，略溢出 |
| 4 | PCB + 颗粒 | 1.27 + 0.9 | 0 | 8/16 颗 + PMIC + SPD |
| 5 | 金手指 | 5.5 mm 高 | −0.05 | 288 pin 贴图 |

### 4.3 可程序化细节清单

| 部件 | 尺寸 mm | 数量 | 排布 / 做法 |
|---|---|---|---|
| PCB | 133.35 × 31.25 × 1.27 | 1 | 四角圆角 R1，顶部中间 1 个防呆缺口 |
| 金手指 | 0.85 mm 间距，高 5.5 | 288（两排各 144） | **贴图**；排宽 122.4 mm；中间防呆缺口位置与 DDR4 不同（DDR5 偏中） |
| DRAM 颗粒 | 9 × 11 × 0.9 | 8 / 16 | 正面 8 颗，间距 1.2 mm；背面同 |
| 颗粒丝印 | 字高 1.0 | 1 张 | 厂商码 + 批次 + 速度（`HMCG88` `DDR5-6400`） |
| PMIC | 3 × 3 × 0.6 | 1 | 正面中间偏下 |
| SPD Hub | 2 × 3 × 0.6 | 1 | 金手指上方 |
| 去耦电容 | 0402 1.0 × 0.5 | 24–40 | 颗粒间空隙 `kit.grid` |
| 马甲 | 133 × 40 × 1.2（单片） | 2 | 铝挤；外侧 8–12 条散热齿 @2 mm，齿高 3 mm |
| 马甲固定 | M2 螺丝 ×2 或卡扣 | 2 | 顶部/底部各一 |
| 导热垫 | 120 × 8 × 0.5 | 2 | 夹在马甲与颗粒之间，边缘露出 1 mm |
| RGB 导光条 | 120 × 6 × 3 | 1 | 乳白 `#f2f3f5` rough 0.18；顶部 8 颗 LED 点位可 emissive |
| 标签贴纸 | 40 × 12 | 1 | 马甲外侧，白底黑字（容量/频率/时序） |

### 4.4 表面材质

| 面 | 材质 | 要点 |
|---|---|---|
| 马甲外侧 | 阳极 `#3b3e44`（黑）/ `#e9e7e1`（白）metal 0.75 rough 0.35 | 拉丝沿长边；齿面略暗 |
| 齿内侧 | `#2a2c30` rough 0.45 | 制造深度 |
| PCB | `#0f1013` rough 0.62 | 颗粒之间可见 |
| 颗粒 | `#16171a` rough 0.45 metal 0.15 | 表面有激光字（浅灰 `#9a9a96`） |
| 金手指 | `#c9a227` metal 1.0 rough 0.26 | 贴图，边缘留 0.5 mm 倒角 |
| 导热垫 | `#93b6c9` rough 0.9 | 哑光，微透 |
| 导光条 | `#f2f3f5` rough 0.18，emissive | 关闭时乳白，开启时按元件 hue 发光 |

**查不到 / 估算**：马甲总高/厚、颗粒尺寸、颗粒数量与容量对应、PMIC 尺寸、金手指高度。

---

## 5. 固态硬盘 Storage（M.2 2280）

**高端参考**：Samsung 990 PRO（Gen4）/ Crucial T705（Gen5，带大散热器）。
Gen5 的视觉特征是**主控大、发热大、常配金属散热片**。

### 5.1 真实尺寸

| 项 | 数值 | 来源 / 备注 |
|---|---|---|
| 模块 | **22 × 80 × 2.38 mm**（单面） | [HP 规格 PDF](https://content.etilize.com/Additional-pdf1/1080938292.pdf)、[至誉科技](http://www.gongkong.com/product/202103/127187.html) |
| 卡边缘 | 75 位置 / **最多 67 pin** / **0.5 mm** 间距 / 双面错位 | [Everything RF](https://www.everythingrf.com/community/what-is-the-m-2-form-factor) |
| M key 连接器 | 67PIN（75 位置），板上高 5.5 mm | [立创商城](https://item.szlcsc.com/51318882.html) |
| 固定螺丝 | **M2 × 3**；铜柱 M2×3+4.5（总高 4.5） | [StarFive](https://support1.starfivetech.com/t/what-kind-of-ssd-can-be-used/886/31)、[螺丝套装](https://www.amazon.ca/dp/B0FMFH4V3N/) |
| PCB 厚 | 0.8 mm（估算） | **估算** |
| 主控 | 12 × 12 mm（Gen5 估算） | **估算** |
| NAND | 10 × 8 mm ×4（估算） | **估算** |
| DRAM 缓存 | 8 × 8 mm ×1（估算） | **估算** |
| 固定缺口 | 半圆 Ø3.2 mm，距尾端 5 mm（估算） | **估算** |
| 单面最高 | 2.38 mm（含元件） | 同 HP PDF |
| Gen5 功耗 | 8–11 W（估算，需散热片） | **估算** |

### 5.2 分层拆解（4 层）

| # | 层 | 厚度 | 拆解位移 | 内容 |
|---|---|---|---|---|
| 1 | 散热片（可选） | 2–3 mm | +0.12 | 铝，6 条槽，M2 螺丝固定 |
| 2 | 导热垫 | 1.0 mm | +0.06 | 浅蓝，覆盖主控 + NAND |
| 3 | PCB + 元件 | 0.8 + 0.9 | 0 | 主控、NAND、DRAM、PMIC、电容 |
| 4 | 金手指 | 0.5 mm 间距 | −0.04 | 67 pin 双面错位 |

### 5.3 可程序化细节清单

| 部件 | 尺寸 mm | 数量 | 排布 / 做法 |
|---|---|---|---|
| PCB | 22 × 80 × 0.8 | 1 | 尾端半圆缺口 R1.6；前端金手指区 5 mm |
| 金手指 | 0.5 mm 间距，双面交错 | 67 | **贴图**；M key 缺口在 12–19 位置区（按 key 定义留空） |
| 主控 | 12 × 12 × 0.9 | 1 | 正方形，`#141519`，顶面丝印型号 + 厂商 logo 方块 |
| NAND | 10 × 8 × 0.9 | 4（2×2 或 1×4） | `#1b1c20`，顶面丝印 |
| DRAM | 8 × 8 × 0.8 | 1 | 主控旁 |
| PMIC | 4 × 4 × 0.6 | 1 | 靠近金手指 |
| 电感 | 3 × 3 × 1 | 2 | 小方块 |
| 电容 | 0402 1.0 × 0.5 | 24–36 | 沿板边 `kit.grid`，间距 1.4 mm |
| 固定缺口 | 半圆 Ø3.2 | 1 | 尾端，螺丝从上方穿过 |
| 散热片 | 22 × 70 × 2 | 1 | 铝，顶部 6 条槽 @3 mm；边缘 0.5 倒角 |
| 散热片螺丝 | M2 × 3，头 Ø3.8 | 2 | 对角 |
| 导热垫 | 20 × 60 × 1.0 | 1 | 夹层，边缘露出 1 mm |
| 标签 | 18 × 25 | 1 | 背面，白底黑字（容量 / 型号 / 认证） |

### 5.4 表面材质

| 面 | 材质 | 要点 |
|---|---|---|
| PCB | `#101014` rough 0.60 | 走线贴图（`pcb_trace` 缩小 repeat） |
| 主控 | `#141519` rough 0.38 metal 0.20 | 表面有轻微镜面感 + 白丝印 |
| NAND | `#1b1c20` rough 0.50 | 丝印为主 |
| DRAM | `#1a1b1f` rough 0.45 | — |
| 金手指 | `#c9a227` metal 1.0 rough 0.24 | 双面错位要贴图对齐 |
| 散热片 | 阳极 `#2c2f34` metal 0.65 rough 0.38 | 槽内更暗 |
| 导热垫 | `#8fb4c9` rough 0.9 | — |
| 螺丝 | 镀镍 `#b9bdc3` metal 0.95 rough 0.3 | 十字槽 |

**查不到 / 估算**：PCB 厚度、主控/NAND/DRAM 尺寸、缺口精确位置、功耗。

---

## 6. 显卡 GPU

**高端参考**：NVIDIA RTX 4090 FE（304×137×61，3 槽，均热板 + 双轴流扇）/ INNO3D RTX 5080 三风扇（Ø88 环形扇 ×3、7 热管、300 mm、2.5 槽）。
**建议建模对象：三风扇 2.5 槽**——它比 FE 双风扇更有"高端硬件"的识别度，也更适合展示鳍片。

### 6.1 真实尺寸

| 项 | 数值 | 来源 / 备注 |
|---|---|---|
| RTX 4090 FE | **304 × 137 × 61 mm**，3 槽 | [PConline](https://www.pconline.com.cn/ask/613853.html) |
| RTX 5080 FE | 304 mm 长 × 137 mm 高，双槽 | [KitGuru 评测](https://www.kitguru.net/components/graphic-cards/dominic-moass/nvidia-rtx-5080-review-efficiency-gains-but-a-performance-letdown/2/) |
| INNO3D 5080 | 300 mm，2.5 槽，**Ø88 mm 环形扇 ×3**，**7 根热管** | [INNO3D 发布页](https://www.gdm.or.jp/pressrelease/2025/0128/572975) |
| ASUS Prime 5080 | 304 mm，2.5 槽 | [产品页](https://www.fastclick.mu/products/asus-the-sff-ready-prime-geforce-rtx%E2%84%A2-5080-16gb-gddr7-graphics-card-pcie%C2%AE-5-0-hdmi%C2%AE-dp-2-1-2-5-slot-axial-tech-fans-vapor-chamber-dual-bios) |
| 挡板高（全高） | **111.15 mm** | 项目已确认（PCIe 全高） |
| 半高 | 68.90 mm | 项目已确认 |
| PCB 厚 | 1.6 mm（行业标准，估算） | **估算** |
| PCB 长 | ≤267 mm（标准 ATX 参考） | 项目已确认；超过则需 2 槽 + 越肩 |
| 金手指 | **164 pin**（x16） | [Amphenol Gen3](https://www.digikey.co.il/en/product-highlight/a/amphenol-fci/pci-express-gen-3-card-edge-connectors) |
| 槽距 | 20.32 mm / 槽 → 2 槽 40.6 / 2.5 槽 ≈50.8 / 3 槽 ≈61 | [槽距来源](https://electronics.stackexchange.com/revisions/30a9f917-e8d4-4e97-abf2-27add1385f54/view-source) |
| 三风扇 | Ø88 mm（扇框 88×88），厚 20–25 mm，每扇 9 叶（估算） | 扇径 [INNO3D](https://www.gdm.or.jp/pressrelease/2025/0128/572975)；叶数**估算** |
| 鳍片 | 约 45 片，厚 0.4 mm，间距 1.6 mm（估算） | **估算**（工程示例值） |
| 热管 | 8 × Ø6 mm（估算） | **估算**（同级别 7–8 根） |
| 均热板 | 90 × 70 × 3 mm（估算） | **估算** |
| GDDR | 16 颗 2 GB（5080 16 GB，估算） | **估算** |
| 供电 | 16 相（估算） | **估算** |
| 背板 | 2 mm 铝/钢（估算） | **估算** |
| 供电接口 | 1 × 12V-2x6（16-pin） | [ATX 3.1 说明](https://knowledge.seasonic.com/article/79-comparison-atx-3-0-vs-atx-3-1-standards) |
| 显示输出 | 3 × DP 2.1 + 1 × HDMI 2.1b | 高端卡通用配置 |

### 6.2 分层拆解（6 层）

| # | 层 | 厚度 | 拆解位移 | 内容 |
|---|---|---|---|---|
| 1 | 导风罩（3 段） | 25–35 mm | +0.14 | ABS/铝，斜切造型，螺丝 6 颗 |
| 2 | 风扇 ×3 | 25 mm | +0.08 | Ø88，9 叶，轮毂 Ø30 |
| 3 | 鳍片堆 | 45–55 mm | +0.03 | 45 片 × 0.4 mm，间距 1.6 |
| 4 | 热管 + 均热板 | 6–10 mm | 0 | 8×Ø6 U 形 + 90×70×3 铜板 |
| 5 | PCB + die + VRAM | 1.6 + 1 | −0.02 | 267 × 111，die 居中，VRAM 环绕 |
| 6 | 背板 | 2 mm | −0.12 | 铝，开孔 3 组，防弯支架 |
| 7 | 挡板 + 接口 | 1 mm | 沿 −Z | 111.15 高，3 DP + 1 HDMI + 16-pin |

### 6.3 可程序化细节清单（这件的数字最多，直接照抄）

| 部件 | 尺寸 mm | 数量 | 排布 / 做法 |
|---|---|---|---|
| 导风罩 | 300 × 130 × 30 | 1（3 段拼） | 每段 96 mm 宽，段间 2 mm 缝；边缘倒角 2 mm；侧边斜切 15° |
| 导风罩螺丝 | Ø4 × 1 | 6 | 顶面 4 + 侧面 2，深色沉孔 |
| 风扇框 | 88 × 88 × 25 | 3 | 外框圆角 R4；中心间距 92 mm；框中框厚度 1.5 |
| 风扇叶 | 单叶长约 29、宽 12、厚 0.8 | 9 / 扇 | 轮毂 Ø30 × 12；叶片沿轴向前倾 20°；`kit.grid` 或 9 次 rotate |
| 风扇轮毂 | Ø30 × 12 | 1 / 扇 | 顶部丝印厂商 logo（贴图） |
| 风扇螺丝 | Ø2 | 4 / 扇 | 四角 |
| 鳍片 | 0.4 × 100 × 55 | **45** | 间距 1.6 mm → 堆高 44 × 2.0 = 88 mm；两端各留 2 mm 边框 |
| 鳍片边框 | 4 × 100 × 60 | 2 | 左右各一，铝挤 |
| 热管 | Ø6，U 形，长 180–240 | **8** | `kit.trace`，弯 2 处 R8；穿过鳍片后压扁贴均热板 |
| 均热板 | 90 × 70 × 3 | 1 | 铜 `#b87333`，边缘折边 2 mm |
| PCB | 267 × 111 × 1.6 | 1 | 前端金手指区 5 mm；后端越肩部分无铜 |
| 金手指 | 164 pin，1.0 mm 间距 | 164 | **贴图**；两侧各留 2 mm 无金区 |
| GPU die | 24 × 24 × 0.8（估算） | 1 | 居中，镜面硅 |
| VRAM | 14 × 14 × 1（估算） | 16 | die 左右各 8 颗，间距 1 mm，环绕布局 |
| 供电电感 | 6 × 6 × 5 | 16 | PCB 前段一排 |
| DrMOS | 5 × 6 × 1 | 16 | 电感旁 |
| 固态电容 | Ø8 × 8 | 10–14 | 靠近金手指 |
| 12V-2x6 接口 | 12 × 10 × 8 | 1 | 顶边中偏后；16 个针孔 2 排 |
| 8-pin 备选 | 20 × 10 × 8 | 2–3 | 若做 4090 风格 |
| 挡板 | 111.15 × 20 × 1 | 1 | 折边 2 道；六边形开孔 80 个（Ø3） |
| DP 口 | 20 × 8 | 3 | 挡板上排 |
| HDMI 口 | 22 × 8 | 1 | 挡板下排 |
| 背板 | 300 × 120 × 2 | 1 | 开孔 3 组（每组 6 × Ø6 圆孔阵列） |
| 背板螺丝 | Ø3 | 8 | 边缘一圈 |
| 防弯支架 | 60 × 20 × 2 | 1 | PCB 与背板之间 |
| 供电指示 LED | 2 × 1 | 2 | 16-pin 旁，可 emissive |

### 6.4 表面材质

| 面 | 材质 | 要点 |
|---|---|---|
| 导风罩 | 阳极 `#2a2c30` metal 0.55 rough 0.42 | 分段缝要暗；斜切面 rough 0.30 提亮 |
| 风扇叶 | `#141518` rough 0.75 metal 0.05 | 叶尖略亮（`#1c1e22`） |
| 风扇框 | `#16171b` rough 0.70 | 内侧圆环加深 |
| 鳍片 | 亮铝 `#b9bec4` metal 0.90 rough 0.35 | 或黑化 `#2e3135`；**两种都可，但整卡统一** |
| 热管 | 镀镍 `#c6cacd` metal 1.0 rough 0.20 | 弯管处高光最重要 |
| 均热板 | 裸铜 `#b87333` metal 1.0 rough 0.28 | 只在拆解态可见，颜色要跳出来 |
| PCB | `#101215` rough 0.62 | 走线贴图 + 丝印 |
| 背板 | `#34373c` metal 0.60 rough 0.45 | 拉丝 + 丝印型号 |
| 挡板 | 镀镍 `#b9bdc3` metal 0.95 rough 0.30 | 开孔内壁暗 |
| 金手指 | `#c9a227` metal 1.0 rough 0.24 | — |

**查不到 / 估算**：风扇叶数、鳍片数/间距、热管数、VRAM 尺寸、供电相数、PCB 实际布局。

---

## 7. 电源 PSU

**高端参考**：1300 W ATX 3.1 全模组（原生 12V-2x6，80 PLUS 白金）。
ATX 3.1 的原生 16-pin 与"3× GPU 瞬时功率"是这一代最值得讲的点。

### 7.1 真实尺寸

| 项 | 数值 | 来源 / 备注 |
|---|---|---|
| 外形 | **150 (W) × 86 (H) × 140 (D) mm**（ATX PS/2） | [SilverStone 技术说明](https://www.silverstonetek.com/en/tech-talk/10055) |
| 深度变体 | >140 mm 仍属 ATX PS/2（如 160/180） | 同上 |
| 显卡供电 | **12V-2x6（16-pin）**，12 根供电针长 4.2 → **4.45 mm** | [PCDIY](http://www.pcdiy.com.tw/detail/28840) |
| 标准 | ATX 3.1 原生 16-pin；3× GPU 偏移、2× 总功率偏移 | [Seasonic 对比](https://knowledge.seasonic.com/article/79-comparison-atx-3-0-vs-atx-3-1-standards)、[技嘉 ATX3.1](https://www.gigabyte.cn/Power-Supply/GP-UD1300GM-PG5-rev-11) |
| 风扇 | Ø135 mm（估算；同级常见 120/135/140） | **估算** |
| 外壳钢板 | 0.8 mm（估算） | **估算** |
| 大电容 | Ø25 × 40 ×2（估算） | **估算** |
| 主变压器 | 40 × 35 × 30（估算） | **估算** |
| 24-pin | ×1（模块口 2×12） | **估算** |
| EPS 8-pin | ×2 | **估算** |
| PCIe 8-pin | ×4 | **估算** |
| SATA | ×6 | **估算** |
| 重量 | 1.5–2.5 kg（估算） | **估算** |

### 7.2 分层拆解（5 层）

| # | 层 | 厚度 | 拆解位移 | 内容 |
|---|---|---|---|---|
| 1 | 上盖 + 风扇网罩 | 0.8 | +0.16 | 冲孔六边形网，中心圆盘 |
| 2 | 风扇 | 25 | +0.10 | Ø135，11 叶（估算） |
| 3 | 内部一次侧 | — | +0.04 | 散热片、整流桥、APFC 电感/电容 |
| 4 | 变压器 + 二次侧 | — | 0 | 主变、同步整流、输出电容 |
| 5 | 底壳 + 模组接口 + 铭牌 | 0.8 | −0.14 | 24-pin/EPS/PCIe/SATA 接口 |

### 7.3 可程序化细节清单

| 部件 | 尺寸 mm | 数量 | 排布 / 做法 |
|---|---|---|---|
| 外壳 | 150 × 86 × 140 | 1 | 折边 6 mm；四角圆角 R2；上盖与底壳分缝 1 mm |
| 风扇网罩 | Ø135 圆 | 1 | 六边形冲孔：孔 3 mm、距 4 mm（`mesh_hex` 贴图 + 少量几何环） |
| 网罩中心盘 | Ø50 × 1 | 1 | 实心圆 + 丝印 logo |
| 风扇 | Ø135 × 25 | 1 | 11 叶（估算），轮毂 Ø45；转速低，可做慢转 |
| 外壳螺丝 | 6-32 UNC，Ø3.5 | 4 | 背面四角 |
| 模组接口板 | 130 × 60 × 2 | 1 | 靠近后部 |
| 24-pin 口 | 53 × 12（估算） | 1 | 2×12 方针孔 |
| EPS 8-pin 口 | 22 × 10 | 2 | 2×4 |
| PCIe 8-pin 口 | 22 × 10 | 4 | 2×4 |
| 12V-2x6 口 | 12 × 10 | 1 | 16 针（12+4）小口 |
| SATA 口 | 12 × 8 | 6 | 6 pin 扁口 |
| Molex 口 | 12 × 8 | 2 | 4 pin |
| 内部散热片 | 80 × 40 × 10 | 2 | 铝挤，齿 1.5 mm × 8 |
| 大电容 | Ø25 × 40 | 2 | 蓝/黑套管，顶部十字 |
| 输出电容 | Ø10 × 20 | 6–8 | 二次侧一排 |
| 主变压器 | 40 × 35 × 30 | 1 | 黑色，线圈纹理（贴图） |
| APFC 电感 | 环 Ø25 × 12 | 1 | 铜线环绕（用 torus + 条纹贴图） |
| 线材 | Ø6 编织 | 6 根 | `kit.trace` 曲线，热缩管接头（Ø8 × 12） |
| 铭牌贴纸 | 120 × 60 | 1 | `label_text`：型号 / 1300W / 各路电流表 / 认证 |
| 80 PLUS 标 | 20 × 20 | 1 | 贴图方块 |

### 7.4 表面材质

| 面 | 材质 | 要点 |
|---|---|---|
| 外壳 | 黑漆钢板 `#1b1c1e` metal 0.35 rough 0.55 | 磨砂贴图；折边处提亮 |
| 网罩 | 同色，rough 0.50 | 孔内全黑（贴图 alpha） |
| 风扇叶 | `#141518` rough 0.75 | — |
| 电容 | 铝壳 `#2c3138` metal 0.85 rough 0.35 + 蓝套管 `#1b4a7a` | 顶部十字槽 |
| 变压器 | `#15161a` rough 0.65 | 线圈用深色条纹贴图 |
| 线材 | `#191a1c` rough 0.90 | 编织纹（细密斜纹贴图） |
| 铭牌 | `#ecebe6` rough 0.70 | 黑字，边缘 1 mm 留白 |

**查不到 / 估算**：风扇尺寸与叶数、内部布局尺寸、电容数量、接口数量、钢板厚度。

---

## 8. 散热器 Cooler

**高端参考**：Thermalright Peerless Assassin 120（双塔 6 热管，125×135×157，750 g）。
这是**最容易被看出"粗糙"的一件**：鳍片数量、间距、热管弯曲是全部观感来源。

### 8.1 真实尺寸

| 项 | 数值 | 来源 / 备注 |
|---|---|---|
| 整体（含风扇） | **125 × 135 × 157 mm** | [Thermalright 官方](https://www.thermalright.com/tw/product/peerless-assassin-120/) |
| 重量 | 750 g | 同上 |
| 热管 | **6 × Ø6 mm** | 同上 |
| 鳍片厚 | **0.4 mm** | 同上；[Frostytech 实测](https://www.frostytech.com/articles/2769/2.html) |
| 鳍片间距 | **1.8 mm** | 同上 |
| 底座 | C1100 纯铜镀镍 | [官方](https://www.thermalright.com/tw/product/peerless-assassin-120/) |
| 每塔片数 | 前塔 42 片 @2.4 间距 / 后塔 53 片 @1.8（同类双塔实测） | [CRYORIG R1 拆解实测](https://nikktech.com/main/articles/pc-hardware/cpu-cooling/cpu-air-coolers/3015-cryorig-r1-ultimate-cpu-cooler-review) |
| 鳍片堆高 | ~110 mm（同类实测） | [Frostytech](https://www.frostytech.com/articles/2769/2.html) |
| 风扇 | **120 × 120 × 25 mm，7 叶，1200 RPM** | [Fractal Prisma SL-12 规格](https://www.proshop.se/Chassi-flaekt/Fractal-Design-Prisma-SL-12-Green-Chassi-flaekt-120mm-Groen-20-dBA/2721874) |
| 底座尺寸 | 40 × 40 × 3 mm（估算） | **估算** |
| 扣具孔距 | AM5 54 × 90 / Intel 78 × 78（估算） | **估算** |
| 热管长 | 200–240 mm（估算） | **估算** |

### 8.2 分层拆解（6 层）

| # | 层 | 厚度 | 拆解位移 | 内容 |
|---|---|---|---|---|
| 1 | 风扇 ×2 | 25 | ±X 0.14 | 120×25，7 叶，钢丝扣具 |
| 2 | 钢丝扣具 | Ø1.2 | ±X 0.10 | 2 根/扇 |
| 3 | 鳍片塔 | 110 | +0.06 | 42–53 片 × 0.4，间距 1.8 |
| 4 | 热管 | Ø6 | +0.02 | 6 根 U 形，贯穿两塔 |
| 5 | 铜底 | 3 | 0 | 40×40，镀镍，压扁热管贴合 |
| 6 | 扣具 + 背板 + 弹簧螺丝 | — | −0.10 | 钢背板 + 4 弹簧螺丝 |

### 8.3 可程序化细节清单

| 部件 | 尺寸 mm | 数量 | 排布 / 做法 |
|---|---|---|---|
| 鳍片 | **0.4 × 120 × 50** | **50 / 塔** | 间距 1.8 → 50 × 2.2 = 110 mm；两端留 4 mm |
| 鳍片边缘 | 折边 1.5 mm | 全部 | 让侧面看是"梳齿"而不是"纸片" |
| 塔间距 | 8 mm | 1 | 中间夹 1 把风扇（双塔常见） |
| 热管 | Ø6，U 形，弯 2 处 R8 | **6** | `kit.trace`；底部压扁成 4 mm 厚贴合铜底 |
| 铜底 | 40 × 40 × 3 | 1 | 镀镍；顶部有 6 条热管压痕 |
| 底座螺丝/压板 | 30 × 12 × 3 | 1 | 十字压板 |
| 风扇 | 120 × 120 × 25 | 2 | 7 叶，轮毂 Ø40，叶厚 1.0，叶尖间隙 2 |
| 风扇框 | 120 × 120 × 25 | 2 | 四角螺丝孔 Ø4.5；框内圆角 R3 |
| 风扇扣具 | Ø1.2 钢丝 | 4 | 2 根/扇，折成钩形 |
| 弹簧螺丝 | M3 × 30 + Ø7 弹簧 | 4 | 对角 |
| 背板 | 60 × 60 × 2 | 1 | 钢，绝缘垫 Ø10 × 0.5 |
| 硅脂 | 35 × 35 × 0.1 | 1 | 浅灰，边缘略不规则 |
| 顶部盖板 | 45 × 45 × 2（部分型号） | 1 | 可选，遮热管头 |

### 8.4 表面材质

| 面 | 材质 | 要点 |
|---|---|---|
| 鳍片 | 亮铝 `#c4c8cd` metal 0.90 rough 0.30 | 折边处 rough 0.22 提亮 |
| 热管 | 镀镍 `#c8ccd0` metal 1.0 rough 0.20 | 弯管外弧高光 |
| 铜底 | 镀镍 `#cfd2d6` rough 0.22 | 与鳍片略有色差 |
| 风扇框 | 白 `#e8e8e4` / 黑 `#141518` rough 0.70 | 与整机风格统一 |
| 风扇叶 | 半透白 `#eef0f2` rough 0.55 | 或纯黑，二选一 |
| 钢丝 | `#9aa0a6` metal 0.9 rough 0.35 | 细但要有高光 |
| 硅脂 | `#9fb4c0` rough 0.95 | 哑光 |

**查不到 / 估算**：每塔精确片数（42–53）、底座尺寸、热管长度、扣具孔距。

---

## 9. 机箱 Case

**高端参考**：Lian Li Lancool II（210×460×470）/ Lancool 216（235×480.9×491.7）。
建议按 **Lancool II 比例**建模（更紧凑、好构图），玻璃侧透 + 前网孔。

### 9.1 真实尺寸

| 项 | 数值 | 来源 / 备注 |
|---|---|---|
| Lancool II | **210 (W) × 460 (H) × 470 (D) mm** | [产品页](https://www.falabella.com.pe/falabella-pe/product/144370872/caja-mid-tower-lian-li-lancool-ii-w-rgb-blanca-diseno-elegante-y-ventilacion-optimizada) |
| Lancool II Mesh | 229 × 494 × 478 mm | [B&H](https://www.bhphotovideo.com/c/product/1577101-REG/lian_li_lan2mrx_lancool_ii_mesh_rgb_mid_tower_case.html/overview) |
| Lancool 216 | **235 × 491.7 × 480.9 mm**，ATX 电源 ≤220 mm | [Lian Li 官方](https://lian-li.com/it/product/lancool-216/) |
| 风扇位 | 最多 6 × 120 或 360 冷排（同级参考） | [Corsair 275R Airflow](https://www.corsair.com/us/en/p/pc-cases/cc-9011181-ww/275r-airflow-tempered-glass-mid-tower-gaming-case-black-cc-9011181-ww) |
| 钢板 | 0.6–1.0 mm SGCC（估算） | **估算** |
| 钢化玻璃 | 4 mm（估算） | **估算** |
| 主板铜柱 | 9 × 6.5 mm | 同 §3.1 |
| PCIe 挡板位 | 7 个，间距 20.32 mm | 同 §3.1 槽距来源 |
| 电源仓 | 200 × 90 × 160（估算，容纳 150×86×140） | **估算** |
| 脚垫 | Ø30 × 10（估算） | **估算** |
| I/O 面板 | 2 × USB-A + 1 × USB-C + 音频（估算） | **估算** |

### 9.2 分层拆解（6 层）

| # | 层 | 厚度 | 拆解位移 | 内容 |
|---|---|---|---|---|
| 1 | 左侧玻璃 | 4 | +X 0.12 | 黑边 10 mm，四周钢框 |
| 2 | 右侧钢板 | 0.8 | −X 0.10 | 走线空间侧 |
| 3 | 前面板 | 20 | +Z 0.14 | 网孔 + 防尘网 + 3 风扇 |
| 4 | 顶盖 | 10 | +Y 0.12 | 网孔 + 防尘网 + I/O |
| 5 | 内部骨架 | — | 0 | 主板托盘、电源仓、走线孔、硬盘架 |
| 6 | 底部 | — | −Y 0.10 | 防尘网、脚垫 |

### 9.3 可程序化细节清单

| 部件 | 尺寸 mm | 数量 | 排布 / 做法 |
|---|---|---|---|
| 箱体 | 210 × 460 × 470 | 1 | 钢板折边；外角 R3 |
| 玻璃侧板 | 190 × 430 × 4 | 1 | 黑边 10 mm；四角螺丝 Ø6 ×4 |
| 钢侧板 | 190 × 430 × 0.8 | 1 | 手拧螺丝 ×2 |
| 前面板 | 200 × 440 × 20 | 1 | 网孔（`mesh_hex`）：孔 2.5、距 4，开孔率 ~42% |
| 防尘网 | 190 × 430 × 1 | 2 | 前 + 顶，黑色细网（高频条纹贴图） |
| 顶盖 | 200 × 470 × 10 | 1 | 网孔 + 磁吸条 |
| 主板托盘 | 305 × 244 × 1 | 1 | 开孔 9 个 + 走线孔 3 个 |
| 走线孔 | 60 × 20，R5 | 3 | 橡胶护圈（Ø 截面 3 mm） |
| 铜柱 | Ø6.5 × 6.5 | 9 | ATX 孔位 |
| PCIe 挡板 | 20.32 间距 × 7 | 7 | 冲孔 6 × Ø3；手拧螺丝 ×1/条 |
| 前风扇 | 120 × 120 × 25 | 3 | 间距 0；转速慢转 |
| 顶风扇位 | 120 × 120 | 2 | 可留空或装 1 |
| 后风扇 | 120 × 120 × 25 | 1 | 排气 |
| 电源仓 | 200 × 90 × 160 | 1 | 顶面开孔 150 × 86；侧面 3 条通风槽 |
| 硬盘架 | 100 × 30 × 120 | 2 | 3.5" ×2 + 2.5" ×2 |
| 脚垫 | Ø30 × 10 | 4 | 橡胶 |
| 底部防尘网 | 180 × 300 × 1 | 1 | 抽拉式，带塑料框 |
| I/O 面板 | 100 × 20 × 8 | 1 | 2×USB-A + 1×USB-C + 2×Ø3.5 音频 |
| 玻璃螺丝 | Ø6 × 8 | 4 | 手拧，橡胶垫 Ø8 |

### 9.4 表面材质

| 面 | 材质 | 要点 |
|---|---|---|
| 钢板 | 黑 `#1c1d1f` metal 0.40 rough 0.50 | 磨砂贴图；折边处 rough 0.35 |
| 玻璃 | `#0b0d12` transmission 0.85 rough 0.06 | 边缘微绿 `#1a2a24`；不反射太强 |
| 网孔 | `#101112` rough 0.60 | alpha 贴图，孔内全黑 |
| 防尘网 | `#0e0f10` rough 0.85 | 高频条纹，透光率低 |
| 橡胶 | `#131313` rough 0.90 | 护圈、脚垫、螺丝垫 |
| 螺丝 | `#2a2b2d` metal 0.7 rough 0.45 | 手拧纹（条纹贴图） |

**查不到 / 估算**：钢板/玻璃厚度、电源仓尺寸、脚垫尺寸、I/O 配置。

---

## 10. 程序化实现优先级（按"收益/成本"排序）

> 成本为**估算工时**（1 人写代码 + 调参）；收益是"用户一眼能看出精细"的程度。

1. **通用贴图工厂（`pcb_trace` / `metal_brush` / `metal_matte` / `mesh_hex` / `label_text` / `contact_array`）** → 一次投入，8 件全部受益，是"从塑料到硬件"的分水岭 → 2–3 h
2. **主板：走线贴图 + 24-pin/EPS/DDR5/PCIe 接口阵列 + 16 电感 + 电容** → 主板是细节密度标杆，它细整机就细 → 4 h
3. **显卡：3 × Ø88 风扇（9 叶）+ 45 片鳍片 + 8 根热管 + 均热板** → 视觉中心，剪影识别度最高 → 3 h
4. **散热器：50 片 × 0.4 mm 鳍片 + 6 根 U 形热管 + 铜底** → 最容易被吐槽"粗糙"的一件，改完立竿见影 → 2.5 h
5. **内存：288 pin 贴图 + 8/16 颗颗粒 + 马甲齿 + RGB 导光条** → 拆解动画里最常被近距离看 → 2 h
6. **CPU：IHS 三层倒角 + 刻字 + 1851 触点贴图 + 侧边 SMD** → 拆解第一层，用户视线第一站 → 1.5 h
7. **机箱：前网孔 + 玻璃侧透 + 走线孔橡胶圈 + 7 条挡板** → 体积最大，整体质感提升最明显 → 2 h
8. **电源：六边形网罩 + 模组接口阵列 + 编织线 + 铭牌** → 拆解后内部有内容，不像空盒子 → 2 h
9. **SSD：67 pin 双面错位金手指 + 主控/NAND/DRAM + 小散热片** → 小件但要经得起镜头推近 → 1.5 h
10. **统一螺丝/铜柱/挡板素材（6-32、M3、M2、Ø4 手拧）** → 全局一致性，避免"每件螺丝长得不一样" → 1 h
11. **统一丝印字库（Canvas 生成，禁外部字体）** → 文字是"工业感"的一半，且零依赖 → 0.5 h
12. **全件倒角层（所有可见 box 加 0.3–0.5 mm 倒角）** → 提升边缘高光，消灭"纸片感" → 1.5 h
13. **微划痕/灰尘 roughnessMap（6 张，按材质复用）** → 破除"全新塑料"感，近看有效 → 1 h
14. **每件 legend 与层绑定 + 拆解缝对齐（0.3–0.8 mm）** → 讲解体验，缝隙是"能拆开"的视觉暗示 → 0.5 h

> 若要砍到 10 条：砍 13、11、10、9。

---

## 11. 查不到 / 估算项汇总（写文案时别当事实）

- **CPU**：基板层数、IHS 精确厚度、tile 尺寸、SMD 数量、散热器孔距。
- **主板**：PCB 层数、安装孔数（9 为常见值）、VRM 相数、电感/电容数量、各槽精确长度。
- **内存**：马甲总高/厚、DRAM 封装尺寸、颗粒数量与容量对应、金手指高度、PMIC 尺寸。
- **SSD**：PCB 厚度、主控/NAND/DRAM 尺寸、缺口位置、Gen5 功耗。
- **显卡**：风扇叶数、鳍片数/间距、热管数量、VRAM 尺寸、供电相数、PCB 布局。
- **电源**：风扇尺寸/叶数、内部布局、电容数量、接口数量、钢板厚度。
- **散热器**：每塔精确片数（42–53 区间）、底座尺寸、热管长度、扣具孔距。
- **机箱**：钢板/玻璃厚度、电源仓尺寸、脚垫尺寸、I/O 配置。

> 上面这些在代码里可以随便用（视觉正确即可），但 `copy.js` 的"参数"文案只写带来源的数字。

---

## 12. 来源汇总

**标准与规格**
- ATX 305 × max 244 mm、I/O 区 158×44：<https://archive.shuttle.eu/2004/de/atx$.htm>
- ATX 2.1 铜柱 ≥6.5 mm、10×10 mm 区：<https://superuser.com/revisions/20a0a3c3-d0f1-4177-9004-164e776da898/view-source>
- ATX 背板 158.75 × 44.45 mm：<https://es.wikipedia.org/wiki/Panel_trasero_ATX>、<https://en.iczoom.com/product/k13-24809153-10004-1A-2.html>
- PCIe 槽间距 20.32 mm：<https://electronics.stackexchange.com/revisions/30a9f917-e8d4-4e97-abf2-27add1385f54/view-source>
- PCIe 卡边缘 36/64/98/164：<https://www.digikey.co.il/en/product-highlight/a/amphenol-fci/pci-express-gen-3-card-edge-connectors>、<https://www.digikey.jp/ja/product-highlight/a/amphenol-fci/pci-express-gen-4-card-edge-connectors>
- 6-32 UNC 螺纹：<https://www.profesionalreview.com/2018/11/06/tipos-de-tornillos-placas-base-y-pc/>
- ATX PS/2 150×86×140：<https://www.silverstonetek.com/en/tech-talk/10055>
- ATX 3.1 / 12V-2x6：<https://knowledge.seasonic.com/article/79-comparison-atx-3-0-vs-atx-3-1-standards>、<http://www.pcdiy.com.tw/detail/28840>、<https://www.gigabyte.cn/Power-Supply/GP-UD1300GM-PG5-rev-11>

**CPU**
- LGA1851 封装 45×37.5、Z-height 4.464：<https://edc.intel.com/content/www/us/en/design/products/platforms/details/arrow-lake-s/core-ultra-200s-series-processors-datasheet-volume-1-of-2/package-support/>、<https://edc.intel.com/content/www/us/en/design/products/platforms/details/arrow-lake-s/core-ultra-200s-series-processors-datasheet-volume-1-of-2/007/package-mechanical-attributes/>
- AM5 40×40 / LGA1718：<https://news.xfastest.com/94985/amd-zen4-am5%e6%8f%92%e6%a7%bd%e6%9b%9d%e5%85%89-%e5%91%8a%e5%88%a5%e8%84%86%e5%bc%b1%e7%9a%84%e9%87%9d%e8%85%b3/>、<https://www.eet-china.com/mp/a54261.html>、<https://www.noticias3d.com/noticia/84867/maqueta-ihs-procesadores-amd-zen-4-raphael-ryzen-para.html>

**内存**
- DDR5 UDIMM 133.35×31.25×1.27：<https://en.hogestorage.com/product_details/30.html>、<https://my.avnet.com/wcm/connect/b6e4d9f8-d5c7-4b2d-8daf-d1f7ad18f372/Micron+DRAM+Module+Form+Factors+Quick+Reference+Guide.pdf>
- DIMM 插座 288 pin / 0.85 mm：<https://www.findchips.com/detail/2044731134/Molex>、<https://www.findchips.com/detail/2-2355626-1/TE-Connectivity>、<https://dnt.jpcconnectivity.com/lang/en/product/find/DDR5__R_LR_DIMM_SMT_Connector>

**SSD**
- M.2 2280 22×80×2.38：<https://content.etilize.com/Additional-pdf1/1080938292.pdf>、<http://www.gongkong.com/product/202103/127187.html>
- M.2 67 pin / 75 位置 / 0.5 mm：<https://www.everythingrf.com/community/what-is-the-m-2-form-factor>、<https://item.szlcsc.com/51318882.html>、<https://www.mouser.tw/new/amphenol/amphenol-pcie-mpoint2-gen-5/>
- M2×3 螺丝 / 4.5 mm 铜柱：<https://support1.starfivetech.com/t/what-kind-of-ssd-can-be-used/886/31>、<https://www.amazon.ca/dp/B0FMFH4V3N/>

**显卡**
- RTX 4090 FE 304×137×61：<https://www.pconline.com.cn/ask/613853.html>、<https://www.dell.com/community/en/conversations/alienware-desktops/aurora-r9-rtx-4080/647fa0bef4ccf8a8de5cfbbf>
- RTX 5080 FE 304×137：<https://www.kitguru.net/components/graphic-cards/dominic-moass/nvidia-rtx-5080-review-efficiency-gains-but-a-performance-letdown/2/>
- INNO3D 5080 Ø88×3 / 7 热管 / 2.5 槽：<https://www.gdm.or.jp/pressrelease/2025/0128/572975>
- ASUS Prime 5080 304 / 2.5 槽：<https://www.fastclick.mu/products/asus-the-sff-ready-prime-geforce-rtx%E2%84%A2-5080-16gb-gddr7-graphics-card-pcie%C2%AE-5-0-hdmi%C2%AE-dp-2-1-2-5-slot-axial-tech-fans-vapor-chamber-dual-bios>

**散热器**
- PA120 125×135×157 / 6×Ø6 / 0.4 / 1.8 / 750 g：<https://www.thermalright.com/tw/product/peerless-assassin-120/>、<https://www.startech.com.bd/thermalright-peerless-assassin-120-cpu-air-cooler>
- 0.4 mm 鳍片 / 1.8 mm 间距 / 110 mm 堆高（实测）：<https://www.frostytech.com/articles/2769/2.html>
- 双塔 42/53 片实测：<https://nikktech.com/main/articles/pc-hardware/cpu-cooling/cpu-air-coolers/3015-cryorig-r1-ultimate-cpu-cooler-review>
- 120×25 / 7 叶 / 1200 RPM：<https://www.proshop.se/Chassi-flaekt/Fractal-Design-Prisma-SL-12-Green-Chassi-flaekt-120mm-Groen-20-dBA/2721874>

**机箱**
- Lancool II 210×460×470：<https://www.falabella.com.pe/falabella-pe/product/144370872/caja-mid-tower-lian-li-lancool-ii-w-rgb-blanca-diseno-elegante-y-ventilacion-optimizada>
- Lancool II Mesh 229×494×478：<https://www.bhphotovideo.com/c/product/1577101-REG/lian_li_lan2mrx_lancool_ii_mesh_rgb_mid_tower_case.html/overview>
- Lancool 216 235×491.7×480.9：<https://lian-li.com/it/product/lancool-216/>
- 6×120 / 360 冷排：<https://www.corsair.com/us/en/p/pc-cases/cc-9011181-ww/275r-airflow-tempered-glass-mid-tower-gaming-case-black-cc-9011181-ww>
