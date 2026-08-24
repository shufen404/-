# 牛来桌宠桌面版

这是从零创建的 Electron 桌宠项目，与旧的网页原型相互独立。

当前 Windows 产物位于 `release`：

- `Niulai-Pet-0.2.0-x64-Setup.exe`：标准 Windows 用户级安装包
- `Niulai-Pet-0.2.0-x64-Portable.exe`：免安装便携版

角色和面板沿用项目中已验证的成熟版本，未在最终打包阶段替换素材。

桌宠形象使用《牛来》左侧橙色小牛的透明走路动画。点击桌宠会保留原气泡反馈，并依次播放“哞、妈妈、牛来”三段本地音效。

“妈妈”和“牛来”分别提取自用户指定视频的 2–5 秒与 7–9 秒，并在两端保留少量余量以避免截断。“哞”由同一角色原声在本地提取基频、谐波噪声与共振特征后生成，不使用网络替代声线。

## 运行

```powershell
npm install
npm start
```

## 预览版本

日常功能开发使用项目根目录的 `preview.cmd`，或运行：

```powershell
npm run preview
```

预览版使用独立的用户数据目录，不会读写正式版的计薪状态。功能确认完成后，再统一构建并更新 `release` 中的安装包。

## 发布与同步更新

正式版本使用 `electron-builder` 生成 NSIS 安装包和便携版，应用启用 `electron-updater`。GitHub Releases 是默认发布源，仓库配置为 `shufen404/-`；每次发布必须同步更新 `package.json` 版本号、Release tag 和 `latest.yml`。安装版会按用户安装到本地用户目录，不要求管理员权限。

公开下载页：https://github.com/shufen404/-/releases/latest
推荐单一入口：https://github.com/shufen404/-/releases/download/v0.2.0/Niulai-Pet-0.2.0-x64-Installer.zip

本地构建：

```powershell
npm run dist
```

只构建便携版：

```powershell
npm run dist:portable
```

预览版不会访问更新服务。正式版可从托盘菜单或设置面板检查更新，下载完成后在下次退出时安装。

## 快捷键

- `Enter`：桌宠获得焦点时切换个人模式 / 工作模式
- `Ctrl + Shift + Enter`：从任意软件全局切换工作模式
- `Ctrl + 1`：显示 / 隐藏桌宠
- `Esc`：隐藏桌宠
- 系统托盘“薪宠”图标：左键点击召回桌宠，右键菜单可显示或隐藏

所有计时和工资数据保存在 Electron 用户数据目录，不上传网络。

## 工作时长

工作模式显示当天的实际上班时长：从设置的上班时间计算到当前真实时间，最多计算到下班时间；期间扣除已设置的午休时段，并每天额外扣除约 3 分钟（160–200 秒）。午休期间计时暂停。
