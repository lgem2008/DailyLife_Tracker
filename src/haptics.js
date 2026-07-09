// 安全的震动反馈封装：expo-haptics 的枚举在 web / 某些版本上可能是 undefined，
// 直接读 Haptics.NotificationFeedbackStyle.Success 会抛 "Cannot read properties of undefined"。
// 这里全部用可选链 + try 包裹，任何平台/版本都不会因为震动而崩溃。
import * as Haptics from 'expo-haptics';

export function tapLight() {
  try {
    const s = Haptics.ImpactFeedbackStyle && Haptics.ImpactFeedbackStyle.Light;
    if (s != null) Haptics.impactAsync(s).catch(() => {});
  } catch (e) {}
}

export function tapMedium() {
  try {
    const s = Haptics.ImpactFeedbackStyle && Haptics.ImpactFeedbackStyle.Medium;
    if (s != null) Haptics.impactAsync(s).catch(() => {});
  } catch (e) {}
}

export function select() {
  try {
    if (typeof Haptics.selectionAsync === 'function') Haptics.selectionAsync().catch(() => {});
  } catch (e) {}
}

export function success() {
  try {
    // 正确枚举名是 NotificationFeedbackType（不是 Style），两个都兜一下
    const t = Haptics.NotificationFeedbackType || Haptics.NotificationFeedbackStyle;
    const s = t && t.Success;
    if (s != null) Haptics.notificationAsync(s).catch(() => {});
  } catch (e) {}
}
