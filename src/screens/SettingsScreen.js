import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Linking,
} from 'react-native';
import Constants from 'expo-constants';
import { colors, getShadow, createThemedStyles } from '../theme';

// GitHub 仓库信息：建好仓库后把 owner/repo 换成真实的
const GITHUB_OWNER = 'your-github-name';
const GITHUB_REPO = 'DailyLife_Tracker';
const RELEASES_PAGE = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
const LATEST_RELEASE_API = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;

const APP_VERSION = Constants.expoConfig?.version || '1.0.0';

// 把 "v1.2.3" / "1.2.3" 解析成可比较的数字数组
function parseVersion(raw) {
  if (!raw) return [0];
  return String(raw).replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
}

// a 比 b 新返回 1，相等 0，更旧 -1
function compareVersion(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const da = pa[i] || 0;
    const db = pb[i] || 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
}

export default function SettingsScreen({ settings, onChangeSettings }) {
  const fitnessPriorityMode = !!settings?.fitnessPriorityMode;
  const darkMode = !!settings?.darkMode;

  const [checking, setChecking] = useState(false);
  // status: null | 'latest' | 'update' | 'error'
  const [status, setStatus] = useState(null);
  const [latestVersion, setLatestVersion] = useState('');
  const [downloadUrl, setDownloadUrl] = useState('');

  const toggleFitnessPriority = () => {
    onChangeSettings({ ...settings, fitnessPriorityMode: !fitnessPriorityMode });
  };

  const toggleDarkMode = () => {
    onChangeSettings({ ...settings, darkMode: !darkMode });
  };

  const checkUpdate = useCallback(async () => {
    if (checking) return;
    setChecking(true);
    setStatus(null);
    try {
      const res = await fetch(LATEST_RELEASE_API, {
        headers: { Accept: 'application/vnd.github+json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const tag = data?.tag_name || '';
      const apkAsset = (data?.assets || []).find(
        (a) => typeof a?.name === 'string' && a.name.toLowerCase().endsWith('.apk'),
      );
      const url = apkAsset?.browser_download_url || data?.html_url || RELEASES_PAGE;
      setLatestVersion(tag);
      setDownloadUrl(url);
      setStatus(compareVersion(tag, APP_VERSION) > 0 ? 'update' : 'latest');
    } catch (e) {
      setStatus('error');
    } finally {
      setChecking(false);
    }
  }, [checking]);

  const openDownload = useCallback(() => {
    const url = downloadUrl || RELEASES_PAGE;
    Linking.openURL(url).catch(() => {});
  }, [downloadUrl]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>设置</Text>
      <Text style={styles.sub}>调整首页顺序和常用功能入口</Text>

      <Pressable style={[styles.card, getShadow()]} onPress={toggleFitnessPriority}>
        <View style={styles.cardHead}>
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle}>健身优先模式</Text>
            <Text style={styles.cardDesc}>
              开启后底部第一个变成健身，并隐藏记录页；关闭后恢复现在的布局。
            </Text>
          </View>
          <View style={[styles.toggle, fitnessPriorityMode && styles.toggleOn]}>
            <View style={[styles.toggleDot, fitnessPriorityMode && styles.toggleDotOn]} />
          </View>
        </View>
      </Pressable>

      <Pressable style={[styles.card, getShadow(), styles.cardSpaced]} onPress={toggleDarkMode}>
        <View style={styles.cardHead}>
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle}>深色模式</Text>
            <Text style={styles.cardDesc}>
              开启后使用深色背景和高对比文字，适合晚上记录。
            </Text>
          </View>
          <View style={[styles.toggle, darkMode && styles.toggleOn]}>
            <View style={[styles.toggleDot, darkMode && styles.toggleDotOn]} />
          </View>
        </View>
      </Pressable>

      <View style={[styles.card, getShadow(), styles.cardSpaced]}>
        <View style={styles.cardHead}>
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle}>检查更新</Text>
            <Text style={styles.cardDesc}>
              当前版本 v{APP_VERSION}。点右侧按钮从 GitHub 查看是否有新版本。
            </Text>
          </View>
          <Pressable
            style={[styles.checkBtn, checking && styles.checkBtnDisabled]}
            onPress={checkUpdate}
            disabled={checking}
          >
            {checking
              ? <ActivityIndicator size="small" color={colors.primary} />
              : <Text style={styles.checkBtnText}>检查</Text>}
          </Pressable>
        </View>

        {status === 'latest' && (
          <Text style={styles.statusOk}>已是最新版本 ✓</Text>
        )}
        {status === 'error' && (
          <Text style={styles.statusError}>检查失败，请检查网络后重试</Text>
        )}
        {status === 'update' && (
          <Pressable style={styles.updateBtn} onPress={openDownload}>
            <Text style={styles.updateBtnText}>
              发现新版本 {latestVersion} · 点这里下载
            </Text>
          </Pressable>
        )}
      </View>
    </ScrollView>
  );
}

const styles = createThemedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 14, paddingBottom: 40, width: '100%', maxWidth: 460, alignSelf: 'center' },
  title: { fontSize: 26, fontWeight: '800', color: colors.text, marginBottom: 4 },
  sub: { fontSize: 14, color: colors.textSoft, marginBottom: 18 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 22,
    padding: 16,
  },
  cardSpaced: { marginTop: 14 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  cardBody: { flex: 1, minWidth: 0, paddingRight: 4 },
  cardTitle: { fontSize: 17, fontWeight: '800', color: colors.text, marginBottom: 6 },
  cardDesc: { fontSize: 13, lineHeight: 20, color: colors.textSoft, flexShrink: 1 },
  toggle: {
    width: 56,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.line,
    justifyContent: 'center',
    paddingHorizontal: 4,
    flexShrink: 0,
  },
  toggleOn: { backgroundColor: colors.primarySoft },
  toggleDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.textSoft,
  },
  toggleDotOn: {
    alignSelf: 'flex-end',
    backgroundColor: colors.primary,
  },
  checkBtn: {
    minWidth: 64,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  checkBtnDisabled: { opacity: 0.7 },
  checkBtnText: { fontSize: 14, fontWeight: '800', color: colors.primary },
  statusOk: { marginTop: 12, fontSize: 13, fontWeight: '700', color: colors.textSoft },
  statusError: { marginTop: 12, fontSize: 13, fontWeight: '700', color: colors.danger },
  updateBtn: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  updateBtnText: { fontSize: 14, fontWeight: '800', color: colors.white },
}));
