import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput } from 'react-native';
import { select } from '../haptics';
import { colors, getShadow } from '../theme';
import { dayKey, todayKey, friendlyDay } from '../date';
import { useKeyboardHeight } from '../useKeyboard';
import MiniCalendar from '../components/MiniCalendar';
import {
  DEFAULT_EXERCISE_MODE,
  clampSetCount,
  modeSummary,
} from './utils';
import { SetRow, StepperField } from './fields';
import { WeightChart } from './charts';
import { ExerciseHistory } from './history';
import styles from './styles';

function RecordSheet({
  part, exercise, rec, mode, canSave,
  onChangeRec, onSave, onClose, onEditExercise,
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
            <Pressable
              style={{ flex: 1 }}
              onPress={onEditExercise}
              disabled={!onEditExercise}
              hitSlop={6}
            >
              <View style={styles.sheetTitleRow}>
                <Text style={styles.sheetTitle}>{exercise}</Text>
                {onEditExercise && <Text style={styles.sheetTitleEdit}>编辑</Text>}
              </View>
              <Text style={styles.sheetSub}>
                {part.label} · {modeSummary(mode)}
              </Text>
            </Pressable>
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
                  withHaptics
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
                  withHaptics
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

export { RecordSheet, BodyWeightSheet, ExerciseCreateSheet, EditWorkoutModal };
