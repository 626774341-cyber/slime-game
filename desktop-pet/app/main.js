// 史莱姆桌宠：无边框透明置顶窗口，箱庭小岛浮在桌面上
const { app, BrowserWindow } = require('electron');

let win;

function injectPetUI() {
  // —— 以下代码运行在页面里（DOM 已就绪）——
  const st = document.createElement('style');
  st.textContent = [
    'html, body { background: transparent !important; }',
    '#title, #hints, #moodCard, #starHud, #photoBtn { display: none !important; }',
    '/* 顶部左侧小控制行：关闭 / 声音 / 昼夜 / 天气 */',
    '#petClose { position: fixed; top: 4px; left: 8px; z-index: 32; -webkit-app-region: no-drag;',
    '  font-size: 14px; line-height: 18px; width: 20px; text-align: center; color: #4a6a8a;',
    '  opacity: .4; cursor: pointer; user-select: none; transition: opacity .15s; }',
    '#petClose:hover { opacity: 1; }',
    '#mute, #nightBtn, #weatherBtn { top: 2px !important; right: auto !important;',
    '  width: 26px !important; height: 20px !important; font-size: 13px !important; opacity: .55;',
    '  animation: none !important; transition: opacity .15s; padding: 0 !important; }',
    '#mute { position: fixed; left: 32px !important; }',
    '#nightBtn { position: fixed; left: 60px !important; }',
    '#weatherBtn { position: fixed; left: 88px !important; }',
    '#mute:hover, #nightBtn:hover, #weatherBtn:hover { opacity: 1; }',
    '/* 顶部拖拽条：按住移动桌宠 */',
    '#dragStrip { position: fixed; top: 0; left: 0; right: 0; height: 24px; z-index: 30;',
    '  -webkit-app-region: drag; cursor: move; }',
    '/* 右下角爪印按钮：点开互动抽屉 */',
    '#petPaw { position: fixed; right: 12px; bottom: 10px; width: 46px; height: 46px; border-radius: 50%;',
    '  background: rgba(255,255,255,.88); box-shadow: 0 4px 14px rgba(60,90,140,.35); z-index: 32;',
    '  display: flex; align-items: center; justify-content: center; font-size: 22px; cursor: pointer;',
    '  -webkit-app-region: no-drag; user-select: none; transition: transform .2s ease; }',
    '#petPaw:hover { transform: scale(1.1); }',
    '/* 互动抽屉：默认收起，点爪印滑出 */',
    '#toolbar { flex-direction: row !important; flex-wrap: wrap !important; justify-content: center !important;',
    '  right: auto !important; left: 50% !important; transform: translate(-50%, 16px) !important;',
    '  bottom: 66px !important; max-width: 96% !important; gap: 5px !important; padding: 8px !important;',
    '  opacity: 0; pointer-events: none; animation: none !important; transition: all .25s ease; }',
    'body.pet-open #toolbar { opacity: 1; pointer-events: auto; transform: translate(-50%, 0) !important; }',
    '.tool { width: 40px !important; height: 40px !important; font-size: 20px !important; }'
  ].join('\n');
  document.head.appendChild(st);

  const strip = document.createElement('div');
  strip.id = 'dragStrip';
  strip.title = '按住这里可以拖动桌宠';
  document.body.appendChild(strip);

  const closeBtn = document.createElement('div');
  closeBtn.id = 'petClose';
  closeBtn.textContent = '✕';
  closeBtn.title = '退出桌宠';
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
  win = new BrowserWindow({
    width: 520,
    height: 460,
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
      backgroundThrottling: false
    }
  });
  win.setAlwaysOnTop(true, 'floating');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile('index.html');
  win.webContents.on('did-finish-load', () => {
    win.webContents.executeJavaScript('(' + injectPetUI.toString() + ')()');
  });
  win.on('closed', () => { win = null; });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
