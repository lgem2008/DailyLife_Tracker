import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Linking, Platform,
} from 'react-native';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import { colors, getShadow, createThemedStyles, LIGHT_THEMES } from '../theme';

const GITHUB_OWNER = 'lgem2008';
const GITHUB_REPO = 'DailyLife_Tracker';
const RELEASES_PAGE = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
const LATEST_RELEASE_API = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
const AUTHOR = 'lgem2008';
const AUTHOR_URL = `https://github.com/${GITHUB_OWNER}`;
const REPO_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`;

const API_MIRRORS = [
  LATEST_RELEASE_API,
  `https://ghproxy.net/https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
  `https://gh-proxy.com/https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
];

const DOWNLOAD_PROXY = 'https://ghproxy.net/';

function fetchWithTimeout(url, opts = {}, ms = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...opts, signal: controller.signal }).finally(() => clearTimeout(timer));
}

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
  const lightTheme = settings?.lightTheme || LIGHT_THEMES[0].key;

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

  const pickLightTheme = (key) => {
    onChangeSettings({ ...settings, lightTheme: key });
  };

  const checkUpdate = useCallback(async () => {
    if (checking) return;
    setChecking(true);
    setStatus(null);
    try {
      let data = null;
      for (const api of API_MIRRORS) {
        try {
          const res = await fetchWithTimeout(api, {
            headers: { Accept: 'application/vnd.github+json' },
          });
          if (!res.ok) continue;
          data = await res.json();
          break;
        } catch (_) {
          continue;
        }
      }
      if (!data) throw new Error('all mirrors failed');
      const tag = data?.tag_name || '';
      const apkAsset = (data?.assets || []).find(
        (a) => typeof a?.name === 'string' && a.name.toLowerCase().endsWith('.apk'),
      );
      let url = apkAsset?.browser_download_url || data?.html_url || RELEASES_PAGE;
      if (url.includes('github.com') && DOWNLOAD_PROXY) {
        url = DOWNLOAD_PROXY + url;
      }
      setLatestVersion(tag);
      setDownloadUrl(url);
      setStatus(compareVersion(tag, APP_VERSION) > 0 ? 'update' : 'latest');
    } catch (e) {
      setStatus('error');
    } finally {
      setChecking(false);
    }
  }, [checking]);

  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

  const downloadAndInstall = useCallback(async () => {
    const url = downloadUrl || RELEASES_PAGE;
    if (Platform.OS !== 'android') {
      Linking.openURL(url).catch(() => {});
      return;
    }
    if (downloading) return;
    setDownloading(true);
    setDownloadProgress(0);
    try {
      const fileUri = FileSystem.cacheDirectory + 'update.apk';
      const existing = await FileSystem.getInfoAsync(fileUri);
      if (existing.exists) await FileSystem.deleteAsync(fileUri, { idempotent: true });

      const download = FileSystem.createDownloadResumable(
        url,
        fileUri,
        {},
        (progress) => {
          if (progress.totalBytesExpectedToWrite > 0) {
            setDownloadProgress(
              Math.round((progress.totalBytesWritten / progress.totalBytesExpectedToWrite) * 100)
            );
          }
        },
      );
      const result = await download.downloadAsync();
      if (!result || !result.uri) throw new Error('download failed');

      const contentUri = await FileSystem.getContentUriAsync(result.uri);
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
        data: contentUri,
        flags: 1,
        type: 'application/vnd.android.package-archive',
      });
    } catch (e) {
      Linking.openURL(url).catch(() => {});
    } finally {
      setDownloading(false);
      setDownloadProgress(0);
    }
  }, [downloadUrl, downloading]);

  const openUrl = useCallback((url) => {
    Linking.openURL(url).catch(() => {});
  }, []);

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

      {!darkMode && (
        <View style={[styles.card, getShadow(), styles.cardSpaced]}>
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle}>浅色配色</Text>
            <Text style={styles.cardDesc}>
              选一个喜欢的主色和背景氛围，深色模式下不生效。
            </Text>
          </View>
          <View style={styles.swatchRow}>
            {LIGHT_THEMES.map((t) => {
              const active = t.key === lightTheme;
              return (
                <Pressable
                  key={t.key}
                  style={styles.swatchItem}
                  onPress={() => pickLightTheme(t.key)}
                >
                  <View style={[styles.swatchDot, { backgroundColor: t.swatch }, active && styles.swatchDotActive]}>
                    {active && <Text style={styles.swatchCheck}>✓</Text>}
                  </View>
                  <Text style={[styles.swatchLabel, active && styles.swatchLabelActive]} numberOfLines={1}>{t.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

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
          <Pressable style={styles.updateBtn} onPress={downloadAndInstall} disabled={downloading}>
            {downloading ? (
              <View style={styles.updateProgress}>
                <ActivityIndicator size="small" color="#fff" />
                <Text style={styles.updateBtnText}>
                  下载中 {downloadProgress}%
                </Text>
              </View>
            ) : (
              <Text style={styles.updateBtnText}>
                发现新版本 {latestVersion} · 下载安装
              </Text>
            )}
          </Pressable>
        )}
      </View>

      <View style={[styles.card, getShadow(), styles.cardSpaced]}>
        <Text style={styles.cardTitle}>关于</Text>
        <Text style={styles.cardDesc}>
          日常记录 · 一个可爱风的日常打卡与健身记录小工具。数据全部存在手机本地，不联网、不登录。
        </Text>

        <Pressable style={styles.aboutRow} onPress={() => openUrl(AUTHOR_URL)}>
          <Text style={styles.aboutLabel}>作者</Text>
          <Text style={styles.aboutValue}>{AUTHOR}</Text>
          <Text style={styles.aboutArrow}>›</Text>
        </Pressable>

        <Pressable style={styles.aboutRow} onPress={() => openUrl(REPO_URL)}>
          <Text style={styles.aboutLabel}>开源仓库</Text>
          <Text style={styles.aboutValue} numberOfLines={1}>GitHub</Text>
          <Text style={styles.aboutArrow}>›</Text>
        </Pressable>

        <View style={styles.aboutRow}>
          <Text style={styles.aboutLabel}>版本</Text>
          <Text style={styles.aboutValue}>v{APP_VERSION}</Text>
        </View>
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
  swatchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 14 },
  swatchItem: { alignItems: 'center', width: 56 },
  swatchDot: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'transparent',
  },
  swatchDotActive: { borderColor: colors.text },
  swatchCheck: { fontSize: 18, fontWeight: '900', color: colors.white },
  swatchLabel: { fontSize: 11, fontWeight: '700', color: colors.textSoft, marginTop: 6 },
  swatchLabelActive: { color: colors.text },
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
  updateProgress: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  aboutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    gap: 10,
  },
  aboutLabel: { fontSize: 14, fontWeight: '800', color: colors.textSoft },
  aboutValue: { flex: 1, fontSize: 14, fontWeight: '800', color: colors.text, textAlign: 'right' },
  aboutArrow: { fontSize: 20, fontWeight: '800', color: colors.textSoft, opacity: 0.5 },
}));
