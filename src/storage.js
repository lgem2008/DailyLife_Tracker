import { Platform } from 'react-native';
import { palette } from './theme';

const DEFAULT_ACTIVITIES = [
  { id: 'a1', emoji: '💧', label: '喝水', color: palette[4] },
  { id: 'a2', emoji: '🏃', label: '运动', color: palette[0] },
  { id: 'a3', emoji: '📖', label: '阅读', color: palette[3] },
  { id: 'a4', emoji: '😴', label: '早睡', color: palette[5] },
  { id: 'a5', emoji: '🧘', label: '冥想', color: palette[6] },
  { id: 'a6', emoji: '☕', label: '咖啡', color: palette[1] },
];

export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

const K_ACTIVITIES = 'dlt_activities';
const K_LOGS = 'dlt_logs';
const K_WORKOUTS = 'dlt_workouts';
const K_EXERCISES = 'dlt_exercises';
const K_MEMORY = 'dlt_exercise_memory';
const K_BODYWEIGHT = 'dlt_bodyweight';
const K_MEASURES = 'dlt_measures';
const K_SETTINGS = 'dlt_settings';

// 数据 schema 版本：后续结构变更可据此迁移
export const STORAGE_SCHEMA_VERSION = 1;
const META_KEY = '__meta';

const DEFAULT_SETTINGS = {
  fitnessPriorityMode: false,
  darkMode: false,
  lightTheme: 'coral',
  fitnessPartLayout: 'list',
  fitnessExerciseLayout: 'list',
  fitnessPartOrder: [],
  fitnessExerciseModes: {},
};

// ---- Web：用 localStorage ----
const webStore = {
  read(key, fallback) {
    try {
      const raw = window.localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (e) {
      console.warn(`[storage] read ${key} failed`, e);
      return fallback;
    }
  },
  write(key, data) {
    try {
      window.localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
      console.warn(`[storage] write ${key} failed`, e);
    }
  },
};

// ---- 原生：用 expo-file-system ----
let nativeStore = null;
if (Platform.OS !== 'web') {
  const { File, Directory, Paths } = require('expo-file-system');
  const DATA_DIR = new Directory(Paths.document, 'dlt_data');
  const files = {
    [K_ACTIVITIES]: new File(DATA_DIR, 'activities.json'),
    [K_LOGS]: new File(DATA_DIR, 'logs.json'),
    [K_WORKOUTS]: new File(DATA_DIR, 'workouts.json'),
    [K_EXERCISES]: new File(DATA_DIR, 'exercises.json'),
    [K_MEMORY]: new File(DATA_DIR, 'memory.json'),
    [K_BODYWEIGHT]: new File(DATA_DIR, 'bodyweight.json'),
    [K_MEASURES]: new File(DATA_DIR, 'measures.json'),
    [K_SETTINGS]: new File(DATA_DIR, 'settings.json'),
  };
  const ensureDir = () => {
    if (!DATA_DIR.exists) DATA_DIR.create();
  };
  nativeStore = {
    read(key, fallback) {
      try {
        ensureDir();
        const f = files[key];
        if (f.exists) {
          const raw = f.textSync();
          return raw ? JSON.parse(raw) : fallback;
        }
      } catch (e) {
        console.warn(`[storage] read ${key} failed`, e);
      }
      return fallback;
    },
    write(key, data) {
      try {
        ensureDir();
        const f = files[key];
        if (!f.exists) f.create();
        f.write(JSON.stringify(data));
      } catch (e) {
        console.warn(`[storage] write ${key} failed`, e);
      }
    },
  };
}

const store = Platform.OS === 'web' ? webStore : nativeStore;

// 写入防抖：快速连续更新只落盘最后一次，降低主线程 IO
const writeTimers = Object.create(null);
const WRITE_DEBOUNCE_MS = 120;

function writeNow(key, data) {
  store.write(key, data);
}

function writeDebounced(key, data) {
  if (writeTimers[key]) clearTimeout(writeTimers[key]);
  writeTimers[key] = setTimeout(() => {
    writeTimers[key] = null;
    writeNow(key, data);
  }, WRITE_DEBOUNCE_MS);
}

// 立即刷盘（可选，给卸载/切后台用）
export function flushStorage() {
  for (const key of Object.keys(writeTimers)) {
    if (writeTimers[key]) {
      clearTimeout(writeTimers[key]);
      writeTimers[key] = null;
    }
  }
}

function ensureSchemaVersion() {
  const settings = store.read(K_SETTINGS, null);
  if (settings && typeof settings === 'object' && settings[META_KEY]?.schemaVersion) return;
  // 老数据没有 meta：写入当前版本，不改业务字段
  if (settings && typeof settings === 'object') {
    store.write(K_SETTINGS, {
      ...settings,
      [META_KEY]: { schemaVersion: STORAGE_SCHEMA_VERSION },
    });
  }
}

function withMeta(settings) {
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    [META_KEY]: {
      ...(settings?.[META_KEY] || {}),
      schemaVersion: STORAGE_SCHEMA_VERSION,
    },
  };
}

export async function loadActivities() {
  ensureSchemaVersion();
  const data = store.read(K_ACTIVITIES, null);
  if (data === null) {
    writeNow(K_ACTIVITIES, DEFAULT_ACTIVITIES);
    return DEFAULT_ACTIVITIES;
  }
  return data;
}

export async function saveActivities(activities) {
  writeDebounced(K_ACTIVITIES, activities);
}

