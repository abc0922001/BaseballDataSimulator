import React, { useEffect, useRef, useState } from 'react';
import { Activity, BarChart2, GitCompare, Layers, Moon, Sun } from 'lucide-react';
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

const TAB_ORDER: readonly ActiveTab[] = ['standings', 'leaderboard', 'snapshots'];

function readStoredTheme(): 'light' | 'dark' | null {
  if (typeof window === 'undefined') return null;
  try {
    const saved = localStorage.getItem('bds_theme');
    return saved === 'light' || saved === 'dark' ? saved : null;
  } catch {
    return null;
  }
}

function readSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export const App: React.FC = () => {
  const [themeOverride, setThemeOverride] = useState<'light' | 'dark' | null>(() =>
    readStoredTheme()
  );
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>(() => readSystemTheme());
  const theme: 'light' | 'dark' = themeOverride ?? systemTheme;

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
  const tabRefs = useRef<Record<ActiveTab, HTMLButtonElement | null>>({
    standings: null,
    leaderboard: null,
    snapshots: null,
  });
  const panelRefs = useRef<Record<ActiveTab, HTMLDivElement | null>>({
    standings: null,
    leaderboard: null,
    snapshots: null,
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');

    const meta = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]');
    if (meta) {
      meta.content = themeOverride ?? 'light dark';
    }

    try {
      if (themeOverride) {
        localStorage.setItem('bds_theme', themeOverride);
      } else {
        localStorage.removeItem('bds_theme');
      }
    } catch {
      // Ignore storage write failures when site data is restricted
    }
  }, [theme, themeOverride]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleMediaChange = (e: MediaQueryListEvent) => {
      setSystemTheme(e.matches ? 'dark' : 'light');
    };
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'bds_theme') {
        setThemeOverride(e.newValue === 'light' || e.newValue === 'dark' ? e.newValue : null);
      }
    };

    mediaQuery.addEventListener('change', handleMediaChange);
    window.addEventListener('storage', handleStorage);
    return () => {
      mediaQuery.removeEventListener('change', handleMediaChange);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  useEffect(() => {
    const cleanups: (() => void)[] = [];
    for (const key of TAB_ORDER) {
      const el = panelRefs.current[key];
      if (!el) continue;
      const onBeforeMatch = () => {
        setActiveTab(key);
      };
      el.addEventListener('beforematch', onBeforeMatch);
      cleanups.push(() => el.removeEventListener('beforematch', onBeforeMatch));
    }
    return () => {
      for (const cleanup of cleanups) cleanup();
    };
  }, []);

  const handleToggleTheme = () => {
    const nextTheme: 'light' | 'dark' = theme === 'dark' ? 'light' : 'dark';
    const currentSys = readSystemTheme();
    setThemeOverride(nextTheme === currentSys ? null : nextTheme);
  };

  const selectTab = (nextTab: ActiveTab, moveFocus = false) => {
    setActiveTab(nextTab);
    const btn = tabRefs.current[nextTab];
    if (btn) {
      btn.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      if (moveFocus) {
        btn.focus();
      }
    }
  };

  const handleTabListKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const currentIdx = TAB_ORDER.indexOf(activeTab);
    let nextIdx = -1;
    if (e.key === 'ArrowRight') {
      nextIdx = (currentIdx + 1) % TAB_ORDER.length;
    } else if (e.key === 'ArrowLeft') {
      nextIdx = (currentIdx - 1 + TAB_ORDER.length) % TAB_ORDER.length;
    } else if (e.key === 'Home') {
      nextIdx = 0;
    } else if (e.key === 'End') {
      nextIdx = TAB_ORDER.length - 1;
    }
    if (nextIdx >= 0) {
      e.preventDefault();
      selectTab(TAB_ORDER[nextIdx], true);
    }
  };

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
      const res = runMonteCarloSimulation({
        userLineup: targetLineup,
        seasons: targetSeasons,
        seed: targetSeed,
      });
      setResult(res);
      setIsRunning(false);
    }
  };

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
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 flex flex-col transition-colors duration-200">
      {/* Top Navbar */}
      <header className="bg-white/95 dark:bg-slate-900/90 backdrop-blur border-b border-slate-200 dark:border-slate-800 sticky top-0 z-20 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-white shadow-sm"
              aria-hidden="true"
            >
              ⚾
            </div>
            <div>
              <h1 className="text-base font-extrabold tracking-tight text-slate-900 dark:text-white">
                Baseball Data Simulator
              </h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                純數學棒球數據模擬器 · 打線四維能力與棒次最佳化蒙地卡羅實驗室
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 text-xs font-mono">
            <span className="px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200">
              30 隊 × 162 場 (DH 制)
            </span>
            <span className="px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-emerald-600 dark:text-emerald-400 hidden sm:inline">
              基準收斂: .250 / .320 / .400 · 4.5 R/G
            </span>

            {/* Theme Toggle Button */}
            <button
              type="button"
              onClick={handleToggleTheme}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 transition cursor-pointer flex items-center gap-1.5 font-sans"
              title={theme === 'dark' ? '切換為淺色主題' : '切換為深色主題'}
              aria-label={theme === 'dark' ? '切換為淺色主題' : '切換為深色主題'}
            >
              {theme === 'dark' ? (
                <>
                  <Sun className="w-4 h-4 text-amber-400" aria-hidden="true" />
                  <span className="text-[11px] hidden sm:inline">淺色模式</span>
                </>
              ) : (
                <>
                  <Moon className="w-4 h-4 text-slate-700" aria-hidden="true" />
                  <span className="text-[11px] hidden sm:inline">深色模式</span>
                </>
              )}
            </button>
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
        <div
          role="tablist"
          aria-label="模擬結果檢視切換"
          onKeyDown={handleTabListKeyDown}
          className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2 overflow-x-auto whitespace-nowrap"
        >
          <button
            ref={(el) => {
              tabRefs.current.standings = el;
            }}
            type="button"
            role="tab"
            id="tab-standings"
            aria-selected={activeTab === 'standings'}
            tabIndex={activeTab === 'standings' ? 0 : -1}
            onClick={() => selectTab('standings')}
            className={`relative flex-none px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
              activeTab === 'standings'
                ? "bg-blue-600 text-white shadow-sm after:content-[''] after:absolute after:inset-x-2 after:bottom-0 after:border-b-2 after:border-current"
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-800'
            }`}
          >
            <Activity className="w-4 h-4" aria-hidden="true" />
            分區戰績與晉級率儀表板 (Standings & Playoff Odds)
          </button>

          <button
            ref={(el) => {
              tabRefs.current.leaderboard = el;
            }}
            type="button"
            role="tab"
            id="tab-leaderboard"
            aria-selected={activeTab === 'leaderboard'}
            tabIndex={activeTab === 'leaderboard' ? 0 : -1}
            onClick={() => selectTab('leaderboard')}
            className={`relative flex-none px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
              activeTab === 'leaderboard'
                ? "bg-blue-600 text-white shadow-sm after:content-[''] after:absolute after:inset-x-2 after:bottom-0 after:border-b-2 after:border-current"
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-800'
            }`}
          >
            <BarChart2 className="w-4 h-4" aria-hidden="true" />
            打者基礎與進階數據排行榜 (OPS+ / wRC+ / WPA / RE24)
          </button>

          <button
            ref={(el) => {
              tabRefs.current.snapshots = el;
            }}
            type="button"
            role="tab"
            id="tab-snapshots"
            aria-selected={activeTab === 'snapshots'}
            tabIndex={activeTab === 'snapshots' ? 0 : -1}
            onClick={() => selectTab('snapshots')}
            className={`relative flex-none px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
              activeTab === 'snapshots'
                ? "bg-emerald-600 text-white shadow-sm after:content-[''] after:absolute after:inset-x-2 after:bottom-0 after:border-b-2 after:border-current"
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-800'
            }`}
          >
            <GitCompare className="w-4 h-4" aria-hidden="true" />
            A/B 實驗快照並排對照 ({snapshots.length})
          </button>
        </div>

        {/* Section 3 & 4: Result Panels (kept in DOM with hidden="until-found" for Find-in-Page) */}
        <div>
          <div
            ref={(el) => {
              panelRefs.current.standings = el;
            }}
            role="tabpanel"
            id="panel-standings"
            aria-labelledby="tab-standings"
            {...(activeTab !== 'standings'
              ? ({ hidden: 'until-found' } as unknown as React.HTMLAttributes<HTMLDivElement>)
              : {})}
          >
            {result && <StandingsView result={result} />}
          </div>

          <div
            ref={(el) => {
              panelRefs.current.leaderboard = el;
            }}
            role="tabpanel"
            id="panel-leaderboard"
            aria-labelledby="tab-leaderboard"
            {...(activeTab !== 'leaderboard'
              ? ({ hidden: 'until-found' } as unknown as React.HTMLAttributes<HTMLDivElement>)
              : {})}
          >
            {result && <LeaderboardView result={result} />}
          </div>

          <div
            ref={(el) => {
              panelRefs.current.snapshots = el;
            }}
            role="tabpanel"
            id="panel-snapshots"
            aria-labelledby="tab-snapshots"
            {...(activeTab !== 'snapshots'
              ? ({ hidden: 'until-found' } as unknown as React.HTMLAttributes<HTMLDivElement>)
              : {})}
          >
            <SnapshotCompare
              snapshots={snapshots}
              onRestoreSnapshot={handleRestoreSnapshot}
              onDeleteSnapshot={handleDeleteSnapshot}
            />
          </div>
        </div>
      </main>

      <footer className="border-t border-slate-200 dark:border-slate-900 py-4 text-center text-xs text-slate-500 dark:text-slate-500 bg-white/50 dark:bg-transparent">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span className="flex items-center gap-1">
            <Layers className="w-3.5 h-3.5" aria-hidden="true" />
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
