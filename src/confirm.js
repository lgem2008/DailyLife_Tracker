// 跨平台确认框：原生用 Alert.alert（带按钮），web 用 window.confirm。
// react-native-web 的 Alert.alert 不渲染带按钮的对话框（等于 no-op），
// 所以 web 必须走 window.confirm，否则“删除确认”永远不会触发。
import { Platform, Alert } from 'react-native';

// confirmAction({ title, message, confirmText, destructive, onConfirm })
export function confirmAction({ title, message, confirmText = '确定', destructive = false, onConfirm }) {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line no-alert
    const ok = typeof window !== 'undefined' && window.confirm
      ? window.confirm(message ? `${title}\n\n${message}` : title)
      : true;
    if (ok) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: '取消', style: 'cancel' },
    { text: confirmText, style: destructive ? 'destructive' : 'default', onPress: onConfirm },
  ]);
}
