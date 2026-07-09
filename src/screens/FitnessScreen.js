import React, { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput, Animated, Easing,
  KeyboardAvoidingView, Platform, useWindowDimensions, PanResponder,
} from 'react-native';
import { select, success } from '../haptics';
import { confirmAction } from '../confirm';
import { colors, getShadow, createThemedStyles, getTileColor, getTileBadgeColor } from '../theme';
import { useKeyboardHeight } from '../useKeyboard';
import { BODY_PARTS } from '../storage';
import { dayKey, todayKey, friendlyDay, hhmm, monthGrid, monthLabel, WEEK_SHORT } from '../date';

const GAP = 10;
const CHART_HEIGHT = 140;
const BAR_WIDTH = 28;
const ROW_HEIGHT = 66;
const ROW_GAP = 8;
const ROW_STRIDE = ROW_HEIGHT + ROW_GAP;
const PART_ROW_HEIGHT = 68;
const PART_ROW_STRIDE = PART_ROW_HEIGHT + GAP;
const DEFAULT_REPS = '4';
const DEFAULT_SET_COUNT = 3;
const DEFAULT_EXERCISE_MODE = { weight: true, reps: false, sets: true, setCount: DEFAULT_SET_COUNT };

// 无重量动作关键词（自重类）
const BODYWEIGHT_KEYWORDS = ['引体', '俯卧撑', '平板支撑', '仰卧起坐', '卷腹', '悬垂', '双杠', '臂屈伸', '倒立'];
function isBodyweight(name) {
  return BODYWEIGHT_KEYWORDS.some((k) => name.includes(k));
}

function inferredExerciseMode(name) {
  return isBodyweight(name)
    ? { weight: false, reps: true, sets: true, setCount: DEFAULT_SET_COUNT }
    : DEFAULT_EXERCISE_MODE;
}

function clampSetCount(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return DEFAULT_SET_COUNT;
  return Math.min(20, Math.max(1, v));
}

function normalizeExerciseMode(mode, name = '') {
  const merged = { ...inferredExerciseMode(name), ...(mode || {}) };
  merged.setCount = merged.sets ? clampSetCount(merged.setCount) : 1;
  return merged;
}

function exerciseModeKey(partKey, exercise) {
  return `${partKey}:${exercise}`;
}

function getExerciseMode(settings, partKey, exercise) {
  const saved = settings?.fitnessExerciseModes?.[exerciseModeKey(partKey, exercise)];
  return normalizeExerciseMode(saved, exercise);
}

function modeSummary(mode) {
  const bits = [];
  if (mode.weight) bits.push('重量');
  if (mode.reps) bits.push('次数');
  bits.push(mode.sets ? `${clampSetCount(mode.setCount)} 组` : '单组');
  return bits.join(' · ');
}

function makeDefaultSet(mode = DEFAULT_EXERCISE_MODE) {
  return { weight: mode.weight ? '' : '', reps: mode.reps ? DEFAULT_REPS : '' };
}

function makeDatedIso(dateKey) {
  const now = new Date();
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds()).toISOString();
}

function maxExerciseWeight(workouts, partKey, exercise) {
  return workouts
    .filter((w) => w.part === partKey && w.exercise === exercise)
    .reduce((best, w) => {
      const top = w.sets.reduce((mx, s) => Math.max(mx, Number(s.weight) || 0), 0);
      return Math.max(best, top);
    }, 0);
}

function daysBetween(a, b) {
  const start = new Date(dayKey(a) + 'T00:00:00').getTime();
  const end = new Date(dayKey(b) + 'T00:00:00').getTime();
  return Math.max(0, Math.round((end - start) / 86400000));
}

