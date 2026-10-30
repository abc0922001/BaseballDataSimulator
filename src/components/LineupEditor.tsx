import React from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Flame,
  Lock,
  RotateCcw,
  Sliders,
  Sparkles,
  Unlock,
} from 'lucide-react';
import {
  PROGRESSIVE_COST_THRESHOLD,
  SINGLE_PLAYER_BUDGET_LIMIT,
  TEAM_BUDGET_LIMIT,
  calculateAttributeCost,
  calculatePlayerCost,
  createBaselineLineup,
  validateLineupBudget,
} from '../engine/constants.ts';
import { estimateTheoreticalSlashLine } from '../engine/probability.ts';
import type { BatterConfig, ExperimentMode, PlayerAttributes } from '../engine/types.ts';

interface LineupEditorProps {
  lineup: BatterConfig[];
  mode: ExperimentMode;
  lockSinglePlayer200: boolean;
  onChangeLineup: (newLineup: BatterConfig[]) => void;
  onChangeMode: (newMode: ExperimentMode) => void;
  onChangeLock200: (locked: boolean) => void;
}

const ATTRIBUTE_KEYS: readonly {
  key: keyof PlayerAttributes;
  label: string;
  shortLabel: string;
  color: string;
}[] = [
  { key: 'contact', label: '打擊 Contact', shortLabel: 'CON', color: 'accent-sky-400' },
  { key: 'power', label: '長打 Power', shortLabel: 'PWR', color: 'accent-rose-500' },
  { key: 'speed', label: '速度 Speed', shortLabel: 'SPD', color: 'accent-emerald-400' },
  { key: 'eye', label: '選球 Eye', shortLabel: 'EYE', color: 'accent-amber-400' },
];

