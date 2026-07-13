import { dayKey, friendlyDay } from '../date';

export const GAP = 10;
export const CHART_HEIGHT = 140;
export const BAR_WIDTH = 28;
export const ROW_HEIGHT = 74;
export const ROW_GAP = 8;
export const ROW_STRIDE = ROW_HEIGHT + ROW_GAP;
export const PART_ROW_HEIGHT = 68;
export const PART_ROW_STRIDE = PART_ROW_HEIGHT + GAP;
export const DEFAULT_REPS = '4';
export const DEFAULT_SET_COUNT = 3;
export const DEFAULT_EXERCISE_MODE = {
  weight: true,
  reps: false,
  sets: true,
  setCount: DEFAULT_SET_COUNT,
};

// 无重量动作关键词（自重类）
const BODYWEIGHT_KEYWORDS = ['引体', '俯卧撑', '平板支撑', '仰卧起坐', '卷腹', '悬垂', '双杠', '臂屈伸', '倒立'];

export function isBodyweight(name) {
  return BODYWEIGHT_KEYWORDS.some((k) => String(name || '').includes(k));
}

export function inferredExerciseMode(name) {
  return isBodyweight(name)
    ? { weight: false, reps: true, sets: true, setCount: DEFAULT_SET_COUNT }
    : { ...DEFAULT_EXERCISE_MODE };
}

export function clampSetCount(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return DEFAULT_SET_COUNT;
  return Math.min(20, Math.max(1, v));
}

export function normalizeExerciseMode(mode, name = '') {
  const merged = { ...inferredExerciseMode(name), ...(mode || {}) };
  merged.setCount = merged.sets ? clampSetCount(merged.setCount) : 1;
  return merged;
}

export function exerciseModeKey(partKey, exercise) {
  return `${partKey}:${exercise}`;
}

export function getExerciseMode(settings, partKey, exercise) {
  const saved = settings?.fitnessExerciseModes?.[exerciseModeKey(partKey, exercise)];
  return normalizeExerciseMode(saved, exercise);
}

export function modeSummary(mode) {
  const bits = [];
  if (mode.weight) bits.push('重量');
  if (mode.reps) bits.push('次数');
  bits.push(mode.sets ? `${clampSetCount(mode.setCount)} 组` : '单组');
  return bits.join(' · ');
}

export function makeDefaultSet(mode = DEFAULT_EXERCISE_MODE) {
  return { weight: mode.weight ? '' : '', reps: mode.reps ? DEFAULT_REPS : '' };
}

export function makeDatedIso(dateKey) {
  const now = new Date();
  const [y, m, d] = String(dateKey).split('-').map(Number);
  return new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds()).toISOString();
}

export function clampNumber(value, min = 0) {
  const n = Number(value);
  if (Number.isNaN(n)) return min;
  return Math.max(min, n);
}

export function formatStepValue(value, decimals = 1) {
  const fixed = Number(value).toFixed(decimals);
  return fixed.replace(/\.0$/, '');
}

export function makeWeightedDefaultSet(weight, mode = DEFAULT_EXERCISE_MODE) {
  return {
    weight: mode.weight && weight ? formatStepValue(weight, 1) : '',
    reps: mode.reps ? DEFAULT_REPS : '',
  };
}

export function maxExerciseWeight(workouts, partKey, exercise) {
  return (workouts || [])
    .filter((w) => w.part === partKey && w.exercise === exercise)
    .reduce((best, w) => {
      const top = (w.sets || []).reduce((mx, s) => Math.max(mx, Number(s.weight) || 0), 0);
      return Math.max(best, top);
    }, 0);
}

export function daysBetween(a, b) {
  const start = new Date(`${dayKey(a)}T00:00:00`).getTime();
  const end = new Date(`${dayKey(b)}T00:00:00`).getTime();
  return Math.max(0, Math.round((end - start) / 86400000));
}

export function workoutVolume(workout) {
  return (workout.sets || []).reduce(
    (sum, s) => sum + (Number(s.weight) || 0) * (Number(s.reps) || 0),
    0,
  );
}

export function workoutTopWeight(workout) {
  return (workout.sets || []).reduce((mx, s) => Math.max(mx, Number(s.weight) || 0), 0);
}

