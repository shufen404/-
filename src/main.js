const { app, BrowserWindow, dialog, globalShortcut, ipcMain, screen, Tray, Menu, nativeImage, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { fileURLToPath, pathToFileURL } = require('url');
const { parseReaderDocument } = require('./document-parser');
const { autoUpdater } = require('electron-updater');

const isPreview = process.argv.includes('--preview');
if (isPreview) {
  app.setPath('userData', path.join(app.getPath('appData'), 'niulai-desktop-pet-preview'));
}

let petWindow;
let panelWindow;
let bilibiliWindow;
let tray;
let hiddenByShortcut = false;
let inlinePanelOpen = false;
let inlinePanelHeight = 0;
let inlineRestorePosition = null;
let petWindowWidth = 210;
const INLINE_WINDOW_HEIGHT = 520;
const PET_HEIGHT_RATIO = 1.24;
let updateState = { status: 'idle' };

const stateFile = () => path.join(app.getPath('userData'), 'salary-pet-state.json');
const defaults = {
  salary: 18000,
  workdays: [1, 2, 3, 4, 5],
  startTime: '09:00',
  endTime: '18:00',
  lunchStart: '12:00',
  lunchEnd: '13:00',
  status: 'idle',
  resumeStatus: 'personal',
  personalSeconds: 0,
  workSeconds: 0,
  lastResetDate: null,
  dailyResetVersion: 0,
  dailyTasks: null,
  lastTick: null,
  alwaysOnTop: true,
  opacity: 1,
  size: 210,
  position: null,
  readerSettings: { fontFamily: 'serif', fontSize: 16, lineHeight: 1.8 },
  petAppearance: { id: 'niulai', name: '牛来', src: '../assets/niulai-static.png', speakingSrc: '../assets/niulai-speaking.png', fallbackSrc: '../assets/niulai-static.png' },
  appearanceHistory: [],
  tools: []
};

function readState() {
  try {
    const state = { ...defaults, ...JSON.parse(fs.readFileSync(stateFile(), 'utf8')) };
    if (Number(state.size) > 320 || Number(state.size) < 180) state.size = 210;
    return state;
  }
  catch { return { ...defaults }; }
}

function saveState(next) {
  const normalized = { ...next };
  if ('size' in normalized) normalized.size = Math.max(180, Math.min(320, Number(normalized.size) || 210));
  fs.writeFileSync(stateFile(), JSON.stringify(normalized, null, 2));
  if (petWindow && !petWindow.isDestroyed()) petWindow.webContents.send('state-updated', normalized);
}

function broadcastUpdate(payload) {
  updateState = { ...updateState, ...payload };
  for (const win of [petWindow, panelWindow]) {
    if (win && !win.isDestroyed()) win.webContents.send('update-status', updateState);
  }
}

function updateLog(message) {
  try {
    const logPath = path.join(app.getPath('userData'), 'updates.log');
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${message}\n`);
  } catch { /* update logging must never affect app startup */ }
}

async function checkForUpdates() {
  if (!app.isPackaged || isPreview) {
    const result = { ok: false, skipped: true, status: 'preview', message: '预览版不检查更新' };
    broadcastUpdate(result);
    return result;
  }
  try {
    broadcastUpdate({ ok: true, status: 'checking', message: '正在检查更新…' });
    const result = await autoUpdater.checkForUpdates();
    return { ok: true, status: updateState.status, updateInfo: result?.updateInfo || null };
  } catch (error) {
    updateLog(`check failed: ${error?.stack || error}`);
    const result = { ok: false, status: 'error', message: '暂时无法检查更新，请稍后再试' };
    broadcastUpdate(result);
    return result;
  }
}

function setupAutoUpdater() {
  if (!app.isPackaged || isPreview) return;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowDowngrade = false;
  autoUpdater.on('checking-for-update', () => broadcastUpdate({ status: 'checking', message: '正在检查更新…' }));
  autoUpdater.on('update-available', info => {
    broadcastUpdate({ status: 'available', version: info?.version || '', message: `发现新版本 ${info?.version || ''}，开始下载…` });
    autoUpdater.downloadUpdate().catch(error => {
      updateLog(`download failed: ${error?.stack || error}`);
      broadcastUpdate({ status: 'error', message: '更新下载失败，请稍后重试' });
    });
  });
  autoUpdater.on('update-not-available', info => broadcastUpdate({ status: 'latest', version: info?.version || '', message: '当前已是最新版本' }));
  autoUpdater.on('download-progress', progress => broadcastUpdate({ status: 'downloading', percent: Math.round(progress?.percent || 0), message: `正在下载更新 ${Math.round(progress?.percent || 0)}%` }));
  autoUpdater.on('update-downloaded', info => broadcastUpdate({ status: 'downloaded', version: info?.version || '', message: `更新 ${info?.version || ''} 已下载，下次退出时安装` }));
  autoUpdater.on('error', error => {
    updateLog(`updater error: ${error?.stack || error}`);
    broadcastUpdate({ status: 'error', message: '更新服务暂时不可用' });
  });
  // A failed update check must never prevent the desktop pet from opening.
  checkForUpdates().catch(() => {});
}

function installDownloadedUpdate() {
  if (!app.isPackaged || isPreview || updateState.status !== 'downloaded') return false;
  autoUpdater.quitAndInstall(false, true);
  return true;
}

function defaultPosition(size) {
  const display = screen.getPrimaryDisplay().workArea;
  return { x: display.x + display.width - size - 24, y: display.y + display.height - size - 24 };
}

function clampPosition(position, width, height) {
  const display = screen.getPrimaryDisplay().workArea;
  const x = Math.max(display.x + 8, Math.min(Number(position?.x) || display.x + display.width - width - 24, display.x + display.width - width - 8));
  const y = Math.max(display.y + 8, Math.min(Number(position?.y) || display.y + display.height - height - 24, display.y + display.height - height - 8));
  return { x: Math.round(x), y: Math.round(y) };
}

function createPetWindow() {
  const state = readState();
  const size = Math.max(180, Math.min(320, Number(state.size) || 210));
  petWindowWidth = size;
  const height = Math.round(size * PET_HEIGHT_RATIO);
  const pos = clampPosition(state.position || defaultPosition(height), size, height);
  petWindow = new BrowserWindow({
    width: size,
    height,
    x: pos.x,
    y: pos.y,
    transparent: true,
    frame: false,
    resizable: false,
    minWidth: 180,
    minHeight: 212,
    maxWidth: 320,
    maxHeight: 960,
    alwaysOnTop: state.alwaysOnTop !== false,
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      sandbox: true,
      nodeIntegrationInSubFrames: true
    }
  });
  lockPetWindowSize(size, height);
  if (isPreview) petWindow.setTitle('薪宠 · 预览版');
  petWindow.setOpacity(Math.max(.45, Math.min(1, Number(state.opacity) || 1)));
  petWindow.loadFile(path.join(__dirname, 'pet.html'));
  // A previous inline session may have closed while the window was expanded.
  // Always restore the compact pet canvas on the next launch.
  petWindow.webContents.once('did-finish-load', () => {
    if (inlinePanelOpen || petWindow.isDestroyed()) return;
    const [currentWidth] = petWindow.getSize();
    petWindow.setSize(currentWidth, Math.round(currentWidth * PET_HEIGHT_RATIO), true);
  });
  petWindow.webContents.on('before-input-event', handleEnterShortcut);
  petWindow.on('move', persistBounds);
  petWindow.on('close', persistBounds);
}

function lockPetWindowSize(width, height) {
  if (!petWindow || petWindow.isDestroyed()) return;
  const safeWidth = Math.max(180, Math.min(320, Math.round(width)));
  const safeHeight = Math.max(212, Math.round(height));
  petWindow.setResizable(false);
  petWindow.setMinimumSize(180, 212);
  petWindow.setMaximumSize(320, 960);
  petWindow.setSize(safeWidth, safeHeight, true);
  // Frameless Windows can still receive an OS resize hit-test at an edge.
  // Equal min/max bounds make dragging fundamentally unable to resize it.
  petWindow.setMinimumSize(safeWidth, safeHeight);
  petWindow.setMaximumSize(safeWidth, safeHeight);
}

function petBaseHeight() {
  if (!petWindow || petWindow.isDestroyed()) return 248;
  const [width] = petWindow.getSize();
  return Math.round(width * PET_HEIGHT_RATIO);
}

function setInlinePanel(open, height = 520) {
  if (!petWindow || petWindow.isDestroyed()) return;
  if (open && !inlinePanelOpen) inlineRestorePosition = petWindow.getPosition();
  inlinePanelOpen = Boolean(open);
  const [rawWidth] = petWindow.getSize();
  const width = Math.max(180, Math.min(320, rawWidth));
  petWindowWidth = width;
  const baseHeight = Math.round(width * PET_HEIGHT_RATIO);
  inlinePanelHeight = inlinePanelOpen ? Math.max(180, INLINE_WINDOW_HEIGHT - baseHeight) : 0;
  const nextHeight = inlinePanelOpen ? Math.max(INLINE_WINDOW_HEIGHT, baseHeight) : baseHeight;
  lockPetWindowSize(width, nextHeight);
  if (inlinePanelOpen) {
    const display = screen.getDisplayMatching(petWindow.getBounds()).workArea;
    const [, currentY] = petWindow.getPosition();
    const nextY = Math.max(display.y + 12, Math.min(currentY, display.y + display.height - nextHeight - 12));
    petWindow.setPosition(petWindow.getPosition()[0], nextY, true);
  } else if (inlineRestorePosition) {
    petWindow.setPosition(inlineRestorePosition[0], inlineRestorePosition[1], true);
    inlineRestorePosition = null;
  }
  petWindow.webContents.send('inline-panel-state', { open: inlinePanelOpen, height: inlinePanelHeight });
}

function resizeInlinePanel(height) {
  // The inline surface has a fixed total height; excess content scrolls inside it.
  if (inlinePanelOpen) inlinePanelHeight = Math.max(180, INLINE_WINDOW_HEIGHT - petBaseHeight());
}

function persistBounds() {
  if (!petWindow || petWindow.isDestroyed()) return;
  const state = readState();
  const [rawWidth] = petWindow.getSize();
  const width = Math.max(180, Math.min(320, rawWidth));
  const [x, y] = petWindow.getPosition();
  // Moving the window must never change the saved pet size.
  saveState({ ...state, size: petWindowWidth || width, position: { x, y } });
}

function boundsUnderPet(width, height, gap = 14) {
  const petBounds = petWindow?.getBounds() || { x: 0, y: 0, width: 0, height: 0 };
  const display = screen.getDisplayMatching(petBounds).workArea;
  const centeredX = Math.round(petBounds.x + (petBounds.width - width) / 2);
  const x = Math.max(display.x + 12, Math.min(centeredX, display.x + display.width - width - 12));
  const belowY = petBounds.y + petBounds.height + gap;
  const aboveY = petBounds.y - height - gap;
  const y = belowY + height <= display.y + display.height - 12
    ? belowY
    : Math.max(display.y + 12, aboveY);
  return { x, y, width, height };
}

function createPanel(type) {
  if (panelWindow && !panelWindow.isDestroyed()) panelWindow.close();
  const petWidth = petWindow?.getBounds()?.width || 210;
  const width = Math.max(180, Math.round(petWidth * 0.92));
  const height = type === 'reader' ? 560 : 520;
  const bounds = boundsUnderPet(width, height, 0);
  panelWindow = new BrowserWindow({
    ...bounds, frame: false, transparent: true, resizable: true,
    minWidth: 180, minHeight: 420, alwaysOnTop: readState().alwaysOnTop !== false,
    skipTaskbar: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      sandbox: true
    }
  });
  panelWindow.loadFile(path.join(__dirname, 'panel.html'), { query: { type } });
  panelWindow.webContents.on('before-input-event', handleEnterShortcut);
  panelWindow.on('closed', () => { panelWindow = null; });
}

async function launchTool(tool) {
  const target = String(tool?.target || '').trim();
  if (!target) return { ok: false, message: '请先填写网址或软件路径' };
  if (/^https?:\/\//i.test(target)) {
    if (isBilibiliUrl(target)) {
      const video = extractBilibiliVideo(target);
      if (video) {
        openBilibiliEmbedded(target, video);
        return { ok: true, embedded: true };
      }
      openBilibiliBrowser(target);
      return { ok: true, embedded: false };
    }
    await shell.openExternal(target);
    return { ok: true };
  }
  const error = await shell.openPath(target);
  return error ? { ok: false, message: error } : { ok: true };
}

function parsedUrl(value) {
  try { return new URL(value); }
  catch { return null; }
}

function isBilibiliUrl(value) {
  const url = parsedUrl(value);
  if (!url) return false;
  const host = url.hostname.toLowerCase();
  return host === 'bilibili.com' || host.endsWith('.bilibili.com') || host === 'b23.tv' || host.endsWith('.b23.tv');
}

function extractBilibiliVideo(value) {
  const url = parsedUrl(value);
  if (!url) return null;
  const bvid = url.pathname.match(/\/video\/(BV[0-9A-Za-z]+)/i)?.[1];
  const aid = url.pathname.match(/\/video\/av(\d+)/i)?.[1];
  if (!bvid && !aid) return null;
  return { bvid, aid, page: Math.max(1, Number(url.searchParams.get('p')) || 1) };
}

function secureRemoteWindowOptions(extra = {}) {
  return {
    ...extra,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      ...(extra.webPreferences || {})
    }
  };
}

function bilibiliPlayerUrl(video) {
  if (!video) return 'https://www.bilibili.com/';
  const params = new URLSearchParams({ page: String(video.page), high_quality: '1', danmaku: '0', autoplay: '1' });
  if (video.bvid) params.set('bvid', video.bvid);
  else params.set('aid', video.aid);
  return `https://player.bilibili.com/player.html?${params}`;
}

function openBilibiliBrowser(target = 'https://www.bilibili.com/') {
  if (!bilibiliWindow || bilibiliWindow.isDestroyed()) {
    bilibiliWindow = new BrowserWindow(secureRemoteWindowOptions({
      width: 1040,
      height: 720,
      minWidth: 760,
      minHeight: 520,
      title: '哔哩哔哩',
      autoHideMenuBar: true,
      backgroundColor: '#ffffff'
    }));
    const handleVideoNavigation = (event, url) => {
      const video = extractBilibiliVideo(url);
      if (!video) return;
      event.preventDefault();
      openBilibiliEmbedded(url, video);
      bilibiliWindow?.hide();
    };
    bilibiliWindow.webContents.on('will-navigate', handleVideoNavigation);
    bilibiliWindow.webContents.on('will-redirect', handleVideoNavigation);
    bilibiliWindow.webContents.on('did-navigate-in-page', (_event, url) => {
      const video = extractBilibiliVideo(url);
      if (video) {
        openBilibiliEmbedded(url, video);
        bilibiliWindow?.hide();
      }
    });
    bilibiliWindow.webContents.setWindowOpenHandler(({ url }) => {
      const video = extractBilibiliVideo(url);
      if (video) {
        openBilibiliEmbedded(url, video);
        bilibiliWindow?.hide();
      } else if (isBilibiliUrl(url)) {
        bilibiliWindow.loadURL(url).catch(() => {});
      } else {
        shell.openExternal(url).catch(() => {});
      }
      return { action: 'deny' };
    });
    bilibiliWindow.on('closed', () => { bilibiliWindow = null; });
  }
  bilibiliWindow.loadURL(target).catch(() => {});
  bilibiliWindow.show();
  bilibiliWindow.focus();
}

function resizePanelForEmbeddedPlayer() {
  if (!panelWindow || panelWindow.isDestroyed()) return;
  const petBounds = petWindow?.getBounds() || { x: 0, y: 0, width: 0, height: 0 };
  const display = screen.getDisplayMatching(petBounds).workArea;
  const width = Math.max(180, Math.round(petBounds.width * 0.92));
  const height = Math.min(620, Math.max(540, display.height - 32));
  const centeredX = Math.round(petBounds.x + (petBounds.width - width) / 2);
  const x = Math.max(display.x + 16, Math.min(centeredX, display.x + display.width - width - 16));
  const belowY = petBounds.y + petBounds.height;
  const aboveY = petBounds.y - height;
  const y = belowY + height <= display.y + display.height - 16
    ? belowY
    : Math.max(display.y + 16, aboveY);
  panelWindow.setBounds({ x, y, width, height }, true);
  panelWindow.show();
  panelWindow.focus();
}

function openBilibiliEmbedded(sourceUrl, video) {
  if (!panelWindow || panelWindow.isDestroyed()) {
    setInlinePanel(true, INLINE_WINDOW_HEIGHT);
    petWindow?.webContents.send('pet:embed-bilibili', { sourceUrl, video, playerUrl: bilibiliPlayerUrl(video) });
    return;
  }
  resizePanelForEmbeddedPlayer();
  panelWindow.webContents.send('panel:embed-bilibili', { sourceUrl, video, playerUrl: bilibiliPlayerUrl(video) });
}

function openBilibiliHomeFromPlayer() {
  if (panelWindow && !panelWindow.isDestroyed()) panelWindow.hide();
  setInlinePanel(false);
  openBilibiliBrowser('https://www.bilibili.com/');
}

function restoreToolsPanel() {
  if (!panelWindow || panelWindow.isDestroyed()) return;
  const width = Math.max(180, Math.round((petWindow?.getBounds()?.width || 210) * 0.92));
  const height = 520;
  panelWindow.setBounds(boundsUnderPet(width, height, 0), true);
  panelWindow.show();
  panelWindow.focus();
}

function toggleWorkMode() {
  if (!petWindow) return;
  petWindow.webContents.send('toggle-work-mode');
}

function enterWorkMode() {
  if (panelWindow && !panelWindow.isDestroyed()) panelWindow.close();
  if (bilibiliWindow && !bilibiliWindow.isDestroyed()) bilibiliWindow.close();
  setInlinePanel(false);
  if (!petWindow || petWindow.isDestroyed()) return;
  petWindow.webContents.send('enter-work-mode');
  showPetWindow();
}

function handleEnterShortcut(event, input) {
  const isEnter = input.key === 'Enter' || input.key === 'Return' || input.code === 'Enter';
  if (input.type !== 'keyDown' || !isEnter || input.control || input.alt || input.meta || input.shift) return;
  event.preventDefault();
  enterWorkMode();
}

function showPetWindow() {
  if (!petWindow || petWindow.isDestroyed()) return;
  petWindow.setIgnoreMouseEvents(false);
  petWindow.setFocusable(true);
  petWindow.show();
  petWindow.focus();
  hiddenByShortcut = false;
}

function hidePetWindow() {
  if (!petWindow || petWindow.isDestroyed()) return;
  petWindow.hide();
  if (panelWindow && !panelWindow.isDestroyed()) panelWindow.hide();
  hiddenByShortcut = true;
}

function toggleVisibility() {
  if (!petWindow || petWindow.isDestroyed()) return;
  if (petWindow.isVisible()) hidePetWindow();
  else showPetWindow();
}

function createTray() {
  const iconPath = path.join(__dirname, '..', 'assets', 'niulai-static.png');
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 20, height: 20 });
  tray = new Tray(icon);
  tray.setToolTip('薪宠 · 点击显示或隐藏');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示薪宠', click: showPetWindow },
    { label: '隐藏薪宠', click: hidePetWindow },
    { label: '检查更新', click: checkForUpdates },
    { type: 'separator' },
    { label: '退出薪宠', click: () => app.quit() }
  ]));
  tray.on('click', showPetWindow);
}

