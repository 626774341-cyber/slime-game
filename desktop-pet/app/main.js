// 史莱姆桌宠：无边框透明置顶窗口，箱庭小岛浮在桌面上
const { app, BrowserWindow } = require('electron');

let win;

function injectPetUI() {
  // —— 以下代码运行在页面里（DOM 已就绪）——
  const st = document.createElement('style');
  st.textContent = [
    '/* 柔和天空光晕：让小岛不干贴在桌面上 */',
    'html, body { background: radial-gradient(ellipse at 50% 40%, rgba(191,228,247,.5) 0%, rgba(191,228,247,0) 68%) !important; }',
    '#title, #hints, #moodCard, #starHud, #photoBtn { display: none !important; }',
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
