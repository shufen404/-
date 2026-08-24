const $ = id => document.getElementById(id);
let state;
let dragStart = null;
let dragPointerId = null;
let didDrag = false;
let lastDragAt = 0;
let lastSave = 0;
let soundIndex = 0;
let activeSound = null;
let clickAudioContext = null;
let basePetHeight = 0;
let inlinePanelOpen = false;
let renderedTasksKey = '';
let readerDocument = null;
let readerPages = [];
let readerPageIndex = 0;
let appearanceOptions = [];
let appliedAppearanceId = '';
let appearanceBottomRatio = 1;
let appearanceBottomPx = null;
const INLINE_TOTAL_HEIGHT = 520;
const INLINE_ATTACH_OVERLAP = 0;
const BUILTIN_APPEARANCES = [
  { id: 'niulai', name: '牛来', src: '../assets/niulai-static.png', speakingSrc: '../assets/niulai-speaking.png', fallbackSrc: '../assets/niulai-static.png' },
  { id: 'cow', name: '小牛', src: '../assets/cow-cutout.png', speakingSrc: '../assets/cow-cutout.png', fallbackSrc: '../assets/cow-cutout.png' },
  { id: 'historical-cow', name: '森林小牛', src: '../assets/niulai-historical-cow.png', speakingSrc: '../assets/niulai-historical-cow.png', fallbackSrc: '../assets/niulai-historical-cow.png' }
];
const DIRECTOR_TASKS = [
  '确认今日选题与核心受众',
  '整理并核对拍摄素材',
  '完成脚本开头三十秒钩子',
  '补齐脚本中的数据来源',
  '检查口播节奏与停顿',
  '设计一版封面标题',
  '整理拍摄分镜与景别',
  '确认今天的拍摄清单',
  '完成素材备份与命名',
  '核对视频字幕与专有名词',
  '记录一个可复用的选题',
  '复盘上一条视频的留存',
  '整理评论区高频问题',
  '补拍缺失的画面证据',
  '确认配乐与音效使用范围',
  '完成剪辑时间线初版',
  '检查画面与台词是否对应',
  '写好视频简介与标签',
  '导出一版预览并检查',
  '记录今天的创作复盘'
];
const petSounds = [
  ['哞','../assets/audio/moo.wav'],
  ['妈妈','../assets/audio/mama.wav'],
  ['牛来','../assets/audio/niulai.wav']
].map(([label,source]) => {
  const audio = new Audio(new URL(source, document.baseURI).href);
  audio.preload = 'auto';
  audio.volume = 0.85;
  return {label,source,audio};
});

function dateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function createDailyTasks(today = dateKey()) {
  const count = 4;
  const pool = [...DIRECTOR_TASKS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return { date: today, items: pool.slice(0, count).map((text, index) => ({ id: `${today}-${index}`, text, done: false })) };
}

function ensureDailyTasks(force = false) {
  const today = dateKey();
  if (!force && state.dailyTasks?.date === today && Array.isArray(state.dailyTasks.items) && state.dailyTasks.items.length >= 3) return false;
  state.dailyTasks = createDailyTasks(today);
  window.salaryPet.updateRuntime({ dailyTasks: state.dailyTasks });
  return true;
}

function checkDailyReset(notify = true) {
  const today = dateKey();
  const needsMigrationReset = Number(state.dailyResetVersion || 0) < 1;
  if (!needsMigrationReset && state.lastResetDate === today) return false;
  state.personalSeconds = 0;
  state.lastResetDate = today;
  state.dailyResetVersion = 1;
  state.lastTick = Date.now();
  state.dailyTasks = createDailyTasks(today);
  window.salaryPet.updateRuntime({ personalSeconds: 0, lastResetDate: today, dailyResetVersion: 1, lastTick: state.lastTick, dailyTasks: state.dailyTasks });
  render();
  if (notify) toast('已到零点，今日摸鱼计薪已重置');
  return true;
}

function workdayCountInMonth() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const days = new Date(year, month + 1, 0).getDate();
  let count = 0;
  for (let day = 1; day <= days; day++) if (state.workdays.includes(new Date(year, month, day).getDay())) count++;
  return Math.max(1, count);
}
function dailyWorkSeconds() {
  const [sh, sm] = state.startTime.split(':').map(Number);
  const [eh, em] = state.endTime.split(':').map(Number);
  let minutes = eh * 60 + em - sh * 60 - sm;
  if (minutes <= 0) minutes += 1440;
  const [lsh,lsm]=(state.lunchStart||'12:00').split(':').map(Number),[leh,lem]=(state.lunchEnd||'13:00').split(':').map(Number);
  let lunchMinutes=leh*60+lem-lsh*60-lsm;if(lunchMinutes<0)lunchMinutes+=1440;
  return Math.max(60, (minutes-lunchMinutes) * 60);
}
function salaryRates() {
  const monthCents = Number(state.salary || 0) * 100;
  const days = workdayCountInMonth();
  const dayCents = monthCents / days;
  const hours = dailyWorkSeconds() / 3600;
  const hourCents = dayCents / hours;
  return { monthCents, days, dayCents, hourCents, secondCents: hourCents / 3600 };
}
const yuan = cents => `¥${(Math.max(0, cents) / 100).toFixed(2)}`;
const duration = seconds => { const h = Math.floor(seconds / 3600), m = Math.floor(seconds % 3600 / 60), s = Math.floor(seconds % 60); return [h,m,s].map(v => String(v).padStart(2,'0')).join(':'); };
function realWorkSeconds() {
  const now = new Date();
  const at = value => { const [h,m]=value.split(':').map(Number); const d=new Date(now); d.setHours(h,m,0,0); return d; };
  const start=at(state.startTime), end=at(state.endTime), lunchStart=at(state.lunchStart||'12:00'), lunchEnd=at(state.lunchEnd||'13:00');
  if(end<=start)end.setDate(end.getDate()+1);
  if(lunchStart<start)lunchStart.setDate(lunchStart.getDate()+1);
  if(lunchEnd<=lunchStart)lunchEnd.setDate(lunchEnd.getDate()+1);
  const until=new Date(Math.min(Math.max(now.getTime(),start.getTime()),end.getTime()));
  let seconds=Math.max(0,(until-start)/1000);
  const overlap=Math.max(0,Math.min(until,lunchEnd)-Math.max(start,lunchStart))/1000;
  const dateSeed=now.getFullYear()*372+(now.getMonth()+1)*31+now.getDate();
  const dailyOffset=160+(dateSeed*37)%41;
  return Math.max(0,seconds-overlap-dailyOffset);
}

