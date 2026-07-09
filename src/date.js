// 日期相关小工具
const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

// 本地日期键 YYYY-MM-DD（按设备时区）
export function dayKey(d) {
  const dt = typeof d === 'string' ? new Date(d) : d;
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayKey() {
  return dayKey(new Date());
}

// 友好的日期标题：今天 / 昨天 / 7月4日 周五
export function friendlyDay(key) {
  const today = todayKey();
  const d = new Date(key + 'T00:00:00');
  const yKey = dayKey(new Date(Date.now() - 86400000));
  if (key === today) return '今天';
  if (key === yKey) return '昨天';
  return `${d.getMonth() + 1}月${d.getDate()}日 ${WEEK[d.getDay()]}`;
}

export function greeting() {
  const h = new Date().getHours();
  if (h < 6) return '夜深了 🌙';
  if (h < 11) return '早上好 ☀️';
  if (h < 14) return '中午好 🍚';
  if (h < 18) return '下午好 ☕';
  return '晚上好 🌆';
}

// HH:MM
export function hhmm(iso) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export const WEEK_SHORT = ['日', '一', '二', '三', '四', '五', '六'];

// 生成某年某月的日历网格（6 行 × 7 列），周日起。
// 返回 [{ key:'YYYY-MM-DD'|null, day:number|null, inMonth:bool }]
export function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const startDow = first.getDay(); // 0=周日
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  // 前置空格（上月尾巴，这里只留空）
  for (let i = 0; i < startDow; i++) cells.push({ key: null, day: null, inMonth: false });
  for (let d = 1; d <= daysInMonth; d++) {
    const m = String(month + 1).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    cells.push({ key: `${year}-${m}-${dd}`, day: d, inMonth: true });
  }
  // 补齐到 7 的倍数
  while (cells.length % 7 !== 0) cells.push({ key: null, day: null, inMonth: false });
  return cells;
}

export function monthLabel(year, month) {
  return `${year}年${month + 1}月`;
}