app.whenReady().then(() => {
  createPetWindow();
  createTray();
  setupAutoUpdater();
  // Frameless transparent windows can receive an occasional OS resize hit-test
  // while a pointer is held. Re-assert the active fixed bounds without affecting drag position.
  setInterval(() => {
    if (!petWindow || petWindow.isDestroyed()) return;
    const expectedWidth = petWindowWidth;
    const expectedHeight = inlinePanelOpen ? INLINE_WINDOW_HEIGHT : Math.round(expectedWidth * PET_HEIGHT_RATIO);
    const [width, height] = petWindow.getSize();
    if (width !== expectedWidth || height !== expectedHeight) lockPetWindowSize(expectedWidth, expectedHeight);
  }, 120);
  globalShortcut.register('CommandOrControl+Shift+Enter', toggleWorkMode);
  globalShortcut.register('CommandOrControl+1', toggleVisibility);
  ipcMain.handle('state:read', () => readState());
  ipcMain.handle('state:write', (_event, next) => { saveState(next); return true; });
  ipcMain.handle('state:update-settings', (_event, patch) => {
    const next = { ...readState(), ...patch };
    saveState(next);
    return next;
  });
  ipcMain.handle('state:update-runtime', (_event, patch) => {
    const next = { ...readState(), ...patch };
    saveState(next);
    return next;
  });
  ipcMain.handle('updates:check', () => checkForUpdates());
  ipcMain.handle('updates:install', () => installDownloadedUpdate());
  ipcMain.handle('tool:launch', (event, tool) => launchTool(tool, event));
  ipcMain.handle('tool:pick-executable', async () => {
    const result = await dialog.showOpenDialog(petWindow, {
      title: '选择要接入的软件',
      properties: ['openFile'],
      filters: [
        { name: 'Windows 软件', extensions: ['exe', 'lnk', 'bat', 'cmd'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    });
    return result.canceled || !result.filePaths[0]
      ? { ok: false, canceled: true }
      : { ok: true, path: result.filePaths[0], name: path.basename(result.filePaths[0], path.extname(result.filePaths[0])) };
  });
  ipcMain.handle('pet:pick-image', async () => {
    const result = await dialog.showOpenDialog(petWindow, {
      title: '上传桌宠形象',
      properties: ['openFile'],
      filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }]
    });
    if (result.canceled || !result.filePaths[0]) return { ok: false, canceled: true };
    const source = result.filePaths[0];
    const extension = path.extname(source).toLowerCase();
    const stat = fs.statSync(source);
    if (stat.size > 15 * 1024 * 1024) return { ok: false, message: '图片不能超过 15 MB' };
    const imageDirectory = path.join(app.getPath('userData'), 'pet-images');
    fs.mkdirSync(imageDirectory, { recursive: true });
    const stamp = Date.now();
    const destination = path.join(imageDirectory, `pet-${stamp}${extension}`);
    fs.copyFileSync(source, destination);
    return {
      ok: true,
      appearance: {
        id: `upload-${stamp}`,
        name: path.basename(source, extension),
        src: pathToFileURL(destination).href,
        speakingSrc: pathToFileURL(destination).href,
        fallbackSrc: pathToFileURL(destination).href
      }
    };
  });
  ipcMain.handle('pet:delete-image', async (_event, imageId) => {
    const id = String(imageId || '');
    if (!id.startsWith('upload-')) return { ok: false, message: '内置形象不能删除' };
    const state = readState();
    const item = Array.isArray(state.appearanceHistory) ? state.appearanceHistory.find(entry => entry?.id === id) : null;
    if (!item) return { ok: false, message: '找不到这个形象' };
    try {
      const imageDirectory = path.resolve(path.join(app.getPath('userData'), 'pet-images'));
      const filePath = path.resolve(fileURLToPath(item.src));
      if (filePath.startsWith(imageDirectory + path.sep) && fs.existsSync(filePath)) fs.unlinkSync(filePath);
      const history = (state.appearanceHistory || []).filter(entry => entry?.id !== id);
      const next = { ...state, appearanceHistory: history };
      if (state.petAppearance?.id === id) next.petAppearance = defaults.petAppearance;
      saveState(next);
      return { ok: true, state: next };
    } catch (error) { return { ok: false, message: error?.message || '删除形象失败' }; }
  });
  ipcMain.handle('reader:pick-document', async () => {
    const result = await dialog.showOpenDialog(petWindow, {
      title: '接入电子书或文档',
      properties: ['openFile'],
      filters: [
        { name: '图书与文档', extensions: ['pdf', 'doc', 'docx', 'txt', 'md', 'markdown'] },
        { name: 'PDF', extensions: ['pdf'] },
        { name: 'Word', extensions: ['doc', 'docx'] },
        { name: '文本', extensions: ['txt', 'md', 'markdown'] }
      ]
    });
    if (result.canceled || !result.filePaths[0]) return { ok: false, canceled: true };
    try { return await parseReaderDocument(result.filePaths[0]); }
    catch (error) { return { ok: false, message: error?.message || '文档读取失败' }; }
  });
  ipcMain.on('window:drag', (_event, delta) => {
    if (!petWindow || petWindow.isDestroyed()) return;
    const bounds = petWindow.getBounds();
    const display = screen.getDisplayMatching(bounds).workArea;
    const x = Math.max(display.x + 4, Math.min(Math.round(bounds.x + delta.x), display.x + display.width - bounds.width - 4));
    const y = Math.max(display.y + 4, Math.min(Math.round(bounds.y + delta.y), display.y + display.height - bounds.height - 4));
    petWindow.setPosition(x, y, true);
  });
  ipcMain.on('window:hide', hidePetWindow);
  ipcMain.on('window:panel', (event, type) => {
    if (petWindow && !petWindow.isDestroyed()) {
      if (panelWindow && !panelWindow.isDestroyed()) panelWindow.close();
      const height = 520;
      setInlinePanel(true, height);
      petWindow.webContents.send(type === 'settings' ? 'inline-settings' : type === 'appearance' ? 'inline-appearance' : 'inline-tools');
      return;
    }
    createPanel(type);
  });
  ipcMain.on('window:close-panel', () => panelWindow?.close());
  ipcMain.on('window:restore-tools-panel', restoreToolsPanel);
  ipcMain.on('window:close-inline-panel', () => setInlinePanel(false));
  ipcMain.on('window:resize-inline-panel', (_event, height) => resizeInlinePanel(height));
  ipcMain.on('window:open-bilibili-home', openBilibiliHomeFromPlayer);
  ipcMain.on('pet:enter-work-mode', enterWorkMode);
  ipcMain.on('window:set-always-on-top', (_event, value) => {
    petWindow?.setAlwaysOnTop(Boolean(value)); panelWindow?.setAlwaysOnTop(Boolean(value));
  });
  ipcMain.on('window:set-opacity', (_event, value) => petWindow?.setOpacity(Number(value)));
  ipcMain.on('window:set-size', (_event, value) => {
    const size = Math.max(180, Math.min(320, Number(value)));
    petWindowWidth = size;
    if (petWindow && !petWindow.isDestroyed()) {
      petWindow.setResizable(false);
      lockPetWindowSize(size, inlinePanelOpen ? INLINE_WINDOW_HEIGHT : Math.round(size * PET_HEIGHT_RATIO));
      const state = readState();
      const [x, y] = petWindow.getPosition();
      saveState({ ...state, size, position: { x, y } });
    }
  });
  app.on('web-contents-created', (_event, contents) => {
    if (contents.getType() === 'webview') contents.on('before-input-event', handleEnterShortcut);
  });
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
