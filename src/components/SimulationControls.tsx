import React, { useState } from 'react';
import {
  BookmarkPlus,
  Dices,
  Hash,
  Loader2,
  Play,
  Timer,
} from 'lucide-react';

interface SimulationControlsProps {
  seasons: number;
  seed: number;
  useRandomSeed: boolean;
  isRunning: boolean;
  progress: { completed: number; total: number };
  lastElapsedMs: number | null;
  canRunSimulation: boolean;
  hasResult: boolean;
  onChangeSeasons: (seasons: number) => void;
  onChangeSeed: (seed: number) => void;
  onToggleRandomSeed: (useRandom: boolean) => void;
  onRunSimulation: () => void;
  onSaveSnapshot: (snapshotName: string) => void;
}

const SEASON_OPTIONS = [1, 10, 30, 50, 100] as const;

export const SimulationControls: React.FC<SimulationControlsProps> = ({
  seasons,
  seed,
  useRandomSeed,
  isRunning,
  progress,
  lastElapsedMs,
  canRunSimulation,
  hasResult,
  onChangeSeasons,
  onChangeSeed,
  onToggleRandomSeed,
  onRunSimulation,
  onSaveSnapshot,
}) => {
  const [snapshotName, setSnapshotName] = useState('');

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasResult) return;
    onSaveSnapshot(snapshotName.trim());
    setSnapshotName('');
  };

  const pct =
    progress.total > 0
      ? Math.round((progress.completed / progress.total) * 100)
      : 0;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs dark:shadow-lg transition-colors">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        {/* Left: Season count & Seed config */}
        <div className="flex flex-wrap items-center gap-4">
          {/* Seasons selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">模擬規模：</span>
            <div className="flex rounded-lg bg-slate-100 dark:bg-slate-950 p-1 border border-slate-200 dark:border-slate-800">
              {SEASON_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  disabled={isRunning}
                  onClick={() => onChangeSeasons(opt)}
                  className={`px-2.5 py-1 rounded-md text-xs font-mono font-semibold transition cursor-pointer ${
                    seasons === opt
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {opt} 季
                </button>
              ))}
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:inline">
              ({(seasons * 2430).toLocaleString()} 場)
            </span>
          </div>

          {/* Seed configuration */}
          <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800">
            <button
              type="button"
              disabled={isRunning}
              onClick={() => onToggleRandomSeed(!useRandomSeed)}
              className={`text-xs flex items-center gap-1 font-medium cursor-pointer ${
                useRandomSeed ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'
              }`}
              title="切換固定種子（可重現對照）或每次隨機種子"
            >
              {useRandomSeed ? (
                <>
                  <Dices className="w-3.5 h-3.5" />
                  隨機 Seed
                </>
              ) : (
                <>
                  <Hash className="w-3.5 h-3.5" />
                  固定 Seed
                </>
              )}
            </button>
            <input
              type="number"
              disabled={isRunning || useRandomSeed}
              value={seed}
              onChange={(e) => onChangeSeed(Number(e.target.value) || 0)}
              className="w-20 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded px-2 py-0.5 text-xs font-mono text-slate-900 dark:text-slate-200 disabled:opacity-50"
            />
          </div>

          {/* Execute Button */}
          <button
            type="button"
            disabled={isRunning || !canRunSimulation}
            onClick={onRunSimulation}
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-40 text-white font-bold text-xs flex items-center gap-2 shadow-sm dark:shadow-md dark:shadow-blue-950/60 cursor-pointer"
          >
            {isRunning ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Web Worker 運算中 ({progress.completed}/{progress.total} 季)...
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                啟動 {seasons} 季蒙地卡羅模擬
              </>
            )}
          </button>

          {lastElapsedMs !== null && !isRunning && (
            <span className="text-xs text-slate-500 dark:text-slate-400 font-mono flex items-center gap-1">
              <Timer className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
              耗時 {(lastElapsedMs / 1000).toFixed(2)}s
            </span>
          )}
        </div>

        {/* Right: Save Snapshot Form */}
        <form onSubmit={handleSave} className="flex items-center gap-2">
          <input
            type="text"
            placeholder="輸入實驗快照名稱 (例如: 一棒長打 100)"
            value={snapshotName}
            onChange={(e) => setSnapshotName(e.target.value)}
            disabled={!hasResult || isRunning}
            className="bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-900 dark:text-slate-200 w-60 focus:outline-none focus:border-blue-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!hasResult || isRunning}
            className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer shadow-xs"
          >
            <BookmarkPlus className="w-4 h-4" />
            儲存為實驗快照 (Snapshot)
          </button>
        </form>
      </div>

      {/* Live Progress Bar when running */}
      {isRunning && (
        <div className="mt-3">
          <div className="flex justify-between text-[11px] font-mono text-slate-500 dark:text-slate-400 mb-1">
            <span>
              正在平行模擬第 {progress.completed} / {progress.total} 季 (
              {(progress.completed * 2430).toLocaleString()} 場已完成)
            </span>
            <span>{pct}%</span>
          </div>
          <div className="w-full h-2 bg-slate-100 dark:bg-slate-950 rounded-full overflow-hidden border border-slate-200 dark:border-slate-800">
            <div
              className="h-full bg-blue-500 transition-all duration-150"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
};
