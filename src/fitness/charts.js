import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import { colors, getShadow } from '../theme';
import { dayKey } from '../date';
import { BODY_PARTS } from '../storage';
import {
  CHART_HEIGHT,
  workoutVolume,
  workoutTopWeight,
  summarizeWorkouts,
  deltaText,
} from './utils';
import styles from './styles';

function FitnessStats({ workouts, bodyWeight }) {
  const data = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const dayMs = 86400000;
    const currentStart = todayStart - 6 * dayMs;
    const prevStart = todayStart - 13 * dayMs;
    const tomorrowStart = todayStart + dayMs;

    const inRange = (w, start, end) => {
      const t = new Date(w.ts).getTime();
      return t >= start && t < end;
    };

    const current = workouts.filter((w) => inRange(w, currentStart, tomorrowStart));
    const previous = workouts.filter((w) => inRange(w, prevStart, currentStart));
    const cur = summarizeWorkouts(current);
    const prev = summarizeWorkouts(previous);

    const partMap = {};
    for (const p of BODY_PARTS) partMap[p.key] = p;
    const partVolumes = current.reduce((acc, item) => {
      const key = item.part;
      if (!acc[key]) acc[key] = { key, volume: 0, sets: 0 };
      acc[key].volume += workoutVolume(item);
      acc[key].sets += item.sets.length;
      return acc;
    }, {});
    const partRows = Object.values(partVolumes)
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 4);
    const maxPartVolume = Math.max(1, ...partRows.map((row) => row.volume));

    const groups = {};
    for (const item of workouts) {
      const key = `${item.part}:${item.exercise}`;
      (groups[key] = groups[key] || []).push(item);
    }
    const records = Object.values(groups).map((items) => {
      const sorted = items.slice().sort((a, b) => (a.ts < b.ts ? -1 : 1));
      const latest = sorted[sorted.length - 1];
      const latestTop = workoutTopWeight(latest);
      const prevBest = sorted
        .slice(0, -1)
        .reduce((mx, item) => Math.max(mx, workoutTopWeight(item)), 0);
      return {
        ...latest,
        latestTop,
        prevBest,
        improved: latestTop > prevBest && latestTop > 0,
      };
    })
      .filter((item) => item.improved)
      .sort((a, b) => (a.ts < b.ts ? 1 : -1))
      .slice(0, 3);

    const bw = bodyWeight.slice().sort((a, b) => (a.ts < b.ts ? -1 : 1));
    const lastBw = bw[bw.length - 1];
    const prevBw = bw.length > 1 ? bw[bw.length - 2] : null;

    return { cur, prev, partRows, maxPartVolume, records, partMap, lastBw, prevBw };
  }, [workouts, bodyWeight]);

  if (workouts.length === 0 && bodyWeight.length === 0) {
    return (
      <View style={[styles.statsCard, getShadow()]}>
        <Text style={styles.statsTitle}>统计</Text>
        <Text style={styles.statsEmpty}>开始记录后，这里会显示训练趋势和突破</Text>
      </View>
    );
  }

  const volumeDelta = deltaText(data.cur.volume, data.prev.volume);
  const bwDelta = data.lastBw && data.prevBw
    ? `${data.lastBw.value > data.prevBw.value ? '+' : ''}${(data.lastBw.value - data.prevBw.value).toFixed(1)}kg`
    : '暂无对比';

  return (
    <View style={[styles.statsCard, getShadow()]}>
      <View style={styles.statsHead}>
        <Text style={styles.statsTitle}>统计</Text>
        <Text style={styles.statsRange}>最近 7 天</Text>
      </View>

      <View style={styles.statsGrid}>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{data.cur.sessions}</Text>
          <Text style={styles.statLabel}>训练</Text>
          <Text style={styles.statDelta}>{deltaText(data.cur.sessions, data.prev.sessions, ' 次')}</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{data.cur.sets}</Text>
          <Text style={styles.statLabel}>组数</Text>
          <Text style={styles.statDelta}>{deltaText(data.cur.sets, data.prev.sets, ' 组')}</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{data.cur.maxWeight || '-'}</Text>
          <Text style={styles.statLabel}>最大kg</Text>
          <Text style={styles.statDelta}>容量 {volumeDelta}</Text>
        </View>
      </View>

      {data.partRows.length > 0 && (
        <View style={styles.partStats}>
          {data.partRows.map((row) => {
            const p = data.partMap[row.key];
            const width = `${Math.max(8, (row.volume / data.maxPartVolume) * 100)}%`;
            return (
              <View key={row.key} style={styles.partStatRow}>
                <Text style={styles.partStatLabel}>{p ? p.label : row.key}</Text>
                <View style={styles.partStatTrack}>
                  <View style={[styles.partStatFill, { width, backgroundColor: p ? p.color : colors.primarySoft }]} />
                </View>
                <Text style={styles.partStatValue}>{row.sets}组</Text>
              </View>
            );
          })}
        </View>
      )}

      <View style={styles.statsFoot}>
        {data.records.length > 0 ? (
          data.records.map((item) => (
            <Text key={item.id} style={styles.recordText} numberOfLines={1}>
              {item.exercise} 新高 {item.latestTop}kg
            </Text>
          ))
        ) : (
          <Text style={styles.recordText}>本周还没有新的重量突破</Text>
        )}
        {data.lastBw && (
          <Text style={styles.recordText}>体重 {data.lastBw.value}kg · {bwDelta}</Text>
        )}
      </View>
    </View>
  );
}

