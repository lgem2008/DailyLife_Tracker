import { dayKey, friendlyDay } from '../date';

export const GAP = 10;
export const CHART_HEIGHT = 140;
export const BAR_WIDTH = 28;
export const ROW_HEIGHT = 66;
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
  const volume = list.reduce((sum, w) => sum + workoutVolume(w), 0);
  const top = list.reduce((mx, w) => Math.max(mx, workoutTopWeight(w)), 0);
  return { sessions, volume, top };
}

export function deltaText(cur, prev, suffix = '') {
  if (prev == null || prev === 0) return null;
  const d = cur - prev;
  if (!d) return `持平`;
  const sign = d > 0 ? '+' : '';
  return `${sign}${formatStepValue(d, suffix === 'kg' ? 1 : 0)}${suffix}`;
}

export function exerciseProgressMeta(workouts, partKey, exercise, mode = DEFAULT_EXERCISE_MODE) {
  const mine = (workouts || [])
    .filter((w) => w.part === partKey && w.exercise === exercise)
    .sort((a, b) => (a.ts < b.ts ? -1 : 1));
  if (mine.length === 0) return null;

  const metricOf = (w) => (
    !mode.weight
      ? (w.sets || []).reduce((sum, s) => sum + (Number(s.reps) || 0), 0)
      : workoutTopWeight(w)
  );

  let best = 0;
  const records = [];
  for (const item of mine) {
    const value = metricOf(item);
    if (value > best) {
      best = value;
      records.push({ value, ts: item.ts });
    }
  }

  const latest = records[records.length - 1];
  const previous = records.length > 1 ? records[records.length - 2] : null;
  const unit = mode.weight ? 'kg' : '个';
  const fmt = (v) => (mode.weight ? formatStepValue(v, 1) : String(v));
  const main = `最高 ${fmt(latest.value)}${unit}`;
  if (!previous) {
    return { main, sub: friendlyDay(dayKey(latest.ts)) };
  }

  const delta = latest.value - previous.value;
  const days = daysBetween(previous.ts, latest.ts);
  return {
    main,
    sub: `+${fmt(delta)}${unit} · ${days}天`,
    detail: `上次 ${fmt(previous.value)}${unit} ${friendlyDay(dayKey(previous.ts))}`,
  };
}
