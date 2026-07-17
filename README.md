# 日常记录 · DailyLife Tracker

一个可爱风的日常打卡小 App。首页是一排带 emoji 的大按钮，点一下就记下今天做了这件事；日历页按天用彩色 emoji 直观回看做过什么。数据全部存在手机本地，不联网、不登录、不上传。

## 技术栈

| 层级 | 选型 | 说明 |
| ---- | ---- | ---- |
| 框架 | [Expo](https://expo.dev) SDK 57 | 开发、调试与原生打包 |
| UI | React 19 + React Native 0.86 | 跨端界面；开启 New Architecture |
| 语言 | JavaScript（无 TypeScript） | 入口 `index.js` / `App.js`，业务在 `src/` |
| 布局 | `react-native-safe-area-context` | 安全区适配 |
| 本地存储 | 原生：`expo-file-system`（JSON 文件）<br>Web：`localStorage` | 全部本机，无后端、无账号 |
| 其他 Expo 模块 | `expo-haptics` / `expo-status-bar` / `expo-intent-launcher` / `@expo/vector-icons` | 震动反馈、状态栏、打开系统意图、图标 |
| Web 调试 | `react-native-web` | `expo start --web` |
| 安卓产物 | 仓库内 `android/` + Gradle | `assembleRelease` 打 release APK |
| 构建工具 | Node.js 18+、Babel（`babel-preset-expo`）、Metro | 可选 EAS（见 `eas.json`） |

不依赖导航库、状态管理库或远程数据库：页面由根组件自管分页/Tab，状态用 React hooks，数据读写走本地 JSON。

## 功能
- 记录：emoji 大按钮，轻点即记录，同一件事一天可多次，按钮当天次数有小角标。
- 日历：按天时间线，用彩色 emoji 胶囊展示当天做了什么，长按可删单条。
- 管理：自由新建 / 编辑 / 删除按钮，自选 emoji 和颜色。
- 更新：设置页可检查新版本，有更新时跳转到 GitHub Releases 下载新 APK。

## 下载安装

在本仓库的 [Releases](../../releases) 页面下载最新的 `.apk`，传到安卓手机上点开安装即可。首次安装需要在系统设置里允许「未知来源 / 安装未知应用」。

App 只在本机存数据，卸载会清空，换手机不会自动同步。

## 自行编译（开发者）

前置：[Node.js](https://nodejs.org) 18+，安卓打包还需 Android SDK / Build Tools（Android Studio 自带）。

```bash
npm install
npx expo start   # 开发调试，配合手机端 Expo Go 扫码
```

本地打包 release APK：

```bash
cd android
./gradlew.bat assembleRelease
```

产物在 `android/app/build/outputs/apk/release/app-release.apk`。

### 关于签名

release 构建从 `android/keystore.properties` 读取签名信息，该文件和 `*.keystore` 均不在仓库中（见 `.gitignore`）。自行编译时，如果没有这个文件，Gradle 会自动回退到 debug 签名，可以正常编译出可安装的 APK，只是签名与官方发布版不同（无法覆盖更新官方版本）。

要用自己的正式密钥签名，先生成 keystore：

```bash
keytool -genkeypair -v -keystore android/app/release.keystore -alias dailylife -keyalg RSA -keysize 2048 -validity 10000
```

再在 `android/keystore.properties` 里填入：

```properties
RELEASE_STORE_FILE=release.keystore
RELEASE_STORE_PASSWORD=你的keystore密码
RELEASE_KEY_ALIAS=dailylife
RELEASE_KEY_PASSWORD=你的key密码
```

## 许可协议

本项目采用 [PolyForm Noncommercial License 1.0.0](./LICENSE)。允许任何人查看、使用、修改和分发源码，但**仅限非商业用途**。禁止将本项目或其衍生作品用于商业目的。详见 LICENSE 全文。
