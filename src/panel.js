const $ = id => document.getElementById(id);
let state;
if (!window.salaryPet && window.parent && window.parent !== window && window.parent.salaryPet) window.salaryPet = window.parent.salaryPet;
const type = new URLSearchParams(location.search).get('type') || 'settings';
const embedded = new URLSearchParams(location.search).get('embedded') === '1';
const dayOptions = [['一',1],['二',2],['三',3],['四',4],['五',5],['六',6],['日',0]];

function selectedDays() {
  return [...document.querySelectorAll('.days input:checked')].map(input => Number(input.value));
}

function monthWorkdays(days) {
  const now = new Date();
  const count = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  let result = 0;
  for (let day = 1; day <= count; day++) if (days.includes(new Date(now.getFullYear(), now.getMonth(), day).getDay())) result++;
  return Math.max(1, result);
}

function minutesBetween(start, end) {
  const [sh,sm] = start.split(':').map(Number), [eh,em] = end.split(':').map(Number);
  let minutes = eh * 60 + em - sh * 60 - sm;
  if (minutes <= 0) minutes += 1440;
  return minutes;
}

function refreshPreview() {
  const salary = Number($('salary').value) || 0;
  const days = monthWorkdays(selectedDays());
  const grossMinutes = minutesBetween($('startTime').value, $('endTime').value);
  const lunchMinutes = minutesBetween($('lunchStart').value, $('lunchEnd').value);
  const hours = Math.max(1 / 60, (grossMinutes - lunchMinutes) / 60);
  const daySalary = salary / days;
  const hourSalary = daySalary / hours;
  const secondSalary = hourSalary / 3600;
  $('salaryPreview').innerHTML = `
    <div><span>本月工作日</span><b>${days} 天</b></div>
    <div><span>日薪</span><b>¥${daySalary.toFixed(2)}</b></div>
    <div><span>时薪</span><b>¥${hourSalary.toFixed(2)}</b></div>
    <div><span>秒薪</span><b>¥${secondSalary.toFixed(4)}</b></div>`;
}

