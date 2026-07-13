import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, Animated, Alert, TextInput, Modal,
  PanResponder,
} from 'react-native';
import { confirmAction } from '../confirm';
import { colors, getShadow, createThemedStyles, getTileColor } from '../theme';
import ActivityEditModal from '../components/ActivityEditModal';
import MiniCalendar from '../components/MiniCalendar';
import {
  dayKey, todayKey, friendlyDay, hhmm, monthGrid, monthLabel, WEEK_SHORT,
} from '../date';
import { BODY_PARTS } from '../storage';
import { useKeyboardHeight } from '../useKeyboard';

const partMap = {};
for (const p of BODY_PARTS) partMap[p.key] = p;

function pad2(n) {
  return String(n).padStart(2, '0');
}

function dateKeyOf(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function WorkoutEditModal({ visible, workout, onClose, onSave }) {
  const [sets, setSets] = useState([]);
  const [dateText, setDateText] = useState('');

  useEffect(() => {
    if (!visible || !workout) return;
    setSets((workout.sets || []).map((s) => ({
      weight: s.weight != null ? String(s.weight) : '',
      reps: s.reps != null ? String(s.reps) : '',
    })));
    setDateText(dateKeyOf(workout.ts));
  }, [visible, workout]);

  const kbHeight = useKeyboardHeight();

  if (!workout) return null;

  const part = partMap[workout.part];
  const showWeight = (workout.sets || []).some((s) => s.weight != null && s.weight !== '');

  const updateSet = (idx, patch) => {
    setSets((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };
  const addSet = () => {
    setSets((prev) => {
      const last = prev[prev.length - 1];
      return [...prev, { weight: last ? last.weight : '', reps: last ? last.reps : '' }];
    });
  };
  const removeSet = (idx) => {
    setSets((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));
  };

  const save = () => {
    const cleanSets = sets
      .map((s) => ({
        weight: s.weight.trim(),
        reps: s.reps.trim(),
      }))
      .filter((s) => s.weight !== '' || s.reps !== '');
    if (cleanSets.length === 0) {
      Alert.alert('提示', '至少保留一组记录');
      return;
    }
    let ts = workout.ts;
    const m = dateText.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      const orig = new Date(workout.ts);
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), orig.getHours(), orig.getMinutes(), orig.getSeconds());
      if (!Number.isNaN(d.getTime())) ts = d.toISOString();
    }
    onSave({ id: workout.id, sets: cleanSets, ts });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.editBackdrop}>
        <View style={[styles.editSheet, kbHeight > 0 && styles.editSheetLifted, kbHeight > 0 && { paddingBottom: kbHeight + 20 }]}>
          <View style={styles.editHandle} />
          <Text style={styles.editTitle}>{workout.exercise}</Text>
          <Text style={styles.editSub}>{part ? part.label : '记录'} · {sets.length} 组</Text>

          <Text style={styles.editFieldLabel}>日期</Text>
          <MiniCalendar
            selected={dateText}
            maxKey={todayKey()}
            onPick={setDateText}
          />

          <Text style={styles.editFieldLabel}>每组</Text>
          <ScrollView style={styles.editSetBox} keyboardShouldPersistTaps="handled">
            {sets.map((s, idx) => (
              <View key={idx} style={styles.editSetRow}>
                <Text style={styles.editSetNo}>{idx + 1}</Text>
                {showWeight && (
                  <View style={styles.editSetField}>
                    <TextInput
                      style={styles.editSetInput}
                      value={s.weight}
                      onChangeText={(v) => updateSet(idx, { weight: v.replace(/[^0-9.]/g, '') })}
                      placeholder="重量"
                      placeholderTextColor={colors.textSoft}
                      keyboardType="decimal-pad"
                    />
                    <Text style={styles.editSetUnit}>kg</Text>
                  </View>
                )}
                <View style={styles.editSetField}>
                  <TextInput
                    style={styles.editSetInput}
                    value={s.reps}
                    onChangeText={(v) => updateSet(idx, { reps: v.replace(/[^0-9]/g, '') })}
                    placeholder="次数"
                    placeholderTextColor={colors.textSoft}
                    keyboardType="number-pad"
                  />
                  <Text style={styles.editSetUnit}>{showWeight ? '次' : '个'}</Text>
                </View>
                <Pressable style={styles.editSetDel} onPress={() => removeSet(idx)} hitSlop={8}>
                  <Text style={styles.editSetDelText}>✕</Text>
                </Pressable>
              </View>
            ))}
          </ScrollView>

          <Pressable style={styles.editAddSet} onPress={addSet}>
            <Text style={styles.editAddSetText}>+ 加一组</Text>
          </Pressable>

          <View style={styles.editActions}>
            <Pressable style={[styles.editBtn, styles.editBtnGhost]} onPress={onClose}>
              <Text style={styles.editBtnGhostText}>取消</Text>
            </Pressable>
            <Pressable style={[styles.editBtn, styles.editBtnPrimary]} onPress={save}>
              <Text style={styles.editBtnPrimaryText}>保存</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function CalendarScreen({
  activities,
  logs,
  workouts = [],
  onRemoveLog,
  onDeleteWorkout,
  onDeleteLogs,
  onDeleteWorkouts,
  onUpdateWorkout,
  onUpdateActivity,
  onLockPager,
}) {
  const today = todayKey();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  // PanResponder 只创建一次，用 ref 读取最新状态，避免闭包捕获旧值
  const yearRef = useRef(year);
  const monthRef = useRef(month);
  const onLockPagerRef = useRef(onLockPager);
  yearRef.current = year;
  monthRef.current = month;
  onLockPagerRef.current = onLockPager;
  const [selected, setSelected] = useState(today);
  const [expanded, setExpanded] = useState(false);
  const [selectedBatchKeys, setSelectedBatchKeys] = useState([]);
  const [detailActionMode, setDetailActionMode] = useState(false);
  const [editingWorkout, setEditingWorkout] = useState(null);
  const [editingActivity, setEditingActivity] = useState(null);
  const expandAnim = useRef(new Animated.Value(0)).current;
  // 整个手指按在日历网格区期间锁住外层分页（不按 pan 生命周期分段，避免 touch/pan 交错提前解锁）
  const pagerLockedRef = useRef(false);

  useEffect(() => {
    Animated.timing(expandAnim, {
      toValue: expanded ? 1 : 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [expanded, expandAnim]);

  const stepMonth = (dir) => {
    const m = monthRef.current;
    const y = yearRef.current;
    if (dir > 0) {
      if (m === 11) { setYear(y + 1); setMonth(0); } else setMonth(m + 1);
    } else if (m === 0) { setYear(y - 1); setMonth(11); } else setMonth(m - 1);
  };

  const lockPager = () => {
    if (pagerLockedRef.current) return;
    pagerLockedRef.current = true;
    if (onLockPagerRef.current) onLockPagerRef.current(false);
  };

  const unlockPager = () => {
    if (!pagerLockedRef.current) return;
    pagerLockedRef.current = false;
    if (onLockPagerRef.current) onLockPagerRef.current(true);
  };

  // 组件卸载时恢复分页（例如切换健身优先模式导致 remount）
  useEffect(() => () => {
    if (pagerLockedRef.current && onLockPagerRef.current) onLockPagerRef.current(true);
    pagerLockedRef.current = false;
  }, []);

  // 手指落到网格区就锁外层分页；抬手再放行。详情区不锁，左右滑仍可切 Tab
  const onCalendarTouchStart = () => {
    lockPager();
  };

  const onCalendarTouchEnd = () => {
    unlockPager();
  };

  // 仅网格区：横向切月，纵向展开/收起
  // capture + 低阈值：不必先“按住日期格”再滑，轻扫即可抢走 Pressable
  const calendarPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_, gs) => {
        const absX = Math.abs(gs.dx);
        const absY = Math.abs(gs.dy);
        return (absX > 4 && absX > absY * 0.9) || (absY > 6 && absY > absX * 1.05);
      },
      onMoveShouldSetPanResponderCapture: (_, gs) => {
        const absX = Math.abs(gs.dx);
        const absY = Math.abs(gs.dy);
        return (absX > 4 && absX > absY * 0.9) || (absY > 6 && absY > absX * 1.05);
      },
      onPanResponderGrant: () => {
        lockPager();
      },
      onPanResponderRelease: (_, gs) => {
        const absX = Math.abs(gs.dx);
        const absY = Math.abs(gs.dy);

        if (absX >= 24 && absX > absY * 1.05) {
          stepMonth(gs.dx < 0 ? 1 : -1);
        } else if (absY >= 22 && absY > absX * 1.15) {
          // 下滑展开，上滑收起
          setExpanded(gs.dy > 0);
        }
        unlockPager();
      },
      onPanResponderTerminate: () => {
        unlockPager();
      },
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
    })
  ).current;

  const actMap = useMemo(() => {
    const map = {};
    for (const item of activities) map[item.id] = item;
    return map;
  }, [activities]);

  const dayEmojis = useMemo(() => {
    const map = {};
    const workoutPartSeen = {};
    for (const item of logs) {
      const key = dayKey(item.ts);
      const activity = actMap[item.activityId];
      (map[key] = map[key] || []).push({ type: 'emoji', v: activity ? activity.emoji : '❓' });
    }
    for (const workout of workouts) {
      const key = dayKey(workout.ts);
      const part = partMap[workout.part];
      const seenKey = `${key}:${workout.part}`;
      if (workoutPartSeen[seenKey]) continue;
      workoutPartSeen[seenKey] = true;
      (map[key] = map[key] || []).push({ type: 'emoji', v: part ? part.emoji : '🏋️' });
    }
    return map;
  }, [logs, workouts, actMap]);

  const cells = useMemo(() => monthGrid(year, month), [year, month]);

  const prevMonth = () => {
    if (month === 0) { setYear(year - 1); setMonth(11); } else setMonth(month - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setYear(year + 1); setMonth(0); } else setMonth(month + 1);
  };

  const detail = useMemo(() => {
    const acts = {};
    for (const item of logs) {
      if (dayKey(item.ts) !== selected) continue;
      if (!acts[item.activityId]) acts[item.activityId] = { count: 0, last: item.ts, logIds: [] };
      acts[item.activityId].count += 1;
      acts[item.activityId].logIds.push(item.id);
      if (item.ts > acts[item.activityId].last) acts[item.activityId].last = item.ts;
    }
    const actItems = Object.keys(acts)
      .map((aid) => ({
        key: `a:${aid}`,
        kind: 'activity',
        aid,
        ...acts[aid],
      }))
      .sort((a, b) => (a.last < b.last ? 1 : -1));

    const wks = workouts
      .filter((item) => dayKey(item.ts) === selected)
      .sort((a, b) => (a.ts < b.ts ? 1 : -1))
      .map((item) => {
        const top = item.sets.reduce((mx, s) => Math.max(mx, Number(s.weight) || 0), 0);
        return {
          ...item,
          key: `w:${item.id}`,
          kind: 'workout',
          top,
          setCount: item.sets.length,
        };
      });

    return { actItems, wks };
  }, [logs, workouts, selected]);

  const hasDetail = detail.actItems.length > 0 || detail.wks.length > 0;
  const allDetailItems = [...detail.actItems, ...detail.wks];

  useEffect(() => {
    setSelectedBatchKeys([]);
    setDetailActionMode(false);
  }, [selected]);

  // 选中项可能因为记录删除而失效，过滤掉已经不存在的 key
  useEffect(() => {
    setSelectedBatchKeys((prev) => {
      const valid = new Set(allDetailItems.map((item) => item.key));
      const next = prev.filter((key) => valid.has(key));
      return next.length === prev.length ? prev : next;
    });
  }, [logs, workouts, selected]);

  const deleteActivityRow = (item) => {
    const activity = actMap[item.aid];
    const title = activity ? `${activity.emoji} ${activity.label}` : '未知活动';
    confirmAction({
      title: `删除「${title}」`,
      message: item.count > 1 ? `这一天有 ${item.count} 次，删除会移除最近的一次。` : '',
      confirmText: '删除',
      destructive: true,
      onConfirm: () => onRemoveLog(item.aid, selected),
    });
  };

  const deleteWorkoutRow = (workout) => {
    confirmAction({
      title: `删除「${workout.exercise}」`,
      confirmText: '删除',
      destructive: true,
      onConfirm: () => onDeleteWorkout && onDeleteWorkout(workout.id),
    });
  };

  const toggleBatchSelect = (key) => {
    setSelectedBatchKeys((prev) => (
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]
    ));
  };

  const openDetailActions = () => {
    setDetailActionMode(true);
  };

  const closeDetailActions = () => {
    setDetailActionMode(false);
    setSelectedBatchKeys([]);
  };

  const deleteSelectedBatch = () => {
    const picked = allDetailItems.filter((item) => selectedBatchKeys.includes(item.key));
    const logIds = picked.filter((item) => item.kind === 'activity').flatMap((item) => item.logIds);
    const workoutIds = picked.filter((item) => item.kind === 'workout').map((item) => item.id);

    if (picked.length === 0) return;

    confirmAction({
      title: '批量删除记录',
      message: `删除选中的 ${picked.length} 项记录？活动汇总会把这一天对应的同类记录一起删掉。`,
      confirmText: '删除',
      destructive: true,
      onConfirm: () => {
        if (logIds.length > 0 && onDeleteLogs) onDeleteLogs(logIds);
        if (workoutIds.length > 0 && onDeleteWorkouts) onDeleteWorkouts(workoutIds);
        setSelectedBatchKeys([]);
      },
    });
  };

  const cellHeight = expandAnim.interpolate({ inputRange: [0, 1], outputRange: [46, 72] });
  const compactOpacity = expandAnim.interpolate({ inputRange: [0, 0.4, 1], outputRange: [1, 0.2, 0] });
  const expandedOpacity = expandAnim.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 0.3, 1] });

  return (
    <>
    <View style={styles.screen}>
      <View style={styles.calendarHeader}>
        <View style={styles.monthBar}>
          <Pressable style={styles.navBtn} onPress={prevMonth} hitSlop={10}>
            <Text style={styles.navText}>‹</Text>
          </Pressable>
          <Text style={styles.monthText}>{monthLabel(year, month)}</Text>
          <Pressable style={styles.navBtn} onPress={nextMonth} hitSlop={10}>
            <Text style={styles.navText}>›</Text>
          </Pressable>
        </View>

        <View style={styles.weekRow}>
          {WEEK_SHORT.map((w, i) => (
            <Text key={w} style={[styles.weekCell, (i === 0 || i === 6) && styles.weekEnd]}>{w}</Text>
          ))}
        </View>

        {/* 仅网格区：按下即锁分页；轻扫即可切月/展开收起（不抢详情区） */}
        <View
          style={styles.calendarGestureZone}
          onTouchStart={onCalendarTouchStart}
          onTouchEnd={onCalendarTouchEnd}
          onTouchCancel={onCalendarTouchEnd}
          {...calendarPanResponder.panHandlers}
        >
          <View style={[styles.grid, getShadow()]}>
            {cells.map((cell, i) => {
              const isToday = cell.key === today;
              const isSel = cell.key === selected;
              const emojis = cell.key ? (dayEmojis[cell.key] || []) : [];
              return (
                <Pressable
                  key={i}
                  style={styles.dayCell}
                  disabled={!cell.inMonth}
                  onPress={() => cell.key && setSelected(cell.key)}
                  // 拉长按压判定，避免轻扫被当成点选日期
                  delayPressIn={160}
                >
                  <Animated.View style={[styles.dayInner, { height: cellHeight }, isSel && styles.daySel, isToday && !isSel && styles.dayToday]}>
                    {!cell.inMonth ? null : (
                      <>
                        <Animated.View style={[styles.compactLayer, { opacity: compactOpacity }]}>
                          {emojis.length > 0 ? (
                            <View style={styles.compactDots}>
                              {emojis.slice(0, 2).map((e, k) => (
                                <Text key={k} style={styles.compactDot}>{e.v}</Text>
                              ))}
                              {emojis.length > 2 && (
                                <Text style={[styles.compactMore, isSel && { color: colors.white }]}>·</Text>
                              )}
                            </View>
                          ) : (
                            <Text style={[styles.compactDayNum, isSel && styles.dayNumSel, isToday && !isSel && styles.dayNumToday]}>
                              {cell.day}
                            </Text>
                          )}
                        </Animated.View>
                        <Animated.View style={[styles.expandedLayer, { opacity: expandedOpacity }]}>
                          <Text style={[styles.dayNum, isSel && styles.dayNumSel, isToday && !isSel && styles.dayNumToday]}>
                            {cell.day}
                          </Text>
                          {emojis.length > 0 && (
                            <View style={styles.dots}>
                              {emojis.slice(0, 3).map((e, k) => (
                                <Text key={k} style={styles.dot}>{e.v}</Text>
                              ))}
                              {emojis.length > 3 && <Text style={[styles.dotMore, isSel && { color: colors.white }]}>+{emojis.length - 3}</Text>}
                            </View>
                          )}
                        </Animated.View>
                      </>
                    )}
                  </Animated.View>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            style={styles.swipeHandle}
            onPress={() => setExpanded((prev) => !prev)}
          >
            <View style={styles.swipeHandleTouch}>
              <View style={styles.swipeHandleBar} />
              <Text style={styles.swipeHint}>{expanded ? '上滑日历收起，信息更紧凑' : '下滑日历展开，显示更多日期信息'}</Text>
            </View>
          </Pressable>
        </View>
      </View>

      {/* 仅详情区滚动，避免和日历上下滑手势抢占 */}
      <ScrollView
        style={styles.detailScroll}
        contentContainerStyle={styles.detailContent}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.detailHead}>
          <Text style={styles.detailTitle}>{friendlyDay(selected)}</Text>
          {detailActionMode && (
            <View style={styles.batchActions}>
              {selectedBatchKeys.length > 0 && (
                <Pressable onPress={() => setSelectedBatchKeys([])}>
                  <Text style={styles.batchGhost}>清空</Text>
                </Pressable>
              )}
              {selectedBatchKeys.length > 0 && (
                <Pressable onPress={deleteSelectedBatch}>
                  <Text style={styles.batchDanger}>删除选中 ({selectedBatchKeys.length})</Text>
                </Pressable>
              )}
              <Pressable onPress={closeDetailActions}>
                <Text style={styles.batchPrimary}>完成</Text>
              </Pressable>
            </View>
          )}
        </View>

        {!hasDetail ? (
          <Text style={styles.detailEmpty}>这天还没有记录</Text>
        ) : (
          <View style={styles.detailCard}>
            <View style={styles.detailRows}>
              {detail.actItems.map((item) => {
                const activity = actMap[item.aid];
                const picked = selectedBatchKeys.includes(item.key);
                const color = activity ? getTileColor(activity.color) : colors.line;
                return (
                  <Pressable
                    key={item.key}
                    style={[styles.detailRow, detailActionMode && picked && styles.detailRowPicked]}
                    onLongPress={openDetailActions}
                    delayLongPress={350}
                  >
                    {detailActionMode && (
                      <Pressable
                        style={[styles.checkbox, picked && styles.checkboxOn]}
                        onPress={() => toggleBatchSelect(item.key)}
                        hitSlop={8}
                      >
                        {picked && <Text style={styles.checkboxTick}>✓</Text>}
                      </Pressable>
                    )}
                    <View style={[styles.detailDot, { backgroundColor: color }]} />
                    <View style={styles.detailMain}>
                      <Text style={styles.detailName}>{activity ? activity.label : '已删除'}</Text>
                      <Text style={styles.detailMeta}>
                        {item.count > 1 ? `${item.count} 次` : '1 次'} · {hhmm(item.last)}
                      </Text>
                    </View>
                    {detailActionMode && activity && onUpdateActivity && (
                      <Pressable style={styles.rowIconBtn} onPress={() => setEditingActivity(activity)} hitSlop={6}>
                        <Text style={styles.rowIconEdit}>✎</Text>
                      </Pressable>
                    )}
                    {detailActionMode && (
                      <Pressable style={styles.rowIconBtn} onPress={() => deleteActivityRow(item)} hitSlop={6}>
                        <Text style={styles.rowIconDel}>🗑</Text>
                      </Pressable>
                    )}
                  </Pressable>
                );
              })}
              {detail.wks.map((item) => {
                const part = partMap[item.part];
                const picked = selectedBatchKeys.includes(item.key);
                const color = part ? getTileColor(part.color) : colors.line;
                const meta = `${item.setCount} 组${item.top > 0 ? ` · ${item.top}kg` : ''}`;
                return (
                  <Pressable
                    key={item.key}
                    style={[styles.detailRow, detailActionMode && picked && styles.detailRowPicked]}
                    onLongPress={openDetailActions}
                    delayLongPress={350}
                  >
                    {detailActionMode && (
                      <Pressable
                        style={[styles.checkbox, picked && styles.checkboxOn]}
                        onPress={() => toggleBatchSelect(item.key)}
                        hitSlop={8}
                      >
                        {picked && <Text style={styles.checkboxTick}>✓</Text>}
                      </Pressable>
                    )}
                    <View style={[styles.detailDot, { backgroundColor: color }]} />
                    <View style={styles.detailMain}>
                      <Text style={styles.detailName}>{item.exercise}</Text>
                      <Text style={styles.detailMeta}>
                        {part ? `${part.label} · ${meta}` : meta} · {hhmm(item.ts)}
                      </Text>
                    </View>
                    {detailActionMode && (
                      <>
                        <Pressable style={styles.rowIconBtn} onPress={() => setEditingWorkout(item)} hitSlop={6}>
                          <Text style={styles.rowIconEdit}>✎</Text>
                        </Pressable>
                        <Pressable style={styles.rowIconBtn} onPress={() => deleteWorkoutRow(item)} hitSlop={6}>
                          <Text style={styles.rowIconDel}>🗑</Text>
                        </Pressable>
                      </>
                    )}
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.hint}>
              {detailActionMode ? '左边勾选可批量删除，右边小图标可单独编辑或删除' : '长按记录显示编辑和删除'}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>

    <WorkoutEditModal
      visible={!!editingWorkout}
      workout={editingWorkout}
      onClose={() => setEditingWorkout(null)}
      onSave={(next) => {
        if (onUpdateWorkout) onUpdateWorkout(next);
        setEditingWorkout(null);
      }}
    />

    <ActivityEditModal
      visible={!!editingActivity}
      initial={editingActivity}
      onClose={() => setEditingActivity(null)}
      onSave={(next) => {
        if (onUpdateActivity) onUpdateActivity(next);
        setEditingActivity(null);
      }}
    />
    </>
  );
}

const styles = createThemedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  calendarHeader: {
    paddingHorizontal: 14,
    paddingTop: 4,
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
  },
  detailScroll: { flex: 1 },
  detailContent: {
    paddingHorizontal: 14,
    paddingBottom: 40,
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
  },

  monthBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 4, marginBottom: 14 },
  navBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  navText: { fontSize: 28, fontWeight: '800', color: colors.primary },
  monthText: { fontSize: 20, fontWeight: '800', color: colors.text, minWidth: 120, textAlign: 'center' },

  weekRow: { flexDirection: 'row', marginBottom: 6 },
  weekCell: { flex: 1, textAlign: 'center', fontSize: 13, fontWeight: '700', color: colors.textSoft },
  weekEnd: { color: colors.primary },

  calendarGestureZone: {
    // 包住网格 + 收起把手，保证上下滑手势命中区域足够
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 6,
    marginBottom: 6,
  },
  dayCell: { width: `${100 / 7}%`, padding: 2 },
  dayInner: {
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  daySel: { backgroundColor: colors.primary },
  dayToday: { backgroundColor: colors.primarySoft },
  compactLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expandedLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 8,
    alignItems: 'center',
  },
  dayNum: { fontSize: 14, fontWeight: '700', color: colors.text },
  dayNumSel: { color: colors.white, fontWeight: '800' },
  dayNumToday: { color: colors.primary, fontWeight: '800' },
  dots: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 4, paddingHorizontal: 2 },
  dot: { fontSize: 10, lineHeight: 12 },
  dotMore: { fontSize: 8, color: colors.textSoft, fontWeight: '800', lineHeight: 12 },
  compactDots: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  compactDot: { fontSize: 14, lineHeight: 16 },
  compactMore: { fontSize: 12, color: colors.textSoft, fontWeight: '800', marginLeft: 1 },
  compactDayNum: { fontSize: 12, fontWeight: '600', color: colors.textSoft },
  swipeHandle: { marginBottom: 4 },
  swipeHandleTouch: { alignItems: 'center', paddingTop: 2, paddingBottom: 10 },
  swipeHandleBar: {
    width: 36,
    height: 5,
    borderRadius: 999,
    backgroundColor: colors.line,
    marginBottom: 8,
  },
  swipeHint: { fontSize: 11, color: colors.textSoft, textAlign: 'center', opacity: 0.75 },

  detailHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  detailTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  batchActions: { flexDirection: 'row', gap: 14 },
  batchPrimary: { fontSize: 13, fontWeight: '800', color: colors.primary },
  batchGhost: { fontSize: 13, fontWeight: '800', color: colors.textSoft },
  batchDanger: { fontSize: 13, fontWeight: '800', color: colors.danger },
  batchDisabled: { opacity: 0.35 },
  detailEmpty: { fontSize: 14, color: colors.textSoft },
  detailCard: { backgroundColor: colors.card, borderRadius: 18, paddingVertical: 6, paddingHorizontal: 12 },
  detailRows: {},
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 46,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  detailRowPicked: {
    backgroundColor: colors.primarySoft,
    borderRadius: 12,
    paddingHorizontal: 8,
    borderBottomColor: 'transparent',
  },
  detailDot: { width: 8, height: 28, borderRadius: 999, marginRight: 10 },
  detailMain: { flex: 1, minWidth: 0 },
  detailName: { fontSize: 14, fontWeight: '800', color: colors.text },
  detailMeta: { fontSize: 12, color: colors.textSoft, marginTop: 2, fontWeight: '700' },
  detailTime: { fontSize: 12, color: colors.textSoft, marginLeft: 10, fontWeight: '700' },
  hint: { fontSize: 11, color: colors.textSoft, marginTop: 10 },
  checkbox: {
    width: 22, height: 22, borderRadius: 6, marginRight: 10,
    borderWidth: 2, borderColor: colors.line,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkboxTick: { color: colors.white, fontSize: 13, fontWeight: '900', lineHeight: 15 },
  rowIconBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', marginLeft: 2 },
  rowIconEdit: { fontSize: 16, color: colors.primary, fontWeight: '800' },
  rowIconDel: { fontSize: 15 },

  // Workout edit sheet
  editBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  editSheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    paddingBottom: 34,
    maxHeight: '90%',
  },
  editSheetLifted: { maxHeight: '100%' },
  editHandle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.line,
    alignSelf: 'center',
    marginBottom: 14,
  },
  editTitle: { fontSize: 20, fontWeight: '800', color: colors.text },
  editSub: { fontSize: 13, fontWeight: '700', color: colors.textSoft, marginTop: 4, marginBottom: 8 },
  editFieldLabel: { fontSize: 13, fontWeight: '700', color: colors.textSoft, marginTop: 12, marginBottom: 8 },
  editTimeInput: {
    backgroundColor: colors.card,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  editSetBox: { maxHeight: 260 },
  editSetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 8,
    gap: 8,
  },
  editSetNo: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.primarySoft,
    color: colors.primary,
    textAlign: 'center',
    lineHeight: 26,
    fontWeight: '800',
    fontSize: 13,
  },
  editSetField: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  editSetInput: {
    flex: 1,
    minWidth: 0,
    backgroundColor: colors.bg,
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 10,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  editSetUnit: { fontSize: 13, color: colors.textSoft, fontWeight: '700' },
  editSetDel: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  editSetDelText: { fontSize: 15, color: colors.textSoft, fontWeight: '800' },
  editAddSet: {
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 6,
    borderWidth: 2,
    borderColor: colors.line,
    borderStyle: 'dashed',
  },
  editAddSetText: { fontSize: 14, fontWeight: '800', color: colors.textSoft },
  editActions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  editBtn: { flex: 1, borderRadius: 16, paddingVertical: 14, alignItems: 'center' },
  editBtnGhost: { backgroundColor: colors.card },
  editBtnGhostText: { fontSize: 16, fontWeight: '700', color: colors.textSoft },
  editBtnPrimary: { backgroundColor: colors.primary },
  editBtnPrimaryText: { fontSize: 16, fontWeight: '800', color: colors.white },

  }));
