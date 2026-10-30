import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Filter, ListOrdered } from 'lucide-react';
import type { BatterStats, MonteCarloResult } from '../engine/types.ts';

interface LeaderboardViewProps {
  result: MonteCarloResult;
}

type SortKey =
  | 'slot'
  | 'pa'
  | 'avg'
  | 'obp'
  | 'slg'
  | 'ops'
  | 'iso'
  | 'babip'
  | 'hr'
  | 'rbi'
  | 'r'
  | 'bb'
  | 'k'
  | 'sb'
  | 'cs'
  | 'gidp'
  | 'opsPlus'
  | 'woba'
  | 'wrcPlus'
  | 'wpa'
  | 're24';

type ScopeMode = 'user' | 'top50' | 'all270';

const COLUMNS: readonly {
  key: SortKey;
  label: string;
  title: string;
  highlight?: boolean;
}[] = [
  { key: 'slot', label: '棒次', title: '打序棒次 (1~9)' },
  { key: 'pa', label: 'PA', title: '打席數 (Plate Appearances)' },
  { key: 'avg', label: 'AVG', title: '打擊率 (Batting Average)' },
  { key: 'obp', label: 'OBP', title: '上壘率 (On-Base Percentage)' },
  { key: 'slg', label: 'SLG', title: '長打率 (Slugging Percentage)' },
  { key: 'ops', label: 'OPS', title: '整體攻擊指數 (OBP + SLG)', highlight: true },
  { key: 'iso', label: 'ISO', title: '純長打率 (SLG - AVG)' },
  { key: 'babip', label: 'BABIP', title: '場內擊球安打率' },
  { key: 'hr', label: 'HR', title: '全壘打 (Home Runs)' },
  { key: 'rbi', label: 'RBI', title: '打點 (Runs Batted In)' },
  { key: 'r', label: 'R', title: '得分 (Runs Scored)' },
  { key: 'bb', label: 'BB', title: '四壞保送 (Walks)' },
  { key: 'k', label: 'K', title: '三振 (Strikeouts)' },
  { key: 'sb', label: 'SB', title: '盜壘成功 (Stolen Bases)' },
  { key: 'cs', label: 'CS', title: '盜壘失敗 (Caught Stealing)' },
  { key: 'gidp', label: 'GIDP', title: '雙殺打 (Grounded Into Double Play)' },
  { key: 'opsPlus', label: 'OPS+', title: '標準化 OPS (聯盟平均 = 100)', highlight: true },
  { key: 'woba', label: 'wOBA', title: '加權上壘率 (Weighted On-Base Average)' },
  { key: 'wrcPlus', label: 'wRC+', title: '加權得分創造值+ (聯盟平均 = 100)', highlight: true },
  { key: 'wpa', label: 'WPA', title: '勝率貢獻值 (Win Probability Added)', highlight: true },
  { key: 're24', label: 'RE24', title: '24 狀態期望得分貢獻值', highlight: true },
];

