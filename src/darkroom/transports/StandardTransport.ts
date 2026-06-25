import { EncryptedPayload, TransportStatus } from '../types'
import { Transport } from './TransportInterface'
import { DARKROOM_CONFIG } from '../config'

interface StandardRelayFrame {
  type: string
  payload?: EncryptedPayload
  msg?: string
}

export class StandardTransport implements Transport {
  public status: TransportStatus = 'disconnected'
  public error: string | null = null

  private ws: WebSocket | null = null
  private roomId: string | null = null
  private memberId: string | null = null
  private messageListeners: Array<(payload: EncryptedPayload) => void> = []
  private statusListeners: Array<(status: TransportStatus, err?: string | null) => void> = []

  private reconnectDelay = 3000 // 3 seconds base delay
  private currentBackoff = 3000
  private maxBackoff = 30000 // 30 seconds max
  private connectionTimeout = 10000 // 10 seconds timeout
  private heartbeatInterval = 30000 // 30 seconds
  private pongTimeout = 10000 // 10 seconds

  private connectTimeoutId: ReturnType<typeof setTimeout> | null = null
  private heartbeatIntervalId: ReturnType<typeof setTimeout> | null = null
  private pongTimeoutId: ReturnType<typeof setTimeout> | null = null
  private reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null

  private joinResolver: (() => void) | null = null
  private joinRejecter: ((err: Error) => void) | null = null

  private relayUrl: string

  constructor(customRelayUrl?: string) {
    this.relayUrl = customRelayUrl ?? DARKROOM_CONFIG.STANDARD_RELAY
  }

  private log(message: string, ...args: unknown[]): void {
    const isDev = typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production'
    if (isDev) {
      console.log(`[Standard] ${message}`, ...args)
    }
  }

  public async connect(roomId: string, memberId: string): Promise<void> {
    this.roomId = roomId
    this.memberId = memberId
    this.currentBackoff = this.reconnectDelay // Reset backoff
    this.log('Connecting...')
    this.updateStatus('connecting')
    return this.establishConnection()
  }

  private establishConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.joinResolver = resolve
      this.joinRejecter = reject

      this.clearAllTimers()

      try {
        if (this.ws) {
          this.ws.close()
        }

        this.ws = new WebSocket(this.relayUrl)

        // 10 seconds connection timeout
        this.connectTimeoutId = setTimeout(() => {
          this.log('Connection timeout exceeded')
          this.handleConnectionFailure(new Error('Relay server unavailable.'))
        }, this.connectionTimeout)

        this.ws.onopen = () => {
          this.log('Connected')
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
            this.handleIncomingMessage(data)
          } catch (e) {
            this.log('Failed to parse message:', e)
          }
        }

        this.ws.onclose = () => {
          this.log('Disconnected')
          if (this.status !== 'disconnected' && this.status !== 'error') {
            this.handleReconnect()
          }
        }

        this.ws.onerror = (err) => {
          this.log('Socket error', err)
          this.handleConnectionFailure(new Error('Unable to connect to Dark Room.'))
        }
      } catch (e) {
        this.handleConnectionFailure(e as Error)
      }
    })
  }

  private handleConnectionFailure(err: Error): void {
    this.clearAllTimers()
    if (this.ws) {
      this.ws.onclose = null
      this.ws.onerror = null
      this.ws.close()
      this.ws = null
    }

    if (this.joinRejecter) {
      this.joinRejecter(err)
      this.joinRejecter = null
      this.joinResolver = null
    }

    if (this.status !== 'disconnected') {
      this.handleReconnect()
    }
  }

  private handleIncomingMessage(data: StandardRelayFrame | { type: 'pong' }): void {
    if (data.type === 'joined') {
      this.log('Joined Room')
      this.updateStatus('connected')

      if (this.connectTimeoutId) {
        clearTimeout(this.connectTimeoutId)
        this.connectTimeoutId = null
      }
      if (this.joinResolver) {
        this.joinResolver()
        this.joinResolver = null
        this.joinRejecter = null
      }

      this.startHeartbeat()
    } else if (data.type === 'pong') {
      if (this.pongTimeoutId) {
        clearTimeout(this.pongTimeoutId)
        this.pongTimeoutId = null
      }
    } else if (data.type === 'message') {
      const frame = data as StandardRelayFrame
      if (frame.payload) {
        this.log('Message Received')
        this.messageListeners.forEach((l) => l(frame.payload!))
      }
    } else if (data.type === 'error') {
      const frame = data as StandardRelayFrame
      this.log('Server error:', frame.msg)
      this.error = frame.msg || 'Relay server unavailable.'
      this.updateStatus('error', this.error)
      this.clearAllTimers()
    }
  }

  private startHeartbeat(): void {
    if (this.heartbeatIntervalId) {
      clearInterval(this.heartbeatIntervalId)
    }

    this.heartbeatIntervalId = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }))

        this.pongTimeoutId = setTimeout(() => {
          this.log('Pong timeout exceeded (heartbeat failed)')
          this.ws?.close()
        }, this.pongTimeout)
      }
    }, this.heartbeatInterval)
  }

  private handleReconnect(): void {
    if (this.status === 'disconnected' || this.status === 'error') return

    this.clearAllTimers()

    this.log('Reconnecting...')
    this.updateStatus('reconnecting')

    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId)
    }

    this.reconnectTimeoutId = setTimeout(() => {
      this.log(`Attempting reconnect in ${this.currentBackoff}ms`)
      this.establishConnection()
        .then(() => {
          this.log('Connection restored')
        })
        .catch((err) => {
          this.log('Reconnect attempt failed:', err.message)
        })

      this.currentBackoff = Math.min(this.currentBackoff * 2, this.maxBackoff)
    }, this.currentBackoff)
  }

  public disconnect(): void {
    this.log('Disconnected')
    this.updateStatus('disconnected')
    this.clearAllTimers()

    if (this.ws) {
      this.ws.onclose = null
      this.ws.onerror = null
      this.ws.close()
      this.ws = null
    }

    this.roomId = null
    this.memberId = null
    this.joinResolver = null
    this.joinRejecter = null
  }

  public async send(payload: EncryptedPayload): Promise<void> {
    if (!this.ws || this.status !== 'connected') {
      throw new Error('Internet connection lost.')
    }

    this.ws.send(
      JSON.stringify({
        type: 'message',
        roomId: this.roomId,
        payload
      })
    )
    this.log('Message Sent')
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

  private clearAllTimers(): void {
    if (this.connectTimeoutId) {
      clearTimeout(this.connectTimeoutId)
      this.connectTimeoutId = null
    }
    if (this.heartbeatIntervalId) {
      clearInterval(this.heartbeatIntervalId)
      this.heartbeatIntervalId = null
    }
    if (this.pongTimeoutId) {
      clearTimeout(this.pongTimeoutId)
      this.pongTimeoutId = null
    }
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId)
      this.reconnectTimeoutId = null
    }
  }
}