export async function loadLogs() {
  return store.read(K_LOGS, []);
}

export async function saveLogs(logs) {
  writeDebounced(K_LOGS, logs);
}

// ---- 健身模块 ----
// 训练记录结构：{ id, ts(ISO), part, exercise, sets:[{ weight, reps }] }
export async function loadWorkouts() {
  return store.read(K_WORKOUTS, []);
}

export async function saveWorkouts(workouts) {
  writeDebounced(K_WORKOUTS, workouts);
}

export const BODY_PARTS = [
  { key: 'chest', label: '胸', emoji: '🏋️', color: palette[0] },
  { key: 'back', label: '背', emoji: '🏊', color: palette[4] },
  { key: 'shoulder', label: '肩', emoji: '🤸', color: palette[3] },
  { key: 'legs', label: '腿', emoji: '🦵', color: palette[5] },
  { key: 'arms', label: '手', emoji: '💪', color: palette[1] },
  { key: 'abs', label: '腹', emoji: '🧘', color: palette[6] },
];

// 每个部位的默认动作（首次使用时写入，之后可自由增删）
const DEFAULT_EXERCISES = {
  chest: ['卧推', '哑铃卧推', '上斜卧推', '双杠臂屈伸', '飞鸟', '器械夹胸'],
  back: ['引体向上', '高位下拉', '杠铃划船', '哑铃划船', '坐姿划船', '硬拉'],
  shoulder: ['站姿推举', '哑铃推举', '侧平举', '前平举', '俯身飞鸟', '面拉'],
  legs: ['深蹲', '腿举', '腿屈伸', '腿弯举', '箭步蹲', '提踵'],
  arms: ['杠铃弯举', '哑铃弯举', '锤式弯举', '三头下压', '窄距卧推', '臂屈伸'],
  abs: ['卷腹', '仰卧起坐', '悬垂举腿', '平板支撑', '俄罗斯转体', '卷腹机'],
};

// 动作列表结构：{ [partKey]: [动作名, ...] }，可增删，本地持久化
export async function loadExercises() {
  const data = store.read(K_EXERCISES, null);
  if (data === null) {
    writeNow(K_EXERCISES, DEFAULT_EXERCISES);
    return DEFAULT_EXERCISES;
  }
  // 兜底：补齐后来新增的部位 key
  const merged = { ...data };
  for (const p of BODY_PARTS) if (!merged[p.key]) merged[p.key] = DEFAULT_EXERCISES[p.key] || [];
  return merged;
}

export async function saveExercises(map) {
  writeDebounced(K_EXERCISES, map);
}

// ---- 动作记忆（记住每个动作最近一次的组数/重量/次数）----
export async function loadMemory() {
  return store.read(K_MEMORY, {});
}

export async function saveMemory(mem) {
  writeDebounced(K_MEMORY, mem);
}

// ---- 体重记录 ----
export async function loadBodyWeight() {
  return store.read(K_BODYWEIGHT, []);
}

export async function saveBodyWeight(list) {
  writeDebounced(K_BODYWEIGHT, list);
}

// ---- 身体维度（围度）----
// 记录结构：{ id, ts(ISO), site, value(cm) }
// goal: 'up' 越大越好（肌肉），'down' 越小越好（腰腹）
export const MEASURE_SITES = [
  { key: 'neck', label: '颈围', short: '颈', goal: 'up', step: 0.5 },
  { key: 'shoulder', label: '肩宽', short: '肩', goal: 'up', step: 0.5 },
  { key: 'chest', label: '胸围', short: '胸', goal: 'up', step: 0.5 },
  { key: 'waist', label: '腰围', short: '腰', goal: 'down', step: 0.5 },
  { key: 'hip', label: '臀围', short: '臀', goal: 'up', step: 0.5 },
  { key: 'armL', label: '左臂围', short: '左臂', goal: 'up', step: 0.5 },
  { key: 'armR', label: '右臂围', short: '右臂', goal: 'up', step: 0.5 },
  { key: 'forearmL', label: '左小臂', short: '左小臂', goal: 'up', step: 0.5 },
  { key: 'forearmR', label: '右小臂', short: '右小臂', goal: 'up', step: 0.5 },
  { key: 'thighL', label: '左腿围', short: '左腿', goal: 'up', step: 0.5 },
  { key: 'thighR', label: '右腿围', short: '右腿', goal: 'up', step: 0.5 },
  { key: 'calfL', label: '左小腿', short: '左小腿', goal: 'up', step: 0.5 },
  { key: 'calfR', label: '右小腿', short: '右小腿', goal: 'up', step: 0.5 },
];

export async function loadMeasures() {
  const data = store.read(K_MEASURES, []);
  return Array.isArray(data) ? data : [];
}

export async function saveMeasures(list) {
  writeDebounced(K_MEASURES, list);
}

// ---- 应用设置 ----
export async function loadSettings() {
  ensureSchemaVersion();
  const data = store.read(K_SETTINGS, null);
  if (data === null) {
    const initial = withMeta(DEFAULT_SETTINGS);
    writeNow(K_SETTINGS, initial);
    return { ...DEFAULT_SETTINGS };
  }
  const { [META_KEY]: _meta, ...rest } = data;
  return { ...DEFAULT_SETTINGS, ...rest };
}

export async function saveSettings(settings) {
  // 业务层不应依赖 __meta；写盘时补上 schema 版本
  const { [META_KEY]: _drop, ...rest } = settings || {};
  writeDebounced(K_SETTINGS, withMeta(rest));
}
