import { contextBridge, ipcRenderer } from 'electron'

// Injected into every content tab. Hides Electron/automation signals from web pages.
try {
  Object.defineProperty(navigator, 'webdriver', { get: () => false, configurable: true })
} catch {}

const api = {
  // Tab management (needed for navigating custom pages)
  createTab: (url: string): Promise<string> => ipcRenderer.invoke('tab:create', url),

  // Dark Room IPC
  darkroomGetConfig: (): Promise<any> => ipcRenderer.invoke('darkroom:get-config'),
  darkroomStart: (): Promise<any> => ipcRenderer.invoke('darkroom:start'),
  darkroomStop: (): Promise<boolean> => ipcRenderer.invoke('darkroom:stop'),
  onDarkroomTorStatus: (cb: (data: any) => void): (() => void) => {
    const listener = (_event: any, data: any) => cb(data)
    ipcRenderer.on('darkroom:tor-status', listener)
    return () => {
      ipcRenderer.removeListener('darkroom:tor-status', listener)
    }
  },

  // DC Net IPC
  dcnetJoin: (roomId: string, peerId: string): Promise<any> =>
    ipcRenderer.invoke('dcnet:join', roomId, peerId),
  dcnetLeave: (roomId: string, peerId: string): Promise<any> =>
    ipcRenderer.invoke('dcnet:leave', roomId, peerId),
  dcnetSubmitVector: (
    roomId: string,
    round: number,
    phase: 'reservation' | 'message',
    peerId: string,
    vector: number[]
  ): Promise<any> =>
    ipcRenderer.invoke('dcnet:submit-vector', roomId, round, phase, peerId, vector),
  onDcnetRoundResult: (cb: (data: any) => void): (() => void) => {
    const listener = (_event: any, data: any) => cb(data)
    ipcRenderer.on('dcnet:round-result', listener)
    return () => {
      ipcRenderer.removeListener('dcnet:round-result', listener)
    }
  }
}

if (process.contextIsolated) {
  if (typeof window !== 'undefined' && window.location.protocol === 'ghost:') {
    try {
      contextBridge.exposeInMainWorld('api', api)
    } catch (error) {
      console.error('[Preload] Failed to expose window.api in contextIsolated mode:', error)
    }
  }
} else {
  if (typeof window !== 'undefined' && window.location.protocol === 'ghost:') {
    // @ts-ignore
    window.api = api
  }
}
