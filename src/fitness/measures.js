// 身体维度（围度）数据整理：按部位取最新值、趋势序列、变化量
import { dayKey } from '../date';
import { MEASURE_SITES } from '../storage';
import { formatStepValue } from './utils';

export const MEASURE_UNIT = 'cm';

export const SITE_MAP = (() => {
  const map = {};
  for (const s of MEASURE_SITES) map[s.key] = s;
  return map;
})();

export function siteLabel(key) {
  return SITE_MAP[key]?.label || key;
}

export function fmtMeasure(v) {
  return formatStepValue(Number(v) || 0, 1);
}

// 某部位的全部记录，按时间正序
export function siteRecords(measures, site) {
  return (measures || [])
    .filter((m) => m && m.site === site && Number.isFinite(Number(m.value)))
    .sort((a, b) => (a.ts < b.ts ? -1 : 1));
}

// 某部位的按天序列（同一天多次取最后一次），供柱状图用
export function siteSeries(measures, site) {
  const byDay = {};
  for (const m of siteRecords(measures, site)) {
    byDay[dayKey(m.ts)] = Number(m.value);
  }
  return Object.entries(byDay).map(([day, value]) => ({ day, value }));
}

// 某部位摘要：最新值 / 上一次 / 最好成绩 / 变化量
export function siteSummary(measures, site) {
  const list = siteRecords(measures, site);
  if (list.length === 0) return null;
  const last = list[list.length - 1];
  const prev = list.length > 1 ? list[list.length - 2] : null;
  const first = list[0];
  const values = list.map((m) => Number(m.value));
  const goal = SITE_MAP[site]?.goal || 'up';
  const best = goal === 'down' ? Math.min(...values) : Math.max(...values);
  return {
    site,
    goal,
    all: list,
    last,
    prev,
    first,
    best,
    delta: prev ? Number(last.value) - Number(prev.value) : null,
    total: list.length > 1 ? Number(last.value) - Number(first.value) : null,
  };
}

// 所有部位的最新值映射，人体图上的点用它显示
export function latestBySite(measures) {
  const map = {};
  for (const m of measures || []) {
    if (!m?.site) continue;
    const cur = map[m.site];
    if (!cur || m.ts > cur.ts) map[m.site] = m;
  }
  return map;
}

// 变化量文案，例如「+1.5cm」；持平返回「持平」
export function deltaLabel(delta) {
  if (delta == null) return null;
  if (Math.abs(delta) < 0.05) return '持平';
  return `${delta > 0 ? '+' : ''}${fmtMeasure(delta)}${MEASURE_UNIT}`;
}

// 变化方向配色：朝目标方向为绿，反向为橙
export function deltaTone(delta, goal = 'up', colors) {
  if (delta == null || Math.abs(delta) < 0.05) return colors.textSoft;
  const good = goal === 'down' ? delta < 0 : delta > 0;
  return good ? '#3FB27F' : '#F0A85C';
}

// 首页统计用：挑出最近有记录、且有变化的几个部位
export function measureHighlights(measures, limit = 3) {
  const rows = [];
  for (const site of MEASURE_SITES) {
    const sum = siteSummary(measures, site.key);
    if (sum) rows.push(sum);
  }
  return rows
    .sort((a, b) => (a.last.ts < b.last.ts ? 1 : -1))
    .slice(0, limit);
}
