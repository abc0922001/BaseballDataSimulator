# Baseball Data Simulator — AI Agent 專案指引與協作規範 (AGENTS.md)

本文件專為接手或協作此專案的 AI Coding Agent 編寫。旨在提供系統全貌、核心設計原則、數學模型不變量、目錄職責劃分、驗收標準與開發操作準則，確保即使未參與初期開發的 Agent 亦能精準理解專案脈絡，避免破壞核心收斂性與既有規則。

---

## 1. 專案核心定位與設計原則 (Core Philosophy)

**Baseball Data Simulator（純數學棒球數據模擬器）** 是一個專為棒球數據實驗設計的高速蒙地卡羅（Monte Carlo）模擬實驗室，不渲染任何動畫，將 100% 運算資源集中於逐局、逐打席、逐壘包的真實棒球規則數學模擬。

### 1.1 核心不變量 (System Invariants)
1. **嚴格控制變因實驗室**：
   - 全聯盟採 **DH 指定打擊制**（無投手打擊）。
   - 每隊固定 **9 名先發打者**全勤出賽（無傷病、疲勞、代打、守備位置區分）。
   - 全聯盟投手與守備皆固定為 **能力值 50 的聯盟標準常數背景**。
   - 一次僅調整 **單一目標球隊（主角隊）**，其餘 29 隊恆定全 50 基準對照組，確保勝率與進階數據的變化 100% 源自受測打線變因。
2. **自然隨機對決與精準基準收斂**：
   - 每個打席透過「三階段隨機能力檢定」動態生成結果，嚴禁人為硬性鎖死單季成績。
   - 當球員四維能力皆為預設值 `50` 時，長期期望值必須自然收斂至 **`.250 / .320 / .400`（AVG / OBP / SLG，OPS `.720`）** 與場均得分 **`4.40～4.50 分（R/G）`**。
3. **兩大實驗模式**：
   - **模式一（自由變因實驗）**：不限總點數，自由調整主角隊任一棒次之四維能力（例如測試「第一棒長打 100」對比「第四棒長打 100」）。
   - **模式二（1,800 點固定預算挑戰）**：9 名打者共享 1,800 點預算（可選單人 200 點鎖定），81～100 級距採遞增成本（每級 2 點預算）。

---

## 2. 規格文件體系 (Single Source of Truth)

在修改任何數學邏輯或賽事規則前，必須先閱讀專案根目錄下 `docs/` 的三份核心文件：
- [`docs/DESIGN.md`](docs/DESIGN.md)：系統架構、打席三階段檢定公式、跑壘推進與出局護送模型、162 場 MLB 賽程主客對稱結構、四階同戰績比序、RE24 矩陣與 WPA 解析式。
- [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md)：Phase 1 至 Phase 5 的架構分層與模組關聯。
- [`docs/TEST_PLAN.md`](docs/TEST_PLAN.md)：自動化測試案例規範（TC-BASE、TC-EXT、TC-RULE、TC-COST）與驗收門檻。

---

## 3. 目錄結構與模組職責 (Architecture & File Navigation)

專案嚴格遵循「**引擎核心（純邏輯、無 DOM 依賴）** $\to$ **背景 Worker** $\to$ **React UI 介面**」的單向依賴分層架構：