function toast(text) { $('toast').textContent = text; $('toast').classList.add('show'); setTimeout(() => $('toast').classList.remove('show'), 1700); }
function save(force=false) { const now=Date.now(); if(force || now-lastSave>5000){lastSave=now; window.salaryPet.updateRuntime({status:state.status,resumeStatus:state.resumeStatus,personalSeconds:state.personalSeconds,workSeconds:state.workSeconds,lastTick:state.lastTick});} }
function setStatus(next) {
  if (next === 'work' && state.status !== 'work') state.resumeStatus = state.status;
  state.status = next;
  state.lastTick = Date.now();
  save(true); render();
}
function toggleWorkMode() {
  if (state.status === 'work') { setStatus(state.resumeStatus || 'personal'); toast('回到摸鱼模式，继续计薪'); }
  else { setStatus('work'); toast('已进入工作模式，暂停计薪'); }
}
function enterWorkMode() {
  if (state.status === 'work') {
    setStatus('personal');
    toast('已回到个人模式，继续计薪');
    return;
  }
  if (activeSound) { activeSound.pause(); activeSound.currentTime = 0; }
  $('petButton').classList.remove('speaking');
  $('coinLayer').replaceChildren();
  setStatus('work');
  toast('已终止个人模式，回到工作模式');
}
function render() {
  const root=$('petRoot');
  // Runtime ticks must not remove the inline panel state from the root node.
  root.classList.remove('idle','personal','paused','work');
  root.classList.add('pet-root', state.status);
  const rates=salaryRates(); const earned=state.personalSeconds*rates.secondCents;
  const labels={idle:'摸鱼薪资未开启',personal:'摸鱼薪资累加中',paused:'摸鱼薪资已关闭',work:'工作中'};
  $('statusText').textContent=labels[state.status]||labels.idle;
  if(state.status==='work') { $('mainValue').textContent=duration(realWorkSeconds()); $('subValue').textContent='今日实际上班时长 · 已扣午休和约 3 分钟'; }
  else if(state.status==='personal') { $('mainValue').textContent=yuan(earned); $('subValue').textContent=`${rates.days} 个工作日 · 秒薪 ¥${(rates.secondCents/100).toFixed(4)}`; }
  else { $('mainValue').textContent='—'; $('subValue').textContent='开启后按秒累计摸鱼薪资'; }
  const running=state.status==='personal'; $('startIcon').textContent=running?'■':'▶'; $('startText').textContent=running?'关闭':'开启';
  applyPetAppearance();
  renderWorkTasks();
}

function currentAppearance() {
  return state?.petAppearance || BUILTIN_APPEARANCES[0];
}

function applyPetAppearance() {
  const appearance = currentAppearance();
  if (!appearance?.src || appearance.id === appliedAppearanceId) return;
  appliedAppearanceId = appearance.id;
  const main = $('petAnimation');
  const speaking = $('petSpeaking');
  const fallback = $('petFallback');
  main.src = appearance.src;
  speaking.src = appearance.speakingSrc || appearance.src;
  fallback.src = appearance.fallbackSrc || appearance.src;
  main.alt = `${appearance.name || '桌宠'}形象`;
  speaking.alt = `${appearance.name || '桌宠'}说话中的形象`;
  fallback.alt = `${appearance.name || '桌宠'}形象`;
  $('petRoot').dataset.appearance = appearance.id;
  measureAppearanceAnchor();
}

function measureAppearanceAnchor() {
  const image = $('petAnimation');
  if (!image?.complete || !image.naturalWidth || !image.naturalHeight) return;
  try {
    const size = 160;
    const scale = Math.min(size / image.naturalWidth, size / image.naturalHeight);
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true }); context.clearRect(0, 0, width, height); context.drawImage(image, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height).data;
    const edge = []; const step = Math.max(1, Math.round(Math.min(width, height) / 24));
    const addEdge = index => { const o = index * 4; edge.push([pixels[o], pixels[o + 1], pixels[o + 2]]); };
    for (let x = 0; x < width; x += step) { addEdge(x); addEdge((height - 1) * width + x); }
    for (let y = 0; y < height; y += step) { addEdge(y * width); addEdge(y * width + width - 1); }
    let bottom = -1;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4; const alpha = pixels[o + 3];
      const background = alpha < 18 || edge.some(([r, g, b]) => Math.hypot(pixels[o] - r, pixels[o + 1] - g, pixels[o + 2] - b) < 34);
      if (!background) bottom = Math.max(bottom, y);
    }
    appearanceBottomRatio = bottom < 0 ? 1 : Math.max(.45, Math.min(1, (bottom + 1) / height));
  } catch { appearanceBottomRatio = 1; }
  const rootRect = $('petRoot').getBoundingClientRect();
  const imageRect = image.getBoundingClientRect();
  const renderedScale = Math.min(imageRect.width / image.naturalWidth, imageRect.height / image.naturalHeight);
  const renderedHeight = image.naturalHeight * renderedScale;
  const offsetY = Math.max(0, (imageRect.height - renderedHeight) / 2);
  appearanceBottomPx = Math.max(0, imageRect.top - rootRect.top + offsetY + renderedHeight * appearanceBottomRatio);
  $('petRoot').style.setProperty('--appearance-bottom-px', `${Math.round(appearanceBottomPx)}px`);
  if (inlinePanelOpen) layoutInlineShell();
}