export function summarizeWorkouts(items) {
  const list = items || [];
  const sessions = list.length;
  const sets = list.reduce((sum, w) => sum + ((w.sets && w.sets.length) || 0), 0);
  const volume = list.reduce((sum, w) => sum + workoutVolume(w), 0);
  const top = list.reduce((mx, w) => Math.max(mx, workoutTopWeight(w)), 0);
  return { sessions, sets, volume, top, maxWeight: top };
}

export function deltaText(cur, prev, suffix = '') {
  if (prev == null || prev === 0) return null;
  const d = cur - prev;
  if (!d) return `持平`;
  const sign = d > 0 ? '+' : '';
  return `${sign}${formatStepValue(d, suffix === 'kg' ? 1 : 0)}${suffix}`;
}

// ISO 周键：YYYY-Www，用于「按周」聚合
export function weekKeyOf(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  // 周四决定本周归属年份（ISO）
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export function workoutMetric(w, mode = DEFAULT_EXERCISE_MODE) {
  const sets = Array.isArray(w?.sets) ? w.sets : [];
  if (!mode.weight) {
    return sets.reduce((sum, s) => sum + (Number(s?.reps) || 0), 0);
  }
  return sets.reduce((mx, s) => Math.max(mx, Number(s?.weight) || 0), 0);
}

// 单动作时间序列：session=每次训练；week=自然周最大
export function buildExerciseSeries(workouts, partKey, exercise, mode = DEFAULT_EXERCISE_MODE, groupBy = 'session') {
  const mine = (workouts || [])
    .filter((w) => w.part === partKey && w.exercise === exercise)
    .sort((a, b) => (a.ts < b.ts ? -1 : 1));

  if (groupBy === 'week') {
    const byWeek = {};
    for (const w of mine) {
      const key = weekKeyOf(w.ts);
      if (!key) continue;
      const value = workoutMetric(w, mode);
      const prev = byWeek[key];
      if (!prev || value > prev.value) {
        byWeek[key] = { key, value, ts: w.ts, label: key.slice(5) };
      }
    }
    return Object.values(byWeek).sort((a, b) => (a.ts < b.ts ? -1 : 1));
  }

  // 同一天多次：取当天最大
  const byDay = {};
  for (const w of mine) {
    const key = dayKey(w.ts);
    const value = workoutMetric(w, mode);
    const prev = byDay[key];
    if (!prev || value > prev.value) {
      byDay[key] = { key, value, ts: w.ts, label: key.slice(5) };
    }
  }
  return Object.values(byDay).sort((a, b) => (a.ts < b.ts ? -1 : 1));
}

export function exerciseProgressMeta(workouts, partKey, exercise, mode = DEFAULT_EXERCISE_MODE) {
  const series = buildExerciseSeries(workouts, partKey, exercise, mode, 'session');
  if (series.length === 0) return null;

  const unit = mode.weight ? 'kg' : '个';
  const fmt = (v) => (mode.weight ? formatStepValue(v, 1) : String(Math.round(v)));
  const latest = series[series.length - 1];
  const prev = series.length > 1 ? series[series.length - 2] : null;
  const best = series.reduce((mx, p) => Math.max(mx, p.value), 0);
  const spark = series.slice(-8).map((p) => p.value);

  // 最近一次真正加码（创新高）的间隔
  let lastPr = null;
  let prevPr = null;
  let runBest = 0;
  for (const p of series) {
    if (p.value > runBest) {
      prevPr = lastPr;
      lastPr = p;
      runBest = p.value;
    }
  }
  let pace = null;
  if (lastPr && prevPr) {
    const days = daysBetween(prevPr.ts, lastPr.ts);
    if (days > 0) pace = `约 ${days} 天加码`;
  }

  const main = `${fmt(latest.value)}${unit}`;
  let sub = friendlyDay(dayKey(latest.ts));
  let delta = null;
  if (prev) {
    delta = latest.value - prev.value;
    if (delta > 0) sub = `近次 +${fmt(delta)}${unit}`;
    else if (delta < 0) sub = `近次 ${fmt(delta)}${unit}`;
    else sub = '近次持平';
  }
  if (pace) sub = `${sub} · ${pace}`;

  return {
    main,
    sub,
    detail: best > 0 ? `历史最高 ${fmt(best)}${unit}` : null,
    spark,
    latest: latest.value,
    best,
    unit,
    delta,
    pace,
    count: series.length,
  };
}
