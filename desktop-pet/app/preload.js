// 桌宠页面 ↔ 主进程 的安全桥
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petApi', {
  setHover: (h) => ipcRenderer.send('pet:hover', h),
  close: () => ipcRenderer.send('pet:close')
});