function renderWorkTasks() {
  const host = $('workTasks');
  if (!host) return;
  const items = state.dailyTasks?.items || [];
  const renderKey = `${state.dailyTasks?.date || ''}|${items.map(item => `${item.id}:${item.done ? 1 : 0}:${item.text}`).join('|')}`;
  if (renderKey === renderedTasksKey) return;
  renderedTasksKey = renderKey;
  host.innerHTML = items.map(item => `<div class="work-task${item.done ? ' done' : ''}"><button class="work-task-check" type="button" data-task-id="${item.id}" aria-label="${item.done ? '取消完成' : '完成'}：${item.text}" aria-pressed="${item.done}">${item.done ? '✓' : ''}</button><span>${item.text}</span></div>`).join('');
}

function toggleWorkTask(id) {
  const item = state.dailyTasks?.items?.find(entry => entry.id === id);
  if (!item) return;
  item.done = !item.done;
  window.salaryPet.updateRuntime({ dailyTasks: state.dailyTasks });
  renderWorkTasks();
}
function tick() {
  if (checkDailyReset(true)) return;
  const now=Date.now(); const last=state.lastTick||now; const delta=Math.max(0,Math.min(3,(now-last)/1000)); state.lastTick=now;
  if(state.status==='personal') state.personalSeconds+=delta;
  if(state.status==='work') state.workSeconds+=delta;
  render(); save();
}
function coinBurst(){
  const count=6+Math.floor(Math.random()*4);
  for(let i=0;i<count;i++){
    const c=document.createElement('i');
    const delay=i*.08+Math.random()*.16;
    const duration=1.25+Math.random()*.45;
    c.className='coin';
    c.textContent='¥';
    c.style.left=`${18+Math.random()*64}%`;
    c.style.setProperty('--start-y',`${12+Math.random()*18}%`);
    c.style.setProperty('--drift',`${-38+Math.random()*76}px`);
    c.style.setProperty('--fall',`${78+Math.random()*62}px`);
    c.style.setProperty('--spin',`${220+Math.random()*260}deg`);
    c.style.setProperty('--delay',`${delay}s`);
    c.style.setProperty('--duration',`${duration}s`);
    $('coinLayer').appendChild(c);
    setTimeout(()=>c.remove(),(delay+duration)*1000+120);
  }
}
function startCoinShower(){
  if (state?.status === 'personal') coinBurst();
  setTimeout(startCoinShower,1700+Math.random()*900);
}
function playClickEffect(){
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if(!AudioContext) return;
  clickAudioContext ||= new AudioContext();
  if(clickAudioContext.state === 'suspended') clickAudioContext.resume().catch(()=>{});
  const now = clickAudioContext.currentTime;
  const gain = clickAudioContext.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.16, now + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.075);
  gain.connect(clickAudioContext.destination);
  const click = clickAudioContext.createOscillator();
  click.type = 'triangle';
  click.frequency.setValueAtTime(920, now);
  click.frequency.exponentialRampToValueAtTime(430, now + 0.065);
  click.connect(gain);
  click.start(now);
  click.stop(now + 0.08);
}
function playPetSound(){
  if(activeSound){activeSound.pause();activeSound.currentTime=0;}
  const sound = petSounds[soundIndex];
  activeSound=sound.audio;
  soundIndex=(soundIndex+1)%petSounds.length;
  activeSound.currentTime=0;
  activeSound.load();
  $('petButton').classList.add('speaking');
  const stopSpeaking = () => $('petButton').classList.remove('speaking');
  activeSound.onended = stopSpeaking;
  activeSound.onerror = () => setTimeout(stopSpeaking, 900);
  const playback = activeSound.play();
  if (playback?.catch) playback.catch(() => {
    stopSpeaking();
    toast(`语音加载失败：${sound.label}`);
  });
  $('petButton').setAttribute('aria-label',`播放牛来语音，下一段：${petSounds[soundIndex].label}`);
}
function thankBoss(){const lines=['感谢老板','老板大气','老板发财','谢谢老板'];const line=$('bossLine');line.textContent=lines[Math.floor(Math.random()*lines.length)];line.classList.remove('fly');void line.offsetWidth;line.classList.add('fly');}
function activatePet(){ playClickEffect(); thankBoss(); playPetSound(); }

function beginPetDrag(e) {
  if (e.button !== 0 || e.target.closest('.panel-actions button, .inline-panel-host, input, select, textarea')) return false;
  dragStart = { x: e.screenX, y: e.screenY, originX: e.screenX, originY: e.screenY };
  dragPointerId = e.pointerId;
  didDrag = false;
  (e.currentTarget || $('petRoot')).setPointerCapture(e.pointerId);
  return true;
}

function layoutInlineShell() {
  const baseHeight = Math.round(window.innerWidth * 1.24);
  const imageHeight = Math.round(baseHeight * .42);
  const cardHeight = Math.round(baseHeight * .58);
  const measuredBottom = Number.parseFloat(getComputedStyle($('petRoot')).getPropertyValue('--appearance-bottom-px'));
  const cardTop = Number.isFinite(measuredBottom) ? Math.max(0, Math.round(measuredBottom + 2)) : Math.max(0, imageHeight + 2);
  const panelTop = cardTop + cardHeight;
  const panelHeight = Math.max(180, Math.round(INLINE_TOTAL_HEIGHT - panelTop));
  document.documentElement.style.setProperty('--inline-top', `${panelTop}px`);
  document.documentElement.style.setProperty('--inline-height', `${panelHeight}px`);
  $('petRoot').style.setProperty('--inline-card-top', `${cardTop}px`);
  $('petRoot').style.setProperty('--card-height', `${cardHeight}px`);
  $('petRoot').style.setProperty('--pet-image-height', `${imageHeight}px`);
  return { panelHeight };
}

