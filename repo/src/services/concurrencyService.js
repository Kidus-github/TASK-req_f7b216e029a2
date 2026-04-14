const CHANNEL_NAME = 'flowforge-sync'

let channel = null
let listeners = []

export const concurrencyService = {
  init() {
    if (typeof BroadcastChannel === 'undefined') return
    if (channel) return
    channel = new BroadcastChannel(CHANNEL_NAME)
    channel.onmessage = (event) => {
      for (const listener of listeners) {
        listener(event.data)
      }
    }
  },

  destroy() {
    if (channel) {
      channel.close()
      channel = null
    }
    listeners = []
  },

  broadcast(message) {
    if (channel) {
      channel.postMessage(message)
    }
  },

  onMessage(callback) {
    listeners.push(callback)
    return () => {
      listeners = listeners.filter((l) => l !== callback)
    }
  },

  notifyDiagramSaved(diagramId, versionNumber, revisionHash, tabId) {
    this.broadcast({
      type: 'diagram_saved',
      diagramId,
      versionNumber,
      revisionHash,
      tabId,
      timestamp: new Date().toISOString(),
    })
  },

  notifyDiagramOpened(diagramId, tabId) {
    this.broadcast({
      type: 'diagram_opened',
      diagramId,
      tabId,
      timestamp: new Date().toISOString(),
    })
  },

  notifyDiagramClosed(diagramId, tabId) {
    this.broadcast({
      type: 'diagram_closed',
      diagramId,
      tabId,
      timestamp: new Date().toISOString(),
    })
  },

  checkConflict(localVersion, localHash, remoteVersion, remoteHash) {
    if (remoteVersion > localVersion) return 'newer_version'
    if (remoteVersion === localVersion && remoteHash !== localHash) return 'hash_mismatch'
    return null
  },
}
