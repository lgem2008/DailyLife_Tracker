import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { colors, getShadow } from '../theme';
import { BODY_PARTS } from '../storage';
import {
  CHART_HEIGHT,
  summarizeWorkouts,
  deltaText,
  buildExerciseSeries,
  formatStepValue,
  getExerciseMode,
  exerciseProgressMeta,
  DEFAULT_EXERCISE_MODE,
} from './utils';
import styles from './styles';

// 列表用迷你柱：高度 22，最多 8 根
function Sparkline({ values = [], width = 56, height = 22 }) {
  const nums = (values || []).map((v) => Number(v) || 0).filter((v) => v >= 0);
  if (nums.length < 2) {
    return <View style={[styles.sparkWrap, { width, height }]} />;
  }
  const max = Math.max(...nums, 0.0001);
  const min = Math.min(...nums);
  const range = Math.max(max - min, max * 0.15, 0.0001);
  const barW = Math.max(3, Math.floor((width - (nums.length - 1) * 2) / nums.length));

  return (
    <View style={[styles.sparkWrap, { width, height }]}>
      {nums.map((v, i) => {
        const frac = (v - min) / range;
        const h = Math.max(3, 4 + frac * (height - 4));
        const isLast = i === nums.length - 1;
        return (
          <View
            key={`${i}-${v}`}
            style={[
              styles.sparkBar,
              {
                width: barW,
                height: h,
                backgroundColor: isLast ? colors.primary : colors.primarySoft,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

function ProgressChart({ workouts, part, exercise, noWeight, mode, embedded = false }) {
  const usesWeight = mode ? !!mode.weight : !noWeight;
  const chartMode = mode || (usesWeight
    ? { weight: true, reps: false, sets: true }
    : { weight: false, reps: true, sets: true });
  const [groupBy, setGroupBy] = useState('session'); // session | week

  const data = useMemo(
    () => buildExerciseSeries(workouts, part, exercise, chartMode, groupBy),
    [workouts, part, exercise, chartMode, groupBy],
  );

  if (data.length < 1) return null;

  const max = Math.max(...data.map((d) => d.value));
  if (max === 0) return null;
  const recent = data.slice(-10);
  const unit = usesWeight ? 'kg' : '个';
  const fmt = (v) => (usesWeight ? formatStepValue(v, 1) : String(Math.round(v)));

  let paceText = null;
  let runBest = 0;
  const prs = [];
  for (const p of data) {
    if (p.value > runBest) {
      prs.push(p);
      runBest = p.value;
    }
  }
  if (prs.length >= 2) {
    const a = prs[prs.length - 2];
    const b = prs[prs.length - 1];
    const days = Math.max(0, Math.round((new Date(b.ts) - new Date(a.ts)) / 86400000));
    if (days > 0) paceText = `上次加码间隔约 ${days} 天`;
  }

  return (
    <View style={[styles.chartWrap, embedded && styles.chartWrapEmbedded]}>
      <View style={styles.chartHead}>
        <Text style={styles.chartLabel}>
          {usesWeight ? '最大重量趋势' : '次数趋势'}
        </Text>
        <View style={styles.chartToggle}>
          <Pressable
            style={[styles.chartToggleBtn, groupBy === 'session' && styles.chartToggleBtnOn]}
            onPress={() => setGroupBy('session')}
          >
            <Text style={[styles.chartToggleText, groupBy === 'session' && styles.chartToggleTextOn]}>按次</Text>
          </Pressable>
          <Pressable
            style={[styles.chartToggleBtn, groupBy === 'week' && styles.chartToggleBtnOn]}
            onPress={() => setGroupBy('week')}
          >
            <Text style={[styles.chartToggleText, groupBy === 'week' && styles.chartToggleTextOn]}>按周</Text>
          </Pressable>
        </View>
      </View>
      {!!paceText && <Text style={styles.chartPace}>{paceText}</Text>}
      <View style={styles.chartBox}>
        <Text style={styles.chartYMax}>{fmt(max)}{unit}</Text>
        <View style={styles.chartBars}>
          {recent.map((d, i) => {
            const h = max > 0 ? (d.value / max) * (CHART_HEIGHT - 24) : 0;
            const isLast = i === recent.length - 1;
            return (
              <View key={`${d.key}_${i}`} style={styles.chartCol}>
                <Text style={styles.chartVal}>{fmt(d.value)}</Text>
                <View style={[styles.chartBar, { height: Math.max(4, h), backgroundColor: isLast ? colors.primary : colors.primarySoft }]} />
                <Text style={styles.chartDay}>{d.label}</Text>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

// 首页统计：速览 + 动作进展（点选动作看图，不必进动作页）
function FitnessStats({ workouts, bodyWeight, settings }) {
  const partMap = useMemo(() => {
    const map = {};
    for (const p of BODY_PARTS) map[p.key] = p;
    return map;
  }, []);

  const weekData = useMemo(() => {
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
    const current = (workouts || []).filter((w) => inRange(w, currentStart, tomorrowStart));
    const previous = (workouts || []).filter((w) => inRange(w, prevStart, currentStart));
    return {
      cur: summarizeWorkouts(current),
      prev: summarizeWorkouts(previous),
    };
  }, [workouts]);

  const exerciseRows = useMemo(() => {
    const groups = {};
    for (const w of workouts || []) {
      if (!w?.part || !w?.exercise) continue;
      const key = `${w.part}:${w.exercise}`;
      if (!groups[key]) groups[key] = { part: w.part, exercise: w.exercise, lastTs: w.ts };
      if (w.ts > groups[key].lastTs) groups[key].lastTs = w.ts;
    }
    return Object.values(groups)
      .map((row) => {
        const mode = getExerciseMode(settings, row.part, row.exercise);
        const progress = exerciseProgressMeta(workouts, row.part, row.exercise, mode);
        return {
          key: `${row.part}:${row.exercise}`,
          part: row.part,
          exercise: row.exercise,
          lastTs: row.lastTs,
          mode,
          progress,
        };
      })
      .filter((row) => row.progress && row.progress.count >= 1)
      .sort((a, b) => (a.lastTs < b.lastTs ? 1 : -1));
  }, [workouts, settings]);

  const [selectedKey, setSelectedKey] = useState(null);
  const [filter, setFilter] = useState('recent'); // recent | up | all

  useEffect(() => {
    if (exerciseRows.length === 0) {
      setSelectedKey(null);
      return;
    }
    if (!selectedKey || !exerciseRows.some((r) => r.key === selectedKey)) {
      setSelectedKey(exerciseRows[0].key);
    }
  }, [exerciseRows, selectedKey]);

  const filteredRows = useMemo(() => {
    if (filter === 'up') {
      return exerciseRows.filter((r) => (r.progress?.delta || 0) > 0).slice(0, 12);
    }
    if (filter === 'all') return exerciseRows.slice(0, 20);
    return exerciseRows.slice(0, 8); // recent
  }, [exerciseRows, filter]);

  const selected = exerciseRows.find((r) => r.key === selectedKey) || filteredRows[0] || null;

  const bw = useMemo(() => {
    const list = (bodyWeight || []).slice().sort((a, b) => (a.ts < b.ts ? -1 : 1));
    return { last: list[list.length - 1], prev: list.length > 1 ? list[list.length - 2] : null };
  }, [bodyWeight]);

  if ((workouts || []).length === 0 && (bodyWeight || []).length === 0) {
    return (
      <View style={[styles.statsCard, getShadow()]}>
        <Text style={styles.statsTitle}>统计</Text>
        <Text style={styles.statsEmpty}>开始记录后，这里可直接查看各动作重量趋势</Text>
      </View>
    );
  }

  const sessionDelta = deltaText(weekData.cur.sessions, weekData.prev.sessions, ' 次');
  const bwDelta = bw.last && bw.prev
    ? `${bw.last.value > bw.prev.value ? '+' : ''}${(bw.last.value - bw.prev.value).toFixed(1)}kg`
    : null;

  return (
    <View style={[styles.statsCard, getShadow()]}>
      <View style={styles.statsHead}>
        <Text style={styles.statsTitle}>统计</Text>
        <Text style={styles.statsRange}>近 7 天</Text>
      </View>

      <View style={styles.statsGridCompact}>
        <View style={styles.statBoxCompact}>
          <Text style={styles.statValue}>{weekData.cur.sessions}</Text>
          <Text style={styles.statLabel}>训练</Text>
          {!!sessionDelta && <Text style={styles.statDelta}>{sessionDelta}</Text>}
        </View>
        <View style={styles.statBoxCompact}>
          <Text style={styles.statValue}>{weekData.cur.sets}</Text>
          <Text style={styles.statLabel}>组数</Text>
        </View>
        <View style={styles.statBoxCompact}>
          <Text style={styles.statValue}>{weekData.cur.maxWeight || '-'}</Text>
          <Text style={styles.statLabel}>最大kg</Text>
        </View>
      </View>

      {bw.last && (
        <Text style={styles.statsBwLine}>
          体重 {bw.last.value}kg{bwDelta ? ` · ${bwDelta}` : ''}
        </Text>
      )}

      <View style={styles.progressSection}>
        <Text style={styles.progressSectionTitle}>动作进展</Text>
        <Text style={styles.progressSectionHint}>点一个动作看趋势，不用点进动作页</Text>

        <View style={styles.progressFilters}>
          {[
            { key: 'recent', label: '最近' },
            { key: 'up', label: '有进步' },
            { key: 'all', label: '全部' },
          ].map((item) => (
            <Pressable
              key={item.key}
              style={[styles.progressFilterBtn, filter === item.key && styles.progressFilterBtnOn]}
              onPress={() => setFilter(item.key)}
            >
              <Text style={[styles.progressFilterText, filter === item.key && styles.progressFilterTextOn]}>
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {filteredRows.length === 0 ? (
          <Text style={styles.statsEmpty}>
            {filter === 'up' ? '暂时没有近次上涨的动作' : '还没有可展示的动作趋势'}
          </Text>
        ) : (
          <View style={styles.progressList}>
            {filteredRows.map((row) => {
              const on = selected && selected.key === row.key;
              const part = partMap[row.part];
              return (
                <Pressable
                  key={row.key}
                  style={[styles.progressRow, on && styles.progressRowOn]}
                  onPress={() => setSelectedKey(row.key)}
                >
                  <View style={styles.progressRowMain}>
                    <Text style={styles.progressName} numberOfLines={1}>
                      {part ? `${part.emoji} ` : ''}{row.exercise}
                    </Text>
                    <Text style={styles.progressMeta} numberOfLines={1}>
                      {row.progress?.main || ''}{row.progress?.sub ? ` · ${row.progress.sub}` : ''}
                    </Text>
                  </View>
                  {Array.isArray(row.progress?.spark) && row.progress.spark.length >= 2 ? (
                    <Sparkline values={row.progress.spark} width={48} height={18} />
                  ) : (
                    <View style={{ width: 48 }} />
                  )}
                </Pressable>
              );
            })}
          </View>
        )}

        {selected && (
          <View style={styles.progressChartBox}>
            <Text style={styles.progressChartTitle}>
              {(partMap[selected.part]?.label || '') + ' · ' + selected.exercise}
            </Text>
            <ProgressChart
              workouts={workouts}
              part={selected.part}
              exercise={selected.exercise}
              mode={selected.mode || DEFAULT_EXERCISE_MODE}
              embedded
            />
          </View>
        )}
      </View>
    </View>
  );
}

// 体重趋势柱状图
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

export { FitnessStats, ProgressChart, WeightChart, Sparkline };