function settingsView() {
  $('eyebrow').textContent = '本地配置';
  $('title').textContent = '设置';
  $('content').innerHTML = `
    <div class="form-row"><label>月薪金额</label><input class="input" id="salary" type="number" min="0.01" step="0.01" value="${state.salary}"></div>
    <div class="form-row"><label>工作日</label><div class="days">${dayOptions.map(([name,value]) => `<label><input type="checkbox" value="${value}" ${state.workdays.includes(value)?'checked':''}><span>${name}</span></label>`).join('')}</div></div>
    <div class="form-row"><label>上班时段</label><div class="time-pair"><input class="input" id="startTime" type="time" value="${state.startTime}"><input class="input" id="endTime" type="time" value="${state.endTime}"></div></div>
    <div class="form-row"><label>午休时段</label><div class="time-pair"><input class="input" id="lunchStart" type="time" value="${state.lunchStart||'12:00'}"><input class="input" id="lunchEnd" type="time" value="${state.lunchEnd||'13:00'}"></div></div>
    <div class="salary-preview" id="salaryPreview"></div>
    <div class="form-row"><label>桌宠大小 <span id="sizeOut">${state.size}px</span></label><input class="range" id="size" type="range" min="180" max="320" step="10" value="${state.size}"></div>
    <div class="form-row"><label>透明度</label><input class="range" id="opacity" type="range" min="0.45" max="1" step="0.05" value="${state.opacity}"></div>
    <div class="form-row toggle-row"><div><label>始终置顶</label><small>默认开启</small></div><input class="toggle" id="alwaysOnTop" type="checkbox" ${state.alwaysOnTop?'checked':''}></div>
    <div class="hint">Enter：切换个人模式 / 工作模式<br>全局切换：Ctrl + Shift + Enter<br>显示/隐藏：Ctrl + 1</div>
    <div class="actions"><button class="primary" id="saveBtn">保存设置</button><button class="secondary" id="updateBtn">检查更新</button></div>
    <small class="update-status" id="updateStatus" aria-live="polite"></small>`;

  ['salary','startTime','endTime','lunchStart','lunchEnd'].forEach(id => $(id).addEventListener('input', refreshPreview));
  document.querySelectorAll('.days input').forEach(input => input.addEventListener('change', refreshPreview));
  $('size').addEventListener('input', () => { $('sizeOut').textContent = `${$('size').value}px`; window.salaryPet.setSize(Number($('size').value)); });
  $('opacity').addEventListener('input', () => window.salaryPet.setOpacity(Number($('opacity').value)));
  $('alwaysOnTop').addEventListener('change', () => window.salaryPet.setAlwaysOnTop($('alwaysOnTop').checked));
  $('updateBtn').addEventListener('click', async () => {
    if ($('updateBtn').dataset.ready === '1') {
      await window.salaryPet.installDownloadedUpdate();
      return;
    }
    $('updateBtn').disabled = true;
    await window.salaryPet.checkForUpdates();
    setTimeout(() => { if ($('updateBtn')) $('updateBtn').disabled = false; }, 1200);
  });
  $('saveBtn').addEventListener('click', async () => {
    const patch = {
      salary: Number($('salary').value) || 0.01,
      workdays: selectedDays(),
      startTime: $('startTime').value,
      endTime: $('endTime').value,
      lunchStart: $('lunchStart').value,
      lunchEnd: $('lunchEnd').value,
      size: Number($('size').value),
      opacity: Number($('opacity').value),
      alwaysOnTop: $('alwaysOnTop').checked
    };
    state = await window.salaryPet.updateSettings(patch);
    $('saveBtn').textContent = '已保存并重新计算';
    setTimeout(() => $('saveBtn').textContent = '保存设置', 1500);
  });
  refreshPreview();
}

function toolsView() {
  $('eyebrow').textContent = '摸鱼工具'; $('title').textContent = '工具';
  const tools = Array.isArray(state.tools) ? state.tools : [];
  $('content').innerHTML = `<button class="tool-card" id="readerBtn"><span class="tool-icon">▤</span><span><b>电子书</b><span>本地阅读</span></span></button><button class="tool-card" id="softwareBtn"><span class="tool-icon">＋</span><span><b>接入软件</b><span>网址或本地软件都可以</span></span></button><div class="tool-list" id="toolList">${tools.map((tool,index) => `<button class="tool-card saved-tool" data-index="${index}"><span class="tool-icon">↗</span><span><b>${escapeHtml(tool.name)}</b><span>${escapeHtml(tool.target)}</span></span><em>打开</em></button>`).join('')}</div>`;
  $('readerBtn').addEventListener('click', () => { $('content').innerHTML = `<div class="reader"><p>“真正重要的不是你身在何处，而是你正在把时间花在哪里。”</p><p>阅读器 MVP 将支持 EPUB、PDF、TXT 和 Markdown。</p></div>`; });
  $('softwareBtn').addEventListener('click', softwareForm);
  document.querySelectorAll('.saved-tool').forEach(card => card.addEventListener('click', () => launchConfiguredTool(tools[Number(card.dataset.index)])));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}

