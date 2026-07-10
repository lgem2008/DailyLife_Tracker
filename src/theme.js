// 全局配色与样式常量（可爱圆润风）
import { Platform, StyleSheet } from 'react-native';

// 浅色模式共用的中性色（文字/危险色/卡片/白）
const lightBase = {
  card: '#FFFFFF',
  text: '#4A4038',      // 柔和深棕
  textSoft: '#9B8F85',  // 次要文字
  danger: '#F27C7C',
  white: '#FFFFFF',
};

// 浅色模式的多套配色：切换时主色 + 背景氛围（bg/line/primarySoft）一起变
const lightThemes = {
  coral: {
    key: 'coral', label: '珊瑚粉', swatch: '#FF9A8B',
    colors: { ...lightBase, bg: '#FFF9F5', line: '#F0E8E0', primary: '#FF9A8B', primarySoft: '#FFE9E4' },
  },
  mint: {
    key: 'mint', label: '薄荷绿', swatch: '#3FB489',
    colors: { ...lightBase, bg: '#F2FBF6', line: '#DEEFE5', primary: '#3FB489', primarySoft: '#D9F2E5' },
  },
  sky: {
    key: 'sky', label: '天空蓝', swatch: '#4FA6DC',
    colors: { ...lightBase, bg: '#F2F9FD', line: '#DEEAF2', primary: '#4FA6DC', primarySoft: '#DAEDF9' },
  },
  lavender: {
    key: 'lavender', label: '薰衣草', swatch: '#9179D2',
    colors: { ...lightBase, bg: '#F8F5FD', line: '#E8E2F2', primary: '#9179D2', primarySoft: '#EBE3F7' },
  },
  apricot: {
    key: 'apricot', label: '杏橙', swatch: '#EF9B4E',
    colors: { ...lightBase, bg: '#FFFAF2', line: '#F2E8DA', primary: '#EF9B4E', primarySoft: '#FBEAD3' },
  },
};

const DEFAULT_LIGHT_THEME = 'coral';

// 供设置页色板使用（不含具体 colors，仅 key/label/swatch）
export const LIGHT_THEMES = Object.values(lightThemes).map(({ colors: _c, ...meta }) => meta);

const darkColors = {
  bg: '#171412',
  card: '#24201D',
  text: '#F6EEE7',
  textSoft: '#B7AAA0',
  line: '#39312B',
  primary: '#FF9A8B',
  primarySoft: '#3B2926',
  danger: '#FF8F8F',
  white: '#FFFFFF',
};

const lightShadow = Platform.select({
  web: {
    boxShadow: '0px 4px 8px rgba(176, 137, 104, 0.15)',
  },
  default: {
    shadowColor: '#B08968',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
});

const darkShadow = Platform.select({
  web: {
    boxShadow: '0px 4px 10px rgba(0, 0, 0, 0.34)',
  },
  default: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 4,
  },
});

export const colors = { ...lightThemes[DEFAULT_LIGHT_THEME].colors };

let colorMode = 'light';
let lightThemeKey = DEFAULT_LIGHT_THEME;

export function getShadow() {
  return colorMode === 'dark' ? darkShadow : lightShadow;
}

function currentLightColors() {
  return (lightThemes[lightThemeKey] || lightThemes[DEFAULT_LIGHT_THEME]).colors;
}

// 同时设定深浅模式与浅色配色；两者变化都会体现在样式缓存 key 上
export function setThemeMode(isDark, themeKey) {
  colorMode = isDark ? 'dark' : 'light';
  if (themeKey && lightThemes[themeKey]) lightThemeKey = themeKey;
  Object.assign(colors, isDark ? darkColors : currentLightColors());
}

export function getLightThemeKey() {
  return lightThemeKey;
}

export function isDarkMode() {
  return colorMode === 'dark';
}

function hexToRgb(hex) {
  const normalized = String(hex || '').replace('#', '').trim();
  if (normalized.length !== 6) return null;
  const value = parseInt(normalized, 16);
  if (!Number.isFinite(value)) return null;
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function rgbToHex({ r, g, b }) {
  const toHex = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function mixHex(a, b, amount) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  if (!ca || !cb) return a;
  return rgbToHex({
    r: ca.r * (1 - amount) + cb.r * amount,
    g: ca.g * (1 - amount) + cb.g * amount,
    b: ca.b * (1 - amount) + cb.b * amount,
  });
}

function hexToHsl(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  let { r, g, b } = rgb;
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToHex({ h, s, l }) {
  h /= 360; s /= 100; l /= 100;
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  let r;
  let g;
  let b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return rgbToHex({ r: r * 255, g: g * 255, b: b * 255 });
}

// 深色模式下：保留色相，转成深邃有质感的暗色调（而不是简单调灰）
export function getTileColor(color) {
  if (colorMode !== 'dark') return color;
  const hsl = hexToHsl(color);
  if (!hsl) return color;
  return hslToHex({
    h: hsl.h,
    s: Math.min(58, Math.max(40, hsl.s)),
    l: 30,
  });
}

// 深色模式下 tile 上小徽章的背景（白色徽章在暗色调上会很刺眼）
export function getTileBadgeColor() {
  return colorMode === 'dark' ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.85)';
}

export function createThemedStyles(factory) {
  const cache = {};
  const styleKeys = Object.keys(factory(colors));
  const styles = {};
  for (const key of styleKeys) {
    Object.defineProperty(styles, key, {
      enumerable: true,
      configurable: false,
      get() {
        // 深色只有一套；浅色按配色 key 分别缓存，切配色能重建样式
        const cacheKey = colorMode === 'dark' ? 'dark' : `light:${lightThemeKey}`;
        if (!cache[cacheKey]) cache[cacheKey] = StyleSheet.create(factory(colors));
        return cache[cacheKey][key];
      },
    });
  }
  return styles;
}

// 按钮可选的粉彩色板（新建活动时循环取色）
export const palette = [
  '#FFB5A7', // 珊瑚
  '#FCD5A8', // 杏橙
  '#FFE59E', // 奶黄
  '#B8E0C4', // 薄荷绿
  '#A7D8E8', // 天蓝
  '#C3B8E8', // 薰衣草
  '#F7B7D2', // 樱粉
  '#D6CDBE', // 燕麦
];

// 常用 emoji（管理页选择器用）
export const emojiChoices = [
  '🏃', '🚶', '🏋️', '🧘', '🚴', '⚽', '🏊', '💪',
  '💧', '☕', '🍎', '🥗', '🍚', '🍜', '🍔', '🍰',
  '😴', '🛌', '⏰', '🌙', '☀️', '🌱', '🌸', '🍀',
  '📖', '📚', '✍️', '💻', '🎨', '🎵', '🎮', '📷',
  '🧹', '🧺', '🛁', '🦷', '💊', '💰', '🛒', '🚗',
  '❤️', '😊', '😭', '🔥', '⭐', '✅', '🎉', '📝',
];
