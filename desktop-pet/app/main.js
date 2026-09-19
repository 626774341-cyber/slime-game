// 史莱姆桌宠：无边框透明置顶窗口，箱庭小岛浮在桌面上
// 托盘常驻：显示/隐藏、换地图、取名、开机自启、退出；点击穿透（不在小岛/按钮上时）
const { app, BrowserWindow, Tray, Menu, nativeImage, screen, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');

let win = null, tray = null, nameWin = null, quitting = false;
let hovering = false, saveTimer = null, cursorTimer = null, lastShakeSent = 0;
const moveTimes = [];

// ---------- 设置持久化 ----------
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

// ---------- 托盘图标 ----------
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

// ---------- 取名小窗 ----------
function openNameWindow() {
  if (nameWin) { nameWin.focus(); return; }
  const cur = (loadSettings().name || '').slice(0, 6);
  nameWin = new BrowserWindow({
    width: 300, height: 130, frame: false, transparent: true, resizable: false,
    minimizable: false, maximizable: false, show: false, skipTaskbar: true,
    webPreferences: { nodeIntegration: true, contextIsolation: false }
  });
  nameWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(
    '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' +
    'body{margin:0;font-family:sans-serif;background:rgba(252,252,255,.98);border-radius:14px;' +
    'display:flex;gap:8px;padding:16px;align-items:center;box-shadow:0 8px 30px rgba(50,80,120,.4)}' +
    'input{flex:1;font-size:15px;padding:7px 9px;border-radius:8px;border:2px solid #bcd8ee;outline:none;color:#2c4a66}' +
    'input:focus{border-color:#54c8ff}' +
    'button{border:none;background:#54c8ff;color:#fff;border-radius:8px;padding:8px 14px;cursor:pointer}' +
    '</style></head><body>' +
    '<input id="n" maxlength="6" placeholder="给它取个名" value="' + cur + '">' +
    '<button onclick="go()">好了</button>' +
    '<script>const {ipcRenderer}=require("electron");' +
    'document.getElementById("n").focus();document.getElementById("n").select();' +
    'function go(){const v=document.getElementById("n").value.trim();' +
    'if(v)ipcRenderer.send("pet:setname",v);window.close();}' +
    'document.getElementById("n").addEventListener("keydown",e=>{if(e.key==="Enter")go();});' +
    '</' + 'script></body></html>'
  ));
  nameWin.once('ready-to-show', () => nameWin.show());
  nameWin.on('closed', () => { nameWin = null; });
}

