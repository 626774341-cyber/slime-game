// 史莱姆桌宠：无边框透明置顶窗口，箱庭小岛浮在桌面上
// 托盘常驻：显示/隐藏、换地图、开机自启、退出；点击穿透（不在小岛/按钮上时）
const { app, BrowserWindow, Tray, Menu, nativeImage, screen, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');

let win = null, tray = null, quitting = false;
let hovering = false, saveTimer = null, cursorTimer = null;

// ---------- 设置持久化（窗口位置 / 开机自启） ----------
function settingsFile() { return path.join(app.getPath('userData'), 'pet-settings.json'); }
function loadSettings() { try { return JSON.parse(fs.readFileSync(settingsFile(), 'utf8')); } catch { return {}; } }
function saveSettings(s) { try { fs.writeFileSync(settingsFile(), JSON.stringify(s, null, 2)); } catch { } }

function validBounds(b) {
  if (!b || !b.width) return false;
  return screen.getAllDisplays().some(d => {
    const a = d.workArea;
    return b.x + b.width > a.x && b.x < a.x + a.width && b.y + b.height > a.y && b.y < a.y + a.height;
  });
}

// ---------- 托盘图标（史莱姆蓝圆点） ----------
function makeTrayIcon() {
  const s = 18, data = Buffer.alloc(s * s * 4);
  const c = (s - 1) / 2, r = s / 2 - 0.5;
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const i = (y * s + x) * 4;
      const d = Math.hypot(x - c, y - c);
      let a = 0;
      if (d <= r - 1) a = 255; else if (d <= r) a = Math.round(255 * (r - d));
      data[i] = 0xff; data[i + 1] = 0xc8; data[i + 2] = 0x54; data[i + 3] = a; // BGRA
    }
  }
  return nativeImage.createFromBitmap(data, { width: s, height: s });
}

function createTray() {
  const s = loadSettings();
  if (s.login === undefined) s.login = true;                       // 默认开机自启
  app.setLoginItemSettings({ openAtLogin: !!s.login, openAsHidden: true });
  saveSettings(s);

  tray = new Tray(makeTrayIcon());
  tray.setToolTip('史莱姆桌宠');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示 / 隐藏桌宠', click: togglePet },
    { label: '换地图（箱庭 ⇄ 轻简）', click: () => run('window.__petToggleMap && window.__petToggleMap()') },
    { type: 'separator' },
    { label: '开机自启', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin,
      click: (item) => {
        app.setLoginItemSettings({ openAtLogin: item.checked, openAsHidden: true });
        const st = loadSettings(); st.login = item.checked; saveSettings(st);
      } },
    { type: 'separator' },
    { label: '退出', click: () => { quitting = true; app.quit(); } }
  ]));
}

function togglePet() {
  if (!win) return;
  if (win.isVisible()) win.hide();
  else { win.show(); win.focus(); }
}

function run(js) {
  if (win && !win.isDestroyed()) win.webContents.executeJavaScript(js).catch(() => {});
}

// ---------- 点击穿透：主进程轮询光标，页面判断是否落在小岛 / 按钮上 ----------
function startCursorPoll() {
  cursorTimer = setInterval(() => {
    if (!win || win.isDestroyed() || !win.isVisible()) return;
    const cp = screen.getCursorScreenPoint();
    const b = win.getBounds();
    const x = Math.round(cp.x - b.x), y = Math.round(cp.y - b.y);
    const inside = x >= 0 && y >= 0 && x < b.width && y < b.height;
    if (!inside) { setHover(false); return; }                     // 光标在窗外：穿透
    run(`window.__petCursor && window.__petCursor(${x},${y})`);   // 在窗内：让页面判定
  }, 60);
}

function setHover(h) {
  if (hovering !== h) {
    hovering = h;
    if (win && !win.isDestroyed()) win.setIgnoreMouseEvents(!hovering);
  }
}

ipcMain.on('pet:hover', (e, h) => { hovering = !!h; if (win && !win.isDestroyed()) win.setIgnoreMouseEvents(!hovering); });
ipcMain.on('pet:close', () => { quitting = true; app.quit(); });

