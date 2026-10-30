import React, { useEffect, useRef, useState } from 'react';
import { Activity, BarChart2, GitCompare, Layers } from 'lucide-react';
import {
  calculateLineupTotalCost,
  createBaselineLineup,
  validateLineupBudget,
} from './engine/constants.ts';
import { runMonteCarloSimulation } from './engine/monteCarloRunner.ts';
import type {
  BatterConfig,
  ExperimentMode,
  ExperimentSnapshot,
  MonteCarloResult,
  SimulationWorkerRequest,
  SimulationWorkerResponse,
} from './engine/types.ts';
import { LineupEditor } from './components/LineupEditor.tsx';
import { SimulationControls } from './components/SimulationControls.tsx';
import { StandingsView } from './components/StandingsView.tsx';
import { LeaderboardView } from './components/LeaderboardView.tsx';
import { SnapshotCompare } from './components/SnapshotCompare.tsx';

type ActiveTab = 'standings' | 'leaderboard' | 'snapshots';

export const App: React.FC = () => {
  const [lineup, setLineup] = useState<BatterConfig[]>(() => createBaselineLineup());
  const [mode, setMode] = useState<ExperimentMode>('free');
  const [lockSinglePlayer200, setLockSinglePlayer200] = useState<boolean>(false);
  const [seasons, setSeasons] = useState<number>(30);
  const [seed, setSeed] = useState<number>(2026);
  const [useRandomSeed, setUseRandomSeed] = useState<boolean>(false);

  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [progress, setProgress] = useState<{ completed: number; total: number }>({
    completed: 0,
    total: 30,
  });
  const [result, setResult] = useState<MonteCarloResult | null>(null);
  const [snapshots, setSnapshots] = useState<ExperimentSnapshot[]>([]);
  const [activeTab, setActiveTab] = useState<ActiveTab>('standings');

  const workerRef = useRef<Worker | null>(null);

  const budgetValidation = validateLineupBudget(lineup, lockSinglePlayer200);
  const canRunSimulation = mode === 'free' || budgetValidation.isValid;

  const executeSimulation = (
    targetLineup: BatterConfig[],
    targetSeasons: number,
    targetSeed: number
  ) => {
    setIsRunning(true);
    setProgress({ completed: 0, total: targetSeasons });

    if (typeof Worker !== 'undefined') {
      if (workerRef.current) {
        workerRef.current.terminate();
      }
      const worker = new Worker(
        new URL('./worker/simulation.worker.ts', import.meta.url),
        { type: 'module' }
      );
      workerRef.current = worker;

      worker.onmessage = (event: MessageEvent<SimulationWorkerResponse>) => {
        const msg = event.data;
        if (msg.type === 'PROGRESS') {
          setProgress({
            completed: msg.completedSeasons,
            total: msg.totalSeasons,
          });
        } else if (msg.type === 'COMPLETE') {
          setResult(msg.result);
          setIsRunning(false);
          worker.terminate();
          workerRef.current = null;
        } else if (msg.type === 'ERROR') {
          console.error('Worker simulation error:', msg.message);
          setIsRunning(false);
          worker.terminate();
          workerRef.current = null;
        }
      };

      const req: SimulationWorkerRequest = {
        type: 'RUN_SIMULATION',
        userLineup: targetLineup,
        userTeamId: 'AL-E-1',
        seasons: targetSeasons,
        seed: targetSeed,
      };
      worker.postMessage(req);
    } else {
      // Fallback for non-Worker test environments
      const res = runMonteCarloSimulation({
        userLineup: targetLineup,
        seasons: targetSeasons,
        seed: targetSeed,
      });
      setResult(res);
      setIsRunning(false);
    }
  };

  // Run an initial 10-season baseline simulation on mount so the dashboard is immediately populated
  useEffect(() => {
    const initialBaseline = createBaselineLineup();
    const res = runMonteCarloSimulation({
      userLineup: initialBaseline,
      seasons: 10,
      seed: 2026,
    });
    setResult(res);
    setSnapshots([
      {
        id: 'snap-baseline-init',
        name: '基準全 50 對照組 (10季)',
        createdAt: new Date().toISOString(),
        mode: 'free',
        lockSinglePlayer200: false,
        seed: 2026,
        seasons: 10,
        totalBudgetUsed: 1800,
        userLineup: initialBaseline.map((b) => ({
          ...b,
          attributes: { ...b.attributes },
        })),
        result: res,
      },
    ]);

    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
      }
    };
  }, []);

  const handleRunClick = () => {
    if (!canRunSimulation || isRunning) return;
    const effectiveSeed = useRandomSeed
      ? Math.floor(Math.random() * 900000) + 100000
      : seed;
    if (useRandomSeed) {
      setSeed(effectiveSeed);
    }
    executeSimulation(lineup, seasons, effectiveSeed);
  };

  const handleSaveSnapshot = (customName: string) => {
    if (!result) return;
    const defaultName =
      customName ||
      `實驗 #${snapshots.length + 1} (${mode === 'budget' ? '1800點' : '自由'} · ${result.seasons}季)`;
    const newSnap: ExperimentSnapshot = {
      id: `snap-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: defaultName,
      createdAt: new Date().toISOString(),
      mode,
      lockSinglePlayer200,
      seed: result.seed,
      seasons: result.seasons,
      totalBudgetUsed: calculateLineupTotalCost(lineup),
      userLineup: lineup.map((b) => ({
        ...b,
        attributes: { ...b.attributes },
      })),
      result,
    };
    setSnapshots((prev) => [...prev, newSnap]);
    setActiveTab('snapshots');
  };

  const handleRestoreSnapshot = (snap: ExperimentSnapshot) => {
    setMode(snap.mode);
    setLockSinglePlayer200(snap.lockSinglePlayer200);
    setSeed(snap.seed);
    setSeasons(snap.seasons);
    setLineup(
      snap.userLineup.map((b) => ({
        ...b,
        attributes: { ...b.attributes },
      }))
    );
    setResult(snap.result);
  };

  const handleDeleteSnapshot = (id: string) => {
    setSnapshots((prev) => prev.filter((s) => s.id !== id));
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Navbar */}
      <header className="bg-slate-900/90 backdrop-blur border-b border-slate-800 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-white shadow">
              ⚾
            </div>
            <div>
              <h1 className="text-base font-extrabold tracking-tight text-white">
                Baseball Data Simulator
              </h1>
              <p className="text-[11px] text-slate-400">
                純數學棒球數據模擬器 · 打線四維能力與棒次最佳化蒙地卡羅實驗室
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
            <span className="px-2.5 py-1 rounded bg-slate-800 border border-slate-700 text-slate-200">
              30 隊 × 162 場 (DH 制)
            </span>
            <span className="px-2.5 py-1 rounded bg-slate-800 border border-slate-700 text-emerald-400 hidden sm:inline">
              基準收斂: .250 / .320 / .400 · 4.5 R/G
            </span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl w-full mx-auto px-4 py-5 space-y-5 flex-1">
        {/* Section 1: Lineup Editor & Point Pool */}
        <LineupEditor
          lineup={lineup}
          mode={mode}
          lockSinglePlayer200={lockSinglePlayer200}
          onChangeLineup={setLineup}
          onChangeMode={setMode}
          onChangeLock200={setLockSinglePlayer200}
        />

        {/* Section 2: Simulation & Snapshot Controls */}
        <SimulationControls
          seasons={seasons}
          seed={seed}
          useRandomSeed={useRandomSeed}
          isRunning={isRunning}
          progress={progress}
          lastElapsedMs={result ? result.elapsedMs : null}
          canRunSimulation={canRunSimulation}
          hasResult={result !== null}
          onChangeSeasons={setSeasons}
          onChangeSeed={setSeed}
          onToggleRandomSeed={setUseRandomSeed}
          onRunSimulation={handleRunClick}
          onSaveSnapshot={handleSaveSnapshot}
        />

        {/* Navigation Tabs for Results */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-2">
          <button
            type="button"
            onClick={() => setActiveTab('standings')}
            className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
              activeTab === 'standings'
                ? 'bg-blue-600 text-white shadow'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Activity className="w-4 h-4" />
            分區戰績與晉級率儀表板 (Standings & Playoff Odds)
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('leaderboard')}
            className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
              activeTab === 'leaderboard'
                ? 'bg-blue-600 text-white shadow'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <BarChart2 className="w-4 h-4" />
            打者基礎與進階數據排行榜 (OPS+ / wRC+ / WPA / RE24)
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('snapshots')}
            className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
              activeTab === 'snapshots'
                ? 'bg-emerald-600 text-white shadow'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <GitCompare className="w-4 h-4" />
            A/B 實驗快照並排對照 ({snapshots.length})
          </button>
        </div>

        {/* Section 3 & 4: Active Result View */}
        {result && activeTab === 'standings' && <StandingsView result={result} />}
        {result && activeTab === 'leaderboard' && <LeaderboardView result={result} />}
        {activeTab === 'snapshots' && (
          <SnapshotCompare
            snapshots={snapshots}
            onRestoreSnapshot={handleRestoreSnapshot}
            onDeleteSnapshot={handleDeleteSnapshot}
          />
        )}
      </main>

      <footer className="border-t border-slate-900 py-4 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span className="flex items-center gap-1">
            <Layers className="w-3.5 h-3.5" />
            Baseball Data Simulator — Pure Mathematical Sabermetrics & Monte Carlo Engine
          </span>
          <span className="font-mono">
            Mulberry32 Seeded PRNG · RE24 Matrix · WPA Win Expectancy
          </span>
        </div>
      </footer>
    </div>
  );
};

export default App;
