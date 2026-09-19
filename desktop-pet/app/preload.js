// 桌宠页面 ↔ 主进程 的安全桥
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('petApi', {
  setHover: (h) => ipcRenderer.send('pet:hover', h),
  close: () => ipcRenderer.send('pet:close'),
  setName: (n) => ipcRenderer.send('pet:setname', n),
  openName: () => ipcRenderer.send('pet:openname'),
  pathForFile: (f) => {
    try { return webUtils.getPathForFile(f); } catch { return (f && f.name) || '文件'; }
  }
});