function showInlinePanel(type) {
  const host = $('inlinePanelHost');
  if (!host) return;
  inlinePanelOpen = true;
  host.classList.remove('inline-player-host', 'arcade-theme', 'appearance-host');
  layoutInlineShell();
  host.innerHTML = type === 'settings' ? inlineSettingsMarkup() : inlineToolsMarkup();
  if (type === 'settings') bindInlineSettings();
  else bindInlineTools();
  $('petRoot').classList.add('inline-open');
  $('petRoot').classList.remove('appearance-open');
  host.setAttribute('aria-hidden', 'false');
}

function hideInlinePanel(notifyMain = true) {
  const host = $('inlinePanelHost');
  inlinePanelOpen = false;
  if (host) { host.replaceChildren(); host.classList.remove('inline-player-host', 'arcade-theme', 'appearance-host'); }
  host?.setAttribute('aria-hidden', 'true');
  $('petRoot').classList.remove('inline-open');
  $('petRoot').classList.remove('appearance-open');
  if (notifyMain) window.salaryPet.closeInlinePanel();
}

function appearanceCardMarkup(appearance, index, activeId) {
  const active = appearance.id === activeId ? ' active' : '';
  const remove = appearance.id.startsWith('upload-') ? `<button class="appearance-remove" data-remove-appearance="${escInline(appearance.id)}" title="删除此形象" aria-label="删除${escInline(appearance.name)}">×</button>` : '';
  return `<div class="appearance-option${active}"><button class="appearance-select" data-appearance-index="${index}" title="使用${escInline(appearance.name)}"><img src="${escInline(appearance.src)}" alt="${escInline(appearance.name)}"><span>${escInline(appearance.name)}</span></button>${remove}</div>`;
}

function showAppearancePanel() {
  const host = $('inlinePanelHost');
  if (!host) return;
  inlinePanelOpen = true;
  layoutInlineShell();
  $('petRoot').classList.add('inline-open');
  $('petRoot').classList.add('appearance-open');
  host.classList.remove('inline-player-host', 'arcade-theme');
  host.classList.add('appearance-host');
  host.setAttribute('aria-hidden', 'false');
  const saved = Array.isArray(state.appearanceHistory) ? state.appearanceHistory : [];
  appearanceOptions = [...BUILTIN_APPEARANCES, ...saved.filter(item => item?.src && !BUILTIN_APPEARANCES.some(builtin => builtin.id === item.id))];
  const activeId = currentAppearance().id;
  host.innerHTML = `<div class="inline-content appearance-panel"><header><span>桌宠形象</span><strong>更换形象</strong><button id="appearanceBack" title="返回主面板">←</button><button id="appearanceClose" title="关闭">×</button></header><div class="appearance-current"><span>当前形象</span><strong>${escInline(currentAppearance().name || '牛来')}</strong></div><div class="appearance-grid">${appearanceOptions.map((appearance, index) => appearanceCardMarkup(appearance, index, activeId)).join('')}</div><button class="appearance-upload" id="appearanceUpload"><span>＋</span><strong>添加图片</strong><small>透明 PNG · JPG · WEBP · GIF</small></button><p class="appearance-hint">请上传已经抠好的透明形象；软件只负责保存、缩放、投影和动态效果。</p></div>`;
  $('appearanceBack').onclick = () => hideInlinePanel();
  $('appearanceClose').onclick = hideInlinePanel;
  document.querySelectorAll('[data-appearance-index]').forEach(button => button.onclick = () => selectAppearance(Number(button.dataset.appearanceIndex)));
  document.querySelectorAll('[data-remove-appearance]').forEach(button => button.onclick = event => { event.stopPropagation(); removeAppearance(button.dataset.removeAppearance); });
  $('appearanceUpload').onclick = uploadAppearance;
}

async function selectAppearance(index) {
  const appearance = appearanceOptions[index];
  if (!appearance?.src) return;
  state.petAppearance = appearance;
  const existing = Array.isArray(state.appearanceHistory) ? state.appearanceHistory : [];
  const history = appearance.id.startsWith('upload-') ? [appearance, ...existing.filter(item => item.id !== appearance.id)].slice(0, 12) : existing;
  state.appearanceHistory = history;
  appliedAppearanceId = '';
  applyPetAppearance();
  state = await window.salaryPet.updateSettings({ petAppearance: appearance, appearanceHistory: history });
  showAppearancePanel();
  toast(`已切换为${appearance.name || '新形象'}`);
}

async function uploadAppearance() {
  const result = await window.salaryPet.pickPetImage();
  if (result?.canceled) return;
  if (!result?.ok) { toast(result?.message || '图片上传失败'); return; }
  const appearance = result.appearance;
  state.petAppearance = appearance;
  const existing = Array.isArray(state.appearanceHistory) ? state.appearanceHistory : [];
  const history = [appearance, ...existing.filter(item => item.id !== appearance.id)].slice(0, 12);
  state.appearanceHistory = history;
  appliedAppearanceId = '';
  applyPetAppearance();
  state = await window.salaryPet.updateSettings({ petAppearance: appearance, appearanceHistory: history });
  showAppearancePanel();
  toast('新形象已上传并应用');
}

async function removeAppearance(id) {
  const appearance = (state.appearanceHistory || []).find(item => item?.id === id);
  if (!appearance) return;
  const result = await window.salaryPet.deletePetImage(id);
  if (!result?.ok) { toast(result?.message || '删除形象失败'); return; }
  state = result.state || state;
  appliedAppearanceId = '';
  applyPetAppearance();
  showAppearancePanel();
  toast(`已删除${appearance.name || '自定义形象'}`);
}

