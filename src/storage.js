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
const K_SETTINGS = 'dlt_settings';

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

export async function loadActivities() {
  const data = store.read(K_ACTIVITIES, null);
  if (data === null) {
    store.write(K_ACTIVITIES, DEFAULT_ACTIVITIES);
    return DEFAULT_ACTIVITIES;
  }
  return data;
}

export async function saveActivities(activities) {
  store.write(K_ACTIVITIES, activities);
}

export async function loadLogs() {
  return store.read(K_LOGS, []);
}

export async function saveLogs(logs) {
  store.write(K_LOGS, logs);
}

// ---- 健身模块 ----
// 训练记录结构：{ id, ts(ISO), part, exercise, sets:[{ weight, reps }] }
export async function loadWorkouts() {
  return store.read(K_WORKOUTS, []);
}

export async function saveWorkouts(workouts) {
  store.write(K_WORKOUTS, workouts);
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
    store.write(K_EXERCISES, DEFAULT_EXERCISES);
    return DEFAULT_EXERCISES;
  }
  // 兜底：补齐后来新增的部位 key
  const merged = { ...data };
  for (const p of BODY_PARTS) if (!merged[p.key]) merged[p.key] = DEFAULT_EXERCISES[p.key] || [];
  return merged;
}

export async function saveExercises(map) {
  store.write(K_EXERCISES, map);
}

// ---- 动作记忆（记住每个动作最近一次的组数/重量/次数）----
export async function loadMemory() {
  return store.read(K_MEMORY, {});
}

export async function saveMemory(mem) {
  store.write(K_MEMORY, mem);
}

// ---- 体重记录 ----
export async function loadBodyWeight() {
  return store.read(K_BODYWEIGHT, []);
}

export async function saveBodyWeight(list) {
  store.write(K_BODYWEIGHT, list);
}

// ---- 应用设置 ----
const DEFAULT_SETTINGS = {
  fitnessPriorityMode: false,
  darkMode: false,
  lightTheme: 'coral',
  fitnessPartLayout: 'list',
  fitnessExerciseLayout: 'list',
  fitnessPartOrder: [],
  fitnessExerciseModes: {},
};

export async function loadSettings() {
  const data = store.read(K_SETTINGS, null);
  if (data === null) {
    store.write(K_SETTINGS, DEFAULT_SETTINGS);
    return DEFAULT_SETTINGS;
  }
  return { ...DEFAULT_SETTINGS, ...data };
}

export async function saveSettings(settings) {
  store.write(K_SETTINGS, { ...DEFAULT_SETTINGS, ...settings });
}
