import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, Platform, ScrollView, useWindowDimensions,
  StatusBar as RNStatusBar, ActivityIndicator, Animated, BackHandler,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { colors, createThemedStyles, setThemeMode } from './src/theme';
import {
  loadActivities, saveActivities, loadLogs, saveLogs,
  loadWorkouts, saveWorkouts, loadExercises, saveExercises,
  loadMemory, saveMemory, loadBodyWeight, saveBodyWeight,
  loadMeasures, saveMeasures, loadSettings, saveSettings, newId,
  MEASURE_SITES,
} from './src/storage';
import { dayKey } from './src/date';
import HomeScreen from './src/screens/HomeScreen';
import CalendarScreen from './src/screens/CalendarScreen';
import FitnessScreen from './src/screens/FitnessScreen';
import SettingsScreen from './src/screens/SettingsScreen';

export default function App() {
  const { width: screenWidth } = useWindowDimensions();
  const pagerRef = useRef(null);
  const [tab, setTab] = useState('home');
  const [activities, setActivities] = useState([]);
  const [logs, setLogs] = useState([]);
  const [workouts, setWorkouts] = useState([]);
  const [exercises, setExercises] = useState({});
  const [memory, setMemory] = useState({});
  const [bodyWeight, setBodyWeight] = useState([]);
  const [measures, setMeasures] = useState([]);
  const [settings, setSettings] = useState({ fitnessPriorityMode: false, darkMode: false });
  const [loading, setLoading] = useState(true);
  const [fitnessResetSignal, setFitnessResetSignal] = useState(0);
  // 切换模式后待执行的分页滚动目标（等 pager 按新页数重新测量后再滚，避免被旧宽度夹断）
  // 日历页在网格上按下时临时锁定横向翻页，把左右滑动让给"切换月份"
  const [pagerEnabled, setPagerEnabled] = useState(true);

  // 提示条
  const [toast, setToast] = useState('');
  const toastY = useRef(new Animated.Value(-80)).current;
  const toastTimer = useRef(null);

  // 当前屏幕的返回处理器（由各屏幕注册）：返回 true 表示已消费返回键
  const screenBackRef = useRef(null);
  const registerBack = useCallback((fn) => { screenBackRef.current = fn; }, []);

  useEffect(() => {
    (async () => {
      const [a, l, w, e, m, bw, ms, s] = await Promise.all([
        loadActivities(),
        loadLogs(),
        loadWorkouts(),
        loadExercises(),
        loadMemory(),
        loadBodyWeight(),
        loadMeasures(),
        loadSettings(),
      ]);
      setActivities(a);
      setLogs(l);
      setWorkouts(w);
      setExercises(e);
      setMemory(m);
      setBodyWeight(bw);
      setMeasures(ms);
      setThemeMode(!!s.darkMode, s.lightTheme);
      setSettings(s);
      setTab(s.fitnessPriorityMode ? 'fitness' : 'home');
      setLoading(false);
    })();
  }, []);

  // 持久化：activities / logs / workouts 变化时写盘（loading 完成后）
  useEffect(() => { if (!loading) saveActivities(activities); }, [activities]);
  useEffect(() => { if (!loading) saveLogs(logs); }, [logs]);
  useEffect(() => { if (!loading) saveWorkouts(workouts); }, [workouts]);
  useEffect(() => { if (!loading) saveExercises(exercises); }, [exercises]);
  useEffect(() => { if (!loading) saveMemory(memory); }, [memory]);
  useEffect(() => { if (!loading) saveBodyWeight(bodyWeight); }, [bodyWeight]);
  useEffect(() => { if (!loading) saveMeasures(measures); }, [measures]);
  useEffect(() => { if (!loading) saveSettings(settings); }, [settings]);

  const changeSettings = useCallback((nextSettings) => {
    setSettings((prev) => {
      const resolved = typeof nextSettings === 'function' ? nextSettings(prev) : nextSettings;
      setThemeMode(!!resolved.darkMode, resolved.lightTheme);
      return resolved;
    });
  }, []);

  const tabs = settings.fitnessPriorityMode
    ? [
      { key: 'fitness', label: '健身', icon: '🏋️' },
      { key: 'calendar', label: '日历', icon: '📅' },
      { key: 'settings', label: '设置', icon: '⚙️' },
    ]
    : [
      { key: 'home', label: '记录', icon: '✨' },
      { key: 'fitness', label: '健身', icon: '🏋️' },
      { key: 'calendar', label: '日历', icon: '📅' },
      { key: 'settings', label: '设置', icon: '⚙️' },
    ];

  // 切换模式后当前 tab 可能在新 tabs 里不存在（如平时→健身时的"记录"），
  // 归位到主页签，保持底部高亮和 tab 状态一致
  useEffect(() => {
    if (!tabs.some((t) => t.key === tab)) {
      setTab(settings.fitnessPriorityMode ? 'fitness' : 'home');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.fitnessPriorityMode]);

  // Android 实体返回键：先让当前屏幕回退一级，其次从非首页切回首页，最后才退出应用
  useEffect(() => {
    const onBack = () => {
      if (screenBackRef.current && screenBackRef.current()) return true;
      const primaryTab = settings.fitnessPriorityMode ? 'fitness' : 'home';
      if (tab !== primaryTab) { setTab(primaryTab); return true; }
      return false;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => { if (sub && typeof sub.remove === 'function') sub.remove(); };
  }, [tab, settings]);

  const showToast = useCallback((msg) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    Animated.spring(toastY, { toValue: 0, useNativeDriver: true, friction: 7 }).start();
    toastTimer.current = setTimeout(() => {
      Animated.timing(toastY, { toValue: -80, duration: 220, useNativeDriver: true }).start();
    }, 1300);
  }, [toastY]);

  const recordActivity = useCallback((activity) => {
    setLogs((prev) => [...prev, { id: newId(), activityId: activity.id, ts: new Date().toISOString() }]);
    showToast(`${activity.emoji} 已记录「${activity.label}」`);
  }, [showToast]);

  // 删除某天某活动的最近一条记录
  const removeLog = useCallback((activityId, key) => {
    setLogs((prev) => {
      let target = null;
      for (const l of prev) {
        if (l.activityId === activityId && dayKey(l.ts) === key) {
          if (!target || l.ts > target.ts) target = l;
        }
      }
      if (!target) return prev;
      return prev.filter((l) => l.id !== target.id);
    });
  }, []);

  const addWorkout = useCallback((w) => {
    setWorkouts((prev) => [...prev, { id: newId(), ts: w.ts || new Date().toISOString(), ...w }]);
    showToast(`💪 已记录「${w.exercise}」`);
  }, [showToast]);

  const deleteWorkout = useCallback((id) => {
    setWorkouts((prev) => prev.filter((w) => w.id !== id));
  }, []);

  const deleteWorkouts = useCallback((ids) => {
    const idSet = new Set(ids);
    setWorkouts((prev) => prev.filter((w) => !idSet.has(w.id)));
  }, []);

  const updateWorkout = useCallback((next) => {
    setWorkouts((prev) => prev.map((w) => (w.id === next.id ? { ...w, ...next } : w)));
  }, []);

  const addBodyWeight = useCallback((value, ts) => {
    setBodyWeight((prev) => [...prev, { id: newId(), ts: ts || new Date().toISOString(), value }]);
    showToast(`⚖️ 体重 ${value}kg 已记录`);
  }, [showToast]);

  const deleteBodyWeight = useCallback((id) => {
    setBodyWeight((prev) => prev.filter((b) => b.id !== id));
  }, []);

  const addMeasure = useCallback((site, value, ts) => {
    setMeasures((prev) => [...prev, { id: newId(), ts: ts || new Date().toISOString(), site, value }]);
    const label = MEASURE_SITES.find((s) => s.key === site)?.label || '围度';
    showToast(`📐 ${label} ${value}cm 已记录`);
  }, [showToast]);

  const deleteMeasure = useCallback((id) => {
    setMeasures((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const deleteLogs = useCallback((ids) => {
    const idSet = new Set(ids);
    setLogs((prev) => prev.filter((l) => !idSet.has(l.id)));
  }, []);

  // 新增动作到某部位（去重）
  const addExercise = useCallback((partKey, name) => {
    setExercises((prev) => {
      const list = prev[partKey] || [];
      if (list.includes(name)) return prev;
      return { ...prev, [partKey]: [...list, name] };
    });
  }, []);

  // 从某部位删除动作（历史 workouts 不动，仍按动作名保留）
  const deleteExercise = useCallback((partKey, name) => {
    setExercises((prev) => {
      const list = prev[partKey] || [];
      return { ...prev, [partKey]: list.filter((n) => n !== name) };
    });
  }, []);

  // 动作排序
  const reorderExercises = useCallback((partKey, ordered) => {
    setExercises((prev) => ({ ...prev, [partKey]: ordered }));
  }, []);

  const renameExercise = useCallback((partKey, oldName, nextName) => {
    setExercises((prev) => {
      const list = prev[partKey] || [];
      if (!list.includes(oldName)) return prev;
      const renamed = list.map((name) => (name === oldName ? nextName : name));
      return { ...prev, [partKey]: Array.from(new Set(renamed)) };
    });
    setWorkouts((prev) => prev.map((w) => (
      w.part === partKey && w.exercise === oldName ? { ...w, exercise: nextName } : w
    )));
    setMemory((prev) => {
      const oldKey = `${partKey}:${oldName}`;
      const nextKey = `${partKey}:${nextName}`;
      if (!prev[oldKey]) return prev;
      const next = { ...prev, [nextKey]: prev[oldKey] };
      delete next[oldKey];
      return next;
    });
  }, []);

  // 更新动作记忆（保存上次的组数/重量/次数）
  const updateMemory = useCallback((key, data) => {
    setMemory((prev) => ({ ...prev, [key]: data }));
  }, []);

  const reorderActivities = useCallback((orderedIds) => {
    setActivities((prev) => {
      const byId = {};
      for (const a of prev) byId[a.id] = a;
      const next = orderedIds.map((id) => byId[id]).filter(Boolean);
      // 保底：万一有 id 没在新顺序里，追加到末尾
      for (const a of prev) if (!orderedIds.includes(a.id)) next.push(a);
      return next;
    });
  }, []);

  const addActivity = useCallback((a) => setActivities((p) => [...p, a]), []);
  const updateActivity = useCallback((a) => setActivities((p) => p.map((x) => (x.id === a.id ? a : x))), []);
  const deleteActivity = useCallback((id) => setActivities((p) => p.filter((x) => x.id !== id)), []);

  // 当前 tab 在本模式 tabs 里的下标（找不到时归 0），用于分页器定位
  const activeIdx = Math.max(0, tabs.findIndex((t) => t.key === tab));

  const switchTab = useCallback((key) => {
    if (key === 'fitness' && tab === 'fitness') {
      setFitnessResetSignal((prev) => prev + 1);
    }
    // 离开日历时清掉可能残留的分页锁，避免横向翻页被卡死
    if (key !== 'calendar') setPagerEnabled(true);
    setTab(key);
    const idx = tabs.findIndex((t) => t.key === key);
    if (idx >= 0 && pagerRef.current) {
      pagerRef.current.scrollTo({ x: idx * screenWidth, animated: true });
    }
  }, [tab, tabs, screenWidth]);

  const onPagerScroll = useCallback((e) => {
    const pageIndex = Math.round(e.nativeEvent.contentOffset.x / screenWidth);
    if (pageIndex >= 0 && pageIndex < tabs.length) {
      const key = tabs[pageIndex].key;
      if (key !== tab) {
        if (key !== 'calendar') setPagerEnabled(true);
        setTab(key);
      }
    }
  }, [screenWidth, tabs, tab]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingEmoji}>🌸</Text>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
    <SafeAreaView style={styles.root}>
      <StatusBar style={settings.darkMode ? 'light' : 'dark'} />

      <ScrollView
        // 切换健身优先模式时页数会变，直接 remount 分页器，让它以正确的
        // contentOffset 初始化，避免旧偏移被夹住而落到别的页或闪一下
        key={settings.fitnessPriorityMode ? 'fp' : 'normal'}
        ref={pagerRef}
        horizontal
        pagingEnabled
        scrollEnabled={pagerEnabled}
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onMomentumScrollEnd={onPagerScroll}
        contentOffset={{ x: activeIdx * screenWidth, y: 0 }}
        style={styles.body}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
      >
        {tabs.map((t) => (
          <View key={t.key} style={{ width: screenWidth, flex: 1 }}>
            {t.key === 'home' && (
              <HomeScreen
                activities={activities}
                logs={logs}
                onRecord={recordActivity}
                onReorder={reorderActivities}
                onAdd={addActivity}
                onUpdate={updateActivity}
                onDelete={deleteActivity}
                registerBack={registerBack}
              />
            )}
            {t.key === 'fitness' && (
              <FitnessScreen
                workouts={workouts}
                exercises={exercises}
                memory={memory}
                bodyWeight={bodyWeight}
                measures={measures}
                settings={settings}
                onChangeSettings={changeSettings}
                onAddWorkout={addWorkout}
                onDeleteWorkout={deleteWorkout}
                onUpdateWorkout={updateWorkout}
                onAddExercise={addExercise}
                onDeleteExercise={deleteExercise}
                onReorderExercises={reorderExercises}
                onRenameExercise={renameExercise}
                onUpdateMemory={updateMemory}
                onAddBodyWeight={addBodyWeight}
                onDeleteBodyWeight={deleteBodyWeight}
                onAddMeasure={addMeasure}
                onDeleteMeasure={deleteMeasure}
                registerBack={registerBack}
                resetSignal={fitnessResetSignal}
              />
            )}
            {t.key === 'calendar' && (
              <CalendarScreen
                activities={activities}
                logs={logs}
                workouts={workouts}
                onRemoveLog={removeLog}
                onDeleteWorkout={deleteWorkout}
                onDeleteLogs={deleteLogs}
                onDeleteWorkouts={deleteWorkouts}
                onUpdateWorkout={updateWorkout}
                onUpdateActivity={updateActivity}
                onLockPager={setPagerEnabled}
              />
            )}
            {t.key === 'settings' && (
              <SettingsScreen
                settings={settings}
                onChangeSettings={changeSettings}
              />
            )}
          </View>
        ))}
      </ScrollView>

      {/* 顶部提示条 */}
      <Animated.View style={[styles.toast, { transform: [{ translateY: toastY }], pointerEvents: 'none' }]}>
        <Text style={styles.toastText}>{toast}</Text>
      </Animated.View>

      {/* 底部 Tab */}
      <View style={styles.tabbar}>
        {tabs.map((t) => {
          const on = tab === t.key;
          return (
            <Pressable key={t.key} style={styles.tab} onPress={() => switchTab(t.key)}>
              <Text style={[styles.tabIcon, on && styles.tabIconOn]}>{t.icon}</Text>
              <Text style={[styles.tabLabel, on && styles.tabLabelOn]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = createThemedStyles((colors) => ({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingTop: Platform.OS === 'android' ? RNStatusBar.currentHeight : 0,
  },
  body: { flex: 1 },
  loading: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  loadingEmoji: { fontSize: 48, marginBottom: 16 },
  tabbar: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingBottom: Platform.OS === 'ios' ? 20 : 8,
    paddingTop: 8,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabIcon: { fontSize: 22, opacity: 0.4 },
  tabIconOn: { opacity: 1 },
  tabLabel: { fontSize: 11, color: colors.textSoft, marginTop: 2, fontWeight: '600' },
  tabLabelOn: { color: colors.primary, fontWeight: '800' },
  toast: {
    position: 'absolute',
    top: (Platform.OS === 'android' ? RNStatusBar.currentHeight || 0 : 44) + 8,
    alignSelf: 'center',
    backgroundColor: colors.text,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    maxWidth: '86%',
  },
  toastText: { color: colors.white, fontSize: 14, fontWeight: '700' },
}));