function forwardInlineVideo(payload) {
  const host = $('inlinePanelHost');
  if (!host) return;
  inlinePanelOpen = true;
  host.classList.remove('inline-player-host', 'arcade-theme');
  $('petRoot').classList.add('inline-open');
  host.setAttribute('aria-hidden', 'false');
  const { panelHeight } = layoutInlineShell();
  host.classList.add('inline-player-host', 'arcade-theme');
  host.innerHTML = `<div class="inline-player-toolbar"><button id="inlinePlayerHome" title="返回哔哩哔哩首页" aria-label="返回哔哩哔哩首页">←</button><button id="inlinePlayerClose" title="关闭播放器" aria-label="关闭播放器">×</button></div><webview id="inlinePlayer" src="${String(payload.playerUrl || '').replace(/"/g, '&quot;')}" partition="persist:niulai-bilibili"></webview>`;
  const videoWidth = host.clientWidth || Math.max(180, Math.round(window.innerWidth * .92));
  const videoHeight = Math.min(Math.round(videoWidth * 9 / 16), Math.max(100, host.clientHeight - 42));
  const playerHeight = Math.min(panelHeight, videoHeight + 42);
  document.documentElement.style.setProperty('--inline-video-height', `${videoHeight}px`);
  document.documentElement.style.setProperty('--inline-height', `${Math.max(180, panelHeight, playerHeight)}px`);
  $('inlinePlayerClose').onclick = () => window.salaryPet.enterWorkMode();
  $('inlinePlayerHome').onclick = () => window.salaryPet.openBilibiliHome();
}

