// 史莱姆桌宠：无边框透明置顶窗口，箱庭小岛浮在桌面上
const { app, BrowserWindow } = require('electron');

let win;

function injectPetUI() {
  // —— 以下代码运行在页面里（DOM 已就绪）——
  const st = document.createElement('style');
  st.textContent = [
    'html, body { background: transparent !important; }',
    '#title, #hints, #moodCard, #starHud, #photoBtn { display: none !important; }',
    '/* 工具栏改为底部横排，避免与窗户边缘 / 其他 UI 重合 */',
    '#toolbar { flex-direction: row !important; right: auto !important; left: 50% !important;',
    '  transform: translateX(-50%) !important; bottom: 5px !important; gap: 5px !important; }',
    '.tool { width: 40px !important; height: 40px !important; font-size: 20px !important; }',
    '/* 右上角小按钮下移，避开顶部拖拽条 */',
    '#mute, #nightBtn, #weatherBtn { top: 30px !important; }',
    '#dragStrip { position: fixed; top: 0; left: 0; right: 0; height: 26px; z-index: 30;',
    '  -webkit-app-region: drag; cursor: move; }',
    '#petClose { position: fixed; top: 3px; left: 10px; z-index: 31;',
    '  -webkit-app-region: no-drag; font-size: 15px; line-height: 20px; width: 20px; text-align: center;',
    '  color: #4a6a8a; opacity: .45; cursor: pointer; user-select: none; }',
    '#petClose:hover { opacity: 1; }'
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
}

function createWindow() {
  win = new BrowserWindow({
    width: 460,
    height: 400,
    transparent: true,
    frame: false,
    hasShadow: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
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
