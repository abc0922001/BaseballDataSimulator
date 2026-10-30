# Baseball Data Simulator — 工程實作計畫 (Implementation Plan)

本計畫依據 `docs/DESIGN.md` 之系統與數學模型規格，將開發流程切分為 **5 個獨立且可驗證的里程碑階段（Phases）**。核心原則為**「引擎先行、基準校驗、背景多執行緒、最後綁定互動 UI」**，確保數學模擬的精確度與運算效能。

---

## 階段總覽與相依關係 (Milestone Dependency Graph)

```text
Phase 1: 專案初始化與基礎型別/PRNG 建置
   │
   ▼
Phase 2: 棒球數學核心引擎 (三階段檢定 + 完整跑壘 + 單場模擬 + RE24/WPA)
   │
   ▼
Phase 3: 30 隊 162 場賽季模擬器、分區/外卡比序與「全 50 基準收斂驗證」
   │
   ▼
Phase 4: 多季蒙地卡羅執行器与 Web Worker 背景高速通訊層
   │
   ▼
Phase 5: 純前端 Web 實驗室介面 (打線配置器、1,800 點預算池、排行榜、A/B 快照對照)
```

---

## Phase 1：專案初始化與基礎架構建置 (Project Scaffolding & Core Types)

### 1.1 工作項目
1. **初始化 Vite + React + TypeScript + Tailwind CSS 專案**：
   - 建立 `package.json`、`tsconfig.json`、`vite.config.ts` 與 Vitest 測試環境。
2. **定義核心領域資料結構 (`src/engine/types.ts`)**：
   - `PlayerAttributes`：`contact`, `power`, `speed`, `eye`（`0–100`）。
   - `BatterConfig` & `TeamConfig`：棒次（1～9 棒）、球員 ID、姓名與能力值。
   - `BatterStats`：單季與多季平均之基礎數據（`PA, AB, R, H, 1B, 2B, 3B, HR, TB, RBI, BB, K, SB, CS, GIDP`）與進階數據（`AVG, OBP, SLG, OPS, ISO, BABIP, OPS+, wOBA, wRC+, RE24, WPA`）。
   - `TeamSeasonSummary`：勝、敗、實際勝率、畢氏期望勝率、得分、失分、分區排名、是否分區冠軍、是否外卡。
   - `MonteCarloResult`：多季模擬聚合統計與實驗快照（`ExperimentSnapshot`）格式。
3. **實作確定性虛擬亂數產生器 (`src/engine/prng.ts`)**：
   - 實作 `Mulberry32` 演算法，支援固定 `Seed` 輸入，確保相同種子與相同打線配置下，30 季模擬結果 100% 可重現。
4. **實作點數成本計算器 (`src/engine/constants.ts`)**：
   - 實作 `calculateAttributeCost(value)`（`0–80` 為 `1:1`，`81–100` 為 `1:2`）與團隊/單人點數驗證函式。

### 1.2 驗收標準
- 單元測試驗證 `calculateAttributeCost(50) === 50`、`calculateAttributeCost(80) === 80`、`calculateAttributeCost(100) === 120`，且預設 9 人全 50 隊伍總消耗恰為 `1,800 點`。

---

## Phase 2：投打對決、跑壘推進與單場比賽引擎 (Plate Appearance & Game Engine)

### 2.1 工作項目
1. **打席三階段隨機檢定模組 (`src/engine/probability.ts`)**：
   - 實作雙區間線性插值 `lerp3(x, v0, v50, v100)`。
   - 實作第一階段選球檢定（`Eye` $\to$ `BB`）、第二階段接觸與安打檢定（`Contact + Speed` $\to$ `Hit / K / Out`）、第三階段長打等級檢定（`Power + Speed` $\to$ `1B / 2B / 3B / HR`）。
   - 提供單一打者理論期望三圍預覽函式 `estimateTheoreticalSlashLine(attrs)` 供 UI 即時顯示。
2. **RE24 與 WPA 勝率期望模組 (`src/engine/winExpectancy.ts`)**：
   - 內建 24 種壘包/出局狀態期望得分表 `RE24_MATRIX[baseState][outs]`。
   - 實作 `getWinExpectancy(inning, isBottom, outs, baseState, homeScoreDiff)`，支援 9 局下半再見比賽（Walk-off）與延長賽槓桿計算。
3. **單場九局（含傳統延長賽）模擬器 (`src/engine/gameSimulator.ts`)**：
   - 維護兩隊當前棒次指標（`0–8` 循環）、局數、上下半局、出局數（`0–2`）與一二三壘跑者狀態。
   - 實作打席前盜壘檢定（`SB / CS`，含 $S < 45$ 不盲目盜壘保護）。
   - 實作安打時依壘上跑者 `Speed` 判定額外進壘（`1B` 時一上三/二回本、`2B` 時一回本）。
   - 實作少於兩出局時一般場內出局（`Out`）的雙殺打（`GIDP`）檢定與護送推進（三壘跑者得分、二壘跑者進三壘）。
   - 實作 9 局下主隊領先提前結束與再見比賽判定，以及平手時進入無免費跑者之第 10+ 局傳統延長賽。

### 2.2 驗收標準
- 單場模擬無死迴圈，主客場得分、打席數、出局數（正規 9 局每半局嚴格 3 出局，再見比賽除外）與個人 `RE24 / WPA` 總和守恆。

