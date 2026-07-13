import React, { useMemo } from 'react';
import { View, Text, Pressable } from 'react-native';
import { colors, getShadow } from '../theme';
import { dayKey, friendlyDay, hhmm } from '../date';
import { ProgressChart } from './charts';
import styles from './styles';

function ExerciseHistory({ workouts, part, exercise, noWeight, mode, onDelete, onEdit, compact = false }) {
  const usesWeight = mode ? !!mode.weight : !noWeight;
  const usesReps = mode ? !!mode.reps : noWeight;
  const formatSet = (set) => {
    if (usesWeight && usesReps) return `${set.weight || 0}×${set.reps || 0}`;
    if (usesWeight) return `${set.weight || 0}kg`;
    if (usesReps) return `${set.reps || 0}个`;
    return '完成';
  };

  const sessions = useMemo(() => {
    const mine = workouts
      .filter((w) => w.part === part && w.exercise === exercise)
      .sort((a, b) => (a.ts < b.ts ? 1 : -1));
    return mine.map((w) => {
      const weights = w.sets.map((s) => Number(s.weight) || 0);
      const top = weights.length ? Math.max(...weights) : 0;
      const totalReps = w.sets.reduce((sum, s) => sum + (Number(s.reps) || 0), 0);
      const volume = w.sets.reduce(
        (sum, s) => sum + (Number(s.weight) || 0) * (Number(s.reps) || 0), 0,
      );
      return { ...w, top, volume, totalReps };
    });
  }, [workouts, part, exercise]);

  if (sessions.length === 0) {
    return <Text style={styles.histEmpty}>还没有记录，练完记一笔，之后能看到进步</Text>;
  }

  if (compact) {
    return (
      <View style={styles.histCompactList}>
        {sessions.slice(0, 12).map((s) => {
          const summary = usesWeight
            ? `最重 ${s.top}kg${usesReps ? ` · 容量 ${s.volume.toFixed(0)}` : ''}`
            : usesReps ? `共 ${s.totalReps} 个` : `${s.sets.length} 组`;
          const setsText = s.sets
            .map(formatSet)
            .join('  ');
          return (
            <View key={s.id} style={styles.histCompactRow}>
              <View style={styles.histCompactMain}>
                <Text style={styles.histCompactHead}>{friendlyDay(dayKey(s.ts))} {hhmm(s.ts)} · {summary}</Text>
                <Text style={styles.histCompactSets} numberOfLines={1}>{setsText}</Text>
              </View>
              <View style={styles.histCompactActions}>
                <Pressable onPress={() => onEdit(s)} hitSlop={6}>
                  <Text style={styles.histCompactAction}>编辑</Text>
                </Pressable>
                <Pressable onPress={() => onDelete(s)} hitSlop={6}>
                  <Text style={[styles.histCompactAction, { color: colors.danger }]}>删</Text>
                </Pressable>
              </View>
            </View>
          );
        })}
      </View>
    );
  }

  return (
    <View style={{ marginTop: 6 }}>
      <ProgressChart workouts={workouts} part={part} exercise={exercise} noWeight={noWeight} />
      {sessions.map((s, i) => {
        const prev = sessions[i + 1];
        let trend = null;
        if (prev) {
          const cur = usesWeight ? s.top : usesReps ? s.totalReps : s.sets.length;
          const pv = usesWeight ? prev.top : usesReps ? prev.totalReps : prev.sets.length;
          const unit = usesWeight ? 'kg' : usesReps ? '个' : '组';
          if (cur > pv) trend = { t: `+${(cur - pv).toFixed(0)}${unit}`, c: '#3FB27F' };
          else if (cur < pv) trend = { t: `-${(pv - cur).toFixed(0)}${unit}`, c: colors.danger };
          else trend = { t: '持平', c: colors.textSoft };
        }
        return (
          <View key={s.id} style={[styles.histCard, getShadow()]}>
            <View style={styles.histHead}>
              <Text style={styles.histDay}>{friendlyDay(dayKey(s.ts))} · {hhmm(s.ts)}</Text>
              <View style={styles.histTopWrap}>
                <Text style={styles.histTop}>{usesWeight ? `最重 ${s.top}kg` : usesReps ? `共 ${s.totalReps} 个` : `${s.sets.length} 组`}</Text>
                {trend && <Text style={[styles.histTrend, { color: trend.c }]}>{trend.t}</Text>}
              </View>
            </View>
            <View style={styles.histSets}>
              {s.sets.map((st, j) => (
                <View key={j} style={styles.histSet}>
                  <Text style={styles.histSetText}>
                    {formatSet(st)}
                  </Text>
                </View>
              ))}
            </View>
            {usesWeight && usesReps && <Text style={styles.histVol}>总容量 {s.volume.toFixed(0)}</Text>}
            <View style={styles.histActions}>
              <Pressable style={styles.histActBtn} onPress={() => onEdit(s)} hitSlop={6}>
                <Text style={styles.histActText}>编辑</Text>
              </Pressable>
              <Pressable style={styles.histActBtn} onPress={() => onDelete(s)} hitSlop={6}>
                <Text style={[styles.histActText, { color: colors.danger }]}>删除</Text>
              </Pressable>
            </View>
          </View>
        );
      })}
    </View>
  );
}

// 平滑跟手的可拖动行：抓手按下后行本身跟随手指 translateY，
// 越过一半行距时通知父组件交换位置（真实数组）并回弹归零。

export { ExerciseHistory };