function createTray() {
  const s = loadSettings();
  if (s.login === undefined) s.login = true;
  app.setLoginItemSettings({ openAtLogin: !!s.login, openAsHidden: true });
  saveSettings(s);

  tray = new Tray(makeTrayIcon());
  tray.setToolTip('史莱姆桌宠');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示 / 隐藏桌宠', click: togglePet },
    { label: '换地图（箱庭 ⇄ 轻简）', click: () => run('window.__petToggleMap && window.__petToggleMap()') },
    { label: '给史莱姆取名', click: openNameWindow },
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

// ---------- 点击穿透：轮询光标 + 页面判定 ----------
function startCursorPoll() {
  cursorTimer = setInterval(() => {
    if (!win || win.isDestroyed() || !win.isVisible()) return;
    const cp = screen.getCursorScreenPoint();
    const b = win.getBounds();
    const x = Math.round(cp.x - b.x), y = Math.round(cp.y - b.y);
    const inside = x >= 0 && y >= 0 && x < b.width && y < b.height;
    if (!inside) { setHover(false); return; }
    run(`window.__petCursor && window.__petCursor(${x},${y})`);
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
ipcMain.on('pet:setname', (e, n) => {
  const st = loadSettings();
  st.name = String(n || '').trim().slice(0, 6);
  saveSettings(st);
  run('window.__petSetName && window.__petSetName(' + JSON.stringify(st.name) + ')');
});

// ---------- 摇一摇：快速甩窗口 → 史莱姆头晕 ----------
function onWindowMove() {
  const now = Date.now();
  moveTimes.push(now);
  while (moveTimes.length && now - moveTimes[0] > 1000) moveTimes.shift();
  if (moveTimes.length > 14 && now - lastShakeSent > 1600) {
    lastShakeSent = now;
    run('window.__petShake && window.__petShake()');
  }
}

// ---------- 页面注入：UI + 粒子 + 相机贴合 + 互动彩蛋 ----------
function injectPetUI() {
  const pet = window.__pet;
  if (!pet) return;
  const st = document.createElement('style');
  st.textContent = [
    'html, body { background: transparent !important; }',
    '#title, #hints, #starHud, #photoBtn { display: none !important; }',
    '#petFx { position: fixed; inset: 0; z-index: 2; pointer-events: none; }',
    '#c { transition: transform .45s ease; }',
    '/* ❤️ 心情条：平时半透明低调，悬停才完整显示 */',
    '#moodCard { display: flex !important; top: 10px !important; left: 50% !important; right: auto !important;',
    '  bottom: auto !important; transform: translateX(-50%) !important; padding: 6px 12px !important;',
    '  border-radius: 999px !important; background: rgba(255,255,255,.95) !important;',
    '  box-shadow: 0 3px 10px rgba(60,90,140,.3) !important; z-index: 32; animation: none !important;',
    '  gap: 6px !important; opacity: .16; transition: opacity .25s ease; }',
    '#moodCard:hover { opacity: 1; }',
    '#moodBar { width: 90px !important; }',
    '/* 右上角统一控制行：✕ 声音 昼夜 天气 爪印 */',
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
    '/* 顶部：拖拽条 + 拖拽手柄按钮 */',
    '#dragStrip { position: fixed; top: 0; left: 0; right: 0; height: 24px; z-index: 30;',
    '  -webkit-app-region: drag; cursor: move; }',
    '#dragHandle { position: fixed; top: 5px; left: 50%; transform: translateX(-50%); z-index: 33;',
    '  width: 64px; height: 15px; border-radius: 8px; background: rgba(255,255,255,.9);',
    '  box-shadow: 0 2px 6px rgba(60,90,140,.3); -webkit-app-region: drag; cursor: move;',
    '  display: flex; align-items: center; justify-content: center; color: #7a97b0;',
    '  font-size: 9px; letter-spacing: 3px; user-select: none; }',
    '/* 互动抽屉：无面板底色 */',
    '#toolbar { flex-direction: row !important; flex-wrap: wrap !important; justify-content: flex-end !important;',
    '  left: auto !important; right: 10px !important; top: 52px !important; bottom: auto !important;',
    '  width: max-content !important; max-width: 96% !important; gap: 6px !important; padding: 0 !important;',
    '  transform: translateY(-10px) !important;',
    '  opacity: 0; pointer-events: none; animation: none !important; transition: all .25s ease;',
    '  background: transparent !important; box-shadow: none !important; backdrop-filter: none !important; }',
    'body.pet-open #toolbar { opacity: 1; pointer-events: auto; transform: translateY(0) !important; }',
    '.tool { width: 40px !important; height: 40px !important; font-size: 20px !important; }',
    '/* 💤 睡觉气泡 + 头顶名牌 + 拖喂提示 */',
    '#petSleep { position: fixed; font-size: 34px; z-index: 3; pointer-events: none; display: none;',
    '  animation: petZzz 2s ease-in-out infinite; }',
    '@keyframes petZzz { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-8px) } }',
    '#petName { position: fixed; z-index: 31; pointer-events: none; display: none; white-space: nowrap;',
    '  padding: 3px 10px; border-radius: 999px; background: rgba(255,255,255,.95); color: #2c4a66;',
    '  font-size: 12px; box-shadow: 0 2px 6px rgba(60,90,140,.3); }',
    '#petToast { position: fixed; bottom: 90px; left: 50%; transform: translateX(-50%);',
    '  background: rgba(35,58,82,.85); color: #fff; font-size: 13px; padding: 8px 18px;',
    '  border-radius: 999px; opacity: 0; transition: all .35s ease; pointer-events: none;',
    '  z-index: 40; white-space: nowrap; }',
    '#petToast.show { opacity: 1; }',
    '.flyFile { position: fixed; z-index: 40; font-size: 30px; pointer-events: none;',
    '  transition: all .6s cubic-bezier(.5,-0.3,.7,1); }',
    '/* 版本徽标 */',
    '#petVer { position: fixed; bottom: 6px; left: 8px; z-index: 33; font-size: 10px;',
    '  color: #7a97b0; opacity: .7; pointer-events: none; user-select: none; }'
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

  // —— 通用：把史莱姆的世界坐标投影到窗口像素 ——
  function slimeScreenPos() {
    const v = pet.slimeGroup.position.clone(); v.y += 0.9; v.project(pet.camera);
    return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight };
  }
  function overSlime(x, y) {
    const s = slimeScreenPos();
    return Math.hypot(x - s.x, y - s.y) < 130;
  }

  // —— 💤 睡觉 + 摇一摇 + 提示条 ——
  let sleeping = false, sleepUntil = 0, lastActivity = performance.now(), wasSleeping = false;
  let shaking = false, shakeUntil = 0, wasShaking = false;
  const sleepBubble = document.createElement('div');
  sleepBubble.id = 'petSleep';
  sleepBubble.textContent = '💤';
  document.body.appendChild(sleepBubble);
  function wake() { sleeping = false; sleepBubble.style.display = 'none'; lastActivity = performance.now(); }
  const petToast = document.createElement('div');
  petToast.id = 'petToast';
  document.body.appendChild(petToast);
  function petSay(msg) {
    petToast.textContent = msg;
    petToast.classList.add('show');
    clearTimeout(petToast._t);
    petToast._t = setTimeout(() => petToast.classList.remove('show'), 2200);
  }
  window.__petShake = () => {
    shaking = true; shakeUntil = performance.now() + 1300;
    wake(); lastActivity = performance.now();
  };
  window.addEventListener('pointerdown', () => {
    lastActivity = performance.now();
    if (shaking) { shaking = false; petSay('嗝…晃晕啦…'); if (pet.slime) pet.slime.sq.v += 9; }
    if (sleeping) wake();
  }, { passive: true });
  window.addEventListener('wheel', () => { lastActivity = performance.now(); if (sleeping) wake(); }, { passive: true });

  // —— 叫名字：头顶名牌 ——
  let petName = '';
  const nameTag = document.createElement('div');
  nameTag.id = 'petName';
  document.body.appendChild(nameTag);
  window.__petSetName = (n) => {
    petName = n || '';
    nameTag.textContent = petName;
    nameTag.style.display = petName ? 'block' : 'none';
  };

  // —— 逗猫棒：按住 Alt 甩鼠标，史莱姆追着光点跳 ——
  let altHeld = false, altX = 0, altY = 0, lastChase = 0;
  window.addEventListener('keydown', (e) => { if (e.key === 'Alt') { altHeld = true; wake(); } });
  window.addEventListener('keyup', (e) => { if (e.key === 'Alt') altHeld = false; });

  // —— 摸头：按住史莱姆来回搓 → 爱心 + 果冻抖；摸太久会晕 ——
  let petting = false, strokeAccum = 0, petStart = 0, rustleCd = 0;
  window.addEventListener('pointerdown', (e) => {
    if (overSlime(e.clientX, e.clientY)) { petting = true; strokeAccum = 0; petStart = performance.now(); }
  }, { passive: true });
  window.addEventListener('pointerup', () => { petting = false; }, { passive: true });
  window.addEventListener('pointermove', (e) => {
    lastActivity = performance.now();
    if (sleeping) wake();
    if (altHeld) { altX = e.clientX; altY = e.clientY; }
    if (!petting) return;
    const now2 = performance.now();
    strokeAccum += Math.hypot(e.movementX || 0, e.movementY || 0);
    if (strokeAccum > 240 && now2 - rustleCd > 650) {
      rustleCd = now2; strokeAccum = 0;
      spawnTreats(e.clientX, e.clientY);
      if (pet.slime) { pet.slime.sq.v += 5; pet.slime.moodT = 0.8; }
      if (pet.mood) pet.mood.happy = Math.min(100, pet.mood.happy + 3);
      petSay(['再摸就要化掉啦～', '呜嘿嘿～', '毛茸茸认证 ✓'][Math.floor(Math.random() * 3)]);
      if (pet.say) pet.say('好舒服～');
    }
    if (now2 - petStart > 8000 && !pet._dizzyFlag) {
      pet._dizzyFlag = true;
      if (pet.slime) pet.slime.sq.v += 9;
      petSay('摸、摸晕啦…脑袋在转圈圈…');
    }
  }, { passive: true });
  window.addEventListener('pointerup', () => { pet._dizzyFlag = false; }, { passive: true });

  // —— 🕐 时钟史莱姆：整点报时跳一下 ——
  let chimeHour = -1;

  // —— 📂 拖喂：按文件类型给不同表情反馈 ——
  const treats = [];
  function spawnTreats(x, y) {
    for (let i = 0; i < 6; i++) {
      treats.push({ x: x + (Math.random() - 0.5) * 60, y: y + (Math.random() - 0.5) * 30,
        vx: (Math.random() - 0.5) * 90, vy: -(60 + Math.random() * 90),
        life: 1, ch: ['💖', '✨', '💗'][Math.floor(Math.random() * 3)] });
    }
  }
  let lastFed = '';
  window.addEventListener('dragover', (e) => { e.preventDefault(); wake(); lastActivity = performance.now(); });
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    wake(); lastActivity = performance.now();
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (!f) return;
    let name = f.name || '文件';
    if (window.petApi) { try { name = window.petApi.pathForFile(f).split('/').pop() || name; } catch { } }
    const ext = (name.split('.').pop() || '').toLowerCase();
    if (name === lastFed) { petSay('「' + name + '」吃过了啦…换一个嘛'); if (pet.slime) pet.slime.sq.v -= 5; return; }
    lastFed = name;
    if (pet.mood) pet.mood.happy = Math.min(100, pet.mood.happy + 12);
    if (pet.slime) { pet.slime.sq.x = 0.35; pet.slime.moodT = 0.8; }
    spawnTreats(innerWidth / 2, innerHeight * 0.45);
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic'].includes(ext)) petSay('🖼️ 好漂亮的画！挂在岛上啦～');
    else if (['mp3', 'wav', 'aac', 'm4a', 'flac'].includes(ext)) {
      petSay('🎵 好听！跟着节奏跳一个！');
      if (pet.startDance) pet.startDance();
    }
    else if (['js', 'json', 'md', 'txt', 'html', 'css', 'py', 'ts'].includes(ext)) {
      f.text().then(t => {
        const first = (t || '').split('\n')[0].trim().slice(0, 22);
        petSay(first ? '📖 学会了一句：' + first : '📖 咦…学到了新东西！');
      }).catch(() => petSay('📖 咦…学到了新东西！'));
    }
    else if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) petSay('📦 咔嚓咔嚓，脆脆的！');
    else petSay('😋 史莱姆把「' + name + '」吃掉了！');
  });

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

  // —— 点击穿透判定 ——
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

  // —— 主渲染循环 ——
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.05); last = now;
    const mode = pet.weather ? pet.weather.mode : 0;
    const night = pet.dnState ? pet.dnState.v : 0;
    // 💤 睡觉
    if (sleeping && (now > sleepUntil || now - lastActivity < 1200)) wake();
    if (!sleeping && now - lastActivity > 30000 && Math.random() < 0.006) {
      sleeping = true;
      sleepUntil = now + 9000 + Math.random() * 6000;
      sleepBubble.style.display = 'block';
    }
    // 🕐 整点报时
    const d = new Date();
    if (d.getMinutes() === 0 && d.getSeconds() < 3 && chimeHour !== d.getHours() &&
        pet.slime.mode === 'free' && pet.slime.pos.y <= 0.05) {
      chimeHour = d.getHours();
      pet.slime.vel.y = 8; pet.slime.sq.v -= 3;
      spawnTreats(innerWidth / 2, innerHeight * 0.4);
      petSay('🕐 现 在 ' + d.getHours() + ' 点整啦！');
      if (pet.say) pet.say('咚——报时！');
    }
    // 摇一摇抖动
    if (shaking && now > shakeUntil) { shaking = false; petSay('嗝…晃晕啦…'); if (pet.slime) pet.slime.sq.v += 9; }
    if (sleeping !== wasSleeping) {
      wasSleeping = sleeping;
      sleepBubble.style.display = sleeping ? 'block' : 'none';
    }
    const dim = sleeping ? 0.35 : 1;
    // 粒子
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
      for (const dr of drops) {
        dr.y += dr.v * dt; dr.x += dr.v * 0.12 * dt;
        if (dr.y > fx.height + 20) { dr.y = -20; dr.x = Math.random() * fx.width; }
        ctx.moveTo(dr.x, dr.y); ctx.lineTo(dr.x - dr.v * 0.02, dr.y - dr.len);
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
    // 逗猫棒光点
    if (altHeld) {
      ctx.fillStyle = 'rgba(255,236,150,.35)';
      ctx.beginPath(); ctx.arc(altX, altY, 13, 0, 6.283); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,190,.95)';
      ctx.beginPath(); ctx.arc(altX, altY, 6, 0, 6.283); ctx.fill();
    }
    // 爱心彩糖
    for (let i = treats.length - 1; i >= 0; i--) {
      const t2 = treats[i];
      t2.life -= dt * 0.9;
      t2.x += t2.vx * dt; t2.y += t2.vy * dt; t2.vy += 60 * dt;
      if (t2.life <= 0) { treats.splice(i, 1); continue; }
      ctx.globalAlpha = Math.max(0, Math.min(1, t2.life));
      ctx.font = '22px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(t2.ch, t2.x, t2.y);
    }
    ctx.globalAlpha = 1;
    // 💤 / 摇晃跟随
    if (sleeping) {
      const s = slimeScreenPos();
      sleepBubble.style.left = (s.x + 34) + 'px';
      sleepBubble.style.top = (s.y - 90) + 'px';
    }
    if (petName) {
      const v = pet.slimeGroup.position.clone(); v.y += 1.2; v.project(pet.camera);
      nameTag.style.left = ((v.x * 0.5 + 0.5) * innerWidth - nameTag.offsetWidth / 2) + 'px';
      nameTag.style.top = ((-v.y * 0.5 + 0.5) * innerHeight - 58) + 'px';
    }
    // —— 小岛边缘倾斜：史莱姆到边缘 → 整岛朝那边微倾（探头看边下） ——
    const sp = pet.slime.pos, B = 4.3, m = 1.4;
    let prx = 0, prz = 0, ptx = 0, pty = 0;
    if (sp.x > B - m) { const kk = (sp.x - (B - m)) / m; prz = 2.4 * kk; ptx = 8 * kk; }
    else if (sp.x < -(B - m)) { const kk = (-(B - m) - sp.x) / m; prz = -2.4 * kk; ptx = -8 * kk; }
    if (sp.z > B - m) { const kk = (sp.z - (B - m)) / m; prx = -3.2 * kk; pty = 7 * kk; }
    else if (sp.z < -(B - m)) { const kk = (-(B - m) - sp.z) / m; prx = 3.2 * kk; pty = -7 * kk; }
    const cEl = document.getElementById('c');
    if (shaking) cEl.style.transform = 'translate(' + (Math.random() * 14 - 7).toFixed(1) + 'px,' + (Math.random() * 14 - 7).toFixed(1) + 'px)';
    else if (sleeping) cEl.style.transform = 'none';
    else if (prx || prz || ptx || pty) cEl.style.transform = 'translate(' + ptx.toFixed(1) + 'px,' + pty.toFixed(1) + 'px) rotateX(' + prx.toFixed(2) + 'deg) rotateZ(' + prz.toFixed(2) + 'deg)';
    else cEl.style.transform = 'none';
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  const strip = document.createElement('div');
  strip.id = 'dragStrip';
  strip.title = '按住这里可以拖动桌宠';
  document.body.appendChild(strip);

  const dragHandle = document.createElement('div');
  dragHandle.id = 'dragHandle';
  dragHandle.textContent = '⠿⠿ 拖动';
  dragHandle.title = '按住拖动整个桌宠';
  document.body.appendChild(dragHandle);

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

  // 可见版本徽标：一眼确认运行的是哪个版本
  const ver = document.createElement('div');
  ver.id = 'petVer';
  ver.textContent = '桌宠 v1.4.0';
  document.body.appendChild(ver);
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
      webSecurity: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  win.setAlwaysOnTop(true, 'floating');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile('index.html');
  win.webContents.on('did-finish-load', () => {
    win.webContents.executeJavaScript('(' + injectPetUI.toString() + ')()')
      .catch(err => {
        try {
          fs.appendFileSync(path.join(app.getPath('userData'), 'pet-errors.log'),
            new Date().toISOString() + ' ' + String(err) + '\n');
        } catch { }
      });
    const n = (loadSettings().name || '');
    if (n) setTimeout(() => run('window.__petSetName && window.__petSetName(' + JSON.stringify(n) + ')'), 400);
  });
  win.on('move', onWindowMove);
  const saveLater = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (win && !win.isDestroyed()) {
        const st = loadSettings(); st.bounds = win.getBounds(); saveSettings(st);
      }
    }, 400);
  };
  win.on('resize', saveLater);
  win.on('closed', () => { win = null; });
}

app.whenReady().then(() => { createWindow(); createTray(); startCursorPoll(); });
app.on('activate', () => {
  if (win) { win.show(); win.focus(); } else createWindow();
});
app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', () => app.quit());