export const LineupEditor: React.FC<LineupEditorProps> = ({
  lineup,
  mode,
  lockSinglePlayer200,
  onChangeLineup,
  onChangeMode,
  onChangeLock200,
}) => {
  const budgetInfo = validateLineupBudget(lineup, lockSinglePlayer200);

  const handleAttrChange = (
    index: number,
    attrKey: keyof PlayerAttributes,
    rawValue: number
  ) => {
    const val = Math.max(0, Math.min(100, Math.round(rawValue || 0)));
    const next = lineup.map((b, i) =>
      i === index
        ? {
            ...b,
            attributes: {
              ...b.attributes,
              [attrKey]: val,
            },
          }
        : b
    );
    onChangeLineup(next);
  };

  const handleNameChange = (index: number, newName: string) => {
    const next = lineup.map((b, i) => (i === index ? { ...b, name: newName } : b));
    onChangeLineup(next);
  };

  const handleSwapSlots = (indexA: number, indexB: number) => {
    if (indexB < 0 || indexB >= lineup.length) return;
    const next = [...lineup];
    const temp = next[indexA];
    next[indexA] = next[indexB];
    next[indexB] = temp;
    const reindexed = next.map((b, idx) => ({
      ...b,
      slot: idx + 1,
    }));
    onChangeLineup(reindexed);
  };

  const applyPreset = (presetId: string) => {
    const base = createBaselineLineup();
    if (presetId === 'baseline50') {
      onChangeLineup(base);
      return;
    }
    if (presetId === '1stPower100') {
      onChangeMode('free');
      base[0].name = '第 1 棒 (Power 100)';
      base[0].attributes.power = 100;
      onChangeLineup(base);
      return;
    }
    if (presetId === '4thPower100') {
      onChangeMode('free');
      base[3].name = '第 4 棒 (Power 100)';
      base[3].attributes.power = 100;
      onChangeLineup(base);
      return;
    }
    if (presetId === '1stTableSetter') {
      onChangeMode('free');
      base[0].name = '開路先鋒 (Eye/Spd 100)';
      base[0].attributes.eye = 100;
      base[0].attributes.speed = 100;
      onChangeLineup(base);
      return;
    }
    if (presetId === 'budgetStarsAndScrubs') {
      onChangeMode('budget');
      onChangeLock200(false);
      // 3 core stars (Slots 1, 2, 3) with 80s (280 pts each -> 840 pts) + 6 role players (160 pts each -> 960 pts) = 1,800 pts
      const stars: PlayerAttributes = { contact: 80, power: 80, speed: 50, eye: 70 }; // 280 pts
      const role: PlayerAttributes = { contact: 45, power: 40, speed: 35, eye: 40 };  // 160 pts
      const next = base.map((b, i) => ({
        ...b,
        name: i < 3 ? `核心巨星 #${i + 1}` : `綠葉打者 #${i + 1}`,
        attributes: i < 3 ? { ...stars } : { ...role },
      }));
      onChangeLineup(next);
      return;
    }
    if (presetId === 'budgetModernOptimized') {
      onChangeMode('budget');
      onChangeLock200(true);
      // Every batter strictly 200 pts, specialized by lineup role
      const configs: { name: string; attrs: PlayerAttributes }[] = [
        { name: '1棒 高上壘快腿', attrs: { contact: 50, power: 20, speed: 60, eye: 70 } }, // 200
        { name: '2棒 核心強打', attrs: { contact: 65, power: 65, speed: 20, eye: 50 } },   // 200
        { name: '3棒 重砲中心', attrs: { contact: 60, power: 75, speed: 15, eye: 50 } },   // 200
        { name: '4棒 清理重砲', attrs: { contact: 50, power: 80, speed: 15, eye: 55 } },   // 200
        { name: '5棒 長打支援', attrs: { contact: 55, power: 70, speed: 25, eye: 50 } },   // 200
        { name: '6棒 選球串聯', attrs: { contact: 55, power: 45, speed: 40, eye: 60 } },   // 200
        { name: '7棒 巧打推進', attrs: { contact: 60, power: 35, speed: 55, eye: 50 } },   // 200
        { name: '8棒 守備伏兵', attrs: { contact: 50, power: 45, speed: 55, eye: 50 } },   // 200
        { name: '9棒 二號開路', attrs: { contact: 50, power: 15, speed: 70, eye: 65 } },   // 200
      ];
      const next = base.map((b, i) => ({
        ...b,
        name: configs[i].name,
        attributes: { ...configs[i].attrs },
      }));
      onChangeLineup(next);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs dark:shadow-lg transition-colors">
      {/* Header & Mode Switcher */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Sliders className="w-5 h-5 text-blue-500 dark:text-blue-400" />
            主角隊 1～9 棒打線配置實驗室 (Lineup & Point Pool)
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            其餘 29 支對照組球隊全能力恆定為 50，確保勝率與進階數據變化 100% 來自受測打線
          </p>
        </div>

        {/* Mode Tabs */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onChangeMode('free')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer ${
              mode === 'free'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            模式一：自由變因實驗 (Free Sandbox)
          </button>

          <button
            type="button"
            onClick={() => onChangeMode('budget')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer ${
              mode === 'budget'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <Flame className="w-4 h-4" />
            模式二：1,800 點固定預算挑戰 (Budget Challenge)
          </button>
        </div>
      </div>

      {/* Presets & Budget Meter Bar */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 my-4">
        {/* Quick Experiment Presets */}
        <div className="xl:col-span-7 bg-slate-50/90 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800/80 rounded-lg p-3">
          <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2 flex items-center justify-between">
            <span>一鍵套用經典實驗預設集 (Experiment Presets)</span>
            <button
              type="button"
              onClick={() => applyPreset('baseline50')}
              className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              重置全 50 基準
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => applyPreset('baseline50')}
              className="px-2.5 py-1.5 rounded bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 cursor-pointer shadow-2xs"
            >
              基準全 50 對照組
            </button>
            <button
              type="button"
              onClick={() => applyPreset('1stPower100')}
              className="px-2.5 py-1.5 rounded bg-rose-50 dark:bg-rose-950/70 hover:bg-rose-100 dark:hover:bg-rose-900/80 text-xs text-rose-800 dark:text-rose-200 border border-rose-200 dark:border-rose-800/60 cursor-pointer shadow-2xs"
            >
              一棒長打 100 (其餘 50)
            </button>
            <button
              type="button"
              onClick={() => applyPreset('4thPower100')}
              className="px-2.5 py-1.5 rounded bg-amber-50 dark:bg-amber-950/70 hover:bg-amber-100 dark:hover:bg-amber-900/80 text-xs text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800/60 cursor-pointer shadow-2xs"
            >
              四棒長打 100 (其餘 50)
            </button>
            <button
              type="button"
              onClick={() => applyPreset('1stTableSetter')}
              className="px-2.5 py-1.5 rounded bg-sky-50 dark:bg-sky-950/70 hover:bg-sky-100 dark:hover:bg-sky-900/80 text-xs text-sky-800 dark:text-sky-200 border border-sky-200 dark:border-sky-800/60 cursor-pointer shadow-2xs"
            >
              一棒選球 100 + 速度 100
            </button>
            <button
              type="button"
              onClick={() => applyPreset('budgetModernOptimized')}
              className="px-2.5 py-1.5 rounded bg-emerald-50 dark:bg-emerald-950/70 hover:bg-emerald-100 dark:hover:bg-emerald-900/80 text-xs text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800/60 cursor-pointer shadow-2xs"
            >
              [1800點] 單人鎖定 200 點特化型
            </button>
            <button
              type="button"
              onClick={() => applyPreset('budgetStarsAndScrubs')}
              className="px-2.5 py-1.5 rounded bg-purple-50 dark:bg-purple-950/70 hover:bg-purple-100 dark:hover:bg-purple-900/80 text-xs text-purple-800 dark:text-purple-200 border border-purple-200 dark:border-purple-800/60 cursor-pointer shadow-2xs"
            >
              [1800點] 三巨星集中打線
            </button>
          </div>
        </div>

        {/* Point Pool Status Box */}
        <div
          className={`xl:col-span-5 rounded-lg p-3 border transition-colors ${
            mode === 'budget' && !budgetInfo.isValid
              ? 'bg-rose-50/90 dark:bg-rose-950/40 border-rose-300 dark:border-rose-700'
              : 'bg-slate-50/90 dark:bg-slate-950/70 border-slate-200 dark:border-slate-800/80'
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              團隊總預算消耗
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-normal">
                (81~100 每級消耗 2 點)
              </span>
            </span>

            {mode === 'budget' && (
              <button
                type="button"
                onClick={() => onChangeLock200(!lockSinglePlayer200)}
                className={`px-2 py-0.5 rounded text-[11px] font-medium flex items-center gap-1 border cursor-pointer ${
                  lockSinglePlayer200
                    ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-500/50'
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-400 border-slate-300 dark:border-slate-700'
                }`}
              >
                {lockSinglePlayer200 ? (
                  <>
                    <Lock className="w-3 h-3" /> 鎖定單人 200 點上限
                  </>
                ) : (
                  <>
                    <Unlock className="w-3 h-3" /> 允許跨球員自由挪移
                  </>
                )}
              </button>
            )}
          </div>

          <div className="flex items-baseline justify-between">
            <div className="text-lg font-mono font-bold text-slate-900 dark:text-white">
              {budgetInfo.totalCost.toLocaleString()}{' '}
              <span className="text-xs text-slate-500 dark:text-slate-400 font-normal">
                / {TEAM_BUDGET_LIMIT.toLocaleString()} 點
              </span>
            </div>

            {mode === 'budget' ? (
              budgetInfo.isValid ? (
                <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  剩餘 {budgetInfo.remainingPoints} 點 (符合規範)
                </span>
              ) : (
                <span className="text-xs text-rose-600 dark:text-rose-400 flex items-center gap-1 font-semibold">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {budgetInfo.overBudgetPoints > 0
                    ? `總預算超支 ${budgetInfo.overBudgetPoints} 點`
                    : `第 ${budgetInfo.violatingSlots.join(', ')} 棒超過單人 200 點上限`}
                </span>
              )
            ) : (
              <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                自由實驗模式 (不限點數上限)
              </span>
            )}
          </div>

          {/* Progress Bar */}
          <div className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden mt-2">
            <div
              className={`h-full transition-all duration-200 ${
                mode === 'budget' && !budgetInfo.isValid
                  ? 'bg-rose-500'
                  : budgetInfo.totalCost === TEAM_BUDGET_LIMIT
                  ? 'bg-emerald-500'
                  : 'bg-blue-500'
              }`}
              style={{
                width: `${Math.min(100, (budgetInfo.totalCost / TEAM_BUDGET_LIMIT) * 100)}%`,
              }}
            />
          </div>
        </div>
      </div>

      {/* 1~9 Lineup Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <th className="py-2 px-2 w-16">棒次</th>
              <th className="py-2 px-2 w-40">打者名稱</th>
              {ATTRIBUTE_KEYS.map((attr) => (
                <th key={attr.key} className="py-2 px-2 min-w-[155px]">
                  {attr.label}
                </th>
              ))}
              <th className="py-2 px-2 text-right w-24">單人點數</th>
              <th className="py-2 px-2 text-right w-52">理論期望三圍 (AVG/OBP/SLG/OPS)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60 text-xs">
            {lineup.map((batter, idx) => {
              const pCost = calculatePlayerCost(batter.attributes);
              const slash = estimateTheoreticalSlashLine(batter.attributes);
              const isSlotViolating =
                mode === 'budget' &&
                lockSinglePlayer200 &&
                pCost > SINGLE_PLAYER_BUDGET_LIMIT;

              return (
                <tr
                  key={batter.id}
                  className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 transition ${
                    isSlotViolating ? 'bg-rose-50 dark:bg-rose-950/25' : ''
                  }`}
                >
                  {/* Slot & Move Up/Down */}
                  <td className="py-2.5 px-2 font-mono font-bold text-slate-800 dark:text-slate-200">
                    <div className="flex items-center gap-1">
                      <span className="w-5 h-5 rounded bg-slate-100 dark:bg-slate-800 inline-flex items-center justify-center text-xs text-blue-600 dark:text-blue-400 font-bold">
                        {batter.slot}
                      </span>
                      <div className="flex flex-col">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => handleSwapSlots(idx, idx - 1)}
                          title="上移棒次"
                          className="text-slate-400 hover:text-slate-800 dark:text-slate-500 dark:hover:text-slate-200 disabled:opacity-25 cursor-pointer"
                        >
                          <ArrowUp className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === lineup.length - 1}
                          onClick={() => handleSwapSlots(idx, idx + 1)}
                          title="下移棒次"
                          className="text-slate-400 hover:text-slate-800 dark:text-slate-500 dark:hover:text-slate-200 disabled:opacity-25 cursor-pointer"
                        >
                          <ArrowDown className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </td>

                  {/* Batter Name */}
                  <td className="py-2.5 px-2">
                    <input
                      type="text"
                      value={batter.name}
                      onChange={(e) => handleNameChange(idx, e.target.value)}
                      className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded px-2 py-1 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500"
                    />
                  </td>

                  {/* 4 Attributes Sliders + Number Inputs */}
                  {ATTRIBUTE_KEYS.map((attr) => {
                    const val = batter.attributes[attr.key];
                    const attrCost = calculateAttributeCost(val);
                    const isProgressive = val > PROGRESSIVE_COST_THRESHOLD;
                    return (
                      <td key={attr.key} className="py-2.5 px-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="range"
                            min={0}
                            max={100}
                            value={val}
                            onChange={(e) =>
                              handleAttrChange(idx, attr.key, Number(e.target.value))
                            }
                            className={`w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-lg cursor-pointer ${attr.color}`}
                          />
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={val}
                            onChange={(e) =>
                              handleAttrChange(idx, attr.key, Number(e.target.value))
                            }
                            className={`w-12 bg-white dark:bg-slate-950 border rounded px-1.5 py-0.5 text-right font-mono text-xs ${
                              isProgressive
                                ? 'border-amber-500/70 text-amber-600 dark:text-amber-300 font-bold'
                                : 'border-slate-300 dark:border-slate-800 text-slate-900 dark:text-slate-200'
                            }`}
                          />
                        </div>
                        {isProgressive && (
                          <div className="text-[10px] text-amber-600 dark:text-amber-400/90 font-mono mt-0.5 text-right">
                            消耗 {attrCost} 點 (2x/級)
                          </div>
                        )}
                      </td>
                    );
                  })}

                  {/* Player Total Cost */}
                  <td className="py-2.5 px-2 text-right font-mono">
                    <span
                      className={`px-2 py-0.5 rounded font-semibold ${
                        isSlotViolating
                          ? 'bg-rose-100 dark:bg-rose-500/20 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-500/40'
                          : pCost > 200
                          ? 'bg-amber-100 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300'
                          : pCost === 200
                          ? 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-300'
                          : 'bg-slate-100/70 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {pCost} 點
                    </span>
                  </td>

                  {/* Theoretical Slash Line Preview */}
                  <td className="py-2.5 px-2 text-right font-mono">
                    <div className="text-slate-800 dark:text-slate-200 font-medium">
                      {slash.avg.toFixed(3).replace(/^0/, '')} /{' '}
                      {slash.obp.toFixed(3).replace(/^0/, '')} /{' '}
                      {slash.slg.toFixed(3).replace(/^0/, '')}{' '}
                      <span className="text-blue-600 dark:text-blue-400 font-bold ml-1">
                        ({slash.ops.toFixed(3).replace(/^0/, '')})
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">
                      期望 ~{slash.expectedHRPer650PA.toFixed(0)} HR · BB{' '}
                      {(slash.bbPct * 100).toFixed(1)}% · K {(slash.kPct * 100).toFixed(1)}%
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
