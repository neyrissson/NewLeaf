const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electron', {
  scanJobs: (url) => ipcRenderer.invoke('scan-jobs', url),
  searchAnswer: (params) => ipcRenderer.invoke('search-answer', params),
  askLocalLLM: (params) => ipcRenderer.invoke('ask-local-llm', params),
  searchWeb: (query) => ipcRenderer.invoke('search-web', query),
  checkOllama: () => ipcRenderer.invoke('check-ollama'),
  onAIChunk: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('ai-chunk', listener);
    return () => ipcRenderer.removeListener('ai-chunk', listener);
  },
  showItemInFolder: (filePath) => ipcRenderer.invoke('show-item-in-folder', filePath),
  openPath: (filePath) => ipcRenderer.invoke('open-path', filePath),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  copyToClipboard: (text) => ipcRenderer.invoke('copy-to-clipboard', text),
  scoreJobFit: (params) => ipcRenderer.invoke('score-job-fit', params),
  fetchJobDescription: (params) => ipcRenderer.invoke('fetch-job-description', params),
  exportCsv: (params) => ipcRenderer.invoke('export-csv', params),
  openGreenhouseSync: () => ipcRenderer.invoke('open-greenhouse-sync'),
  saveJsonFile: (params) => ipcRenderer.invoke('save-json-file', params),
  openJsonFile: () => ipcRenderer.invoke('open-json-file'),
  sweepAggregators: (params) => ipcRenderer.invoke('sweep-aggregators', params),
  fetchCompanyLinkedin: (params) => ipcRenderer.invoke('fetch-company-linkedin', params),
  setGeoLocations: (list) => ipcRenderer.invoke('set-geo-locations', list),
  setProvincesAllowed: (list) => ipcRenderer.invoke('set-provinces-allowed', list),
  checkUrlAlive: (params) => ipcRenderer.invoke('check-url-alive', params)
})