// ---------- 页面注入：UI 重排 + 天气粒子 + 相机贴合 + 边缘探头 + 睡觉 ----------
function injectPetUI() {
  const pet = window.__pet;
  if (!pet) return;
  const st = document.createElement('style');
  st.textContent = [
    'html, body { background: transparent !important; }',
    '#title, #hints, #starHud, #photoBtn { display: none !important; }',
    '#petFx { position: fixed; inset: 0; z-index: 2; pointer-events: none; }',
    '#c { transition: transform .45s ease; }',
    '/* ❤️ 心情条回归：顶部居中小胶囊 */',
    '#moodCard { display: flex !important; top: 10px !important; left: 50% !important; right: auto !important;',
    '  bottom: auto !important; transform: translateX(-50%) !important; padding: 6px 12px !important;',
    '  border-radius: 999px !important; background: rgba(255,255,255,.95) !important;',
    '  box-shadow: 0 3px 10px rgba(60,90,140,.3) !important; z-index: 32; animation: none !important;',
    '  gap: 6px !important; }',
    '#moodBar { width: 90px !important; }',
    '/* 右上角统一控制行：✕ 声音 昼夜 天气 爪印（实体白钮） */',
    '#petClose, #mute, #nightBtn, #weatherBtn, #petPaw {',
    '  position: fixed !important; top: 10px !important; right: auto !important; left: auto !important;',
    '  width: 34px !important; height: 34px !important; border-radius: 10px !important;',
    '  background: #ffffff !important; box-shadow: 0 3px 10px rgba(60,90,140,.30) !important;',
    '  display: flex !important; align-items: center; justify-content: center;',
    '  font-size: 16px !important; line-height: 1 !important; color: #2c4a66 !important;',
    '  z-index: 32; -webkit-app-region: no-drag; animation: none !important; padding: 0 !important;',
    '  transition: transform .15s ease, box-shadow .15s ease; cursor: pointer; user-select: none; }',
    '#petClose:hover, #mute:hover, #nightBtn:hover, #weatherBtn:hover, #petPaw:hover {',
    '  transform: scale(1.1); box-shadow: 0 5px 14px rgba(60,90,140,.4) !important; }',
    '#petPaw { right: 10px !important; font-size: 19px !important; }',
    '#weatherBtn { right: 50px !important; }',
    '#nightBtn { right: 90px !important; }',
    '#mute { right: 130px !important; }',
    '#petClose { right: 170px !important; font-size: 15px !important; }',
    '/* 顶部拖拽条 */',
    '#dragStrip { position: fixed; top: 0; left: 0; right: 0; height: 24px; z-index: 30;',
    '  -webkit-app-region: drag; cursor: move; }',
    '/* 互动抽屉：无面板底色，按钮悬浮 */',
    '#toolbar { flex-direction: row !important; flex-wrap: wrap !important; justify-content: flex-end !important;',
    '  left: auto !important; right: 10px !important; top: 52px !important; bottom: auto !important;',
    '  width: max-content !important; max-width: 96% !important; gap: 6px !important; padding: 0 !important;',
    '  transform: translateY(-10px) !important;',
    '  opacity: 0; pointer-events: none; animation: none !important; transition: all .25s ease;',
    '  background: transparent !important; box-shadow: none !important; backdrop-filter: none !important; }',
    'body.pet-open #toolbar { opacity: 1; pointer-events: auto; transform: translateY(0) !important; }',
    '.tool { width: 40px !important; height: 40px !important; font-size: 20px !important; }',
    '/* 💤 睡觉气泡 */',
    '#petSleep { position: fixed; top: 14%; left: 55%; font-size: 36px; z-index: 3;',
    '  pointer-events: none; display: none; animation: petZzz 2s ease-in-out infinite; }',
    '@keyframes petZzz { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-8px) } }'
  ].join('\n');
  document.head.appendChild(st);

  // —— 天气粒子层 ——
  const fx = document.createElement('canvas');
  fx.id = 'petFx';
  document.body.appendChild(fx);
  const ctx = fx.getContext('2d');

  // —— 相机贴合：四角恒可见 ——
  function cornerR() { return Math.sqrt(2) * 5.25 + 0.35; }
  function fitDist() {
    const cam = pet.camera;
    const vF = cam.fov * Math.PI / 180;
    const hF = 2 * Math.atan(Math.tan(vF / 2) * cam.aspect);
    return Math.max(cornerR() / Math.tan(vF / 2), cornerR() / Math.tan(hF / 2)) + 0.9;
  }
  function fitView(force) {
    const cam = pet.camera, ctl = pet.controls;
    ctl.maxDistance = fitDist();
    const dir = cam.position.clone().sub(ctl.target).normalize();
    let d = cam.position.distanceTo(ctl.target);
    if (force || d > ctl.maxDistance) d = ctl.maxDistance;
    cam.position.copy(ctl.target).addScaledVector(dir, d);
  }
  function sizeFx() { fx.width = innerWidth; fx.height = innerHeight; }
  function onResize() { sizeFx(); fitView(false); }
  sizeFx();
  fitView(true);
  window.addEventListener('resize', onResize);

  // —— 贴边探头：史莱姆走到小岛边缘 → 身体压扁趴下往边上张望 ——
  // —— 💤 闲置睡觉：偶尔飘到窗口上沿打瞌睡，一碰就醒 ——
  let sleeping = false, sleepUntil = 0, lastActivity = performance.now(), wasSleeping = false;
  const sleepBubble = document.createElement('div');
  sleepBubble.id = 'petSleep';
  sleepBubble.textContent = '💤';
  document.body.appendChild(sleepBubble);
  function wake() { sleeping = false; sleepBubble.style.display = 'none'; lastActivity = performance.now(); }
  ['pointerdown', 'pointermove', 'wheel', 'keydown'].forEach(ev =>
    window.addEventListener(ev, () => {
      lastActivity = performance.now();
      if (sleeping) wake();
    }, { passive: true }));

  // —— 点击穿透判定：光标在小岛椭圆 / UI 元素上才算"悬停" ——
  function computeHover(cx, cy) {
    const el = document.elementFromPoint(cx, cy);
    if (el && el.id !== 'c' && el.id !== 'petFx' && el.tagName !== 'BODY' && el.tagName !== 'HTML') return true;
    const rx2 = innerWidth * 0.46, ry2 = innerHeight * 0.40;
    const dx = (cx - innerWidth / 2) / rx2, dy = (cy - innerHeight * 0.52) / ry2;
    return dx * dx + dy * dy <= 1;
  }
  window.__petCursor = (x, y) => {
    if (window.petApi) window.petApi.setHover(computeHover(x, y));
  };

  // 粒子
  const newMote = () => ({ x: Math.random() * fx.width, y: Math.random() * fx.height,
    r: 1 + Math.random() * 2.4, vy: 8 + Math.random() * 14, tw: Math.random() * 6.28, sp: 0.4 + Math.random() * 0.8 });
  const newDrop = () => ({ x: Math.random() * fx.width, y: Math.random() * fx.height,
    v: 520 + Math.random() * 320, len: 12 + Math.random() * 10 });
  const newFlake = () => ({ x: Math.random() * fx.width, y: Math.random() * fx.height,
    v: 40 + Math.random() * 55, r: 1.4 + Math.random() * 2, ph: Math.random() * 6.28 });
  let motes = Array.from({ length: 42 }, newMote);
  let drops = Array.from({ length: 80 }, newDrop);
  let flakes = Array.from({ length: 60 }, newFlake);
  let sunny = 1, rain = 0, snow = 0, last = performance.now();

  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.05); last = now;
    const mode = pet.weather ? pet.weather.mode : 0;
    const night = pet.dnState ? pet.dnState.v : 0;
    // 💤 睡觉状态机（闲置 30 秒后偶发入睡，9~15 秒或一碰即醒）
    if (sleeping && (now > sleepUntil || now - lastActivity < 1200)) wake();
    if (!sleeping && now - lastActivity > 30000 && Math.random() < 0.006) {
      sleeping = true;
      sleepUntil = now + 9000 + Math.random() * 6000;
      sleepBubble.style.display = 'block';
    }
    if (sleeping !== wasSleeping) {
      wasSleeping = sleeping;
      const cEl = document.getElementById('c');
      cEl.style.transform = sleeping ? 'translateY(-12%) scale(0.94)' : 'none';
    }
    const dim = sleeping ? 0.35 : 1;
    sunny += ((mode === 0 ? 1 : 0) - sunny) * Math.min(1, dt * 3);
    rain += ((mode === 1 ? 1 : 0) - rain) * Math.min(1, dt * 3);
    snow += ((mode === 2 ? 1 : 0) - snow) * Math.min(1, dt * 3);
    ctx.clearRect(0, 0, fx.width, fx.height);
    if (sunny > 0.02) {
      for (const m of motes) {
        m.y -= m.vy * dt; m.x += Math.sin(now * 0.0004 * m.sp + m.tw) * 14 * dt;
        if (m.y < -8) { m.y = fx.height + 8; m.x = Math.random() * fx.width; }
        if (m.x < -8) m.x = fx.width + 8; else if (m.x > fx.width + 8) m.x = -8;
        const tw = 0.4 + 0.3 * Math.sin(now * 0.002 * m.sp + m.tw);
        ctx.globalAlpha = sunny * tw * (night > 0.5 ? 0.9 : 0.65) * dim;
        ctx.fillStyle = night > 0.5 ? '#d6ff8f' : '#ffe9a8';
        ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, 6.283); ctx.fill();
      }
    }
    if (rain > 0.02) {
      ctx.strokeStyle = 'rgba(170,205,240,' + (0.5 * rain * dim).toFixed(3) + ')';
      ctx.lineWidth = 1.4; ctx.beginPath();
      for (const d of drops) {
        d.y += d.v * dt; d.x += d.v * 0.12 * dt;
        if (d.y > fx.height + 20) { d.y = -20; d.x = Math.random() * fx.width; }
        ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - d.v * 0.02, d.y - d.len);
      }
      ctx.stroke();
    }
    if (snow > 0.02) {
      ctx.fillStyle = 'rgba(255,255,255,' + (0.85 * snow * dim).toFixed(3) + ')';
      for (const f of flakes) {
        f.y += f.v * dt; f.x += Math.sin(now * 0.001 + f.ph) * 22 * dt;
        if (f.y > fx.height + 6) { f.y = -6; f.x = Math.random() * fx.width; }
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 6.283); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    // —— 地图边缘探头：史莱姆走到小岛边缘 → 身体压扁趴下往边上张望 ——
    const sp = pet.slime.pos, B = 4.3, m = 1.3;
    let k = 0;
    if (Math.abs(sp.x) > B - m) k = Math.min(1, (Math.abs(sp.x) - (B - m)) / m);
    if (Math.abs(sp.z) > B - m) k = Math.max(k, Math.min(1, (Math.abs(sp.z) - (B - m)) / m));
    if (k > 0) pet.slime.sq.x = Math.max(pet.slime.sq.x, 0.30 * k);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  const strip = document.createElement('div');
  strip.id = 'dragStrip';
  strip.title = '按住这里可以拖动桌宠';
  document.body.appendChild(strip);

  const closeBtn = document.createElement('div');
  closeBtn.id = 'petClose';
  closeBtn.textContent = '✕';
  closeBtn.title = '关闭桌宠';
  closeBtn.addEventListener('click', () => { if (window.petApi) window.petApi.close(); });
  document.body.appendChild(closeBtn);

  const paw = document.createElement('div');
  paw.id = 'petPaw';
  paw.textContent = '🐾';
  paw.title = '互动菜单';
  paw.addEventListener('click', () => document.body.classList.toggle('pet-open'));
  document.body.appendChild(paw);
}