export const LeaderboardView: React.FC<LeaderboardViewProps> = ({ result }) => {
  const [scope, setScope] = useState<ScopeMode>('user');
  const [sortKey, setSortKey] = useState<SortKey>('slot');
  const [sortAsc, setSortAsc] = useState<boolean>(true);

  const handleSortClick = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      // Default ascending only for slot, k, cs, gidp; descending for productive stats
      setSortAsc(key === 'slot');
    }
  };

  const rows = useMemo(() => {
    const baseList: BatterStats[] =
      scope === 'user' ? [...result.userBatters] : [...result.allBatters];

    baseList.sort((a, b) => {
      const valA = a[sortKey];
      const valB = b[sortKey];
      if (valA === valB) return a.slot - b.slot;
      return sortAsc ? valA - valB : valB - valA;
    });

    if (scope === 'top50') {
      return baseList.slice(0, 50);
    }
    return baseList;
  }, [result, scope, sortKey, sortAsc]);

  const formatStat = (b: BatterStats, key: SortKey): string => {
    switch (key) {
      case 'slot':
        return `#${b.slot}`;
      case 'pa':
      case 'rbi':
      case 'r':
      case 'bb':
      case 'k':
        return b[key].toFixed(0);
      case 'hr':
      case 'sb':
      case 'cs':
      case 'gidp':
      case 're24':
        return b[key].toFixed(1);
      case 'opsPlus':
      case 'wrcPlus':
        return b[key].toFixed(0);
      case 'wpa':
        return (b.wpa >= 0 ? '+' : '') + b.wpa.toFixed(2);
      case 'avg':
      case 'obp':
      case 'slg':
      case 'ops':
      case 'iso':
      case 'babip':
      case 'woba':
        return b[key].toFixed(3).replace(/^0/, '');
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs dark:shadow-lg transition-colors">
      {/* Header & Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 mb-3 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <ListOrdered className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              打者基礎與進階數據排行榜 (Sabermetrics Leaderboard)
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              點擊任一欄位表頭即可切換升降冪排序（所有計數為單季 162 場平均產量）
            </p>
          </div>
        </div>

        {/* Scope Selector */}
        <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-950 p-1 rounded-lg border border-slate-200 dark:border-slate-800">
          <Filter className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 ml-1.5" />
          <button
            type="button"
            onClick={() => {
              setScope('user');
              setSortKey('slot');
              setSortAsc(true);
            }}
            className={`px-2.5 py-1 rounded text-xs font-semibold transition cursor-pointer ${
              scope === 'user'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            僅主角隊 1～9 棒
          </button>
          <button
            type="button"
            onClick={() => {
              setScope('top50');
              if (sortKey === 'slot') {
                setSortKey('wrcPlus');
                setSortAsc(false);
              }
            }}
            className={`px-2.5 py-1 rounded text-xs font-semibold transition cursor-pointer ${
              scope === 'top50'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            全聯盟 Top 50
          </button>
          <button
            type="button"
            onClick={() => {
              setScope('all270');
              if (sortKey === 'slot') {
                setSortKey('wrcPlus');
                setSortAsc(false);
              }
            }}
            className={`px-2.5 py-1 rounded text-xs font-semibold transition cursor-pointer ${
              scope === 'all270'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            全聯盟 270 人
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse font-mono text-xs">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 select-none">
              <th className="py-2 px-2 w-10 text-center">排名</th>
              <th className="py-2 px-2 min-w-[140px]">打者 (球隊)</th>
              <th className="py-2 px-2 text-center">能力 (C/P/S/E)</th>
              {COLUMNS.map((col) => {
                const isActive = sortKey === col.key;
                return (
                  <th
                    key={col.key}
                    title={col.title}
                    onClick={() => handleSortClick(col.key)}
                    className={`py-2 px-2 text-right cursor-pointer hover:text-slate-900 dark:hover:text-white transition ${
                      isActive
                        ? 'text-blue-600 dark:text-blue-400 font-bold bg-slate-100 dark:bg-slate-800/60'
                        : col.highlight
                        ? 'text-slate-700 dark:text-slate-200'
                        : ''
                    }`}
                  >
                    <div className="inline-flex items-center justify-end gap-0.5">
                      <span>{col.label}</span>
                      {isActive &&
                        (sortAsc ? (
                          <ArrowUp className="w-3 h-3" />
                        ) : (
                          <ArrowDown className="w-3 h-3" />
                        ))}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
            {rows.map((b, idx) => (
              <tr
                key={b.playerId}
                className={`${
                  b.isUserTeam
                    ? 'bg-blue-50/70 hover:bg-blue-100/70 dark:bg-blue-950/30 dark:hover:bg-blue-950/50 text-slate-900 dark:text-slate-100'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/30'
                }`}
              >
                <td className="py-2 px-2 text-center text-slate-400 dark:text-slate-500">{idx + 1}</td>
                <td className="py-2 px-2 font-sans">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-slate-900 dark:text-white">{b.playerName}</span>
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${
                        b.isUserTeam
                          ? 'bg-blue-100 text-blue-700 border border-blue-200 dark:bg-blue-600/30 dark:text-blue-300 dark:border-blue-500/40'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {b.teamAbbrev}
                    </span>
                  </div>
                </td>
                <td className="py-2 px-2 text-center text-[11px] text-slate-500 dark:text-slate-400">
                  {b.attributes.contact}/{b.attributes.power}/{b.attributes.speed}/
                  {b.attributes.eye}
                </td>
                {COLUMNS.map((col) => {
                  const isActive = sortKey === col.key;
                  const valStr = formatStat(b, col.key);
                  let colorClass = '';
                  if (col.key === 'opsPlus' || col.key === 'wrcPlus') {
                    colorClass =
                      b[col.key] >= 120
                        ? 'text-amber-600 dark:text-amber-400 font-bold'
                        : b[col.key] <= 85
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-slate-700 dark:text-slate-200';
                  } else if (col.key === 'wpa' || col.key === 're24') {
                    colorClass =
                      b[col.key] > 0.5
                        ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                        : b[col.key] < -0.5
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-slate-600 dark:text-slate-300';
                  } else if (col.highlight) {
                    colorClass = 'text-blue-600 dark:text-blue-300 font-semibold';
                  }

                  return (
                    <td
                      key={col.key}
                      className={`py-2 px-2 text-right ${colorClass} ${
                        isActive ? 'bg-slate-100/60 dark:bg-slate-800/35' : ''
                      }`}
                    >
                      {valStr}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
