import React, { useState } from 'react';
import { GitCompare, Trash2, Upload } from 'lucide-react';
import type { ExperimentSnapshot } from '../engine/types.ts';

interface SnapshotCompareProps {
  snapshots: ExperimentSnapshot[];
  onRestoreSnapshot: (snapshot: ExperimentSnapshot) => void;
  onDeleteSnapshot: (id: string) => void;
}

export const SnapshotCompare: React.FC<SnapshotCompareProps> = ({
  snapshots,
  onRestoreSnapshot,
  onDeleteSnapshot,
}) => {
  const [selectedAId, setSelectedAId] = useState<string>('');
  const [selectedBId, setSelectedBId] = useState<string>('');

  if (snapshots.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-center shadow-lg">
        <GitCompare className="w-8 h-8 text-slate-600 mx-auto mb-2" />
        <h3 className="text-sm font-bold text-slate-300">
          尚無已儲存的實驗快照 (No Saved Snapshots)
        </h3>
        <p className="text-xs text-slate-400 mt-1">
          在上方執行模擬後點擊「儲存為實驗快照」，即可在此並排比較「全 50 基準」、「一棒長打 100」、「四棒長打 100」等實驗的勝率差 ΔWin%、得分差 ΔR/G 與各棒次 WPA / RE24 消長。
        </p>
      </div>
    );
  }

  const snapA =
    snapshots.find((s) => s.id === selectedAId) ?? snapshots[0];
  const snapB =
    snapshots.find((s) => s.id === selectedBId) ??
    snapshots[snapshots.length > 1 ? snapshots.length - 1 : 0];

  const uA = snapA.result.userTeamSummary;
  const uB = snapB.result.userTeamSummary;

  const formatDelta = (val: number, decimals = 2, suffix = '') => {
    const sign = val > 0 ? '+' : '';
    return `${sign}${val.toFixed(decimals)}${suffix}`;
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <GitCompare className="w-5 h-5 text-emerald-400" />
          <div>
            <h2 className="text-base font-bold text-white">
              A/B 實驗快照並排對照實驗室 (Snapshot Comparison & Lineup Diff)
            </h2>
            <p className="text-[11px] text-slate-400">
              直接對比不同打線配置或棒次排列在多季模擬下的期望勝場、得分效率與各棒次 WPA / RE24 差異
            </p>
          </div>
        </div>
        <span className="text-xs font-mono text-slate-400">
          已儲存 {snapshots.length} 組實驗快照
        </span>
      </div>

      {/* All Snapshots Summary Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs font-mono">
          <thead>
            <tr className="border-b border-slate-800 text-[11px] text-slate-400">
              <th className="py-2 px-2">快照名稱</th>
              <th className="py-2 px-2">模式 / 點數</th>
              <th className="py-2 px-2 text-right">季數 (Seed)</th>
              <th className="py-2 px-2 text-right">平均勝場 (Avg W)</th>
              <th className="py-2 px-2 text-right">實際勝率 (Win%)</th>
              <th className="py-2 px-2 text-right">畢氏勝率 (Pyth%)</th>
              <th className="py-2 px-2 text-right">場均得分 (R/G)</th>
              <th className="py-2 px-2 text-right">封王率%</th>
              <th className="py-2 px-2 text-right">總晉級率%</th>
              <th className="py-2 px-2 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {snapshots.map((s) => {
              const u = s.result.userTeamSummary;
              return (
                <tr key={s.id} className="hover:bg-slate-800/40">
                  <td className="py-2 px-2 font-sans font-semibold text-white">
                    {s.name}
                  </td>
                  <td className="py-2 px-2 font-sans text-slate-300">
                    {s.mode === 'budget' ? '1800點預算' : '自由變因'} ({s.totalBudgetUsed}點)
                  </td>
                  <td className="py-2 px-2 text-right text-slate-400">
                    {s.seasons}季 (#{s.seed})
                  </td>
                  <td className="py-2 px-2 text-right font-bold text-white">
                    {u.avgW.toFixed(2)}W
                  </td>
                  <td className="py-2 px-2 text-right text-blue-400">
                    {u.avgWinPct.toFixed(4)}
                  </td>
                  <td className="py-2 px-2 text-right text-sky-400">
                    {u.avgPythWinPct.toFixed(4)}
                  </td>
                  <td className="py-2 px-2 text-right text-emerald-400">
                    {u.avgRunsPerGame.toFixed(2)}
                  </td>
                  <td className="py-2 px-2 text-right text-amber-400">
                    {u.divisionTitlePct.toFixed(1)}%
                  </td>
                  <td className="py-2 px-2 text-right text-emerald-400 font-semibold">
                    {u.postseasonBerthPct.toFixed(1)}%
                  </td>
                  <td className="py-2 px-2 text-right">
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onRestoreSnapshot(s)}
                        title="載入此快照打線設定"
                        className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-sans text-[11px] inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Upload className="w-3 h-3" />
                        套用
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteSnapshot(s.id)}
                        title="刪除此快照"
                        className="p-1 rounded bg-rose-950/60 hover:bg-rose-900 text-rose-300 cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* A vs B Selector & Head-to-Head Delta Comparison */}
      <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-400">基準組 A (Baseline)：</span>
              <select
                value={snapA.id}
                onChange={(e) => setSelectedAId(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs text-white"
              >
                {snapshots.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({uA ? `${s.result.userTeamSummary.avgW.toFixed(1)}W` : ''})
                  </option>
                ))}
              </select>
            </div>

            <span className="text-xs font-bold text-slate-500">VS.</span>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-blue-400">實驗組 B (Experiment)：</span>
              <select
                value={snapB.id}
                onChange={(e) => setSelectedBId(e.target.value)}
                className="bg-slate-900 border border-blue-600/60 rounded px-2.5 py-1 text-xs text-white"
              >
                {snapshots.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.result.userTeamSummary.avgW.toFixed(1)}W)
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Key Team Deltas (B - A) */}
          <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
            <div>
              勝場差 ΔW：
              <strong
                className={
                  uB.avgW - uA.avgW >= 0 ? 'text-emerald-400 ml-1' : 'text-rose-400 ml-1'
                }
              >
                {formatDelta(uB.avgW - uA.avgW, 2, ' 場')}
              </strong>
            </div>
            <div>
              勝率差 ΔWin%：
              <strong
                className={
                  uB.avgWinPct - uA.avgWinPct >= 0
                    ? 'text-emerald-400 ml-1'
                    : 'text-rose-400 ml-1'
                }
              >
                {formatDelta((uB.avgWinPct - uA.avgWinPct) * 100, 2, '%')}
              </strong>
            </div>
            <div>
              場均得分差 ΔR/G：
              <strong
                className={
                  uB.avgRunsPerGame - uA.avgRunsPerGame >= 0
                    ? 'text-emerald-400 ml-1'
                    : 'text-rose-400 ml-1'
                }
              >
                {formatDelta(uB.avgRunsPerGame - uA.avgRunsPerGame, 2, ' 分')}
              </strong>
            </div>
            <div>
              封王率差 ΔDiv%：
              <strong
                className={
                  uB.divisionTitlePct - uA.divisionTitlePct >= 0
                    ? 'text-amber-400 ml-1'
                    : 'text-rose-400 ml-1'
                }
              >
                {formatDelta(uB.divisionTitlePct - uA.divisionTitlePct, 1, '%')}
              </strong>
            </div>
          </div>
        </div>

        {/* 1~9 Slot-by-Slot Comparison Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs font-mono">
            <thead>
              <tr className="border-b border-slate-800 text-[10px] text-slate-400 uppercase">
                <th className="py-1.5 px-2">棒次</th>
                <th className="py-1.5 px-2">A 組打者 (C/P/S/E)</th>
                <th className="py-1.5 px-2">B 組打者 (C/P/S/E)</th>
                <th className="py-1.5 px-2 text-right">PA (A→B)</th>
                <th className="py-1.5 px-2 text-right">HR (A→B)</th>
                <th className="py-1.5 px-2 text-right">RBI (A→B)</th>
                <th className="py-1.5 px-2 text-right">OPS+ (A→B)</th>
                <th className="py-1.5 px-2 text-right">wRC+ (A→B)</th>
                <th className="py-1.5 px-2 text-right">RE24 (B - A)</th>
                <th className="py-1.5 px-2 text-right">WPA (B - A)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {snapA.result.userBatters.map((bA, idx) => {
                const bB = snapB.result.userBatters[idx];
                const dRE24 = bB.re24 - bA.re24;
                const dWPA = bB.wpa - bA.wpa;
                const attrChanged =
                  bA.attributes.contact !== bB.attributes.contact ||
                  bA.attributes.power !== bB.attributes.power ||
                  bA.attributes.speed !== bB.attributes.speed ||
                  bA.attributes.eye !== bB.attributes.eye;

                return (
                  <tr
                    key={bA.slot}
                    className={attrChanged ? 'bg-blue-950/30' : 'hover:bg-slate-900/60'}
                  >
                    <td className="py-1.5 px-2 font-bold text-blue-400">#{bA.slot}</td>
                    <td className="py-1.5 px-2 font-sans text-slate-300">
                      {bA.playerName}{' '}
                      <span className="font-mono text-[10px] text-slate-500">
                        ({bA.attributes.contact}/{bA.attributes.power}/{bA.attributes.speed}/
                        {bA.attributes.eye})
                      </span>
                    </td>
                    <td className="py-1.5 px-2 font-sans text-white">
                      {bB.playerName}{' '}
                      <span
                        className={`font-mono text-[10px] ${
                          attrChanged ? 'text-amber-300 font-bold' : 'text-slate-500'
                        }`}
                      >
                        ({bB.attributes.contact}/{bB.attributes.power}/{bB.attributes.speed}/
                        {bB.attributes.eye})
                      </span>
                    </td>
                    <td className="py-1.5 px-2 text-right text-slate-300">
                      {bA.pa.toFixed(0)} → {bB.pa.toFixed(0)}
                    </td>
                    <td className="py-1.5 px-2 text-right text-slate-200">
                      {bA.hr.toFixed(1)} → <strong className="text-white">{bB.hr.toFixed(1)}</strong>
                    </td>
                    <td className="py-1.5 px-2 text-right text-slate-200">
                      {bA.rbi.toFixed(0)} →{' '}
                      <strong className="text-white">{bB.rbi.toFixed(0)}</strong>
                    </td>
                    <td className="py-1.5 px-2 text-right">
                      {bA.opsPlus.toFixed(0)} →{' '}
                      <strong className="text-amber-300">{bB.opsPlus.toFixed(0)}</strong>
                    </td>
                    <td className="py-1.5 px-2 text-right">
                      {bA.wrcPlus.toFixed(0)} →{' '}
                      <strong className="text-amber-300">{bB.wrcPlus.toFixed(0)}</strong>
                    </td>
                    <td
                      className={`py-1.5 px-2 text-right font-semibold ${
                        dRE24 > 0.5
                          ? 'text-emerald-400'
                          : dRE24 < -0.5
                          ? 'text-rose-400'
                          : 'text-slate-400'
                      }`}
                    >
                      {bB.re24.toFixed(1)} ({formatDelta(dRE24, 1)})
                    </td>
                    <td
                      className={`py-1.5 px-2 text-right font-semibold ${
                        dWPA > 0.1
                          ? 'text-emerald-400'
                          : dWPA < -0.1
                          ? 'text-rose-400'
                          : 'text-slate-400'
                      }`}
                    >
                      {bB.wpa.toFixed(2)} ({formatDelta(dWPA, 2)})
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