function createWindow() {
  const wa = screen.getPrimaryDisplay().workArea;
  const s = loadSettings();
  let x = Math.max(wa.x, wa.x + wa.width - 720), y = Math.max(wa.y, wa.y + wa.height - 620);
  let w = 700, h = 600;
  if (validBounds(s.bounds)) { x = s.bounds.x; y = s.bounds.y; w = s.bounds.width; h = s.bounds.height; }
  win = new BrowserWindow({
    width: w,
    height: h,
    x, y,
    minWidth: 320,
    minHeight: 280,
    transparent: true,
    frame: false,
    hasShadow: false,
    resizable: true,
    minimizable: false,
    maximizable: true,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    webPreferences: {
      backgroundThrottling: false,
      webSecurity: false,             // 加载本地 vendor ES 模块（完全离线）
      preload: path.join(__dirname, 'preload.js')
    }
  });
  win.setAlwaysOnTop(true, 'floating');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile('index.html');
  win.webContents.on('did-finish-load', () => {
    win.webContents.executeJavaScript('(' + injectPetUI.toString() + ')()');
  });
  const saveLater = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (win && !win.isDestroyed()) {
        const st = loadSettings(); st.bounds = win.getBounds(); saveSettings(st);
      }
    }, 400);
  };
  win.on('resize', saveLater);
  win.on('move', saveLater);
  win.on('closed', () => { win = null; });
}

app.whenReady().then(() => { createWindow(); createTray(); startCursorPoll(); });
// macOS：再次打开 App 时唤出桌宠
app.on('activate', () => {
  if (win) { win.show(); win.focus(); } else createWindow();
});
app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', () => app.quit());   // ✕ 关闭即退出（托盘可再启动）