function exerciseProgressMeta(workouts, partKey, exercise, mode = DEFAULT_EXERCISE_MODE) {
  const mine = workouts
    .filter((w) => w.part === partKey && w.exercise === exercise)
    .sort((a, b) => (a.ts < b.ts ? -1 : 1));
  if (mine.length === 0) return null;

  const metricOf = (w) => (
    !mode.weight
      ? w.sets.reduce((sum, s) => sum + (Number(s.reps) || 0), 0)
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

function makeWeightedDefaultSet(weight, mode = DEFAULT_EXERCISE_MODE) {
  return { weight: mode.weight && weight ? formatStepValue(weight, 1) : '', reps: mode.reps ? DEFAULT_REPS : '' };
}

function StageView({ children }) {
  return (
    <View style={{ flex: 1 }}>
      {children}
    </View>
  );
}

function SetRow({ index, set, onChange, onRemove, mode = DEFAULT_EXERCISE_MODE }) {
  const simpleOnly = !mode.weight && !mode.reps;
  return (
    <View style={styles.setRow}>
      {mode.sets && <Text style={styles.setNo}>{index + 1}</Text>}
      {mode.weight && (
        <>
          <TextInput
            style={styles.setInput}
            value={set.weight}
            onChangeText={(v) => onChange({ ...set, weight: v.replace(/[^0-9.]/g, '') })}
            placeholder="重量"
            placeholderTextColor={colors.textSoft}
            keyboardType="decimal-pad"
          />
          <Text style={styles.setUnit}>kg ×</Text>
        </>
      )}
      {mode.reps && (
        <>
          <TextInput
            style={styles.setInput}
            value={set.reps}
            onChangeText={(v) => onChange({ ...set, reps: v.replace(/[^0-9]/g, '') })}
            placeholder={mode.weight ? '次数' : '个数'}
            placeholderTextColor={colors.textSoft}
            keyboardType="number-pad"
          />
          {!mode.weight && <Text style={styles.setUnit}>个</Text>}
        </>
      )}
      {simpleOnly && <Text style={styles.setSimpleText}>{mode.sets ? '完成一组' : '完成'}</Text>}
      {mode.sets && (
        <Pressable style={styles.setDel} onPress={onRemove} hitSlop={8}>
          <Text style={styles.setDelText}>✕</Text>
        </Pressable>
      )}
    </View>
  );
}

function clampNumber(value, min = 0) {
  const n = Number(value);
  if (Number.isNaN(n)) return min;
  return Math.max(min, n);
}

function formatStepValue(value, decimals = 1) {
  const fixed = Number(value).toFixed(decimals);
  return fixed.replace(/\.0$/, '');
}

function StepperField({ value, onChange, step, min = 0, placeholder, keyboardType, decimals = 0 }) {
  const bump = (dir) => {
    select();
    const next = clampNumber(value, min) + dir * step;
    onChange(formatStepValue(Math.max(min, next), decimals));
  };

  return (
    <View style={styles.stepper}>
      <Pressable style={styles.stepperBtn} onPress={() => bump(-1)} hitSlop={6}>
        <Text style={styles.stepperBtnText}>-</Text>
      </Pressable>
      <TextInput
        style={styles.stepperInput}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textSoft}
        keyboardType={keyboardType}
      />
      <Pressable style={styles.stepperBtn} onPress={() => bump(1)} hitSlop={6}>
        <Text style={styles.stepperBtnText}>+</Text>
      </Pressable>
    </View>
  );
}

function QuickSetRow({ index, set, onChange, onRemove, mode = DEFAULT_EXERCISE_MODE }) {
  const simpleOnly = !mode.weight && !mode.reps;
  return (
    <View style={styles.quickSetRow}>
      {mode.sets && <Text style={styles.quickSetNo}>{index + 1}</Text>}
      {mode.weight && (
        <View style={styles.quickField}>
          <Text style={styles.quickLabel}>kg</Text>
          <StepperField
            value={set.weight}
            step={2.5}
            decimals={1}
            keyboardType="decimal-pad"
            placeholder="重量"
            onChange={(v) => onChange({ ...set, weight: v.replace(/[^0-9.]/g, '') })}
          />
        </View>
      )}
      {mode.reps && (
      <View style={styles.quickField}>
        <Text style={styles.quickLabel}>{mode.weight ? '次数' : '个数'}</Text>
        <StepperField
          value={set.reps}
          step={1}
          keyboardType="number-pad"
          placeholder={mode.weight ? '次数' : '个数'}
          onChange={(v) => onChange({ ...set, reps: v.replace(/[^0-9]/g, '') })}
        />
      </View>
      )}
      {simpleOnly && <Text style={styles.quickSimpleText}>{mode.sets ? '完成一组' : '完成'}</Text>}
      {mode.sets && (
        <Pressable style={styles.quickDel} onPress={onRemove} hitSlop={8}>
          <Text style={styles.quickDelText}>✕</Text>
        </Pressable>
      )}
    </View>
  );
}

function RecordSheet({
  part, exercise, rec, mode, canSave,
  onChangeRec, onSave, onClose,
  workouts, onDeleteWorkout, onEditWorkout,
  dateKey, onChangeDate,
}) {
  const [showDatePicker, setShowDatePicker] = useState(false);
  const maxDate = todayKey();
  const simpleOnly = !mode.weight && !mode.reps && !mode.sets;
  const kbHeight = useKeyboardHeight();

  return (
    <View style={styles.sheetOverlay}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose} />
      <View style={styles.sheetKeyboard}>
        <View style={[styles.sheetCard, kbHeight > 0 && styles.sheetCardLifted, kbHeight > 0 && { paddingBottom: kbHeight + 12 }, getShadow()]}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHead}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sheetTitle}>{exercise}</Text>
              <Text style={styles.sheetSub}>
                {part.label} · {modeSummary(mode)}
              </Text>
            </View>
            <Pressable style={styles.sheetClose} onPress={onClose} hitSlop={8}>
              <Text style={styles.sheetCloseText}>✕</Text>
            </Pressable>
          </View>

          <ScrollView
            style={styles.sheetScroll}
            contentContainerStyle={styles.sheetScrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <Pressable style={styles.datePickBtn} onPress={() => setShowDatePicker((v) => !v)}>
              <Text style={styles.datePickLabel}>日期</Text>
              <Text style={styles.datePickText}>{friendlyDay(dateKey)}</Text>
              <Text style={styles.datePickArrow}>{showDatePicker ? '▲' : '▼'}</Text>
            </Pressable>
            {showDatePicker && (
              <View style={styles.sheetCalendarWrap}>
                <MiniCalendar
                  selected={dateKey}
                  maxKey={maxDate}
                  onPick={(key) => {
                    onChangeDate(key);
                    setShowDatePicker(false);
                  }}
                />
              </View>
            )}

            {simpleOnly ? (
              <Text style={styles.recordSimpleHint}>点下面保存，记录完成一次</Text>
            ) : (
              <View style={styles.recordPanel}>
                {mode.weight && (
                  <View style={styles.recordField}>
                    <Text style={styles.recordFieldLabel}>重量 kg</Text>
                    <StepperField
                      value={rec.weight}
                      step={2.5}
                      decimals={1}
                      keyboardType="decimal-pad"
                      placeholder="重量"
                      onChange={(v) => onChangeRec({ weight: v.replace(/[^0-9.]/g, '') })}
                    />
                  </View>
                )}
                {mode.sets && (
                  <View style={styles.recordField}>
                    <Text style={styles.recordFieldLabel}>组数</Text>
                    <StepperField
                      value={rec.count}
                      step={1}
                      min={1}
                      keyboardType="number-pad"
                      placeholder="组数"
                      onChange={(v) => onChangeRec({ count: v.replace(/[^0-9]/g, '') })}
                    />
                  </View>
                )}
                {mode.reps && (
                  <View style={styles.recordField}>
                    <Text style={styles.recordFieldLabel}>{mode.weight ? '次数（选填）' : '个数'}</Text>
                    <StepperField
                      value={rec.reps}
                      step={1}
                      keyboardType="number-pad"
                      placeholder={mode.weight ? '次数' : '个数'}
                      onChange={(v) => onChangeRec({ reps: v.replace(/[^0-9]/g, '') })}
                    />
                  </View>
                )}
              </View>
            )}

            <Text style={styles.sheetHistTitle}>最近记录</Text>
            <ExerciseHistory
              workouts={workouts}
              part={part.key}
              exercise={exercise}
              noWeight={!mode.weight}
              mode={mode}
              onDelete={onDeleteWorkout}
              onEdit={onEditWorkout}
              compact
            />
          </ScrollView>

          <Pressable
            style={[styles.sheetSave, canSave && styles.sheetSaveActive]}
            onPress={onSave}
            disabled={!canSave}
          >
            <Text style={[styles.sheetSaveText, !canSave && styles.saveBtnTextDisabled]}>
              保存这次训练
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function BodyWeightSheet({ value, onChange, summary, chartData, onSave, onDelete, onClose, dateKey, onChangeDate }) {
  const canSave = value.trim().length > 0;
  const [showDatePicker, setShowDatePicker] = useState(false);
  const maxDate = todayKey();
  const kbHeight = useKeyboardHeight();

  return (
    <View style={styles.sheetOverlay}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose} />
      <View style={styles.sheetKeyboard}>
        <View style={[styles.sheetCard, styles.bwSheetCard, kbHeight > 0 && styles.sheetCardLifted, kbHeight > 0 && { paddingBottom: kbHeight + 12 }, getShadow()]}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHead}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sheetTitle}>体重</Text>
              <Text style={styles.sheetSub}>快速记录体重</Text>
            </View>
            <Pressable style={styles.sheetClose} onPress={onClose} hitSlop={8}>
              <Text style={styles.sheetCloseText}>✕</Text>
            </Pressable>
          </View>

          <ScrollView
            style={styles.bwSheetScroll}
            contentContainerStyle={styles.sheetScrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <Pressable style={styles.datePickBtn} onPress={() => setShowDatePicker((v) => !v)}>
              <Text style={styles.datePickLabel}>日期</Text>
              <Text style={styles.datePickText}>{friendlyDay(dateKey)}</Text>
              <Text style={styles.datePickArrow}>{showDatePicker ? '▲' : '▼'}</Text>
            </Pressable>
            {showDatePicker && (
              <View style={styles.sheetCalendarWrap}>
                <MiniCalendar
                  selected={dateKey}
                  maxKey={maxDate}
                  onPick={(key) => {
                    onChangeDate(key);
                    setShowDatePicker(false);
                  }}
                />
              </View>
            )}
            <View style={styles.bwQuickBox}>
              <Text style={styles.quickLabel}>kg</Text>
              <StepperField
                value={value}
                step={0.1}
                decimals={1}
                keyboardType="decimal-pad"
                placeholder="今天体重"
                onChange={(v) => onChange(v.replace(/[^0-9.]/g, ''))}
              />
              {summary && (
                <View style={styles.bwStatsRow}>
                  <Text style={styles.bwLast}>最新 {summary.last.value}kg</Text>
                  {summary.prev && (
                    <Text style={[
                      styles.bwDelta,
                      { color: summary.last.value > summary.prev.value ? '#F0A85C'
                        : summary.last.value < summary.prev.value ? '#3FB27F' : colors.textSoft },
                    ]}>
                      {summary.last.value > summary.prev.value ? '+' : ''}
                      {(summary.last.value - summary.prev.value).toFixed(1)}kg
                    </Text>
                  )}
                </View>
              )}
            </View>

            {summary ? (
              <View style={styles.bwSheetHistory}>
                <WeightChart data={chartData} />
                <Text style={styles.bwHistTitle}>历史记录</Text>
                {summary.all.slice().reverse().map((b) => (
                  <View key={b.id} style={styles.bwItem}>
                    <Text style={styles.bwItemDay}>{friendlyDay(dayKey(b.ts))}</Text>
                    <Text style={styles.bwItemVal}>{b.value}kg</Text>
                    <Pressable onPress={() => onDelete(b.id)} hitSlop={6}>
                      <Text style={styles.bwItemDel}>✕</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.bwEmpty}>还没有体重，上面记一笔</Text>
            )}
          </ScrollView>

          <Pressable
            style={[styles.sheetSave, canSave && styles.sheetSaveActive]}
            disabled={!canSave}
            onPress={onSave}
          >
            <Text style={[styles.sheetSaveText, !canSave && styles.saveBtnTextDisabled]}>
              保存体重
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function ExerciseCreateSheet({ title = '新增动作', subtitle = '设置这个动作要记录什么', name, mode, onChangeName, onChangeMode, onSave, onClose }) {
  const canSave = name.trim().length > 0;
  const kbHeight = useKeyboardHeight();
  const toggle = (key) => {
    select();
    onChangeMode({ ...mode, [key]: !mode[key] });
  };

  return (
    <View style={styles.sheetOverlay}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose} />
      <View style={styles.sheetKeyboard}>
        <View style={[styles.sheetCard, styles.createSheetCard, kbHeight > 0 && styles.sheetCardLifted, kbHeight > 0 && { paddingBottom: kbHeight + 12 }, getShadow()]}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHead}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sheetTitle}>{title}</Text>
              <Text style={styles.sheetSub}>{subtitle}</Text>
            </View>
            <Pressable style={styles.sheetClose} onPress={onClose} hitSlop={8}>
              <Text style={styles.sheetCloseText}>✕</Text>
            </Pressable>
          </View>

          <ScrollView
            style={styles.createScroll}
            contentContainerStyle={styles.createScrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <TextInput
              style={styles.createInput}
              value={name}
              onChangeText={onChangeName}
              placeholder="动作名称"
              placeholderTextColor={colors.textSoft}
              maxLength={16}
              onSubmitEditing={onSave}
            />

            <View style={styles.createModeGrid}>
              {[
                { key: 'weight', title: '重量', sub: '例如 40kg' },
                { key: 'reps', title: '次数', sub: '例如 12 次' },
                { key: 'sets', title: '是否多组', sub: '需要记录第 1/2/3 组' },
              ].map((item) => {
                const on = !!mode[item.key];
                return (
                  <Pressable
                    key={item.key}
                    style={[styles.createModeItem, on && styles.createModeItemOn]}
                    onPress={() => toggle(item.key)}
                  >
                    <View style={[styles.createModeCheck, on && styles.createModeCheckOn]}>
                      <Text style={[styles.createModeCheckText, on && styles.createModeCheckTextOn]}>{on ? '✓' : ''}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.createModeTitle}>{item.title}</Text>
                      <Text style={styles.createModeSub}>{item.sub}</Text>
                    </View>
                  </Pressable>
                );
              })}

              {mode.sets && (
                <View style={styles.createCountRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.createModeTitle}>组数</Text>
                    <Text style={styles.createModeSub}>默认预填几组</Text>
                  </View>
                  <View style={styles.createCountStepper}>
                    <StepperField
                      value={mode.setCount === '' ? '' : String(clampSetCount(mode.setCount))}
                      step={1}
                      min={1}
                      keyboardType="number-pad"
                      placeholder="组数"
                      onChange={(v) => {
                        const digits = v.replace(/[^0-9]/g, '');
                        onChangeMode({ ...mode, setCount: digits === '' ? '' : clampSetCount(digits) });
                      }}
                    />
                  </View>
                </View>
              )}
            </View>
          </ScrollView>

          <Pressable
            style={[styles.sheetSave, canSave && styles.sheetSaveActive]}
            disabled={!canSave}
            onPress={onSave}
          >
            <Text style={[styles.sheetSaveText, !canSave && styles.saveBtnTextDisabled]}>保存动作</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function workoutVolume(workout) {
  return workout.sets.reduce(
    (sum, s) => sum + (Number(s.weight) || 0) * (Number(s.reps) || 0),
    0,
  );
}

function workoutTopWeight(workout) {
  return workout.sets.reduce((mx, s) => Math.max(mx, Number(s.weight) || 0), 0);
}

function summarizeWorkouts(items) {
  return items.reduce((acc, item) => {
    acc.sessions += 1;
    acc.sets += item.sets.length;
    acc.volume += workoutVolume(item);
    acc.maxWeight = Math.max(acc.maxWeight, workoutTopWeight(item));
    return acc;
  }, { sessions: 0, sets: 0, volume: 0, maxWeight: 0 });
}

function deltaText(cur, prev, suffix = '') {
  if (prev === null || prev === undefined) return '暂无上周对比';
  const diff = cur - prev;
  if (diff === 0) return '持平';
  return `${diff > 0 ? '+' : ''}${diff.toFixed(0)}${suffix}`;
}

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

// 内嵌小日历：点某天回调 key（YYYY-MM-DD），不依赖任何原生日期组件
function MiniCalendar({ selected, onPick, minKey, maxKey }) {
  const initY = Number((selected || '').slice(0, 4)) || new Date().getFullYear();
  const initM = (Number((selected || '').slice(5, 7)) || (new Date().getMonth() + 1)) - 1;
  const [y, setY] = useState(initY);
  const [m, setM] = useState(initM);
  const cells = monthGrid(y, m);
  const prev = () => { if (m === 0) { setY(y - 1); setM(11); } else setM(m - 1); };
  const next = () => { if (m === 11) { setY(y + 1); setM(0); } else setM(m + 1); };
  return (
    <View style={styles.calBox}>
      <View style={styles.calHead}>
        <Pressable onPress={prev} hitSlop={8} style={styles.calNav}><Text style={styles.calNavText}>‹</Text></Pressable>
        <Text style={styles.calMonth}>{monthLabel(y, m)}</Text>
        <Pressable onPress={next} hitSlop={8} style={styles.calNav}><Text style={styles.calNavText}>›</Text></Pressable>
      </View>
      <View style={styles.calWeekRow}>
        {WEEK_SHORT.map((w, i) => (
          <Text key={w} style={[styles.calWeekCell, (i === 0 || i === 6) && { color: colors.primary }]}>{w}</Text>
        ))}
      </View>
      <View style={styles.calGrid}>
        {cells.map((c, i) => {
          if (!c.inMonth) return <View key={i} style={styles.calCell} />;
          const sel = c.key === selected;
          const disabled = (minKey && c.key < minKey) || (maxKey && c.key > maxKey);
          return (
            <Pressable
              key={i}
              style={styles.calCell}
              disabled={disabled}
              onPress={() => { select(); onPick(c.key); }}
            >
              <View style={[styles.calDay, sel && styles.calDaySel, disabled && styles.calDayDisabled]}>
                <Text style={[styles.calDayText, sel && styles.calDayTextSel, disabled && styles.calDayTextDisabled]}>{c.day}</Text>
              </View>
            </Pressable>
          );
        })}
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

function EditWorkoutModal({ workout, noWeight, mode, onSave, onCancel }) {
  const recordMode = mode || (noWeight ? { weight: false, reps: true, sets: true } : DEFAULT_EXERCISE_MODE);
  const [sets, setSets] = useState(workout.sets.map((s) => ({ ...s })));
  const initDate = new Date(workout.ts);
  const pad = (n) => String(n).padStart(2, '0');
  const [dateStr, setDateStr] = useState(
    `${initDate.getFullYear()}-${pad(initDate.getMonth() + 1)}-${pad(initDate.getDate())}`
  );
  const [timeStr, setTimeStr] = useState(
    `${pad(initDate.getHours())}:${pad(initDate.getMinutes())}`
  );
  const [showCal, setShowCal] = useState(false);
  const kbHeight = useKeyboardHeight();

  const changeSet = (i, v) => setSets(sets.map((s, k) => (k === i ? v : s)));
  const removeSet = (i) => setSets(sets.length > 1 ? sets.filter((_, k) => k !== i) : sets);
  const addSet = () => {
    const last = sets[sets.length - 1] || { weight: '', reps: '' };
    setSets([...sets, { weight: last.weight, reps: last.reps }]);
  };

  const save = () => {
    const clean = sets.filter((s) => (
      (!recordMode.weight && !recordMode.reps)
        || (recordMode.weight && s.weight !== '')
        || (recordMode.reps && s.reps !== '')
    ));
    if (clean.length === 0) return;
    const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
    const tm = /^(\d{2}):(\d{2})$/.exec(timeStr);
    let ts = workout.ts;
    if (dm && tm) {
      const d = new Date(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]), Number(tm[1]), Number(tm[2]));
      if (!isNaN(d.getTime())) ts = d.toISOString();
    }
    onSave({ ...workout, sets: clean, ts });
  };

  return (
    <View style={[styles.modalOverlay, kbHeight > 0 && { paddingBottom: kbHeight, justifyContent: 'flex-end' }]}>
      <View style={[styles.modalCard, getShadow()]}>
        <Text style={styles.modalTitle}>编辑记录</Text>
        <Text style={styles.modalLabel}>日期时间</Text>
        <View style={styles.modalTimeRow}>
          <Pressable
            style={[styles.modalDateInput, styles.modalDateBtn]}
            onPress={() => setShowCal((v) => !v)}
          >
            <Text style={styles.modalDateText}>{dateStr}</Text>
            <Text style={styles.modalDateArrow}>{showCal ? '▲' : '▼'}</Text>
          </Pressable>
          <TextInput
            style={styles.modalTimeInput}
            value={timeStr}
            onChangeText={(v) => setTimeStr(v.replace(/[^0-9:]/g, ''))}
            placeholder="HH:MM"
            placeholderTextColor={colors.textSoft}
            keyboardType="numbers-and-punctuation"
            maxLength={5}
          />
        </View>
        {showCal && (
          <View style={styles.modalCalendarWrap}>
            <MiniCalendar
              selected={dateStr}
              onPick={(key) => {
                setDateStr(key);
                setShowCal(false);
              }}
            />
          </View>
        )}
        <Text style={styles.modalLabel}>组数</Text>
        <ScrollView style={{ maxHeight: 260 }}>
          {sets.map((s, i) => (
            <SetRow
              key={i}
              index={i}
              set={s}
              mode={recordMode}
              onChange={(v) => changeSet(i, v)}
              onRemove={() => removeSet(i)}
            />
          ))}
        </ScrollView>
        {recordMode.sets && (
          <Pressable style={styles.addSet} onPress={addSet}>
            <Text style={styles.addSetText}>＋ 加一组</Text>
          </Pressable>
        )}
        <View style={styles.modalBtns}>
          <Pressable style={[styles.modalBtn, styles.modalBtnGhost]} onPress={onCancel}>
            <Text style={styles.modalBtnGhostText}>取消</Text>
          </Pressable>
          <Pressable style={[styles.modalBtn, styles.modalBtnPrimary]} onPress={save}>
            <Text style={styles.modalBtnPrimaryText}>保存</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

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
function DraggableRow({
  name, index, editMode, isActive, dragIdx, listLen,
  onGripStart, onGripSwap, onGripEnd, onPress, onDelete, count, progress,
}) {
  const translateY = useRef(new Animated.Value(0)).current;
  const startY = useRef(0);
  const currentIndex = useRef(index);
  const prevIndex = useRef(index);
  const timer = useRef(null);
  const dragging = useRef(false);
  const moved = useRef(false);

  // 被顶开的行：从旧位置 spring 平滑滑到新位置（和网格一致的让位动画）
  useEffect(() => {
    if (isActive) {
      prevIndex.current = index;
      currentIndex.current = index;
      return;
    }
    const delta = prevIndex.current - index;
    prevIndex.current = index;
    currentIndex.current = index;
    if (delta !== 0) {
      translateY.setValue(delta * ROW_STRIDE);
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, friction: 9, tension: 90 }).start();
    }
  }, [index, isActive, translateY]);

  // 拖动结束后归位
  useEffect(() => {
    if (isActive) return;
    if (dragIdx === null || dragIdx === undefined) {
      Animated.timing(translateY, { toValue: 0, duration: 160, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    }
  }, [dragIdx, isActive, translateY]);

  const clearHold = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const beginDrag = () => {
    if (listLen <= 1) return;
    dragging.current = true;
    select();
    onGripStart(index);
  };

  const handleResponderGrant = (e) => {
    startY.current = e.nativeEvent.pageY;
    moved.current = false;
    dragging.current = false;
    translateY.setValue(0);
    clearHold();
    timer.current = setTimeout(beginDrag, 260);
  };

  const handleResponderMove = (e) => {
    const dy = e.nativeEvent.pageY - startY.current;
    if (!dragging.current) {
      if (Math.abs(dy) > 8) {
        moved.current = true;
        clearHold();
      }
      return;
    }

    translateY.setValue(dy);
    const half = ROW_STRIDE / 2;
    if (dy > half && currentIndex.current < listLen - 1) {
      onGripSwap(currentIndex.current, currentIndex.current + 1);
      currentIndex.current += 1;
      startY.current += ROW_STRIDE;
      translateY.setValue(dy - ROW_STRIDE);
    } else if (dy < -half && currentIndex.current > 0) {
      onGripSwap(currentIndex.current, currentIndex.current - 1);
      currentIndex.current -= 1;
      startY.current -= ROW_STRIDE;
      translateY.setValue(dy + ROW_STRIDE);
    }
  };

  const handleResponderEnd = () => {
    clearHold();
    if (dragging.current) {
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        friction: 8,
        tension: 90,
      }).start();
      dragging.current = false;
      onGripEnd();
      return;
    }
    if (!moved.current) onPress();
  };

  return (
    <Animated.View
      style={[
        styles.exRow,
        getShadow(),
        isActive && styles.exRowMoving,
        { transform: [{ translateY }], zIndex: isActive ? 10 : 1 },
      ]}
    >
      <View
        style={styles.exTap}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={handleResponderGrant}
        onResponderMove={handleResponderMove}
        onResponderRelease={handleResponderEnd}
        onResponderTerminate={handleResponderEnd}
      >
        <View style={styles.exMain}>
          <Text style={styles.exName} numberOfLines={1}>{name}</Text>
          {progress?.detail && !editMode && <Text style={styles.exProgressDetail} numberOfLines={1}>{progress.detail}</Text>}
        </View>
        {!editMode && (
          progress ? (
            <View style={styles.exProgress}>
              <Text style={styles.exProgressMain} numberOfLines={1}>{progress.main}</Text>
              <Text style={styles.exProgressSub} numberOfLines={1}>{progress.sub}</Text>
            </View>
          ) : (
            count > 0 && <Text style={styles.exCnt}>{count} 次</Text>
          )
        )}
      </View>
      {editMode && (
        <Pressable style={styles.exDel} onPress={onDelete} hitSlop={8}>
          <Text style={styles.exDelText}>✕</Text>
        </Pressable>
      )}
    </Animated.View>
  );
}

function ExerciseGridTile({ name, width, count, progress, part, dragging }) {
  return (
    <View
      style={[styles.exerciseTile, getShadow(), { width }, dragging && styles.tileDragging]}
    >
      <Text style={styles.exerciseTileEmoji}>{part.emoji}</Text>
      <Text style={styles.exerciseTileName} numberOfLines={2}>{name}</Text>
      {progress ? (
        <View style={styles.exerciseTileMeta}>
          <Text style={styles.exerciseTileMain} numberOfLines={1}>{progress.main}</Text>
          <Text style={styles.exerciseTileSub} numberOfLines={1}>{progress.sub}</Text>
        </View>
      ) : (
        <Text style={styles.exerciseTileSub}>{count > 0 ? `${count} 次` : '未记录'}</Text>
      )}
    </View>
  );
}

function PartGridTile({ part, width, dragging }) {
  return (
    <View
      style={[styles.partTile, getShadow(), { width, backgroundColor: getTileColor(part.color) }, dragging && styles.tileDragging]}
    >
      <Text style={styles.partTileEmoji}>{part.emoji}</Text>
      <Text style={styles.partTileLabel} numberOfLines={1}>{part.label}</Text>
    </View>
  );
}

// 通用网格：长按触发二维拖动排序，未触发时轻点即 onPress
function DragGrid({ items, keyOf, cols, tileWidth, gap, onReorder, onPressItem, renderTile, onDragStateChange }) {
  const [order, setOrder] = useState(() => items.map(keyOf));
  const [draggingKey, setDraggingKey] = useState(null);
  const itemByKey = useRef({});
  const anims = useRef({}).current;
  const orderRef = useRef(order);
  const draggingKeyRef = useRef(null);
  const geomRef = useRef({ cols, tileWidth, gap });

  itemByKey.current = {};
  for (const it of items) itemByKey.current[keyOf(it)] = it;
  orderRef.current = order;
  geomRef.current = { cols, tileWidth, gap };

  const stride = tileWidth + gap;
  const homeOf = useCallback((index, geom) => {
    const g = geom || geomRef.current;
    const col = index % g.cols;
    const row = Math.floor(index / g.cols);
    const pitch = g.tileWidth + g.gap;
    return { x: col * pitch, y: row * pitch };
  }, []);

  // 同步外部 items 的增删（保持已有顺序，新增追加、删除移除）
  useEffect(() => {
    setOrder((prev) => {
      const keys = items.map(keyOf);
      const kept = prev.filter((k) => keys.includes(k));
      const added = keys.filter((k) => !prev.includes(k));
      return [...kept, ...added];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  order.forEach((k, index) => {
    if (!anims[k]) anims[k] = new Animated.ValueXY(homeOf(index));
  });

  useEffect(() => {
    order.forEach((k, index) => {
      if (k === draggingKeyRef.current) return;
      Animated.spring(anims[k], {
        toValue: homeOf(index),
        useNativeDriver: false,
        friction: 9,
        tension: 90,
      }).start();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order, cols, tileWidth, gap]);

  const respondersRef = useRef({});
  const holdTimer = useRef(null);

  const makeResponder = (k) => {
    const clearHold = () => {
      if (holdTimer.current) clearTimeout(holdTimer.current);
      holdTimer.current = null;
    };
    let didDrag = false;
    let moved = false;
    let startHome = { x: 0, y: 0 };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => didDrag,
      onPanResponderGrant: () => {
        didDrag = false;
        moved = false;
        clearHold();
        holdTimer.current = setTimeout(() => {
          didDrag = true;
          select();
          draggingKeyRef.current = k;
          setDraggingKey(k);
          if (onDragStateChange) onDragStateChange(true);
          const startIndex = orderRef.current.indexOf(k);
          startHome = homeOf(startIndex);
          anims[k].setOffset(startHome);
          anims[k].setValue({ x: 0, y: 0 });
        }, 240);
      },
      onPanResponderMove: (_, gesture) => {
        if (!didDrag) {
          if (Math.abs(gesture.dx) > 8 || Math.abs(gesture.dy) > 8) {
            moved = true;
            clearHold();
          }
          return;
        }
        anims[k].setValue({ x: gesture.dx, y: gesture.dy });
        const geom = geomRef.current;
        const pitch = geom.tileWidth + geom.gap;
        // 用拖动起始位置（offset 固定为它）+ 手指位移算屏幕中心，
        // 不能用当前索引重算 home，否则重排后 home 跳格会跨过中间列
        const cx = startHome.x + gesture.dx + geom.tileWidth / 2;
        const cy = startHome.y + gesture.dy + geom.tileWidth / 2;
        let col = Math.floor(cx / pitch);
        let row = Math.floor(cy / pitch);
        if (col < 0) col = 0;
        if (col >= geom.cols) col = geom.cols - 1;
        if (row < 0) row = 0;
        let target = row * geom.cols + col;
        const total = orderRef.current.length;
        if (target < 0) target = 0;
        if (target > total - 1) target = total - 1;
        const current = orderRef.current.indexOf(k);
        if (target !== current) {
          const next = orderRef.current.slice();
          next.splice(current, 1);
          next.splice(target, 0, k);
          setOrder(next);
        }
      },
      onPanResponderRelease: () => {
        clearHold();
        if (!didDrag) {
          if (!moved) onPressItem(itemByKey.current[k]);
          return;
        }
        anims[k].flattenOffset();
        const finalIndex = orderRef.current.indexOf(k);
        Animated.spring(anims[k], {
          toValue: homeOf(finalIndex),
          useNativeDriver: false,
          friction: 8,
          tension: 90,
        }).start(() => {
          draggingKeyRef.current = null;
          setDraggingKey(null);
          if (onDragStateChange) onDragStateChange(false);
          onReorder(orderRef.current.slice());
        });
      },
      onPanResponderTerminate: () => {
        clearHold();
        if (!didDrag) return;
        anims[k].flattenOffset();
        const finalIndex = orderRef.current.indexOf(k);
        Animated.spring(anims[k], {
          toValue: homeOf(finalIndex),
          useNativeDriver: false,
          friction: 8,
          tension: 90,
        }).start(() => {
          draggingKeyRef.current = null;
          setDraggingKey(null);
          if (onDragStateChange) onDragStateChange(false);
        });
      },
    });
  };

  order.forEach((k) => {
    if (!respondersRef.current[k]) respondersRef.current[k] = makeResponder(k);
  });

  const rows = Math.ceil(order.length / cols);
  const gridH = rows > 0 ? rows * stride - gap : 0;

  return (
    <View style={{ height: gridH, marginBottom: 6 }}>
      {order.map((k) => {
        const item = itemByKey.current[k];
        if (!item) return null;
        const isDragging = draggingKey === k;
        return (
          <Animated.View
            key={k}
            style={{
              position: 'absolute',
              width: tileWidth,
              transform: [{ translateX: anims[k].x }, { translateY: anims[k].y }],
              zIndex: isDragging ? 10 : 1,
            }}
            {...respondersRef.current[k].panHandlers}
          >
            {renderTile(item, isDragging)}
          </Animated.View>
        );
      })}
    </View>
  );
}

function DraggablePartRow({ part, index, listLen, isActive, dragIdx, onPress, onDragStart, onDragSwap, onDragEnd }) {
  const translateY = useRef(new Animated.Value(0)).current;
  const startY = useRef(0);
  const currentIndex = useRef(index);
  const prevIndex = useRef(index);
  const timer = useRef(null);
  const dragging = useRef(false);
  const moved = useRef(false);

  // 被顶开的行：从旧位置 spring 平滑滑到新位置（和网格一致的让位动画）
  useEffect(() => {
    if (isActive) {
      prevIndex.current = index;
      currentIndex.current = index;
      return;
    }
    const delta = prevIndex.current - index;
    prevIndex.current = index;
    currentIndex.current = index;
    if (delta !== 0) {
      translateY.setValue(delta * PART_ROW_STRIDE);
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, friction: 9, tension: 90 }).start();
    }
  }, [index, isActive, translateY]);

  // 拖动结束后归位
  useEffect(() => {
    if (isActive) return;
    if (dragIdx === null || dragIdx === undefined) {
      Animated.timing(translateY, { toValue: 0, duration: 160, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    }
  }, [dragIdx, isActive, translateY]);

  const clearHold = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const beginDrag = () => {
    dragging.current = true;
    select();
    onDragStart(index);
  };

  const handleGrant = (e) => {
    startY.current = e.nativeEvent.pageY;
    moved.current = false;
    dragging.current = false;
    translateY.setValue(0);
    clearHold();
    timer.current = setTimeout(beginDrag, 260);
  };

  const handleMove = (e) => {
    const dy = e.nativeEvent.pageY - startY.current;
    if (!dragging.current) {
      if (Math.abs(dy) > 8) {
        moved.current = true;
        clearHold();
      }
      return;
    }

    translateY.setValue(dy);
    const half = PART_ROW_STRIDE / 2;
    if (dy > half && currentIndex.current < listLen - 1) {
      onDragSwap(currentIndex.current, currentIndex.current + 1);
      currentIndex.current += 1;
      startY.current += PART_ROW_STRIDE;
      translateY.setValue(dy - PART_ROW_STRIDE);
    } else if (dy < -half && currentIndex.current > 0) {
      onDragSwap(currentIndex.current, currentIndex.current - 1);
      currentIndex.current -= 1;
      startY.current -= PART_ROW_STRIDE;
      translateY.setValue(dy + PART_ROW_STRIDE);
    }
  };

  const handleEnd = () => {
    clearHold();
    if (dragging.current) {
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        friction: 8,
        tension: 90,
      }).start();
      dragging.current = false;
      onDragEnd();
      return;
    }
    if (!moved.current) onPress();
  };

  return (
    <Animated.View
      style={[
        styles.partRow,
        { backgroundColor: getTileColor(part.color) },
        getShadow(),
        isActive && styles.partRowMoving,
        { transform: [{ translateY }], zIndex: isActive ? 10 : 1 },
      ]}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={handleGrant}
      onResponderMove={handleMove}
      onResponderRelease={handleEnd}
      onResponderTerminate={handleEnd}
    >
      <Text style={styles.partEmoji}>{part.emoji}</Text>
      <Text style={styles.partLabel}>{part.label}</Text>
    </Animated.View>
  );
}

export default function FitnessScreen({
  workouts, exercises, memory = {}, bodyWeight = [],
  settings = {}, onChangeSettings,
  onAddWorkout, onDeleteWorkout, onUpdateWorkout,
  onAddExercise, onDeleteExercise, onReorderExercises, onRenameExercise, onUpdateMemory,
  onAddBodyWeight, onDeleteBodyWeight, registerBack, resetSignal,
}) {
  const { width: viewportWidth } = useWindowDimensions();
  const [part, setPart] = useState(null);
  const [exercise, setExercise] = useState(null);
  const [customEx, setCustomEx] = useState('');
  const [customMode, setCustomMode] = useState(DEFAULT_EXERCISE_MODE);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingExercise, setEditingExercise] = useState(null);
  const [rec, setRec] = useState({ weight: '', reps: DEFAULT_REPS, count: String(DEFAULT_SET_COUNT) });
  const [recordDate, setRecordDate] = useState(todayKey());
  const [editMode, setEditMode] = useState(false);
  const [dragIdx, setDragIdx] = useState(null);
  const [partDragIdx, setPartDragIdx] = useState(null);
  const [gridDragging, setGridDragging] = useState(false);
  const [editingWorkout, setEditingWorkout] = useState(null);
  const [bwInput, setBwInput] = useState('');
  const [bwDate, setBwDate] = useState(todayKey());
  const [bwOpen, setBwOpen] = useState(false);
  const exerciseScrollRef = useRef(null);

  const resetToFitnessHome = useCallback(() => {
    setPart(null);
    setExercise(null);
    setCustomEx('');
    setCustomMode(DEFAULT_EXERCISE_MODE);
    setCreateOpen(false);
    setEditingExercise(null);
    setEditMode(false);
    setDragIdx(null);
    setPartDragIdx(null);
    setEditingWorkout(null);
    setBwOpen(false);
    setRecordDate(todayKey());
    setBwDate(todayKey());
  }, []);

  useEffect(() => {
    if (resetSignal === undefined) return;
    resetToFitnessHome();
  }, [resetSignal, resetToFitnessHome]);

  // 注册实体返回键：优先关弹窗 → 关体重页 → 退动作 → 退部位
  useEffect(() => {
    if (!registerBack) return;
    registerBack(() => {
      if (editingWorkout) { setEditingWorkout(null); return true; }
      if (editingExercise) { setEditingExercise(null); setCreateOpen(false); return true; }
      if (createOpen) { setCreateOpen(false); return true; }
      if (bwOpen) { setBwOpen(false); return true; }
      if (exercise) { setExercise(null); return true; }
      if (part) { setPart(null); return true; }
      return false;
    });
    return () => registerBack(null);
  }, [registerBack, editingWorkout, editingExercise, createOpen, bwOpen, exercise, part]);

  const openPart = (p) => {
    select();
    setPart(p); setExercise(null); setCustomEx('');
    setCustomMode(DEFAULT_EXERCISE_MODE);
    setCreateOpen(false); setEditingExercise(null);
    setEditMode(false); setDragIdx(null); setPartDragIdx(null);
  };

  const saveExerciseMode = useCallback((partKey, name, mode) => {
    if (!onChangeSettings) return;
    const key = exerciseModeKey(partKey, name);
    onChangeSettings({
      ...settings,
      fitnessExerciseModes: {
        ...(settings?.fitnessExerciseModes || {}),
        [key]: normalizeExerciseMode(mode, name),
      },
    });
  }, [settings, onChangeSettings]);

  const removeExerciseMode = useCallback((partKey, name) => {
    if (!onChangeSettings) return;
    const key = exerciseModeKey(partKey, name);
    const modes = { ...(settings?.fitnessExerciseModes || {}) };
    delete modes[key];
    onChangeSettings({ ...settings, fitnessExerciseModes: modes });
  }, [settings, onChangeSettings]);

  const orderedParts = useMemo(() => {
    const byKey = {};
    for (const p of BODY_PARTS) byKey[p.key] = p;
    const saved = Array.isArray(settings?.fitnessPartOrder) ? settings.fitnessPartOrder : [];
    const keys = [...saved.filter((key) => byKey[key])];
    for (const p of BODY_PARTS) if (!keys.includes(p.key)) keys.push(p.key);
    return keys.map((key) => byKey[key]).filter(Boolean);
  }, [settings]);

  const savePartOrder = useCallback((parts) => {
    if (!onChangeSettings) return;
    onChangeSettings({ ...settings, fitnessPartOrder: parts.map((p) => p.key) });
  }, [settings, onChangeSettings]);

  const onPartDragStart = useCallback((index) => {
    setPartDragIdx(index);
  }, []);

  const onPartDragSwap = useCallback((from, to) => {
    const cur = orderedParts;
    if (from < 0 || to < 0 || from >= cur.length || to >= cur.length) return;
    const next = [...cur];
    [next[from], next[to]] = [next[to], next[from]];
    savePartOrder(next);
    setPartDragIdx(to);
  }, [orderedParts, savePartOrder]);

  const onPartDragEnd = useCallback(() => {
    setPartDragIdx(null);
  }, []);

  const openExercise = (name, modeOverride = null) => {
    select();
    const mode = modeOverride ? normalizeExerciseMode(modeOverride, name) : getExerciseMode(settings, part.key, name);
    const noWeight = !mode.weight;
    const memKey = `${part.key}:${name}`;
    const saved = memory[memKey];
    const historicalMax = maxExerciseWeight(workouts, part.key, name);
    const rememberedMax = Number(saved?.maxWeight) || 0;
    const maxWeight = Math.max(historicalMax, rememberedMax);
    // 新版记忆用 rec；兼容旧版存的 sets 数组
    const savedRec = saved?.rec || (saved?.sets && saved.sets.length > 0
      ? { weight: saved.sets[0].weight || '', reps: saved.sets[0].reps || '', count: String(saved.sets.length) }
      : null);
    setRec({
      weight: noWeight ? '' : (maxWeight ? formatStepValue(maxWeight, 1) : (savedRec ? savedRec.weight || '' : '')),
      reps: mode.reps ? (savedRec ? savedRec.reps || '' : '') : '',
      count: String(mode.sets ? clampSetCount(savedRec ? savedRec.count : mode.setCount) : 1),
    });
    setRecordDate(todayKey());
    setEditMode(false);
    setDragIdx(null);
    setExercise(name);
  };

  const exList = (part && exercises && exercises[part.key]) || [];
  const exerciseMode = exercise && part ? getExerciseMode(settings, part.key, exercise) : DEFAULT_EXERCISE_MODE;
  const noWeight = exercise ? !exerciseMode.weight : false;
  const exerciseLayout = settings?.fitnessExerciseLayout === 'grid' ? 'grid' : 'list';
  const showExerciseGrid = exerciseLayout === 'grid' && !editMode;
  const exerciseContentWidth = Math.max(0, Math.min(460, viewportWidth) - 28);
  const exerciseGridCols = exerciseContentWidth >= 360 ? 3 : 2;
  const exerciseTileWidth = Math.max(
    120,
    Math.floor((exerciseContentWidth - GAP * (exerciseGridCols - 1)) / exerciseGridCols),
  );
  const partLayout = settings?.fitnessPartLayout === 'grid' ? 'grid' : 'list';
  const showPartGrid = partLayout === 'grid';
  const partGridCols = exerciseContentWidth >= 360 ? 3 : 2;
  const partTileWidth = Math.max(
    120,
    Math.floor((exerciseContentWidth - GAP * (partGridCols - 1)) / partGridCols),
  );

  const toggleExerciseLayout = useCallback(() => {
    if (!onChangeSettings) return;
    select();
    onChangeSettings({
      ...settings,
      fitnessExerciseLayout: exerciseLayout === 'grid' ? 'list' : 'grid',
    });
  }, [settings, onChangeSettings, exerciseLayout]);

  const togglePartLayout = useCallback(() => {
    if (!onChangeSettings) return;
    select();
    onChangeSettings({
      ...settings,
      fitnessPartLayout: partLayout === 'grid' ? 'list' : 'grid',
    });
  }, [settings, onChangeSettings, partLayout]);

  const addCustom = () => {
    const name = customEx.trim();
    if (!name) return;
    if (!exList.includes(name)) onAddExercise(part.key, name);
    saveExerciseMode(part.key, name, customMode);
    setCustomEx('');
    setCustomMode(DEFAULT_EXERCISE_MODE);
    setCreateOpen(false);
    openExercise(name, customMode);
  };

  const openEditExercise = (name) => {
    select();
    setEditingExercise(name);
    setCustomEx(name);
    setCustomMode(getExerciseMode(settings, part.key, name));
    setCreateOpen(true);
  };

  const saveEditedExercise = () => {
    if (!editingExercise) return;
    const oldName = editingExercise;
    const nextName = customEx.trim();
    if (!nextName) return;
    if (nextName !== oldName && onRenameExercise) {
      onRenameExercise(part.key, oldName, nextName);
      removeExerciseMode(part.key, oldName);
    }
    saveExerciseMode(part.key, nextName, customMode);
    setEditingExercise(null);
    setCreateOpen(false);
    setCustomEx('');
    setCustomMode(DEFAULT_EXERCISE_MODE);
  };

  const confirmDeleteExercise = (name) => {
    const cnt = workouts.filter((w) => w.part === part.key && w.exercise === name).length;
    confirmAction({
      title: `删除「${name}」`,
      message: cnt > 0
        ? `已有的 ${cnt} 条训练记录会保留，只是不再显示在动作列表里。`
        : '',
      confirmText: '删除',
      destructive: true,
      onConfirm: () => onDeleteExercise(part.key, name),
    });
  };

  // 拖动时直接调用父组件更新，父组件的新顺序会立即回流到 exList
  const onGripStart = useCallback((index) => {
    select();
    setDragIdx(index);
  }, []);

  const onGripSwap = useCallback((from, to) => {
    if (!part) return;
    // 用最新的顺序做交换
    const cur = exercises[part.key] || [];
    if (from < 0 || to < 0 || from >= cur.length || to >= cur.length) return;
    const next = [...cur];
    [next[from], next[to]] = [next[to], next[from]];
    onReorderExercises(part.key, next);
    setDragIdx(to);
  }, [part, exercises, onReorderExercises]);

  const onGripEnd = useCallback(() => {
    setDragIdx(null);
  }, []);

  const changeRec = (patch) => setRec((prev) => ({ ...prev, ...patch }));

  // 单行记录：重量 + 组数（自己输入）+ 可选次数。保存时展开成 count 组相同的 set。
  const canSave = (!exerciseMode.weight && !exerciseMode.reps && !exerciseMode.sets)
    || (!exerciseMode.weight || rec.weight !== '')
    && (!exerciseMode.reps || rec.reps !== '');

  const saveWorkout = () => {
    if (!canSave) return;
    const count = exerciseMode.sets ? clampSetCount(rec.count || DEFAULT_SET_COUNT) : 1;
    const oneSet = {
      weight: exerciseMode.weight ? (rec.weight || '') : '',
      reps: exerciseMode.reps ? (rec.reps || '') : '',
    };
    const sets = Array.from({ length: count }, () => ({ ...oneSet }));
    success();
    onAddWorkout({ part: part.key, exercise, sets, ts: makeDatedIso(recordDate) });
    const memKey = `${part.key}:${exercise}`;
    const currentMax = Number(oneSet.weight) || 0;
    const maxWeight = Math.max(currentMax, Number(memory[memKey]?.maxWeight) || 0);
    onUpdateMemory(memKey, { rec: { ...oneSet, count: String(count) }, maxWeight });
    setExercise(null);
    setRecordDate(todayKey());
  };

  const deleteWorkoutEntry = (w) => {
    confirmAction({
      title: '删除这次记录',
      message: `${friendlyDay(dayKey(w.ts))} ${hhmm(w.ts)} 的记录将被移除。`,
      confirmText: '删除',
      destructive: true,
      onConfirm: () => onDeleteWorkout(w.id),
    });
  };

  const addBw = () => {
    const v = parseFloat(bwInput);
    if (!isNaN(v) && v > 0) {
      success();
      onAddBodyWeight(v, makeDatedIso(bwDate));
      setBwInput('');
      setBwOpen(false);
      setBwDate(todayKey());
    }
  };

  // 体重最新一次 + 趋势
  const bwSummary = useMemo(() => {
    if (bodyWeight.length === 0) return null;
    const sorted = [...bodyWeight].sort((a, b) => (a.ts < b.ts ? -1 : 1));
    const last = sorted[sorted.length - 1];
    const prev = sorted.length > 1 ? sorted[sorted.length - 2] : null;
    return { last, prev, all: sorted };
  }, [bodyWeight]);

  const bwChartData = useMemo(() => {
    if (!bwSummary) return [];
    const byDay = {};
    for (const item of bwSummary.all) {
      byDay[dayKey(item.ts)] = item.value;
    }
    return Object.entries(byDay).map(([day, value]) => ({ day, value }));
  }, [bwSummary]);

  const deleteBw = (id) => {
    confirmAction({
      title: '删除这条体重',
      confirmText: '删除',
      destructive: true,
      onConfirm: () => onDeleteBodyWeight(id),
    });
  };

  // ---- Level 1: body parts list ----
  if (!part) {
    return (
      <StageView>
      <View style={{ flex: 1 }}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.content, bwOpen && styles.contentWithSheet]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={partDragIdx === null && !gridDragging}
      >
        <View style={styles.homeHead}>
          <Text style={styles.title}>健身</Text>
          <Pressable
            style={[styles.layoutBtn, showPartGrid && styles.layoutBtnActive]}
            onPress={togglePartLayout}
          >
            <Text style={[styles.layoutBtnText, showPartGrid && styles.layoutBtnTextActive]}>
              {showPartGrid ? '☰' : '▦'}
            </Text>
          </Pressable>
        </View>
        <Text style={styles.sub}>选个部位，记录动作和重量，追踪进步</Text>

        {showPartGrid ? (
          <DragGrid
            items={orderedParts}
            keyOf={(p) => p.key}
            cols={partGridCols}
            tileWidth={partTileWidth}
            gap={GAP}
            onDragStateChange={(dragging) => setGridDragging(dragging)}
            onPressItem={(p) => openPart(p)}
            onReorder={(keys) => {
              const byKey = {};
              for (const p of orderedParts) byKey[p.key] = p;
              savePartOrder(keys.map((k) => byKey[k]).filter(Boolean));
            }}
            renderTile={(p, isDragging) => (
              <View
                style={[
                  styles.partTile,
                  getShadow(),
                  { width: partTileWidth, backgroundColor: getTileColor(p.color) },
                  isDragging && styles.tileDragging,
                ]}
              >
                <Text style={styles.partTileEmoji}>{p.emoji}</Text>
                <Text style={styles.partTileLabel} numberOfLines={1}>{p.label}</Text>
              </View>
            )}
          />
        ) : (
          orderedParts.map((p, idx) => (
            <DraggablePartRow
              key={p.key}
              part={p}
              index={idx}
              listLen={orderedParts.length}
              isActive={partDragIdx === idx}
              dragIdx={partDragIdx}
              onPress={() => openPart(p)}
              onDragStart={onPartDragStart}
              onDragSwap={onPartDragSwap}
              onDragEnd={onPartDragEnd}
            />
          ))
        )}

        <Pressable
          onPress={() => {
            select();
            setBwDate(todayKey());
            setBwInput(bwSummary ? String(bwSummary.last.value) : '');
            setBwOpen(true);
          }}
        >
          <View style={[styles.partRow, styles.bwRow, getShadow()]}>
            <Text style={styles.partEmoji}>⚖️</Text>
            <Text style={styles.partLabel}>体重</Text>
            {bwSummary && (
              <View style={styles.partBadge}>
                <Text style={styles.partBadgeText}>{bwSummary.last.value}kg</Text>
              </View>
            )}
            <Text style={styles.partArrow}>›</Text>
          </View>
        </Pressable>

        <FitnessStats workouts={workouts} bodyWeight={bodyWeight} />
      </ScrollView>
      {bwOpen && (
        <BodyWeightSheet
          value={bwInput}
          onChange={setBwInput}
          summary={bwSummary}
          chartData={bwChartData}
          dateKey={bwDate}
          onChangeDate={setBwDate}
          onSave={addBw}
          onDelete={deleteBw}
          onClose={() => setBwOpen(false)}
        />
      )}
      </View>
      </StageView>
    );
  }

  // ---- Level 2: exercise list + quick record sheet ----
  if (part) {
    return (
      <StageView>
      <View style={{ flex: 1 }}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 20}
        >
        <ScrollView
          ref={exerciseScrollRef}
          style={styles.screen}
          contentContainerStyle={[styles.content, exercise && styles.contentWithSheet]}
          showsVerticalScrollIndicator={false}
          scrollEnabled={dragIdx === null && !gridDragging}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.l2Header}>
            <Pressable style={styles.back} onPress={() => setPart(null)}>
              <Text style={styles.backText}>‹ 部位</Text>
            </Pressable>
            <View style={styles.l2Actions}>
              {exList.length > 0 && !editMode && (
                <Pressable
                  style={[styles.layoutBtn, showExerciseGrid && styles.layoutBtnActive]}
                  onPress={toggleExerciseLayout}
                >
                  <Text style={[styles.layoutBtnText, showExerciseGrid && styles.layoutBtnTextActive]}>
                    {showExerciseGrid ? '☰' : '▦'}
                  </Text>
                </Pressable>
              )}
              {exList.length > 0 && (
                <Pressable
                  style={[styles.editBtn, editMode && styles.editBtnActive]}
                  onPress={() => { setEditMode(!editMode); setDragIdx(null); }}
                >
                  <Text style={[styles.editBtnText, editMode && styles.editBtnTextActive]}>
                    {editMode ? '完成' : '编辑'}
                  </Text>
                </Pressable>
              )}
            </View>
          </View>
          <View style={styles.titleRow}>
            <Text style={styles.titleEmoji}>{part.emoji}</Text>
            <Text style={styles.title}>{part.label}</Text>
          </View>
          <Text style={styles.sub}>
            {editMode ? '点动作改名称/记录方式 · 长按拖动排序 · 点 ✕ 删除' : '点击动作，底部快速记录'}
          </Text>

          {exList.length === 0 && (
            <Text style={styles.exEmpty}>还没有动作，下面加一个吧</Text>
          )}
          {showExerciseGrid ? (
            <DragGrid
              items={exList.map((name) => ({ name }))}
              keyOf={(it) => it.name}
              cols={exerciseGridCols}
              tileWidth={exerciseTileWidth}
              gap={GAP}
              onDragStateChange={(active) => setGridDragging(active)}
              onPressItem={(it) => openExercise(it.name)}
              onReorder={(keys) => onReorderExercises(part.key, keys)}
              renderTile={(it, isDragging) => {
                const name = it.name;
                const cnt = workouts.filter((w) => w.part === part.key && w.exercise === name).length;
                const mode = getExerciseMode(settings, part.key, name);
                const progress = exerciseProgressMeta(workouts, part.key, name, mode);
                return (
                  <ExerciseGridTile
                    name={name}
                    part={part}
                    width={exerciseTileWidth}
                    count={cnt}
                    progress={progress}
                    dragging={isDragging}
                  />
                );
              }}
            />
          ) : (
            exList.map((name, idx) => {
              const cnt = workouts.filter((w) => w.part === part.key && w.exercise === name).length;
              const mode = getExerciseMode(settings, part.key, name);
              const progress = exerciseProgressMeta(workouts, part.key, name, mode);
              return (
                <DraggableRow
                  key={name}
                  name={name}
                  index={idx}
                  listLen={exList.length}
                  editMode={editMode}
                  isActive={dragIdx === idx}
                  dragIdx={dragIdx}
                  onGripStart={onGripStart}
                  onGripSwap={onGripSwap}
                  onGripEnd={onGripEnd}
                  onPress={() => { editMode ? openEditExercise(name) : openExercise(name); }}
                  onDelete={() => confirmDeleteExercise(name)}
                  count={cnt}
                  progress={progress}
                />
              );
            })
          )}

          <Pressable
            style={styles.addExerciseBtn}
            onPress={() => {
              select();
              setCustomEx('');
              setCustomMode(DEFAULT_EXERCISE_MODE);
              setCreateOpen(true);
            }}
          >
            <Text style={styles.addExerciseText}>+ 添加动作</Text>
          </Pressable>
        </ScrollView>
        </KeyboardAvoidingView>

        {createOpen && (
          <ExerciseCreateSheet
            title={editingExercise ? '编辑动作' : '新增动作'}
            subtitle={editingExercise ? '修改名称和记录方式' : '设置这个动作要记录什么'}
            name={customEx}
            mode={customMode}
            onChangeName={setCustomEx}
            onChangeMode={setCustomMode}
            onSave={editingExercise ? saveEditedExercise : addCustom}
            onClose={() => {
              setCreateOpen(false);
              setEditingExercise(null);
            }}
          />
        )}

        {exercise && (
          <RecordSheet
            part={part}
            exercise={exercise}
            rec={rec}
            mode={exerciseMode}
            canSave={canSave}
            onChangeRec={changeRec}
            onSave={saveWorkout}
            onClose={() => setExercise(null)}
            dateKey={recordDate}
            onChangeDate={setRecordDate}
            workouts={workouts}
            onDeleteWorkout={deleteWorkoutEntry}
            onEditWorkout={setEditingWorkout}
          />
        )}

        {editingWorkout && (
          <EditWorkoutModal
            workout={editingWorkout}
            mode={getExerciseMode(settings, editingWorkout.part, editingWorkout.exercise)}
            onCancel={() => setEditingWorkout(null)}
            onSave={(next) => {
              onUpdateWorkout(next);
              setEditingWorkout(null);
            }}
          />
        )}
      </View>
      </StageView>
    );
  }

  return null;
}

