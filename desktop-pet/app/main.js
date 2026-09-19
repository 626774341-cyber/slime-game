// 史莱姆桌宠：无边框透明置顶窗口，箱庭小岛浮在桌面上
// 托盘常驻：显示/隐藏、换地图、退出；✕ = 隐藏到托盘
const { app, BrowserWindow, Tray, Menu, nativeImage, screen } = require('electron');

let win = null, tray = null, quitting = false, moveTimer = null;

// 程序化画一个史莱姆蓝的圆形托盘图标（16~18px 足够）
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
  tray = new Tray(makeTrayIcon());
  tray.setToolTip('史莱姆桌宠');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示 / 隐藏桌宠', click: togglePet },
    { label: '换地图（箱庭 ⇄ 轻简）', click: () => run('window.__petToggleMap && window.__petToggleMap()') },
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

// 窗口贴近屏幕边缘时，让史莱姆"扒边探头"
function sendEdge() {
  if (!win || win.isDestroyed() || !win.isVisible()) return;
  const b = win.getBounds(), wa = screen.getPrimaryDisplay().workArea;
  let dir = null;
  if (b.x - wa.x <= 40) dir = 'left';
  else if (wa.x + wa.width - (b.x + b.width) <= 40) dir = 'right';
  else if (b.y - wa.y <= 40) dir = 'top';
  else if (wa.y + wa.height - (b.y + b.height) <= 40) dir = 'bottom';
  run('window.__petEdge && window.__petEdge(' + JSON.stringify(dir) + ')');
}

