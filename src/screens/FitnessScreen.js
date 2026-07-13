import React, { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, Pressable, KeyboardAvoidingView, Platform, useWindowDimensions,
} from 'react-native';
import { select, success } from '../haptics';
import { confirmAction } from '../confirm';
import { colors, getShadow, getTileColor } from '../theme';
import { BODY_PARTS } from '../storage';
import { dayKey, todayKey, friendlyDay, hhmm } from '../date';
import {
  GAP,
  DEFAULT_REPS,
  DEFAULT_SET_COUNT,
  DEFAULT_EXERCISE_MODE,
  clampSetCount,
  normalizeExerciseMode,
  exerciseModeKey,
  getExerciseMode,
  makeDatedIso,
  maxExerciseWeight,
  exerciseProgressMeta,
  formatStepValue,
} from '../fitness/utils';
import { StageView } from '../fitness/fields';
import { FitnessStats } from '../fitness/charts';
import {
  RecordSheet,
  BodyWeightSheet,
  ExerciseCreateSheet,
  EditWorkoutModal,
} from '../fitness/sheets';
import {
  DraggableRow,
  ExerciseGridTile,
  PartGridTile,
  DragGrid,
  DraggablePartRow,
} from '../fitness/drag';
import styles from '../fitness/styles';

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
  // 动作列表固定为列表视图（网格开关已去掉）
  const showExerciseGrid = false;
  const exerciseContentWidth = Math.max(0, Math.min(460, viewportWidth) - 28);
  const exerciseGridCols = 3;
  const exerciseTileWidth = Math.max(
    72,
    Math.floor((exerciseContentWidth - GAP * (exerciseGridCols - 1)) / exerciseGridCols),
  );
  const partLayout = settings?.fitnessPartLayout === 'grid' ? 'grid' : 'list';
  const showPartGrid = partLayout === 'grid';
  const partGridCols = 3;
  const partTileWidth = Math.max(
    72,
    Math.floor((exerciseContentWidth - GAP * (partGridCols - 1)) / partGridCols),
  );

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
    if (!part || !name) return;
    select();
    // 先打开编辑层，不急着拆掉当前部位上下文，避免偶发 part/exercise 竞态
    setEditingExercise(name);
    setCustomEx(name);
    setCustomMode(getExerciseMode(settings, part.key, name));
    setCreateOpen(true);
  };

  const saveEditedExercise = () => {
    if (!editingExercise || !part) return;
    const oldName = editingExercise;
    const nextName = customEx.trim();
    if (!nextName) return;
    if (nextName !== oldName && onRenameExercise) {
      onRenameExercise(part.key, oldName, nextName);
      removeExerciseMode(part.key, oldName);
    }
    saveExerciseMode(part.key, nextName, customMode || DEFAULT_EXERCISE_MODE);
    const savedMode = customMode || DEFAULT_EXERCISE_MODE;
    setEditingExercise(null);
    setCreateOpen(false);
    setCustomEx('');
    setCustomMode(DEFAULT_EXERCISE_MODE);
    // 保存后回到记录面板，而不是直接把面板撤走
    openExercise(nextName, savedMode);
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
          <Pressable style={styles.layoutBtn} onPress={togglePartLayout}>
            <Text style={styles.layoutBtnText}>
              {showPartGrid ? '☰' : '⊞'}
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
          <View style={[styles.partRow, styles.bwRow, showPartGrid && styles.bwRowGrid, getShadow()]}>
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

        <FitnessStats workouts={workouts} bodyWeight={bodyWeight} settings={settings} />
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
            {editMode ? '点动作改名称/记录方式 · 长按拖动排序 · 点 ✕ 删除' : '点击动作记录 · 长按进入编辑'}
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
                  onEnterEditMode={() => { setEditMode(true); setDragIdx(null); }}
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

        {/* 编辑动作时盖住记录面板，避免两层同时抢手势；取消后回到记录 */}
        {exercise && !createOpen && !editingWorkout && (
          <RecordSheet
            part={part}
            exercise={exercise}
            rec={rec}
            mode={exerciseMode}
            canSave={canSave}
            onChangeRec={changeRec}
            onSave={saveWorkout}
            onClose={() => setExercise(null)}
            onEditExercise={() => openEditExercise(exercise)}
            dateKey={recordDate}
            onChangeDate={setRecordDate}
            workouts={workouts}
            onDeleteWorkout={deleteWorkoutEntry}
            onEditWorkout={setEditingWorkout}
          />
        )}

        {createOpen && (
          <ExerciseCreateSheet
            title={editingExercise ? '编辑动作' : '新增动作'}
            subtitle={editingExercise ? '修改名称和记录方式' : '设置这个动作要记录什么'}
            name={customEx}
            mode={customMode || DEFAULT_EXERCISE_MODE}
            onChangeName={setCustomEx}
            onChangeMode={setCustomMode}
            onSave={editingExercise ? saveEditedExercise : addCustom}
            onClose={() => {
              setCreateOpen(false);
              setEditingExercise(null);
              setCustomEx('');
              setCustomMode(DEFAULT_EXERCISE_MODE);
            }}
          />
        )}

        {editingWorkout && (
          <EditWorkoutModal
            workout={editingWorkout}
            mode={getExerciseMode(settings, editingWorkout.part, editingWorkout.exercise)}
            onCancel={() => setEditingWorkout(null)}
            onSave={(next) => {
              if (onUpdateWorkout) onUpdateWorkout(next);
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