function ProgressChart({ workouts, part, exercise, noWeight }) {
  const data = useMemo(() => {
    const mine = workouts
      .filter((w) => w.part === part && w.exercise === exercise)
      .sort((a, b) => (a.ts < b.ts ? -1 : 1));
    const byDay = {};
    for (const w of mine) {
      const k = dayKey(w.ts);
      let v;
      if (noWeight) {
        v = w.sets.reduce((sum, s) => sum + (Number(s.reps) || 0), 0);
      } else {
        v = w.sets.reduce((mx, s) => Math.max(mx, Number(s.weight) || 0), 0);
      }
      byDay[k] = Math.max(byDay[k] || 0, v);
    }
    return Object.entries(byDay).map(([day, weight]) => ({ day, weight }));
  }, [workouts, part, exercise, noWeight]);

  if (data.length < 1) return null;

  const max = Math.max(...data.map((d) => d.weight));
  if (max === 0) return null;
  const recent = data.slice(-10);
  const unit = noWeight ? '个' : 'kg';

  return (
    <View style={styles.chartWrap}>
      <Text style={styles.chartLabel}>{noWeight ? '每日总次数' : '最大重量趋势'}</Text>
      <View style={styles.chartBox}>
        <Text style={styles.chartYMax}>{max}{unit}</Text>
        <View style={styles.chartBars}>
          {recent.map((d, i) => {
            const h = max > 0 ? (d.weight / max) * (CHART_HEIGHT - 24) : 0;
            const isLast = i === recent.length - 1;
            return (
              <View key={d.day} style={styles.chartCol}>
                <Text style={styles.chartVal}>{d.weight}</Text>
                <View style={[styles.chartBar, { height: h, backgroundColor: isLast ? colors.primary : colors.primarySoft }]} />
                <Text style={styles.chartDay}>{d.day.slice(5)}</Text>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

// 体重趋势柱状图：基线取最小值放大波动，每根柱标注数值（自重图共用样式）
function WeightChart({ data }) {
  if (!data || data.length < 1) return null;
  const recent = data.slice(-12);
  const values = recent.map((d) => d.value);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min;
  return (
    <View style={styles.chartWrap}>
      <Text style={styles.chartLabel}>体重趋势</Text>
      <View style={styles.chartBox}>
        <Text style={styles.chartYMax}>{max}kg</Text>
        <View style={styles.chartBars}>
          {recent.map((d, i) => {
            const frac = range > 0 ? (d.value - min) / range : 0.5;
            const h = 14 + frac * (CHART_HEIGHT - 40);
            const isLast = i === recent.length - 1;
            return (
              <View key={d.day + '_' + i} style={styles.chartCol}>
                <Text style={styles.chartVal}>{d.value}</Text>
                <View style={[styles.chartBar, { height: h, backgroundColor: isLast ? colors.primary : colors.primarySoft }]} />
                <Text style={styles.chartDay}>{d.day.slice(5)}</Text>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

export { FitnessStats, ProgressChart, WeightChart };
