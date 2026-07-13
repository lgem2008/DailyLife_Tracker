import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Linking, Platform,
} from 'react-native';
import Constants from 'expo-constants';
import { File, Paths } from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import { colors, getShadow, createThemedStyles, LIGHT_THEMES } from '../theme';

const GITHUB_OWNER = 'lgem2008';
const GITHUB_REPO = 'DailyLife_Tracker';
const APP_PACKAGE = 'com.dailylife.tracker';
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

// 下载源：原链 + 公共镜像。真正下载前会测速排序，不再死板串行「原链优先」
const DOWNLOAD_PROXIES = [
  '',
  'https://ghproxy.net/',
  'https://gh-proxy.com/',
];

// 测速时只拉前 64KB，避免拖慢真正下载
const PROBE_RANGE_END = 64 * 1024 - 1;
const PROBE_TIMEOUT_MS = 4500;

// FLAG_GRANT_READ_URI_PERMISSION | FLAG_ACTIVITY_NEW_TASK
const INSTALL_INTENT_FLAGS = 1 | 0x10000000;

function fetchWithTimeout(url, opts = {}, ms = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...opts, signal: controller.signal }).finally(() => clearTimeout(timer));
}

function sourceLabel(url) {
  if (!url) return '未知源';
  if (url.includes('ghproxy.net')) return '镜像 ghproxy';
  if (url.includes('gh-proxy.com')) return '镜像 gh-proxy';
  if (url.includes('github.com') || url.includes('githubusercontent.com')) return 'GitHub 原链';
  return '备用源';
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

function buildDownloadCandidates(rawUrl) {
  if (!rawUrl) return [];
  const urls = [];
  for (const proxy of DOWNLOAD_PROXIES) {
    const next = proxy && rawUrl.includes('github.com') ? proxy + rawUrl : rawUrl;
    if (!urls.includes(next)) urls.push(next);
  }
  return urls;
}

// 对单个下载源做小流量测速：延迟 + 吞吐
async function probeDownloadSource(url, ms = PROBE_TIMEOUT_MS) {
  const start = Date.now();
  try {
    const res = await fetchWithTimeout(url, {
      method: 'GET',
      headers: {
        Accept: 'application/octet-stream',
        Range: `bytes=0-${PROBE_RANGE_END}`,
      },
    }, ms);
    // 206 部分内容 / 200 整包（部分代理不支持 Range）
    if (!(res.ok || res.status === 206)) {
      throw new Error(`http ${res.status}`);
    }
    const buf = await res.arrayBuffer();
    const elapsed = Math.max(1, Date.now() - start);
    const bytes = buf?.byteLength || 0;
    // 过小多半是错误页 / 拦截页
    if (bytes < 2048) throw new Error(`probe too small (${bytes})`);
    // 不支持 Range 时可能回了超大 body：只按已读字节计，超时保护已由 abort 兜底
    const speed = bytes / elapsed; // B/ms ≈ KB/s
    return {
      url,
      ok: true,
      elapsed,
      bytes,
      speed,
      // 综合分：吞吐优先，延迟略作惩罚
      score: speed - elapsed * 0.02,
      label: sourceLabel(url),
    };
  } catch (e) {
    return {
      url,
      ok: false,
      elapsed: Math.max(1, Date.now() - start),
      bytes: 0,
      speed: 0,
      score: -1,
      label: sourceLabel(url),
      error: e,
    };
  }
}

// 并行测速，按 score 降序；全失败则退回原顺序
async function rankDownloadCandidates(urls) {
  if (!urls || urls.length === 0) return [];
  if (urls.length === 1) return urls;
  const results = await Promise.all(urls.map((url) => probeDownloadSource(url)));
  const ok = results.filter((r) => r.ok).sort((a, b) => b.score - a.score);
  console.log('[update] probe results', results.map((r) => ({
    label: r.label,
    ok: r.ok,
    ms: r.elapsed,
    kbps: r.ok ? Math.round(r.speed) : 0,
  })));
  if (ok.length === 0) return urls;
  const ranked = ok.map((r) => r.url);
  // 测速失败的源垫后，仍作兜底
  for (const url of urls) {
    if (!ranked.includes(url)) ranked.push(url);
  }
  return ranked;
}

// 把 GitHub Release markdown 正文收成可读的要点列表
function parseReleaseNotes(body) {
  if (!body || typeof body !== 'string') return [];
  const items = [];
  for (const raw of body.split(/\r?\n/)) {
    let line = String(raw || '').trim();
    if (!line) continue;
    if (/full\s*changelog/i.test(line)) continue;
    if (/^https?:\/\/\S+$/i.test(line)) continue;
    if (/compare\/v?\d/i.test(line)) continue;
    // 标题 / 加粗 / 列表符
    line = line.replace(/^#+\s*/, '');
    line = line.replace(/\*\*/g, '');
    line = line.replace(/^[-*•]\s+/, '');
    line = line.replace(/^\d+[\.)]\s+/, '');
    // "xxx by @user in https://..."
    line = line.replace(/\s+by\s+@[\w-]+.*$/i, '');
    line = line.replace(/\s+in\s+https?:\/\/\S+/gi, '');
    line = line.replace(/https?:\/\/\S+/gi, '').trim();
    if (!line) continue;
    if (/^(what's changed|changes|更新内容|changelog)$/i.test(line)) continue;
    if (line.length < 2) continue;
    items.push(line);
  }
  // 去重，最多 12 条
  const seen = new Set();
  const out = [];
  for (const item of items) {
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
    if (out.length >= 12) break;
  }
  return out;
}

export default function SettingsScreen({ settings, onChangeSettings }) {
  const fitnessPriorityMode = !!settings?.fitnessPriorityMode;
  const darkMode = !!settings?.darkMode;
  const lightTheme = settings?.lightTheme || LIGHT_THEMES[0].key;

  const [checking, setChecking] = useState(false);
  // status: null | 'latest' | 'update' | 'error' | 'no_apk'
  const [status, setStatus] = useState(null);
  const [latestVersion, setLatestVersion] = useState('');
  const [downloadUrl, setDownloadUrl] = useState('');
  const [releaseNotes, setReleaseNotes] = useState([]);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  // probing | downloading | installing | ''
  const [downloadPhase, setDownloadPhase] = useState('');
  const [downloadSource, setDownloadSource] = useState('');
  const [installError, setInstallError] = useState('');

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
    setInstallError('');
    setReleaseNotes([]);
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
      // 只接受真正的 APK 直链，避免把 Releases 网页当安装包下载
      const apkUrl = apkAsset?.browser_download_url || '';
      // GitHub Release 正文 → 可读要点
      const notes = parseReleaseNotes(typeof data?.body === 'string' ? data.body : '');
      setLatestVersion(tag);
      setDownloadUrl(apkUrl);
      setReleaseNotes(notes);
      if (compareVersion(tag, APP_VERSION) <= 0) {
        setStatus('latest');
      } else if (!apkUrl) {
        setStatus('no_apk');
      } else {
        setStatus('update');
      }
    } catch (e) {
      setStatus('error');
    } finally {
      setChecking(false);
    }
  }, [checking]);

  const openInstallPermissionSettings = useCallback(async () => {
    try {
      await IntentLauncher.startActivityAsync(
        IntentLauncher.ActivityAction.MANAGE_UNKNOWN_APP_SOURCES,
        { data: `package:${APP_PACKAGE}` },
      );
    } catch (_) {
      try {
        await IntentLauncher.startActivityAsync(
          IntentLauncher.ActivityAction.MANAGE_UNKNOWN_APP_SOURCES,
        );
      } catch (__) {
        Linking.openURL(`package:${APP_PACKAGE}`).catch(() => {});
      }
    }
  }, []);

  const launchApkInstaller = useCallback(async (file) => {
    const contentUri = file.contentUri;
    if (!contentUri) throw new Error('missing contentUri');
    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
      data: contentUri,
      flags: INSTALL_INTENT_FLAGS,
      type: 'application/vnd.android.package-archive',
    });
  }, []);

  const downloadAndInstall = useCallback(async () => {
    if (Platform.OS !== 'android') {
      Linking.openURL(downloadUrl || RELEASES_PAGE).catch(() => {});
      return;
    }
    if (!downloadUrl) {
      setInstallError('未找到可下载的 APK，请到 GitHub Releases 手动安装。');
      return;
    }
    if (downloading) return;

    setDownloading(true);
    setDownloadProgress(0);
    setDownloadPhase('probing');
    setDownloadSource('');
    setInstallError('');

    const rawCandidates = buildDownloadCandidates(downloadUrl);
    let lastError = null;
    let downloadedFile = null;

    try {
      // 先并行测速，选当前网络下最快的源；失败再按排名依次兜底
      let candidates = rawCandidates;
      try {
        candidates = await rankDownloadCandidates(rawCandidates);
      } catch (e) {
        console.warn('[update] probe rank failed, fallback order', e);
        candidates = rawCandidates;
      }

      setDownloadPhase('downloading');
      for (const url of candidates) {
        try {
          setDownloadSource(sourceLabel(url));
          setDownloadProgress(0);
          const destination = new File(Paths.cache, 'update.apk');
          // createDownloadTask 不覆盖已有文件，先清掉上次残留
          if (destination.exists) {
            try { destination.delete(); } catch (_) { /* ignore */ }
          }
          // 新 File API：带进度下载到缓存目录
          const task = File.createDownloadTask(url, destination, {
            headers: { Accept: 'application/octet-stream' },
            onProgress: ({ bytesWritten, totalBytes }) => {
              if (totalBytes > 0) {
                setDownloadProgress(Math.min(99, Math.round((bytesWritten / totalBytes) * 100)));
              }
            },
          });
          const file = await task.downloadAsync();
          if (!file || !file.exists) throw new Error('download returned empty file');
          // 极小的文件多半是错误页 HTML，而不是 APK
          if (typeof file.size === 'number' && file.size > 0 && file.size < 50 * 1024) {
            try { file.delete(); } catch (_) { /* ignore */ }
            throw new Error(`downloaded file too small (${file.size} bytes)`);
          }
          downloadedFile = file;
          setDownloadProgress(100);
          break;
        } catch (e) {
          lastError = e;
          console.warn('[update] download attempt failed', url, e);
        }
      }

      if (!downloadedFile) {
        throw lastError || new Error('all download mirrors failed');
      }

      setDownloadPhase('installing');
      try {
        await launchApkInstaller(downloadedFile);
      } catch (e) {
        console.warn('[update] install intent failed', e);
        setInstallError('已下载，但无法打开安装器。请允许本应用「安装未知应用」后重试。');
      }
    } catch (e) {
      console.warn('[update] download failed', e);
      setInstallError('应用内下载失败。可重试，或允许安装未知应用后再次下载。');
    } finally {
      setDownloading(false);
      setDownloadPhase('');
      setDownloadSource('');
    }
  }, [downloadUrl, downloading, launchApkInstaller]);

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
          <Pressable
            style={[styles.checkBtn, checking && styles.checkBtnDisabled]}
            onPress={checkUpdate}
            disabled={checking}
          >
            {checking
              ? <ActivityIndicator size="small" color={colors.primary} />
              : <Text style={styles.checkBtnText}>检查更新</Text>}
          </Pressable>
        </View>

        {status === 'latest' && (
          <Text style={styles.statusOk}>已是最新版本 ✓</Text>
        )}
        {status === 'error' && (
          <Text style={styles.statusError}>检查失败，请检查网络后重试</Text>
        )}
        {status === 'no_apk' && (
          <View style={styles.updateHint}>
            <Text style={styles.statusError}>
              发现新版本 {latestVersion}，但 Release 里没有 APK 附件。
            </Text>
            <View style={styles.notesBox}>
              <Text style={styles.notesTitle}>更新内容</Text>
              {releaseNotes.length > 0 ? (
                releaseNotes.map((line, idx) => (
                  <View key={`${idx}-${line.slice(0, 12)}`} style={styles.noteRow}>
                    <Text style={styles.noteBullet}>•</Text>
                    <Text style={styles.noteLine}>{line}</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.notesEmpty}>暂无详细说明，可到发布页查看</Text>
              )}
            </View>
            <Pressable style={styles.browserBtn} onPress={() => openUrl(RELEASES_PAGE)}>
              <Text style={styles.browserBtnText}>浏览器打开发布页</Text>
            </Pressable>
          </View>
        )}
        {status === 'update' && (
          <View style={styles.updateBlock}>
            <Text style={styles.updateFound}>发现新版本 {latestVersion}</Text>
            <View style={styles.notesBox}>
              <Text style={styles.notesTitle}>更新内容</Text>
              {releaseNotes.length > 0 ? (
                releaseNotes.map((line, idx) => (
                  <View key={`${idx}-${line.slice(0, 12)}`} style={styles.noteRow}>
                    <Text style={styles.noteBullet}>•</Text>
                    <Text style={styles.noteLine}>{line}</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.notesEmpty}>暂无详细说明，可到发布页查看</Text>
              )}
            </View>
            <Text style={styles.updateChoiceHint}>选择安装方式</Text>
            <Pressable style={styles.updateBtn} onPress={downloadAndInstall} disabled={downloading}>
              {downloading ? (
                <View style={styles.updateProgress}>
                  <ActivityIndicator size="small" color="#fff" />
                  <Text style={styles.updateBtnText}>
                    {downloadPhase === 'probing'
                      ? '测速选源中…'
                      : downloadPhase === 'installing' || downloadProgress >= 100
                        ? '正在打开安装…'
                        : downloadSource
                          ? `下载中 ${downloadProgress}% · ${downloadSource}`
                          : `下载中 ${downloadProgress}%`}
                  </Text>
                </View>
              ) : (
                <Text style={styles.updateBtnText}>应用内下载安装</Text>
              )}
            </Pressable>
            <Pressable
              style={[styles.browserBtn, downloading && styles.browserBtnDisabled]}
              onPress={() => openUrl(RELEASES_PAGE)}
              disabled={downloading}
            >
              <Text style={styles.browserBtnText}>浏览器打开</Text>
            </Pressable>
          </View>
        )}
        {!!installError && (
          <View style={styles.updateHint}>
            <Text style={styles.statusError}>{installError}</Text>
            <View style={styles.hintActions}>
              <Pressable style={styles.linkBtn} onPress={openInstallPermissionSettings}>
                <Text style={styles.linkBtnText}>允许安装未知应用</Text>
              </Pressable>
              {!!downloadUrl && !downloading && (
                <Pressable style={styles.linkBtn} onPress={downloadAndInstall}>
                  <Text style={styles.linkBtnText}>重试下载</Text>
                </Pressable>
              )}
              <Pressable style={styles.linkBtn} onPress={() => openUrl(RELEASES_PAGE)}>
                <Text style={styles.linkBtnText}>浏览器打开</Text>
              </Pressable>
            </View>
          </View>
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
  swatchRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
  swatchItem: { alignItems: 'center', flex: 1, minWidth: 0, paddingHorizontal: 2 },
  swatchDot: {
    width: 38, height: 38, borderRadius: 19,
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
  statusError: { marginTop: 12, fontSize: 13, fontWeight: '700', color: colors.danger, lineHeight: 20 },
  updateBlock: { marginTop: 12 },
  updateFound: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 2,
  },
  notesBox: {
    marginTop: 10,
    padding: 14,
    borderRadius: 16,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.line,
  },
  notesTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.primary,
    marginBottom: 10,
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
    gap: 8,
  },
  noteBullet: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.primary,
    lineHeight: 20,
    width: 12,
  },
  noteLine: {
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '600',
    color: colors.text,
  },
  notesEmpty: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '600',
    color: colors.textSoft,
  },
  updateChoiceHint: {
    marginTop: 14,
    marginBottom: 2,
    fontSize: 12,
    fontWeight: '800',
    color: colors.textSoft,
  },
  updateBtn: {
    marginTop: 10,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  updateBtnText: { fontSize: 14, fontWeight: '800', color: colors.white },
  browserBtn: {
    marginTop: 10,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
  },
  browserBtnDisabled: { opacity: 0.6 },
  browserBtnText: { fontSize: 14, fontWeight: '800', color: colors.primary },
  updateProgress: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  updateHint: { marginTop: 4 },
  hintActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  linkBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
  },
  linkBtnText: { fontSize: 13, fontWeight: '800', color: colors.primary },
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
