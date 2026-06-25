import { EncryptedPayload, TransportStatus } from '../types'
import { Transport } from './TransportInterface'

export class TorTransport implements Transport {
  public status: TransportStatus = 'disconnected'
  public error: string | null = null

  private ws: WebSocket | null = null
  private roomId: string | null = null
  private memberId: string | null = null
  private messageListeners: Array<(payload: EncryptedPayload) => void> = []
  private statusListeners: Array<(status: TransportStatus, err?: string | null) => void> = []

  private bootstrapProgress = 0
  private unsubscribeStatus: (() => void) | null = null
  private checkTimeoutId: ReturnType<typeof setTimeout> | null = null

  public async connect(roomId: string, memberId: string): Promise<void> {
    this.roomId = roomId
    this.memberId = memberId
    this.updateStatus('connecting')

    // Subscribe to IPC status updates
    if (window.api.onDarkroomTorStatus) {
      this.unsubscribeStatus = window.api.onDarkroomTorStatus(
        (data: { status: string; progress: number | null }) => {
          if (data.status === 'bootstrapping' && data.progress !== null) {
            this.bootstrapProgress = data.progress
            this.updateStatus(
              'connecting',
              `Still connecting to Tor — this can take a minute on first launch (${data.progress}%)`
            )
          } else if (data.status === 'ready') {
            this.bootstrapProgress = 100
          } else if (data.status === 'error') {
            this.updateStatus('error', 'Tor failed to start — try restarting Dark Room.')
          }
        }
      )
    }

    // Set a timeout for bootstrap check
    this.checkTimeoutId = setTimeout(() => {
      if (this.status === 'connecting' && this.bootstrapProgress < 100) {
        this.updateStatus(
          'connecting',
          'Still connecting to Tor — this can take a minute on first launch.'
        )
      }
    }, 15000)

    try {
      const config = await window.api.darkroomGetConfig()
      if (!config.torFound) {
        this.updateStatus('error', "Tor isn't available on this system.")
        return
      }

      const result = await window.api.darkroomStart()
      if (!result.ok) {
        if (result.error === 'TOR_NOT_FOUND') {
          this.updateStatus('error', "Tor isn't available on this system.")
        } else {
          this.updateStatus(
            'error',
            result.error || 'Tor failed to start — try restarting Dark Room.'
          )
        }
        return
      }

      const proxyPort = result.port
      if (!proxyPort) {
        this.updateStatus('error', 'Tor proxy port not received.')
        return
      }

      // Establish WebSocket connection over the local Tor SOCKS5-tunneled port
      return this.establishSocket(proxyPort)
    } catch (e) {
      const err = e as Error
      console.error('[TorTransport] Connection failed:', err)
      this.updateStatus('error', err.message || 'Tor connection failed.')
    }
  }

  private establishSocket(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        if (this.ws) {
          this.ws.close()
        }

        // Connect directly to the local port exposed by DarkRoomProxy
        this.ws = new WebSocket(`ws://127.0.0.1:${port}`)

        this.ws.onopen = () => {
          console.log('[TorTransport] WebSocket connection established through Tor proxy')
          this.ws?.send(
            JSON.stringify({
              type: 'join',
              roomId: this.roomId,
              memberId: this.memberId
            })
          )
        }

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)
            if (data.type === 'joined') {
              console.log('[TorTransport] Server joined ack received')
              this.updateStatus('connected')
              resolve()
            } else if (data.type === 'message') {
              if (data.payload) {
                this.messageListeners.forEach((l) => l(data.payload))
              }
            } else if (data.type === 'error') {
              this.updateStatus('error', data.msg || 'Relay error')
            }
          } catch (e) {
            console.error('[TorTransport] Failed to parse message:', e)
          }
        }

        this.ws.onclose = () => {
          console.log('[TorTransport] Socket closed')
          if (this.status !== 'disconnected' && this.status !== 'error') {
            this.updateStatus('connecting', 'Tor connection lost, reconnecting...')
            // Retry establishment
            setTimeout(() => {
              if (this.status !== 'disconnected') {
                this.establishSocket(port).catch(() => {})
              }
            }, 3000)
          }
        }

        this.ws.onerror = (err) => {
          console.error('[TorTransport] Socket error:', err)
          reject(new Error('WebSocket proxy connection failed.'))
        }
      } catch (e) {
        reject(e)
      }
    })
  }

  public disconnect(): void {
    this.updateStatus('disconnected')

    if (this.unsubscribeStatus) {
      // Clean up event listener if context isolation supports return callback
      this.unsubscribeStatus = null
    }

    if (this.checkTimeoutId) {
      clearTimeout(this.checkTimeoutId)
      this.checkTimeoutId = null
    }

    if (this.ws) {
      this.ws.close()
      this.ws = null
    }

    this.roomId = null
    this.memberId = null
    window.api.darkroomStop().catch(() => {})
  }

  public async send(payload: EncryptedPayload): Promise<void> {
    if (!this.ws || this.status !== 'connected') {
      throw new Error('Tor transport not connected')
    }

    this.ws.send(
      JSON.stringify({
        type: 'message',
        roomId: this.roomId,
        payload
      })
    )
  }

  public onMessage(cb: (payload: EncryptedPayload) => void): void {
    this.messageListeners.push(cb)
  }

  public onStatusChange(cb: (status: TransportStatus, err?: string | null) => void): void {
    this.statusListeners.push(cb)
  }

  private updateStatus(newStatus: TransportStatus, err: string | null = null): void {
    this.status = newStatus
    this.error = err
    this.statusListeners.forEach((l) => l(newStatus, err))
  }
}
