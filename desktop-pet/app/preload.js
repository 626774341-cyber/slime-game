// 桌宠页面 ↔ 主进程 的安全桥
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('petApi', {
  setHover: (h) => ipcRenderer.send('pet:hover', h),
  close: () => ipcRenderer.send('pet:close'),
  openNaming: () => ipcRenderer.send('pet:openname'),
  saveFileAs: async (name, file) => {
    const buf = new Uint8Array(await file.arrayBuffer());
    return ipcRenderer.invoke('pet:savefile', name, buf);
  },
  pathForFile: (f) => {
    try { return webUtils.getPathForFile(f); } catch { return (f && f.name) || '文件'; }
  }
});