function escInline(value) { return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function inlineToolsMarkup() {
  const tools = Array.isArray(state?.tools) ? state.tools : [];
  const card = (icon, name, detail, id = '', extra = '') => `<button class="inline-card" ${id ? `id="${id}"` : ''} ${extra}><span class="inline-card-icon">${icon}</span><span class="inline-card-copy"><strong>${name}</strong><small>${detail}</small></span></button>`;
  const reader = `<div class="inline-card inline-tool-row"><button class="inline-card-main" id="inlineReader"><span class="inline-card-icon">▤</span><span class="inline-card-copy"><strong>电子书</strong><small>PDF · Word · TXT · Markdown</small></span></button><button class="inline-card-action" id="inlineReaderConnect" title="接入电子书" aria-label="接入电子书">＋</button></div>`;
  const software = `<div class="inline-card inline-tool-row"><button class="inline-card-main" id="inlineSoftware"><span class="inline-card-icon">▣</span><span class="inline-card-copy"><strong>接入软件</strong><small>网址或本地软件都可以</small></span></button><button class="inline-card-action" id="inlineSoftwareConnect" title="接入软件" aria-label="接入软件">＋</button></div>`;
  const game = `<div class="inline-card inline-tool-row"><button class="inline-card-main" id="inlineGame"><span class="inline-card-icon">◎</span><span class="inline-card-copy"><strong>小游戏</strong><small>第一视角霓虹靶场 · 30 秒挑战</small></span></button><button class="inline-card-action" id="inlineGameConnect" title="打开小游戏" aria-label="打开小游戏">＋</button></div>`;
  return `<div class="inline-content"><header><span>摸鱼工具</span><strong>工具</strong><button id="inlineClose" title="关闭工具栏">×</button></header>${reader}${software}${game}${tools.map((t,i)=>`<button class="inline-card" data-tool="${i}"><span class="inline-card-icon">↗</span><span class="inline-card-copy"><strong>${escInline(t.name)}</strong><small>${escInline(t.target)}</small></span><b>打开</b></button>`).join('')}</div>`;
}
function bindInlineTools() {
  $('inlineClose').onclick = hideInlinePanel;
  $('inlineGame').onclick = showInlineGame;
  $('inlineGameConnect').onclick = showInlineGame;
  $('inlineReader').onclick = () => showInlineReader();
  $('inlineReaderConnect').onclick = () => showInlineReader();
  $('inlineSoftware').onclick = showInlineSoftwareForm;
  $('inlineSoftwareConnect').onclick = showInlineSoftwareForm;
  document.querySelectorAll('[data-tool]').forEach(el => el.onclick = () => window.salaryPet.launchTool((state.tools || [])[Number(el.dataset.tool)]));
}

function showInlineGame() {
  const host = $('inlinePanelHost');
  if (!host) return;
  inlinePanelOpen = true;
  layoutInlineShell();
  $('petRoot').classList.add('inline-open');
  host.classList.remove('inline-player-host');
  host.classList.add('arcade-theme', 'inline-game-host');
  host.setAttribute('aria-hidden', 'false');
  host.innerHTML = `<section class="arcade-stage game-shell"><header class="arcade-toolbar"><button id="gameBack" title="返回工具">←</button><strong>霓虹靶场</strong><button id="gameClose" title="关闭小游戏">×</button></header><webview id="inlineGameView" src="target-range.html" partition="persist:niulai-game"></webview></section>`;
  $('gameBack').onclick = () => showInlinePanel('tools');
  $('gameClose').onclick = hideInlinePanel;
}

function showInlineSoftwareForm() {
  const host = $('inlinePanelHost');
  if (!host) return;
  host.classList.remove('inline-player-host', 'arcade-theme');
  host.innerHTML = `<div class="inline-content inline-software"><header><span>摸鱼工具</span><strong>接入软件</strong><button id="softwareBack" title="返回工具">←</button><button id="softwareClose" title="关闭">×</button></header><div class="inline-form-row"><label>软件名称</label><input class="inline-input" id="softwareName" placeholder="例如：哔哩哔哩" autocomplete="off"></div><div class="inline-form-row"><label>网址或程序路径</label><div class="software-target-row"><input class="inline-input" id="softwareTarget" placeholder="https:// 或本地程序路径" autocomplete="off"><button id="softwareBrowse" title="选择本地软件">…</button></div></div><div class="software-presets"><button data-name="抖音" data-target="https://www.douyin.com/">抖音</button><button data-name="哔哩哔哩" data-target="https://www.bilibili.com/">哔哩哔哩</button></div><div class="inline-actions"><button class="inline-primary" id="softwareSave">保存入口</button><button class="inline-secondary" id="softwareCancel">取消</button></div></div>`;
  $('softwareBack').onclick = () => showInlinePanel('tools');
  $('softwareClose').onclick = hideInlinePanel;
  $('softwareCancel').onclick = () => showInlinePanel('tools');
  document.querySelectorAll('.software-presets button').forEach(button => {
    button.onclick = () => { $('softwareName').value = button.dataset.name; $('softwareTarget').value = button.dataset.target; };
  });
  $('softwareBrowse').onclick = async () => {
    const result = await window.salaryPet.pickExecutable();
    if (!result?.ok) return;
    $('softwareTarget').value = result.path;
    if (!$('softwareName').value.trim()) $('softwareName').value = result.name;
  };
  $('softwareSave').onclick = async () => {
    const name = $('softwareName').value.trim();
    const target = $('softwareTarget').value.trim();
    if (!name || !target) {
      $('softwareTarget').setCustomValidity('请填写软件名称和网址或路径');
      $('softwareTarget').reportValidity();
      return;
    }
    $('softwareTarget').setCustomValidity('');
    const tools = [...(Array.isArray(state.tools) ? state.tools : []), { name, target }];
    state = await window.salaryPet.updateSettings({ tools });
    showInlinePanel('tools');
    toast('软件入口已接入');
  };
}

function paginateReaderText(text, targetLength = 1500) {
  const paragraphs = String(text || '').split(/\n{2,}/).map(value => value.trim()).filter(Boolean);
  const pages = [];
  let current = '';
  for (const paragraph of paragraphs) {
    const parts = paragraph.length > targetLength
      ? paragraph.match(new RegExp(`[\\s\\S]{1,${targetLength}}`, 'g')) || []
      : [paragraph];
    for (const part of parts) {
      if (current && current.length + part.length > targetLength) {
        pages.push(current.trim());
        current = '';
      }
      current += `${current ? '\n\n' : ''}${part}`;
    }
  }
  if (current.trim()) pages.push(current.trim());
  return pages.length ? pages : [''];
}

function currentReaderSettings() {
  const saved = state?.readerSettings || {};
  return {
    fontFamily: ['serif', 'sans', 'mono'].includes(saved.fontFamily) ? saved.fontFamily : 'serif',
    fontSize: Math.max(12, Math.min(24, Number(saved.fontSize) || 16)),
    lineHeight: Math.max(1.4, Math.min(2.2, Number(saved.lineHeight) || 1.8))
  };
}

function readerFontStack(value) {
  if (value === 'sans') return '"Microsoft YaHei UI","PingFang SC",sans-serif';
  if (value === 'mono') return '"Cascadia Mono","Microsoft YaHei UI",monospace';
  return '"Source Han Serif SC","Noto Serif CJK SC","SimSun",serif';
}

function applyReaderSettings() {
  const page = $('readerPage');
  if (!page) return;
  const settings = currentReaderSettings();
  page.style.fontFamily = readerFontStack(settings.fontFamily);
  page.style.fontSize = `${settings.fontSize}px`;
  page.style.lineHeight = String(settings.lineHeight);
  if ($('readerFont')) $('readerFont').value = settings.fontFamily;
  if ($('readerSize')) $('readerSize').textContent = `${settings.fontSize}`;
  if ($('readerLeading')) $('readerLeading').textContent = settings.lineHeight.toFixed(1);
}

function saveReaderSettings(patch) {
  state.readerSettings = { ...currentReaderSettings(), ...patch };
  window.salaryPet.updateSettings({ readerSettings: state.readerSettings });
  applyReaderSettings();
}

function renderReaderPage() {
  const page = $('readerPage');
  if (!page || !readerDocument) return;
  readerPageIndex = Math.max(0, Math.min(readerPages.length - 1, readerPageIndex));
  page.textContent = readerPages[readerPageIndex] || '';
  page.scrollTop = 0;
  $('readerPageCount').textContent = `${readerPageIndex + 1} / ${readerPages.length}`;
  $('readerPrev').disabled = readerPageIndex === 0;
  $('readerNext').disabled = readerPageIndex >= readerPages.length - 1;
  applyReaderSettings();
}

async function importReaderDocument() {
  const button = $('readerImport');
  if (button) { button.disabled = true; button.textContent = '读取中'; }
  const result = await window.salaryPet.pickReaderDocument();
  if (result?.canceled) {
    if (button) { button.disabled = false; button.textContent = readerDocument ? '换书' : '选择文档'; }
    return;
  }
  if (!result?.ok) {
    if (button) { button.disabled = false; button.textContent = readerDocument ? '换书' : '选择文档'; }
    toast(result?.message || '文档读取失败');
    return;
  }
  readerDocument = result;
  readerPages = paginateReaderText(result.text);
  readerPageIndex = 0;
  showInlineReader(readerDocument);
}

function showInlineReader(documentData = readerDocument) {
  const host = $('inlinePanelHost');
  if (!host) return;
  inlinePanelOpen = true;
  layoutInlineShell();
  $('petRoot').classList.add('inline-open');
  host.classList.remove('inline-player-host');
  host.classList.add('arcade-theme');
  host.setAttribute('aria-hidden', 'false');
  const settings = currentReaderSettings();
  const documentView = documentData
    ? `<div class="reader-meta"><strong title="${escInline(documentData.name)}">${escInline(documentData.name)}</strong><span>${escInline(documentData.format)} · ${Number(documentData.characterCount || 0).toLocaleString()} 字</span></div><div class="reader-controls"><select id="readerFont" title="字体"><option value="serif">宋体</option><option value="sans">黑体</option><option value="mono">等宽</option></select><button id="readerSmaller" title="减小字号">A−</button><output id="readerSize">${settings.fontSize}</output><button id="readerLarger" title="增大字号">A＋</button><button id="readerTighter" title="缩小行距">↕−</button><output id="readerLeading">${settings.lineHeight.toFixed(1)}</output><button id="readerLooser" title="增大行距">↕＋</button></div><article class="reader-page" id="readerPage" tabindex="0"></article><footer class="reader-pager"><button id="readerPrev" title="上一页">←</button><span id="readerPageCount"></span><button id="readerNext" title="下一页">→</button></footer>`
    : `<div class="reader-empty"><span class="reader-empty-icon">▤</span><strong>接入一本书</strong><small>PDF · Word · TXT · Markdown</small></div>`;
  host.innerHTML = `<section class="arcade-stage reader-shell"><header class="arcade-toolbar"><button id="readerBack" title="返回工具">←</button><strong>霓虹阅读器</strong><button class="reader-import" id="readerImport">${documentData ? '换书' : '选择文档'}</button><button id="readerClose" title="关闭阅读器">×</button></header>${documentView}</section>`;
  $('readerBack').onclick = () => showInlinePanel('tools');
  $('readerClose').onclick = hideInlinePanel;
  $('readerImport').onclick = importReaderDocument;
  if (!documentData) return;
  $('readerFont').value = settings.fontFamily;
  $('readerFont').onchange = event => saveReaderSettings({ fontFamily: event.target.value });
  $('readerSmaller').onclick = () => saveReaderSettings({ fontSize: currentReaderSettings().fontSize - 1 });
  $('readerLarger').onclick = () => saveReaderSettings({ fontSize: currentReaderSettings().fontSize + 1 });
  $('readerTighter').onclick = () => saveReaderSettings({ lineHeight: currentReaderSettings().lineHeight - 0.1 });
  $('readerLooser').onclick = () => saveReaderSettings({ lineHeight: currentReaderSettings().lineHeight + 0.1 });
  $('readerPrev').onclick = () => { readerPageIndex -= 1; renderReaderPage(); };
  $('readerNext').onclick = () => { readerPageIndex += 1; renderReaderPage(); };
  renderReaderPage();
}
const inlineDayOptions = [['一',1],['二',2],['三',3],['四',4],['五',5],['六',6],['日',0]];
function inlineSelectedDays() {
  return [...document.querySelectorAll('.inline-days input:checked')].map(input => Number(input.value));
}
function inlineMonthWorkdays(days) {
  const now = new Date();
  const count = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  let result = 0;
  for (let day = 1; day <= count; day++) if (days.includes(new Date(now.getFullYear(), now.getMonth(), day).getDay())) result++;
  return Math.max(1, result);
}
function inlineMinutesBetween(start, end) {
  const [sh, sm] = start.split(':').map(Number), [eh, em] = end.split(':').map(Number);
  let minutes = eh * 60 + em - sh * 60 - sm;
  if (minutes <= 0) minutes += 1440;
  return minutes;
}
function refreshInlineSalaryPreview() {
  const salary = Number($('inlineSalary').value) || 0;
  const days = inlineMonthWorkdays(inlineSelectedDays());
  const grossMinutes = inlineMinutesBetween($('inlineStartTime').value, $('inlineEndTime').value);
  const lunchMinutes = inlineMinutesBetween($('inlineLunchStart').value, $('inlineLunchEnd').value);
  const hours = Math.max(1 / 60, (grossMinutes - lunchMinutes) / 60);
  const daySalary = salary / days;
  const hourSalary = daySalary / hours;
  $('inlineSalaryPreview').innerHTML = `<div><span>本月工作日</span><b>${days} 天</b></div><div><span>日薪</span><b>¥${daySalary.toFixed(2)}</b></div><div><span>时薪</span><b>¥${hourSalary.toFixed(2)}</b></div><div><span>秒薪</span><b>¥${(hourSalary / 3600).toFixed(4)}</b></div>`;
}
function inlineSettingsMarkup() {
  const current = state || { salary: 18000, workdays: [1,2,3,4,5], startTime: '09:00', endTime: '18:00', lunchStart: '12:00', lunchEnd: '13:00', size: 210, opacity: 1, alwaysOnTop: true };
  return `<div class="inline-content inline-settings"><header><span>本地配置</span><strong>设置</strong><button id="inlineClose" title="关闭设置">×</button></header><div class="inline-form-row"><label>月薪金额</label><input class="inline-input" id="inlineSalary" type="number" min="0.01" step="0.01" value="${current.salary}"></div><div class="inline-form-row"><label>工作日</label><div class="inline-days">${inlineDayOptions.map(([name,value]) => `<label><input type="checkbox" value="${value}" ${current.workdays.includes(value) ? 'checked' : ''}><span>${name}</span></label>`).join('')}</div></div><div class="inline-form-row"><label>上班时段</label><div class="inline-time-pair"><input class="inline-input" id="inlineStartTime" type="time" value="${current.startTime}"><input class="inline-input" id="inlineEndTime" type="time" value="${current.endTime}"></div></div><div class="inline-form-row"><label>午休时段</label><div class="inline-time-pair"><input class="inline-input" id="inlineLunchStart" type="time" value="${current.lunchStart || '12:00'}"><input class="inline-input" id="inlineLunchEnd" type="time" value="${current.lunchEnd || '13:00'}"></div></div><div class="inline-salary-preview" id="inlineSalaryPreview"></div><div class="inline-form-row"><label>桌宠大小 <span id="inlineSizeOut">${current.size}px</span></label><input class="inline-range" id="inlineSize" type="range" min="180" max="320" step="10" value="${current.size}"></div><div class="inline-form-row"><label>透明度</label><input class="inline-range" id="inlineOpacity" type="range" min="0.45" max="1" step="0.05" value="${current.opacity}"></div><div class="inline-form-row inline-toggle-row"><div><label>始终置顶</label><small>默认开启</small></div><input class="inline-toggle" id="inlineAlwaysOnTop" type="checkbox" ${current.alwaysOnTop ? 'checked' : ''}></div><div class="inline-hint">Enter：切换个人模式 / 工作模式<br>全局切换：Ctrl + Shift + Enter<br>显示/隐藏：Ctrl + 1</div><div class="inline-actions"><button class="inline-primary" id="inlineSave">保存设置</button></div></div>`;
}
function bindInlineSettings() {
  $('inlineClose').onclick = hideInlinePanel;
  ['inlineSalary','inlineStartTime','inlineEndTime','inlineLunchStart','inlineLunchEnd'].forEach(id => $(id).addEventListener('input', refreshInlineSalaryPreview));
  document.querySelectorAll('.inline-days input').forEach(input => input.addEventListener('change', refreshInlineSalaryPreview));
  $('inlineSize').oninput = e => { $('inlineSizeOut').textContent = `${e.target.value}px`; window.salaryPet.setSize(Number(e.target.value)); };
  $('inlineOpacity').oninput = e => window.salaryPet.setOpacity(Number(e.target.value));
  $('inlineAlwaysOnTop').onchange = e => window.salaryPet.setAlwaysOnTop(e.target.checked);
  $('inlineSave').onclick = async () => {
    state = await window.salaryPet.updateSettings({ salary: Number($('inlineSalary').value) || 0.01, workdays: inlineSelectedDays(), startTime: $('inlineStartTime').value, endTime: $('inlineEndTime').value, lunchStart: $('inlineLunchStart').value, lunchEnd: $('inlineLunchEnd').value, size: Number($('inlineSize').value), opacity: Number($('inlineOpacity').value), alwaysOnTop: $('inlineAlwaysOnTop').checked });
    render();
    toast('设置已保存并重新计算');
  };
  refreshInlineSalaryPreview();
}

window.addEventListener('DOMContentLoaded', async () => {
  basePetHeight = Math.round(window.innerHeight);
  state=await window.salaryPet.readState();
  checkDailyReset(false);
  ensureDailyTasks();
  render();
  $('petAnimation').addEventListener('load',()=>{$('petButton').classList.remove('fallback'); measureAppearanceAnchor();});
  $('petAnimation').addEventListener('error',()=>{$('petButton').classList.add('fallback')});
  $('petButton').addEventListener('pointerdown',e=>{ e.stopPropagation(); beginPetDrag(e); });
  $('petButton').addEventListener('dragstart',e=>e.preventDefault());
  $('petButton').addEventListener('pointerup',e=>{
    if (e.button !== 0 || e.pointerId !== dragPointerId) return;
    if (!didDrag && Date.now() - lastDragAt >= 300) activatePet();
    didDrag = false;
    e.currentTarget.blur();
  });
  $('petButton').addEventListener('keydown',e=>{
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activatePet(); }
  });
  $('startBtn').addEventListener('click',e=>{e.stopPropagation(); if(state.status==='personal'){setStatus('paused');toast('摸鱼薪资已关闭');}else if(state.status==='work'){toast('请先退出工作模式');}else{setStatus('personal');toast('摸鱼薪资已开启');coinBurst();}});
  $('workTasks').addEventListener('click', e => {
    const button = e.target.closest('[data-task-id]');
    if (!button) return;
    e.preventDefault();
    e.stopPropagation();
    toggleWorkTask(button.dataset.taskId);
  });
  $('workBtn').addEventListener('click',e=>{e.stopPropagation();toggleWorkMode()});
  $('toolsBtn').addEventListener('click',e=>{e.stopPropagation();showInlinePanel('tools');window.salaryPet.openPanel('tools')});
  $('settingsBtn').addEventListener('click',e=>{e.stopPropagation();showInlinePanel('settings');window.salaryPet.openPanel('settings')});
  $('appearanceButton').addEventListener('click', e => { e.stopPropagation(); showAppearancePanel(); window.salaryPet.openPanel('appearance'); });
  $('petRoot').addEventListener('pointerdown',e=>{
    if (e.target.closest('#petButton, button, input, webview, #inlinePanelHost')) return;
    beginPetDrag(e);
  });
  $('petRoot').addEventListener('pointermove',e=>{
    if(!dragStart || e.pointerId!==dragPointerId) return;
    const total=Math.hypot(e.screenX-dragStart.originX,e.screenY-dragStart.originY);
    if(total<4) return;
    didDrag=true;
    lastDragAt=Date.now();
    const d={x:e.screenX-dragStart.x,y:e.screenY-dragStart.y};
    dragStart.x=e.screenX;dragStart.y=e.screenY;
    window.salaryPet.drag(d);
  });
  const stopDrag=e=>{if(e.pointerId!==dragPointerId)return;dragStart=null;dragPointerId=null;};
  $('petRoot').addEventListener('pointerup',stopDrag);
  $('petRoot').addEventListener('pointercancel',stopDrag);
  document.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key==='Return'||e.code==='Enter'){e.preventDefault();enterWorkMode();}if(e.key==='Escape')window.salaryPet.hide();});
  window.salaryPet.onToggleWorkMode(toggleWorkMode);
  window.salaryPet.onEnterWorkMode(enterWorkMode);
  window.salaryPet.onInlineTools(() => showInlinePanel('tools'));
  window.salaryPet.onInlineSettings(() => showInlinePanel('settings'));
  window.salaryPet.onInlineAppearance(showAppearancePanel);
  window.salaryPet.onInlinePanelState(payload => payload.open ? showInlinePanel('tools') : hideInlinePanel(false));
  window.salaryPet.onPetEmbedBilibili(payload => { if (!$('petRoot').classList.contains('inline-open')) showInlinePanel('tools'); setTimeout(() => forwardInlineVideo(payload), 80); });
  window.salaryPet.onStateUpdated(next=>{state={...state,...next}; appliedAppearanceId = ''; render()});
  setInterval(tick,1000); setTimeout(startCoinShower,350);
});

window.addEventListener('resize', () => {
  if (inlinePanelOpen) layoutInlineShell();
});