```text
BaseballDataSimulator/
├── docs/                        # 單一真實來源文件 (Design, Plan, Test)
├── src/
│   ├── engine/                  # 純 TypeScript 棒球數學核心 (零 React/DOM 依賴，高可測試性)
│   │   ├── types.ts             # 聯盟、球隊、打者、進階數據型別定義
│   │   ├── prng.ts              # Mulberry32 確定性 32-bit PRNG (支援固定 Seed 100% 重現)
│   │   ├── constants.ts         # 24 狀態 RE24 矩陣、1800 點預算與遞增成本計算器
│   │   ├── probability.ts       # lerp3 雙區間插值、三階段打席檢定、跑壘/盜壘/出局推進機率
│   │   ├── winExpectancy.ts     # 24 狀態 RE24 得分貢獻計算器與 WPA 勝率期望模型
│   │   ├── gameSimulator.ts     # 單場九局 (含傳統延長賽無免費跑者) 正規比賽模擬器
│   │   ├── scheduleGenerator.ts # 30 隊 162 場 MLB 對稱賽程產生器 (2,430 場)
│   │   ├── seasonSimulator.ts   # 單季 2,430 場結算、四階同戰績比序、OPS+/wRC+ 結算
│   │   └── monteCarloRunner.ts  # 多季 (1~100 季) 蒙地卡羅執行器與統計聚合器
│   ├── worker/
│   │   └── simulation.worker.ts # Web Worker 背景執行緒通訊層 (避免阻塞主執行緒 60fps)
│   ├── components/              # React 實驗室前端元件
│   │   ├── LineupEditor.tsx     # 1~9 棒四維滑桿、棒次對調、理論三圍即時預覽、預算池儀表
│   │   ├── SimulationControls.tsx # 季數選擇 (1/10/30/50/100)、Seed 設定、Worker 進度條、快照儲存
│   │   ├── StandingsView.tsx    # 主角隊英雄卡片 (W-L, 畢氏勝率, 封王/外卡率) 與雙聯盟六分區戰績
│   │   ├── LeaderboardView.tsx  # 打者基礎/進階 (OPS+, wRC+, WPA, RE24) 點擊表頭排序排行榜
│   │   └── SnapshotCompare.tsx  # A/B 實驗快照並排對照表 (勝率差 ΔWin%、得分差 ΔR/G)
│   ├── App.tsx                  # 頂層狀態管理與工作區切換
│   ├── main.tsx                 # React 入口點
│   └── index.css                # Tailwind CSS v4 樣式
├── test/
│   └── engine.test.ts           # Vitest 單元測試與 30 季收斂檢核套件 (20 項完整測試)
├── vite.config.ts               # Vite 設定 (含 base: './' 支援 GitHub Pages 子路徑)
├── tsconfig.json                # TypeScript 嚴格設定 (erasableSyntaxOnly)
└── README.md                    # 專案說明與操作指南
```

---

## 4. 關鍵數學公式與業務規則摘要

### 4.1 打席三階段檢定 (Three-Stage PA Resolution)
- **通用雙區間插值函式**：$\text{lerp3}(x, v_0, v_{50}, v_{100})$（$0 \le x \le 50$ 與 $50 < x \le 100$ 線性對應），確保能力 50 錨定基準，0 與 100 呈現放大極端值。
- **第一階段（選球檢定，Eye $\to$ BB）**：$P(\text{BB}) = \text{lerp3}(E, 0.015, 7/75, 0.250)$。
- **第二階段（接觸檢定，Contact + Speed $\to$ Hit / K / Out）**：
  - 打數安打率 $P(\text{Hit} \mid \text{AB}) = \text{clamp}(\text{lerp3}(C, 0.120, 0.250, 0.400) + \frac{S-50}{50} \times 0.015, 0.080, 0.450)$。
  - 三振條件機率 $P(\text{K} \mid \text{AB Out}) = \text{clamp}(\text{lerp3}(C, 0.550, 0.295, 0.080) - \frac{E-50}{50} \times 0.030, 0.030, 0.650)$。
- **第三階段（長打檢定，Power + Speed $\to$ 1B / 2B / 3B / HR）**：
  - $P(\text{HR} \mid \text{Hit}) = \text{lerp3}(P, 0.010, 0.128, 0.495)$。

### 4.2 跑壘推進與四大盲點防護
- **盜壘（SB/CS）防自殺機制**：$S_{\text{runner}} < 45$ 時盜壘企圖率為 `0%`；$S=50$ 時成功率 `76%`（損益平衡點）；$S=100$ 時成功率 `90%`。
- **避免雙殺（GIDP）**：出局數 $< 2$ 且一壘有人擊出一般場內出局時，由打者速度判定 $P(\text{GIDP}) = \text{lerp3}(S, 0.20, 0.080, 0.015)$。
- **一般出局護送推進（Productive Outs）**：未雙殺且出局數 $< 3$ 時，三壘跑者有機率得分（計打者 1 打點 RBI），二壘跑者有機率推進三壘。**三振（K）則 0% 護送**。
- **傳統正規延長賽**：9 局平手進入第 10 局，**無免費二壘跑者（開局壘包嚴格為 000）**。
- **純規則主客場**：無任何屬性加成，僅保留 9 局下主隊領先免攻與再見安打/再見全壘打機制。

### 4.3 1,800 點高能力遞增成本函數
- 能力在 `0–80` 區間為 `1:1` 消耗；`81–100` 區間每點消耗 `2 點` 預算：
  $$\text{Cost}(x) = \begin{cases} x, & 0 \le x \le 80 \\ 80 + 2 \times (x - 80), & 81 \le x \le 100 \end{cases}$$
- 能力 50 = 50 點（9人全50剛好 1,800 點）；能力 100 = 120 點（四維全100單人需 480 點）。