---

## Phase 3：162 場賽程、進階數據結算與基準收斂校驗 (Season Engine & Calibration)

### 3.1 工作項目
1. **MLB 擬真 162 場賽程產生器 (`src/engine/scheduleGenerator.ts`)**：
   - 建立 2 聯盟 × 3 分區 × 5 隊（共 30 隊）結構。
   - 產出每隊 162 場對戰表（同分區 52 場、同聯盟跨分區 64 場、跨聯盟 46 場；主客各 81 場），共 `2,430 場` 例行賽。
2. **單季模擬與同戰績比序 (`src/engine/seasonSimulator.ts`)**：
   - 執行 2,430 場比賽，記錄兩隊直接對戰戰績（Head-to-Head）與分區內戰績。
   - 結算各分區排名，並依「直接對戰勝率 $\to$ 同分區勝率 $\to$ 得失分差 $\to$ 總得分」判定每聯盟 **3 支分區冠軍** 與 **3 張外卡（Wild Card）**。
   - 計算全聯盟平均 `lgOBP`、`lgSLG`、`lgwOBA`、`lgR/lgPA`，進而為全聯盟 270 名打者結算 `OPS+`、`wOBA`、`wRC+` 與團隊 `畢氏期望勝率`。
3. **全 50 基準收斂校準測試**：
   - 執行 30 季全聯盟能力 50 模擬，驗證全聯盟綜合三圍收斂於 `.250 / .320 / .400`（誤差 $< \pm .003$）且場均得分收斂於 `4.50 分`（誤差 $< \pm 0.15$ 分）。

### 3.2 驗收標準
- 通過自動化基準校準測試，且單季 2,430 場模擬在單執行緒下耗時低於 `50ms`。

---

## Phase 4：多季蒙地卡羅引擎與 Web Worker 封裝 (Monte Carlo & Web Worker)

### 4.1 工作項目
1. **多季批次模擬聚合器 (`src/engine/monteCarloRunner.ts`)**：
   - 支援連續執行 $N$ 季（如 1、10、30、50、100 季）。
   - 聚合計算每支球隊的平均勝敗場、勝率標準差、畢氏期望勝率、**分區封王率（%）**、**外卡率（%）**與**季後賽總晉級率（%）**。
   - 聚合計算主角隊 1～9 棒與全聯盟打者的多季平均基礎/進階數據。
2. **Web Worker 非同步通訊 (`src/worker/simulation.worker.ts`)**：
   - 接收主執行緒傳入的 `SimulationRequest`（主角隊配置、模擬季數、亂數種子）。
   - 每完成 1 季發送 `PROGRESS` 訊息更新 UI 進度條；全部完成後回傳 `COMPLETE` 完整統計結果。

### 4.2 驗收標準
- 連續模擬 30 季（72,900 場比賽）於 1～2 秒內完成，UI 進度條平滑更新且主執行緒無任何卡頓。

---

## Phase 5：純前端 Web 實驗室介面實作 (React Laboratory UI)

### 5.1 工作項目
1. **主角隊 1～9 棒配置器 (`src/components/LineupEditor.tsx`)**：
   - 模式切換分頁：**「自由變因實驗模式」** vs. **「1,800 點固定預算挑戰模式」**（含「鎖定單人 200 點」勾選框与即時剩餘點數儀表）。
   - 1～9 棒四維能力滑桿與數字輸入框，標示 `81–100` 高能力遞增消耗提示，並即時顯示該棒次的理論期望 `AVG / OBP / SLG / OPS`。
   - 棒次上下對調按鈕與快速實驗預設集（如「一棒長打 100」、「四棒長打 100」、「極限上壘一二棒」等）。
2. **模擬控制與快照管理列 (`src/components/SimulationControls.tsx`)**：
   - 季數選擇（1 / 10 / 30 / 50 / 100 季）、Seed 鎖定/隨機切換、執行按鈕與進度條。
   - 「儲存為實驗快照（Save Snapshot）」功能。
3. **分區戰績、外卡與晉級率視圖 (`src/components/StandingsView.tsx`)**：
   - 頂部醒目卡片：主角隊平均勝敗、勝率（含相對 `.500` 基準之 $\Delta$）、畢氏期望勝率、場均得分、分區封王率與總晉級率。
   - 雙聯盟 6 分區完整戰績表與外卡標記（`DIV` / `WC`）。
4. **打擊排行榜視圖 (`src/components/LeaderboardView.tsx`)**：
   - 支援「主角隊 1～9 棒棒次檢視」與「全聯盟排行榜（Top 50 / 全部 270 人）」切換。
   - 完整顯示基礎與進階數據欄位（`PA, AVG, OBP, SLG, OPS, HR, RBI, R, BB, K, SB, CS, GIDP, OPS+, wOBA, wRC+, WPA, RE24`），支援點擊表頭排序。
5. **A/B 實驗快照對照視圖 (`src/components/SnapshotCompare.tsx`)**：
   - 並排比較多個已儲存的實驗快照（例如直接對比「基準全 50」、「一棒 Power 100」、「四棒 Power 100」在 30 季下的平均勝場差、得分差與各棒次 WPA 變化）。

### 5.2 驗收標準
- 通過 `docs/TEST_PLAN.md` 中所有自動化測試與手動 QA 檢核項目，建置（`npm run build`）零錯誤。