function injectPetUI() {
  // —— 以下代码运行在页面里（模块脚本已执行完，window.__pet 可用）——
  const pet = window.__pet;
  if (!pet) return;                                // 游戏脚本未就绪时放弃注入
  const st = document.createElement('style');
  st.textContent = [
    'html, body { background: transparent !important; }',
    '#title, #hints, #moodCard, #starHud, #photoBtn { display: none !important; }',
    '#petFx { position: fixed; inset: 0; z-index: 2; pointer-events: none; }',
    '#c { transition: transform .45s ease; }',
    '/* 右上角统一控制行：✕ 声音 昼夜 天气 爪印（实体白钮，不透明） */',
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
    '/* 顶部拖拽条：按住移动桌宠 */',
    '#dragStrip { position: fixed; top: 0; left: 0; right: 0; height: 24px; z-index: 30;',
    '  -webkit-app-region: drag; cursor: move; }',
    '/* 互动抽屉：默认收起，点右上角爪印从按钮组下方滑出 */',
    '#toolbar { flex-direction: row !important; flex-wrap: wrap !important; justify-content: flex-end !important;',
    '  left: auto !important; right: 10px !important; top: 52px !important; bottom: auto !important;',
    '  width: max-content !important; max-width: 96% !important; gap: 5px !important; padding: 8px !important;',
    '  transform: translateY(-10px) !important;',
    '  opacity: 0; pointer-events: none; animation: none !important; transition: all .25s ease;',
    '  background: rgba(255,255,255,.96) !important; }',
    'body.pet-open #toolbar { opacity: 1; pointer-events: auto; transform: translateY(0) !important; }',
    '.tool { width: 40px !important; height: 40px !important; font-size: 20px !important; }'
  ].join('\n');
  document.head.appendChild(st);

  // —— 天气粒子层：整窗漂浮，随游戏天气切换（晴=光点/萤火虫，雨=雨丝，雪=雪花）——
  const fx = document.createElement('canvas');
  fx.id = 'petFx';
  document.body.appendChild(fx);
  const ctx = fx.getContext('2d');

  // —— 相机贴合：不管窗口多大、缩放到哪，小岛四个角恒定可见 ——
  function cornerR() { return Math.sqrt(2) * 5.25 + 0.35; }        // 岛半对角 + 余量
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
  fitView(true);                                   // 启动即完整展示全岛
  window.addEventListener('resize', onResize);

  // —— 贴边探头：主进程通知当前贴的是哪条边，小岛微微倾斜"扒边" ——
  window.__petEdge = (dir) => {
    const c = document.getElementById('c');
    if (!c) return;
    const map = {
      left: 'translateX(-16px) rotateZ(-2.5deg)',
      right: 'translateX(16px) rotateZ(2.5deg)',
      top: 'translateY(-14px) scale(1.02)',
      bottom: 'translateY(14px) scale(0.97)'
    };
    c.style.transform = map[dir] || 'none';
  };
  // —— 换地图：箱庭 ⇄ 轻简（只看史莱姆）——
  window.__petToggleMap = () => {
    const p = window.__pet;
    if (p.world) p.world.visible = !p.world.visible;
    return !!(p.world && p.world.visible);
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
    sunny += ((mode === 0 ? 1 : 0) - sunny) * Math.min(1, dt * 3);
    rain += ((mode === 1 ? 1 : 0) - rain) * Math.min(1, dt * 3);
    snow += ((mode === 2 ? 1 : 0) - snow) * Math.min(1, dt * 3);
    ctx.clearRect(0, 0, fx.width, fx.height);
    if (sunny > 0.02) {                               // 晴天：暖色光点（夜里变萤火虫）
      for (const m of motes) {
        m.y -= m.vy * dt; m.x += Math.sin(now * 0.0004 * m.sp + m.tw) * 14 * dt;
        if (m.y < -8) { m.y = fx.height + 8; m.x = Math.random() * fx.width; }
        if (m.x < -8) m.x = fx.width + 8; else if (m.x > fx.width + 8) m.x = -8;
        const tw = 0.4 + 0.3 * Math.sin(now * 0.002 * m.sp + m.tw);
        ctx.globalAlpha = sunny * tw * (night > 0.5 ? 0.9 : 0.65);
        ctx.fillStyle = night > 0.5 ? '#d6ff8f' : '#ffe9a8';
        ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, 6.283); ctx.fill();
      }
    }
    if (rain > 0.02) {                                // 雨天：整窗雨丝
      ctx.strokeStyle = 'rgba(170,205,240,' + (0.5 * rain).toFixed(3) + ')';
      ctx.lineWidth = 1.4; ctx.beginPath();
      for (const d of drops) {
        d.y += d.v * dt; d.x += d.v * 0.12 * dt;
        if (d.y > fx.height + 20) { d.y = -20; d.x = Math.random() * fx.width; }
        ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - d.v * 0.02, d.y - d.len);
      }
      ctx.stroke();
    }
    if (snow > 0.02) {                                // 雪天：整窗雪花
      ctx.fillStyle = 'rgba(255,255,255,' + (0.85 * snow).toFixed(3) + ')';
      for (const f of flakes) {
        f.y += f.v * dt; f.x += Math.sin(now * 0.001 + f.ph) * 22 * dt;
        if (f.y > fx.height + 6) { f.y = -6; f.x = Math.random() * fx.width; }
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 6.283); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
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
  closeBtn.title = '隐藏桌宠（顶栏托盘图标可找回）';
  closeBtn.addEventListener('click', () => window.close());
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
  win = new BrowserWindow({
    width: 700,
    height: 600,
    x: Math.max(wa.x, wa.x + wa.width - 720),
    y: Math.max(wa.y, wa.y + wa.height - 620),
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
      webSecurity: false              // 允许加载本地 vendor 里的 ES 模块（完全离线）
    }
  });
  win.setAlwaysOnTop(true, 'floating');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile('index.html');
  win.webContents.on('did-finish-load', () => {
    win.webContents.executeJavaScript('(' + injectPetUI.toString() + ')()');
  });
  win.on('close', (e) => {
    if (!quitting) { e.preventDefault(); win.hide(); }   // ✕ = 隐藏到托盘
  });
  win.on('move', () => {
    clearTimeout(moveTimer);
    moveTimer = setTimeout(sendEdge, 120);
  });
  win.on('closed', () => { win = null; });
}

app.whenReady().then(() => { createWindow(); createTray(); });
// macOS：再次打开 App（或点 Dock）时，把隐藏中的桌宠唤出来
app.on('activate', () => {
  if (win) { win.show(); win.focus(); } else createWindow();
});
app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', () => { /* 托盘常驻，不自动退出 */ });