function softwareForm() {
  $('content').innerHTML = `<div class="form-row"><label>软件名称</label><input class="input" id="toolName" placeholder="例如：抖音" autocomplete="off"></div><div class="form-row"><label>软件地址</label><input class="input" id="toolTarget" placeholder="抖音网址或本地 .exe 路径" autocomplete="off"><small>例如 https://www.douyin.com/，或 C:\\Apps\\Douyin\\Douyin.exe</small></div><div class="tool-presets"><button class="secondary" id="douyinPreset">抖音网页版</button><button class="secondary" id="biliPreset">哔哩哔哩</button></div><div class="actions"><button class="primary" id="saveToolBtn">保存入口</button><button class="secondary" id="cancelToolBtn">取消</button></div>`;
  $('douyinPreset').addEventListener('click', () => { $('toolName').value = '抖音'; $('toolTarget').value = 'https://www.douyin.com/'; });
  $('biliPreset').addEventListener('click', () => { $('toolName').value = '哔哩哔哩'; $('toolTarget').value = 'https://www.bilibili.com/'; });
  $('cancelToolBtn').addEventListener('click', toolsView);
  $('saveToolBtn').addEventListener('click', async () => {
    const name = $('toolName').value.trim();
    const target = $('toolTarget').value.trim();
    if (!name || !target) { $('toolTarget').setCustomValidity('请填写软件名称和网址或路径'); $('toolTarget').reportValidity(); return; }
    state = await window.salaryPet.updateSettings({ tools: [...(Array.isArray(state.tools) ? state.tools : []), { name, target }] });
    toolsView();
  });
}

async function launchConfiguredTool(tool) {
  const result = await window.salaryPet.launchTool(tool);
  if (!result?.ok) {
    $('content').insertAdjacentHTML('afterbegin', `<div class="tool-error">${escapeHtml(result?.message || '打开失败，请检查网址或软件路径')}</div>`);
    setTimeout(() => document.querySelector('.tool-error')?.remove(), 3000);
  }
}

function showEmbeddedBilibili(payload = {}) {
  $('eyebrow').textContent = '内置播放';
  $('title').textContent = '哔哩哔哩';
  $('content').innerHTML = `
    <div class="embedded-toolbar">
      <button class="secondary" id="embeddedClose" title="关闭播放器">关闭</button>
      <button class="secondary" id="embeddedHome" title="返回哔哩哔哩首页">返回</button>
    </div>
    <div class="embedded-browser">
      <webview id="embeddedView" partition="persist:niulai-bilibili"></webview>
    </div>`;
  const view = $('embeddedView');
  const initialUrl = String(payload.playerUrl || payload.sourceUrl || 'https://www.bilibili.com/');
  view.src = initialUrl;
  view.addEventListener('dom-ready', () => {
    view.setWindowOpenHandler?.(({ url }) => {
      if (/^https?:\/\/(?:[^/]+\.)?bilibili\.com\//i.test(url)) view.src = url;
      return { action: 'deny' };
    });
  });
  $('embeddedClose').addEventListener('click', () => {
    view.src = 'about:blank';
    window.salaryPet.enterWorkMode();
  });
  $('embeddedHome').addEventListener('click', () => {
    view.src = 'about:blank';
    window.salaryPet.openBilibiliHome();
  });
  view.addEventListener('did-fail-load', event => {
    if (event.errorCode === -3) return;
    $('content').insertAdjacentHTML('afterbegin', '<div class="tool-error">B站页面加载失败，请检查网络后重试。</div>');
  });
}

window.addEventListener('DOMContentLoaded', async () => {
  state = await window.salaryPet.readState();
  type === 'tools' ? toolsView() : settingsView();
  $('closeBtn').addEventListener('click', () => embedded ? window.salaryPet.closeInlinePanel() : window.salaryPet.closePanel());
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') window.salaryPet.closePanel();
    if (event.key === 'Enter' || event.key === 'Return' || event.code === 'Enter') { event.preventDefault(); window.salaryPet.enterWorkMode(); }
  });
  window.salaryPet.onEmbedBilibili(showEmbeddedBilibili);
  window.salaryPet.onUpdateStatus(status => {
    const output = $('updateStatus');
    const button = $('updateBtn');
    if (output) output.textContent = status?.message || '';
    if (button && status?.status === 'downloaded') {
      button.dataset.ready = '1';
      button.disabled = false;
      button.textContent = '立即安装更新';
    }
  });
  window.addEventListener('message', event => {
    if (event.data?.type === 'bilibili') showEmbeddedBilibili(event.data.payload);
  });
});