### 4.4 賽制與比序規則
- 30 隊各出賽 162 場（同分區 52 場、同聯盟跨分區 64 場、跨聯盟 46 場；主客各 81 場，全聯盟共 2,430 場）。
- 每聯盟結算 **3 席分區冠軍** 與 **3 席外卡**。
- 四階同戰績比序（Tiebreaker Hierarchy）：
  1. 直接對戰勝率（Head-to-Head Win%）
  2. 同分區對戰勝率（Intradivision Win%）
  3. 整季得失分差（Run Differential, $R - RA$）
  4. 整季總得分（Total Runs Scored, $R$）

---

## 5. 自動化測試驗證清單 (Test Suites & Pass Criteria)

在提交任何程式碼修改前，必須確保 [`test/engine.test.ts`](test/engine.test.ts) 中的 20 項測試全數通過（`npm test -- --run`）：

1. **基準收斂組 (`TC-BASE-01 ~ 06`)**：
   - 全 50 模擬 30 季，全聯盟 $\text{AVG} \in [0.248, 0.252]$。
   - 全聯盟 $\text{OBP} \in [0.318, 0.322]$。
   - 全聯盟 $\text{SLG} \in [0.396, 0.404]$。
   - 全聯盟 $\text{OPS} \in [0.715, 0.725]$。
   - 全聯盟 $\text{R/G} \in [4.30, 4.70]$，單隊單季平均全壘打落在 $165 \sim 190$ 支。
   - `OPS+` 與 `wRC+` 中心點為 $100 \pm 1$，平均 `RE24` 接近 0。
2. **單調性與極值組 (`TC-EXT-01 ~ 04`)**：
   - 選球 Eye `0 vs 50 vs 100`（保送率 $<2.5\%$ vs $>22\%$）。
   - 打擊 Contact `0 vs 50 vs 100`（打擊率 $<.140$ vs $[.385, .415]$）。
   - 長打 Power `0 vs 50 vs 100`（全壘打 $<5$ 支 vs $70\sim85$ 支）。
   - 速度 Speed `0 vs 50 vs 100`（盜壘數 0 vs $>40$ 且成功率 $>85\%$，避免雙殺）。
3. **規則防護組 (`TC-RULE-01 ~ 06`)**：
   - 162 場賽程完整性與主客 81 場嚴格對稱（全季勝場 2,430、敗場 2,430）。
   - 延長賽無幽靈跑者（第 10 局起壘包狀態 000）。
   - 一般出局護送推進 vs. 三振 0 護送。
   - 純規則主客場無能力值加成。
   - 雙聯盟各選出 3 分區冠軍 + 3 外卡，嚴格執行四階比序。
   - 相同 PRNG Seed 具備 100% 重現性。
4. **預算成本組 (`TC-COST-01 ~ 03`)**：
   - 全 50 剛好 1,800 點；遞增成本每級 2 點計算無誤；鎖定單人 200 點阻擋機制生效。
5. **經典實驗驗證 (`QA-EXP-01`)**：
   - 第一棒長打 100 連續 30 季顯著提升勝場（$\Delta W \ge +3$ 場）、單季約 80+ 轟、OPS+/wRC+ 達 150+。

---

## 6. 開發者維護注意事項與指令規範 (Agent Operating Rules)

1. **型別檢查與建置**：
   - 修改程式碼後，必須執行 `npm run check`（`tsc --noEmit`），確認 0 錯誤、0 警告。
   - 生產環境建置執行 `npm run build`，輸出產物存放於 `dist/`。
2. **測試執行指令**：
   - 執行全部測試：`npm test -- --run`。
   - 切勿執行可能啟用 e2e 的全量無參數 vitest 指令。
3. **Git 操作約束（極度重要）**：
   - **僅在使用者明確要求時才執行 commit**。
   - 執行 commit 時，遵循 `git-commit` 規範，**Commit Message 必須使用正體中文（zh-TW）撰寫**，主旨行使用原形動詞（如 `Add`, `Fix`, `Refactor`, `Update` 等），長度 $\le 50$ 字元且結尾無句號。
   - **嚴格禁止主動執行 `git push`**。推送權限與時機 100% 由使用者手動控制。
4. **保持引擎純粹度**：
   - `src/engine/` 中的所有模組嚴禁引入 React、DOM API、`window` 或任何前端狀態。
   - 所有資料流必須透過純函式、參數傳遞與 PRNG 實例注入，以確保在 Web Worker 與 Node/Vitest 環境中皆可零依賴執行。
