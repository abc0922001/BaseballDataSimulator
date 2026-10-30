import React from 'react';
import { Award, BarChart3, Shield, TrendingUp, Trophy } from 'lucide-react';
import type {
  DivisionId,
  LeagueId,
  MonteCarloResult,
  TeamMonteCarloSummary,
} from '../engine/types.ts';

interface StandingsViewProps {
  result: MonteCarloResult;
}

const LEAGUES: readonly LeagueId[] = ['AL', 'NL'];
const DIVISIONS: readonly DivisionId[] = ['East', 'Central', 'West'];

export const StandingsView: React.FC<StandingsViewProps> = ({ result }) => {
  const u = result.userTeamSummary;
  const lg = result.leagueAverages;

  const deltaWins = u.avgW - 81.0;
  const deltaWinPct = u.avgWinPct - 0.5;
  const deltaRPG = u.avgRunsPerGame - lg.runsPerGame;

  return (
    <div className="space-y-4">
      {/* Top Hero Cards for User Team */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs dark:shadow-lg transition-colors">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3 pb-2 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-500 dark:text-amber-400" />
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              主角隊蒙地卡羅期望表現摘要 — {u.teamName} ({u.league} {u.division})
            </h2>
          </div>
          <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
            模擬規模：{result.seasons} 季 ({(result.seasons * 162).toLocaleString()} 場主角隊比賽) · Seed #{result.seed}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          {/* Card 1: Avg W-L */}
          <div className="bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-lg p-3">
            <div className="text-[11px] text-slate-500 dark:text-slate-400">平均勝敗 (Avg W-L)</div>
            <div className="text-xl font-mono font-bold text-slate-900 dark:text-white mt-1">
              {u.avgW.toFixed(1)}W - {u.avgL.toFixed(1)}L
            </div>
            <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-1">
              SD ±{u.stdDevW.toFixed(1)}W · 範圍 [{u.minW}, {u.maxW}]
            </div>
          </div>

          {/* Card 2: Actual Win% & Delta */}
          <div className="bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-lg p-3">
            <div className="text-[11px] text-slate-500 dark:text-slate-400">實際勝率 (Win% vs .500)</div>
            <div className="text-xl font-mono font-bold text-slate-900 dark:text-white mt-1">
              {u.avgWinPct.toFixed(3).replace(/^0/, '')}
            </div>
            <div
              className={`text-[11px] font-mono font-semibold mt-1 ${
                deltaWins >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              ΔW {deltaWins >= 0 ? '+' : ''}
              {deltaWins.toFixed(2)} 場 ({deltaWinPct >= 0 ? '+' : ''}
              {(deltaWinPct * 100).toFixed(2)}%)
            </div>
          </div>

          {/* Card 3: Pythagorean Win% */}
          <div className="bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-lg p-3">
            <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
              畢氏期望勝率 (Pyth Win%)
            </div>
            <div className="text-xl font-mono font-bold text-blue-600 dark:text-blue-400 mt-1">
              {u.avgPythWinPct.toFixed(3).replace(/^0/, '')}
            </div>
            <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-1">
              期望勝場 {u.avgPythW.toFixed(1)}W · 得失差{' '}
              {u.avgRunDiff >= 0 ? '+' : ''}
              {u.avgRunDiff.toFixed(0)}
            </div>
          </div>

          {/* Card 4: Runs Per Game */}
          <div className="bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-lg p-3">
            <div className="text-[11px] text-slate-500 dark:text-slate-400">場均得分 (R/G vs 聯盟)</div>
            <div className="text-xl font-mono font-bold text-slate-900 dark:text-white mt-1">
              {u.avgRunsPerGame.toFixed(2)}{' '}
              <span className="text-xs font-normal text-slate-500 dark:text-slate-400">分/場</span>
            </div>
            <div
              className={`text-[11px] font-mono mt-1 ${
                deltaRPG >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              單季 {u.avgR.toFixed(0)} 分 ({deltaRPG >= 0 ? '+' : ''}
              {deltaRPG.toFixed(2)} R/G)
            </div>
          </div>

          {/* Card 5: Division Title % */}
          <div className="bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-lg p-3">
            <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <Award className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
              分區封王率 (Division %)
            </div>
            <div className="text-xl font-mono font-bold text-amber-600 dark:text-amber-400 mt-1">
              {u.divisionTitlePct.toFixed(1)}%
            </div>
            <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-1">
              基準五隊均分期望 = 20.0%
            </div>
          </div>

          {/* Card 6: Postseason Berth % */}
          <div className="bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-lg p-3">
            <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <Shield className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
              總晉級率 (分區 + 外卡)
            </div>
            <div className="text-xl font-mono font-bold text-emerald-600 dark:text-emerald-400 mt-1">
              {u.postseasonBerthPct.toFixed(1)}%
            </div>
            <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-1">
              外卡晉級率 {u.wildCardPct.toFixed(1)}% (基準總晉級 40%)
            </div>
          </div>
        </div>

        {/* League Environment Calibration Strip */}
        <div className="mt-3 pt-2.5 border-t border-slate-200 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1.5">
            <BarChart3 className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
            全聯盟環境統計 (30 隊平均)：
          </span>
          <span>
            AVG <strong className="text-slate-800 dark:text-slate-200">{lg.avg.toFixed(3).replace(/^0/, '')}</strong> ·
            OBP <strong className="text-slate-800 dark:text-slate-200">{lg.obp.toFixed(3).replace(/^0/, '')}</strong> ·
            SLG <strong className="text-slate-800 dark:text-slate-200">{lg.slg.toFixed(3).replace(/^0/, '')}</strong> ·
            OPS <strong className="text-slate-800 dark:text-slate-200">{lg.ops.toFixed(3).replace(/^0/, '')}</strong> ·
            wOBA <strong className="text-slate-800 dark:text-slate-200">{lg.woba.toFixed(3).replace(/^0/, '')}</strong> ·
            場均 <strong className="text-slate-800 dark:text-slate-200">{lg.runsPerGame.toFixed(2)} R/G</strong> ·
            單隊全壘打 <strong className="text-slate-800 dark:text-slate-200">{lg.hrPerTeamSeason.toFixed(1)} HR</strong>
          </span>
        </div>
      </div>

      {/* 6 Divisions Standings Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {LEAGUES.map((lgId) => (
          <div
            key={lgId}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs dark:shadow-lg space-y-4 transition-colors"
          >
            <h3 className="text-sm font-bold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-800 pb-2">
              {lgId === 'AL' ? '美國聯盟 (American League)' : '國家聯盟 (National League)'} — 六分區戰績與晉級率
            </h3>

            {DIVISIONS.map((divId) => {
              const divTeams: TeamMonteCarloSummary[] = result.teamSummaries
                .filter((t) => t.league === lgId && t.division === divId)
                .sort((a, b) => b.avgWinPct - a.avgWinPct || b.avgRunDiff - a.avgRunDiff);

              return (
                <div key={divId} className="space-y-1">
                  <div className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                    {lgId} {divId}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs font-mono">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-800 text-[10px] text-slate-500 dark:text-slate-400 uppercase">
                          <th className="py-1 px-1.5">球隊</th>
                          <th className="py-1 px-1.5 text-right">勝</th>
                          <th className="py-1 px-1.5 text-right">敗</th>
                          <th className="py-1 px-1.5 text-right">勝率</th>
                          <th className="py-1 px-1.5 text-right">畢氏勝率</th>
                          <th className="py-1 px-1.5 text-right">R/G</th>
                          <th className="py-1 px-1.5 text-right">得失差</th>
                          <th className="py-1 px-1.5 text-right">封王%</th>
                          <th className="py-1 px-1.5 text-right">外卡%</th>
                          <th className="py-1 px-1.5 text-right">晉級%</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                        {divTeams.map((t, idx) => (
                          <tr
                            key={t.teamId}
                            className={`${
                              t.isUserTeam
                                ? 'bg-blue-50/80 dark:bg-blue-950/50 text-blue-900 dark:text-blue-200 font-bold'
                                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/30'
                            }`}
                          >
                            <td className="py-1.5 px-1.5 font-sans flex items-center gap-1.5">
                              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono w-3">
                                {idx + 1}
                              </span>
                              <span className="font-medium">{t.teamName}</span>
                              {t.isUserTeam && (
                                <span className="px-1.5 py-0.2 bg-blue-600 text-white rounded text-[9px] font-bold">
                                  USER
                                </span>
                              )}
                            </td>
                            <td className="py-1.5 px-1.5 text-right">{t.avgW.toFixed(1)}</td>
                            <td className="py-1.5 px-1.5 text-right">{t.avgL.toFixed(1)}</td>
                            <td className="py-1.5 px-1.5 text-right">
                              {t.avgWinPct.toFixed(3).replace(/^0/, '')}
                            </td>
                            <td className="py-1.5 px-1.5 text-right text-blue-600 dark:text-blue-400 font-semibold">
                              {t.avgPythWinPct.toFixed(3).replace(/^0/, '')}
                            </td>
                            <td className="py-1.5 px-1.5 text-right">
                              {t.avgRunsPerGame.toFixed(2)}
                            </td>
                            <td
                              className={`py-1.5 px-1.5 text-right font-semibold ${
                                t.avgRunDiff >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                              }`}
                            >
                              {t.avgRunDiff >= 0 ? '+' : ''}
                              {t.avgRunDiff.toFixed(0)}
                            </td>
                            <td className="py-1.5 px-1.5 text-right text-amber-600 dark:text-amber-400">
                              {t.divisionTitlePct.toFixed(1)}%
                            </td>
                            <td className="py-1.5 px-1.5 text-right text-sky-600 dark:text-sky-400">
                              {t.wildCardPct.toFixed(1)}%
                            </td>
                            <td className="py-1.5 px-1.5 text-right text-emerald-600 dark:text-emerald-400 font-semibold">
                              {t.postseasonBerthPct.toFixed(1)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};