const styles = createThemedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 14, paddingTop: 8, paddingBottom: 40, width: '100%', maxWidth: 460, alignSelf: 'center' },
  contentWithSheet: { paddingBottom: 260 },
  title: { fontSize: 26, fontWeight: '800', color: colors.text, marginBottom: 4 },
  homeHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  titleEmoji: { fontSize: 26 },
  sub: { fontSize: 14, color: colors.textSoft, marginBottom: 18 },
  back: { paddingVertical: 6, marginBottom: 2, alignSelf: 'flex-start' },
  backText: { fontSize: 16, fontWeight: '800', color: colors.primary },
  // Body weight panel（页面底部常驻）
  bwPanel: { backgroundColor: colors.card, borderRadius: 18, padding: 14, marginTop: 8, marginBottom: 16 },
  bwHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  bwTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  bwRow: { backgroundColor: getTileColor('#DCD3F2'), marginTop: 0 },
  bwHistTitle: { fontSize: 15, fontWeight: '800', color: colors.text, marginBottom: 4 },
  bwEmpty: { fontSize: 13, color: colors.textSoft, marginTop: 2 },
  bwInputRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  bwInput: {
    flex: 1, backgroundColor: colors.bg, borderRadius: 12, paddingHorizontal: 14,
    paddingVertical: 10, fontSize: 15, color: colors.text,
  },
  bwAddBtn: { backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  bwAddText: { color: colors.white, fontSize: 14, fontWeight: '800' },
  bwStatsRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bwLast: { fontSize: 14, fontWeight: '800', color: colors.text },
  bwDelta: { fontSize: 13, fontWeight: '800' },
  bwQuickBox: {
    backgroundColor: colors.bg, borderRadius: 16,
    padding: 12, marginBottom: 12,
  },
  bwSheetHistory: { marginTop: 2 },
  bwItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.line,
  },
  bwItemDay: { fontSize: 13, color: colors.textSoft },
  bwItemVal: { fontSize: 14, fontWeight: '800', color: colors.text, flex: 1, textAlign: 'right', marginRight: 12 },
  bwItemDel: { fontSize: 14, color: colors.textSoft, paddingHorizontal: 6 },

  // Part list
  partRow: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 18,
    height: PART_ROW_HEIGHT, paddingHorizontal: 18, marginBottom: GAP,
  },
  partRowMoving: { borderWidth: 2, borderColor: colors.primary, opacity: 0.96 },
  partEmoji: { fontSize: 28, marginRight: 14 },
  partLabel: { fontSize: 18, fontWeight: '800', color: colors.text, flex: 1 },
  partBadge: {
    backgroundColor: 'rgba(255,255,255,0.85)', borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 4, marginRight: 8,
  },
  partBadgeText: { fontSize: 12, fontWeight: '800', color: colors.text },
  partArrow: { fontSize: 24, fontWeight: '800', color: colors.text, opacity: 0.4 },
  partGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP, marginBottom: 6 },
  partTile: {
    aspectRatio: 1,
    borderRadius: 18,
    padding: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  partTileEmoji: { fontSize: 32, marginBottom: 10 },
  partTileLabel: { fontSize: 18, fontWeight: '900', color: colors.text },

  // Stats
  statsCard: {
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: 14,
    marginTop: 10,
    marginBottom: 12,
  },
  statsHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  statsTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  statsRange: { fontSize: 12, fontWeight: '800', color: colors.textSoft },
  statsEmpty: { fontSize: 13, color: colors.textSoft, lineHeight: 20, marginTop: 6 },
  statsGrid: { flexDirection: 'row', gap: 8 },
  statBox: {
    flex: 1,
    backgroundColor: colors.bg,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 8,
    minHeight: 78,
  },
  statValue: { fontSize: 22, fontWeight: '900', color: colors.text },
  statLabel: { fontSize: 12, fontWeight: '800', color: colors.textSoft, marginTop: 2 },
  statDelta: { fontSize: 10, fontWeight: '700', color: colors.primary, marginTop: 5 },
  partStats: { marginTop: 12, gap: 8 },
  partStatRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  partStatLabel: { width: 24, fontSize: 12, fontWeight: '800', color: colors.textSoft },
  partStatTrack: {
    flex: 1,
    height: 8,
    borderRadius: 999,
    backgroundColor: colors.bg,
    overflow: 'hidden',
  },
  partStatFill: { height: '100%', borderRadius: 999 },
  partStatValue: { width: 34, textAlign: 'right', fontSize: 11, fontWeight: '800', color: colors.textSoft },
  statsFoot: { marginTop: 12, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 9, gap: 4 },
  recordText: { fontSize: 12, fontWeight: '700', color: colors.textSoft },

  // Level 2 header
  l2Header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  l2Actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  layoutBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.line,
    alignItems: 'center', justifyContent: 'center',
  },
  layoutBtnActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  layoutBtnText: { fontSize: 18, fontWeight: '900', color: colors.textSoft, lineHeight: 20 },
  layoutBtnTextActive: { color: colors.primary },
  editBtn: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 14,
    backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.line,
  },
  editBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  editBtnText: { fontSize: 13, fontWeight: '800', color: colors.textSoft },
  editBtnTextActive: { color: colors.white },

  // Exercise list
  exRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card,
    borderRadius: 16, paddingVertical: 14, paddingHorizontal: 16, marginBottom: ROW_GAP,
    height: ROW_HEIGHT,
  },
  exRowMoving: { borderWidth: 2, borderColor: colors.primary, backgroundColor: colors.primarySoft },
  exTap: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  exMain: { flex: 1, minWidth: 0, paddingRight: 8 },
  exName: { fontSize: 16, fontWeight: '700', color: colors.text },
  exCnt: { fontSize: 13, color: colors.textSoft, marginRight: 8 },
  exProgress: { alignItems: 'flex-end', maxWidth: 150 },
  exProgressMain: { fontSize: 13, fontWeight: '900', color: colors.text },
  exProgressSub: { fontSize: 11, fontWeight: '800', color: colors.primary, marginTop: 2 },
  exProgressDetail: { fontSize: 11, fontWeight: '700', color: colors.textSoft, marginTop: 3 },
  exGrip: {
    width: 32, height: 32, borderRadius: 8, backgroundColor: colors.bg,
    alignItems: 'center', justifyContent: 'center', marginRight: 10,
    cursor: 'grab',
  },
  exGripText: { fontSize: 18, color: colors.textSoft },
  exDel: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginLeft: 6 },
  exDelText: { fontSize: 16, color: colors.danger, fontWeight: '700' },
  exEmpty: { fontSize: 14, color: colors.textSoft, marginTop: 4, marginBottom: 8 },
  exerciseGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP, marginBottom: 2 },
  exerciseTile: {
    aspectRatio: 1,
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: 12,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  tileDragging: { opacity: 0.9, transform: [{ scale: 1.06 }] },
  exerciseTileEmoji: { fontSize: 24 },
  exerciseTileName: { fontSize: 15, fontWeight: '800', color: colors.text, lineHeight: 19, textAlign: 'center' },
  exerciseTileMeta: { gap: 2, alignItems: 'center' },
  exerciseTileMain: { fontSize: 12, fontWeight: '900', color: colors.text },
  exerciseTileSub: { fontSize: 11, fontWeight: '800', color: colors.textSoft },
  addExerciseBtn: {
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 8,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.line,
    borderStyle: 'dashed',
  },
  addExerciseText: { fontSize: 15, fontWeight: '800', color: colors.textSoft },

  // Record sets
  logCard: { backgroundColor: colors.card, borderRadius: 22, padding: 16, marginBottom: 24 },
  setRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  setNo: {
    width: 26, height: 26, borderRadius: 13, backgroundColor: colors.primarySoft, color: colors.primary,
    textAlign: 'center', lineHeight: 26, fontWeight: '800', fontSize: 13, marginRight: 10,
  },
  setInput: {
    width: 68, backgroundColor: colors.bg, borderRadius: 12, paddingVertical: 10,
    textAlign: 'center', fontSize: 16, fontWeight: '700', color: colors.text,
  },
  setUnit: { marginHorizontal: 8, fontSize: 14, color: colors.textSoft, fontWeight: '700' },
  setSimpleText: { flex: 1, fontSize: 14, color: colors.textSoft, fontWeight: '800' },
  setDel: { marginLeft: 'auto', padding: 6 },
  setDelText: { fontSize: 16, color: colors.textSoft },
  addSet: {
    borderRadius: 14, paddingVertical: 12, alignItems: 'center', marginBottom: 12,
    borderWidth: 2, borderColor: colors.line, borderStyle: 'dashed',
  },
  addSetText: { fontSize: 15, fontWeight: '800', color: colors.textSoft },
  saveBtn: {
    backgroundColor: colors.line, borderRadius: 16, paddingVertical: 15, alignItems: 'center',
  },
  saveBtnActive: { backgroundColor: colors.primary },
  saveBtnText: { color: colors.white, fontSize: 16, fontWeight: '800' },
  saveBtnTextDisabled: { opacity: 0.5 },

  // Quick record sheet
  sheetOverlay: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
    justifyContent: 'flex-end', zIndex: 50,
  },
  sheetBackdrop: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
    backgroundColor: 'rgba(74,64,56,0.16)',
  },
  sheetKeyboard: { flex: 1, width: '100%', justifyContent: 'flex-end' },
  sheetCard: {
    width: '100%', maxWidth: 520, alignSelf: 'center',
    maxHeight: '82%', backgroundColor: colors.card,
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    paddingHorizontal: 14, paddingTop: 8, paddingBottom: 12,
  },
  sheetHandle: {
    width: 42, height: 4, borderRadius: 2, backgroundColor: colors.line,
    alignSelf: 'center', marginBottom: 10,
  },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: colors.text },
  sheetSub: { fontSize: 12, color: colors.textSoft, fontWeight: '700', marginTop: 2 },
  sheetClose: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: colors.bg,
    alignItems: 'center', justifyContent: 'center',
  },
  sheetCloseText: { fontSize: 16, color: colors.textSoft, fontWeight: '800' },
  sheetScroll: { maxHeight: 430, flexShrink: 1 },
  // 键盘弹起时：面板占满剩余空间，内部滚动区收缩，保证输入行和保存按钮都可见
  sheetCardLifted: { maxHeight: '100%' },
  bwSheetCard: { maxHeight: '92%' },
  bwSheetScroll: { maxHeight: 560, flexShrink: 1 },
  sheetScrollContent: { paddingBottom: 6 },
  sheetHistTitle: { fontSize: 14, fontWeight: '800', color: colors.textSoft, marginTop: 8 },
  sheetSave: {
    marginTop: 10, backgroundColor: colors.line, borderRadius: 16,
    paddingVertical: 15, alignItems: 'center',
  },
  sheetSaveActive: { backgroundColor: colors.primary },
  sheetSaveText: { color: colors.white, fontSize: 16, fontWeight: '800' },
  createSheetCard: { maxHeight: '90%' },
  createScroll: { flexShrink: 1 },
  createScrollContent: { paddingBottom: 4 },
  createInput: {
    backgroundColor: colors.bg,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 12,
  },
  createModeGrid: { gap: 8 },
  createCountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1.5,
    borderColor: colors.line,
  },
  createCountStepper: { width: 120 },
  createModeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1.5,
    borderColor: colors.line,
  },
  createModeItemOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  createModeCheck: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  createModeCheckOn: { backgroundColor: colors.primary },
  createModeCheckText: { fontSize: 14, fontWeight: '900', color: colors.textSoft },
  createModeCheckTextOn: { color: colors.white },
  createModeTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  createModeSub: { fontSize: 12, fontWeight: '700', color: colors.textSoft, marginTop: 2 },
  datePickBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.bg, borderRadius: 14,
    paddingHorizontal: 12, paddingVertical: 11,
    marginBottom: 10,
  },
  datePickLabel: { fontSize: 12, fontWeight: '800', color: colors.textSoft, marginRight: 10 },
  datePickText: { flex: 1, fontSize: 15, fontWeight: '800', color: colors.text },
  datePickArrow: { fontSize: 11, fontWeight: '800', color: colors.textSoft },
  sheetCalendarWrap: { marginBottom: 10 },
  quickSetRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.bg, borderRadius: 16,
    padding: 10, marginBottom: 10, gap: 8,
  },
  quickSetNo: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: colors.primarySoft, color: colors.primary,
    textAlign: 'center', lineHeight: 26, fontWeight: '800', fontSize: 13,
  },
  quickField: { flex: 1, minWidth: 0 },
  quickLabel: { fontSize: 11, color: colors.textSoft, fontWeight: '800', marginBottom: 5, textAlign: 'center' },
  quickSimpleText: { flex: 1, fontSize: 14, color: colors.textSoft, fontWeight: '800', textAlign: 'center' },
  stepper: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.card, borderRadius: 13,
    borderWidth: 1, borderColor: colors.line,
    overflow: 'hidden',
  },
  stepperBtn: {
    width: 34, height: 40, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  stepperBtnText: { fontSize: 20, color: colors.primary, fontWeight: '900', lineHeight: 22 },
  stepperInput: {
    flex: 1, minWidth: 38, height: 40, paddingHorizontal: 4,
    textAlign: 'center', fontSize: 16, fontWeight: '800', color: colors.text,
  },
  quickDel: {
    width: 28, height: 40, alignItems: 'center', justifyContent: 'center',
  },
  quickDelText: { fontSize: 15, color: colors.textSoft, fontWeight: '800' },
  quickAddSet: {
    borderRadius: 14, paddingVertical: 11, alignItems: 'center', marginBottom: 8,
    borderWidth: 2, borderColor: colors.line, borderStyle: 'dashed',
  },
  quickAddSetText: { fontSize: 14, fontWeight: '800', color: colors.textSoft },

  // Single-row record
  recordPanel: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: colors.bg, borderRadius: 16, padding: 12, marginBottom: 10,
  },
  recordField: { flex: 1, minWidth: 0 },
  recordFieldLabel: { fontSize: 11, color: colors.textSoft, fontWeight: '800', marginBottom: 6, textAlign: 'center' },
  recordSimpleHint: {
    fontSize: 14, color: colors.textSoft, fontWeight: '800', textAlign: 'center',
    backgroundColor: colors.bg, borderRadius: 16, padding: 18, marginBottom: 10,
  },

  // Chart
  chartWrap: { backgroundColor: colors.card, borderRadius: 18, padding: 14, marginBottom: 14 },
  chartLabel: { fontSize: 13, fontWeight: '800', color: colors.textSoft, marginBottom: 10 },
  chartBox: { flexDirection: 'row', alignItems: 'flex-end' },
  chartYMax: { fontSize: 10, color: colors.textSoft, fontWeight: '700', marginRight: 6, marginBottom: 14 },
  chartBars: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', height: CHART_HEIGHT },
  chartCol: { alignItems: 'center', width: BAR_WIDTH },
  chartVal: { fontSize: 10, fontWeight: '700', color: colors.text, marginBottom: 3 },
  chartBar: { width: BAR_WIDTH - 8, borderRadius: 6, minHeight: 4 },
  chartDay: { fontSize: 9, color: colors.textSoft, marginTop: 4 },

  // History
  histTitle: { fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: 4 },
  histEmpty: { fontSize: 14, color: colors.textSoft, marginTop: 10, lineHeight: 20 },
  histCard: { backgroundColor: colors.card, borderRadius: 18, padding: 14, marginTop: 10 },
  histHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  histDay: { fontSize: 14, fontWeight: '800', color: colors.text },
  histTopWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  histTop: { fontSize: 13, fontWeight: '800', color: colors.text },
  histTrend: { fontSize: 12, fontWeight: '800' },
  histSets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  histSet: { backgroundColor: colors.bg, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10 },
  histSetText: { fontSize: 13, fontWeight: '700', color: colors.text },
  histVol: { fontSize: 12, color: colors.textSoft, marginTop: 8 },
  histActions: { flexDirection: 'row', gap: 14, marginTop: 10, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 10 },
  histActBtn: { paddingHorizontal: 4, paddingVertical: 2 },
  histActText: { fontSize: 13, fontWeight: '800', color: colors.primary },
  histCompactList: { marginTop: 4, borderTopWidth: 1, borderTopColor: colors.line },
  histCompactRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.line,
  },
  histCompactMain: { flex: 1, minWidth: 0, paddingRight: 8 },
  histCompactHead: { fontSize: 12, fontWeight: '800', color: colors.text },
  histCompactSets: { fontSize: 12, color: colors.textSoft, marginTop: 2 },
  histCompactActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  histCompactAction: { fontSize: 12, fontWeight: '800', color: colors.primary },

  // Edit modal
  modalOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center', padding: 14, zIndex: 100,
  },
  modalCard: { backgroundColor: colors.card, borderRadius: 22, padding: 18, width: '100%', maxWidth: 420 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: 12 },
  modalLabel: { fontSize: 13, fontWeight: '800', color: colors.textSoft, marginBottom: 6, marginTop: 4 },
  modalTimeRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  modalDateInput: {
    flex: 1.4, backgroundColor: colors.bg, borderRadius: 12, paddingHorizontal: 12,
    paddingVertical: 10, fontSize: 14, color: colors.text,
  },
  modalDateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalDateText: { fontSize: 14, color: colors.text, fontWeight: '700' },
  modalDateArrow: { fontSize: 11, color: colors.textSoft, fontWeight: '800' },
  modalTimeInput: {
    flex: 1, backgroundColor: colors.bg, borderRadius: 12, paddingHorizontal: 12,
    paddingVertical: 10, fontSize: 14, color: colors.text,
  },
  modalCalendarWrap: { marginBottom: 8 },
  modalBtns: { flexDirection: 'row', gap: 10, marginTop: 6 },
  modalBtn: { flex: 1, paddingVertical: 12, borderRadius: 14, alignItems: 'center' },
  modalBtnGhost: { backgroundColor: colors.bg },
  modalBtnGhostText: { fontSize: 15, fontWeight: '800', color: colors.textSoft },
  modalBtnPrimary: { backgroundColor: colors.primary },
  modalBtnPrimaryText: { fontSize: 15, fontWeight: '800', color: colors.white },

  calBox: { backgroundColor: colors.bg, borderRadius: 16, padding: 12 },
  calHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  calNav: {
    width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.card,
  },
  calNavText: { fontSize: 18, color: colors.primary, fontWeight: '800' },
  calMonth: { fontSize: 15, fontWeight: '800', color: colors.text },
  calWeekRow: { flexDirection: 'row', marginBottom: 6 },
  calWeekCell: { flex: 1, textAlign: 'center', fontSize: 12, color: colors.textSoft, fontWeight: '700' },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calCell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  calDay: {
    width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center',
  },
  calDaySel: { backgroundColor: colors.primary },
  calDayDisabled: { opacity: 0.35 },
  calDayText: { fontSize: 13, color: colors.text, fontWeight: '700' },
  calDayTextSel: { color: colors.white },
  calDayTextDisabled: { color: colors.textSoft },
}));
