import { EncryptedPayload, TransportStatus } from '../types'
import { Transport } from './TransportInterface'
import { deriveSharedSecret } from '../crypto'
import { DARKROOM_CONFIG } from '../config'

// ── FNV-1a Hash ──────────────────────────────────────────────────────────────
function hashPad(sharedSecret: Uint8Array, round: number, slot: number): number {
  let hash = 2166136261
  for (let i = 0; i < sharedSecret.length; i++) {
    hash ^= sharedSecret[i]
    hash = Math.imul(hash, 16777619)
  }
  hash ^= round
  hash = Math.imul(hash, 16777619)
  hash ^= slot
  hash = Math.imul(hash, 16777619)
  return hash >>> 0
}

// ── LCG PRNG for blinder buffers ─────────────────────────────────────────────
function generateBlinderBuffer(
  sharedSecret: Uint8Array,
  round: number,
  slot: number,
  length: number
): Uint8Array {
  const pad = new Uint8Array(length)
  let seed = hashPad(sharedSecret, round, slot)
  for (let i = 0; i < length; i++) {
    seed = (Math.imul(1103515245, seed) + 12345) >>> 0
    pad[i] = seed & 0xff
  }
  return pad
}

export class DCNetTransport implements Transport {
  public status: TransportStatus = 'disconnected'
  public error: string | null = null

  private roomId: string | null = null
  private myPeerId: string | null = null
  private mySecretKeyB64: string
  private peerPubKeys: Record<string, string> = {} // peerId -> publicKeyB64
  private activePeers: Set<string> = new Set()

  private messageListeners: Array<(payload: EncryptedPayload) => void> = []
  private statusListeners: Array<(status: TransportStatus, err?: string | null) => void> = []
  private roundResultListeners: Array<
    (data: {
      roomId: string
      round: number
      phase: 'reservation' | 'message'
      result: number[]
      activePeersCount?: number
    }) => void
  > = []

  private ws: WebSocket | null = null
  private round = 0

  // Queue of message payloads waiting to be sent
  private pendingMessage: EncryptedPayload | null = null
  private myReservedSlot: number | null = null
  private myReservationToken = 0

  private connectResolver: (() => void) | null = null
  private connectRejecter: ((err: Error) => void) | null = null

  private connectTimeoutId: ReturnType<typeof setTimeout> | null = null
  private reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null
  private heartbeatIntervalId: ReturnType<typeof setTimeout> | null = null
  private pongTimeoutId: ReturnType<typeof setTimeout> | null = null
  private currentBackoff = 3000

  constructor(mySecretKeyB64: string, peerPubKeys: Record<string, string>) {
    this.mySecretKeyB64 = mySecretKeyB64
    this.peerPubKeys = peerPubKeys
  }

  private log(message: string, ...args: unknown[]): void {
    const isDev = typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production'
    if (isDev) {
      console.log(`[DCNET] ${message}`, ...args)
    }
  }

  public async connect(roomId: string, memberId: string): Promise<void> {
    this.roomId = roomId
    this.myPeerId = memberId
    this.round = 0
    this.myReservedSlot = null
    this.pendingMessage = null
    this.currentBackoff = 3000
    this.updateStatus('connecting')
    this.log('Connecting')

    return this.establishConnection()
  }

  private establishConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.connectResolver = resolve
      this.connectRejecter = reject

      const isReconnectingJoin = this.status === 'reconnecting' || this.status === 'heartbeat-lost'

      this.clearAllTimers()

      if (this.ws) {
        this.ws.onopen = null
        this.ws.onmessage = null
        this.ws.onclose = null
        this.ws.onerror = null
        try {
          this.ws.close()
        } catch {
          // Ignore close errors on cleanup
        }
        this.ws = null
      }

      try {
        this.ws = new WebSocket(DARKROOM_CONFIG.DCNET_COORDINATOR)

        // 10s connection/join timeout
        this.connectTimeoutId = setTimeout(() => {
          this.log('Connection timeout')
          this.handleConnectionFailure(new Error('Coordinator unavailable.'))
        }, DARKROOM_CONFIG.ROUND_TIMEOUT)

        this.ws.onopen = () => {
          this.log('Connected')
          if (this.roomId && this.myPeerId) {
            this.ws?.send(
              JSON.stringify({
                type: 'join',
                roomId: this.roomId,
                peerId: this.myPeerId,
                reconnect: isReconnectingJoin
              })
            )
          }
        }

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)
            if (data.type === 'joined') {
              this.log('Joined')
              this.updateStatus('connected')

              if (data.activePeers && Array.isArray(data.activePeers)) {
                this.activePeers = new Set(data.activePeers)
              } else {
                this.activePeers = new Set([this.myPeerId!])
              }

              if (this.connectTimeoutId) {
                clearTimeout(this.connectTimeoutId)
                this.connectTimeoutId = null
              }

              if (this.connectResolver) {
                this.connectResolver()
                this.connectResolver = null
                this.connectRejecter = null
              }

              this.startHeartbeat()
              this.runReservationRound()
            } else if (data.type === 'round-result') {
              this.log('Round Result')
              if (data.roomId === this.roomId) {
                this.roundResultListeners.forEach((l) => l(data))
                this.handleRoundResult(data.round, data.phase, data.result)
              }
            } else if (data.type === 'peer-joined') {
              this.log(`Peer Joined: ${data.peerId}`)
              this.activePeers.add(data.peerId)
              this.myReservedSlot = null
              this.round++
              this.runReservationRound()
            } else if (data.type === 'peer-left') {
              this.log(`Peer Left: ${data.peerId}`)
              this.activePeers.delete(data.peerId)
              this.myReservedSlot = null
              this.round++
              this.runReservationRound()
            } else if (data.type === 'round-timeout') {
              this.log('Round Timeout')
              this.myReservedSlot = null
              this.round = (data.round || this.round) + 1
              this.runReservationRound()
            } else if (data.type === 'pong') {
              if (this.pongTimeoutId) {
                clearTimeout(this.pongTimeoutId)
                this.pongTimeoutId = null
              }
            } else if (data.type === 'error') {
              this.log(`Error: ${data.message}`)
              this.updateStatus('error', data.message)
              if (this.ws) {
                this.ws.close()
              }
            }
          } catch (e) {
            this.log('Failed to parse message:', e)
          }
        }

        this.ws.onclose = () => {
          if (this.status !== 'disconnected' && this.status !== 'error') {
            this.handleReconnect()
          } else {
            this.log('Disconnected')
          }
        }

        this.ws.onerror = (err) => {
          this.log('Socket error', err)
          this.handleConnectionFailure(new Error('WebSocket error occurred'))
        }
      } catch (e) {
        this.handleConnectionFailure(e as Error)
      }
    })
  }

  private handleConnectionFailure(err: Error): void {
    this.clearAllTimers()
    if (this.ws) {
      this.ws.onopen = null
      this.ws.onmessage = null
      this.ws.onclose = null
      this.ws.onerror = null
      try {
        this.ws.close()
      } catch {
        // Ignore close errors on failure handling
      }
      this.ws = null
    }

    if (this.connectRejecter) {
      this.connectRejecter(err)
      this.connectRejecter = null
      this.connectResolver = null
    }

    if (this.status !== 'disconnected') {
      this.handleReconnect()
    }
  }

  private handleReconnect(): void {
    if (this.status === 'disconnected' || this.status === 'error') return

    this.clearAllTimers()
    this.log('Reconnecting')
    this.updateStatus('reconnecting')

    this.reconnectTimeoutId = setTimeout(() => {
      this.establishConnection()
        .then(() => {
          this.log('Connected')
          this.currentBackoff = 3000
        })
        .catch((err) => {
          this.log('Reconnect attempt failed:', err.message)
        })
      this.currentBackoff = Math.min(this.currentBackoff * 2, 30000)
    }, this.currentBackoff)
  }

  private startHeartbeat(): void {
    if (this.heartbeatIntervalId) {
      clearInterval(this.heartbeatIntervalId)
    }

    this.heartbeatIntervalId = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }))

        if (this.pongTimeoutId) {
          clearTimeout(this.pongTimeoutId)
        }
        this.pongTimeoutId = setTimeout(() => {
          this.log('Heartbeat Lost')
          this.updateStatus('heartbeat-lost', 'Heartbeat lost.')
          if (this.ws) {
            try {
              this.ws.close()
            } catch {
              // Ignore close errors on heartbeat timeout
            }
          }
        }, 10000)
      }
    }, DARKROOM_CONFIG.HEARTBEAT_INTERVAL)
  }

  private clearAllTimers(): void {
    if (this.connectTimeoutId) {
      clearTimeout(this.connectTimeoutId)
      this.connectTimeoutId = null
    }
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId)
      this.reconnectTimeoutId = null
    }
    if (this.heartbeatIntervalId) {
      clearInterval(this.heartbeatIntervalId)
      this.heartbeatIntervalId = null
    }
    if (this.pongTimeoutId) {
      clearTimeout(this.pongTimeoutId)
      this.pongTimeoutId = null
    }
  }

  public disconnect(): void {
    this.log('Disconnected')
    this.updateStatus('disconnected')
    this.clearAllTimers()

    if (this.ws) {
      this.ws.onopen = null
      this.ws.onmessage = null
      this.ws.onclose = null
      this.ws.onerror = null
      try {
        this.ws.close()
      } catch {
        // Ignore close errors on disconnect
      }
      this.ws = null
    }

    this.roomId = null
    this.myPeerId = null
    this.pendingMessage = null
    this.myReservedSlot = null
    this.round = 0
    this.connectResolver = null
    this.connectRejecter = null
    this.messageListeners = []
    this.statusListeners = []
    this.roundResultListeners = []
    this.activePeers.clear()
  }

  public async send(payload: EncryptedPayload): Promise<void> {
    if (this.status !== 'connected') {
      throw new Error('DC-Net transport not connected')
    }
    this.pendingMessage = payload
    this.log('Message queued, waiting for slot reservation')
  }

  private runReservationRound(): void {
    if (this.status !== 'connected' || !this.roomId || !this.myPeerId) return

    this.log('Reservation Round')

    const vector = new Array(21).fill(0)

    if (this.pendingMessage && this.myReservedSlot === null) {
      this.myReservedSlot = Math.floor(Math.random() * 20)
      this.myReservationToken = Math.floor(Math.random() * 0x7fffffff) + 1
      vector[this.myReservedSlot] = this.myReservationToken
      vector[20] = Math.floor(Math.random() * 0x7fffffff) + 1
    } else if (this.myReservedSlot !== null && this.pendingMessage) {
      vector[this.myReservedSlot] = this.myReservationToken
      vector[20] = 0
    } else {
      vector[20] = 0
    }

    const blinded = [...vector]
    for (const [peerId, peerPubKey] of Object.entries(this.peerPubKeys)) {
      if (peerId === this.myPeerId) continue
      if (!this.activePeers.has(peerId)) continue
      const sharedSecret = deriveSharedSecret(this.mySecretKeyB64, peerPubKey)

      for (let s = 0; s < 21; s++) {
        const pad = hashPad(sharedSecret, this.round, s)
        blinded[s] ^= pad
        blinded[s] = blinded[s] >>> 0
      }
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: 'submit-vector',
          roomId: this.roomId,
          peerId: this.myPeerId,
          round: this.round,
          phase: 'reservation',
          vector: blinded
        })
      )
      this.log('Vector Sent')
    }
  }

  private handleRoundResult(
    round: number,
    phase: 'reservation' | 'message',
    result: number[]
  ): void {
    if (phase === 'reservation') {
      this.log(`Reservation round ${round} finished. Result vector length: ${result.length}`)

      if (this.pendingMessage && this.myReservedSlot !== null) {
        const token = result[this.myReservedSlot]
        if (token === this.myReservationToken) {
          this.log(`Slot ${this.myReservedSlot} successfully reserved!`)
        } else {
          this.log(`Collision detected on slot ${this.myReservedSlot}. Retrying...`)
          this.myReservedSlot = null
        }
      }

      const reservationStatus = result[20]
      if (reservationStatus === 0) {
        this.log('No active reservations pending. Transitioning to MESSAGE phase.')
        this.runMessageRound()
      } else {
        this.round++
        this.runReservationRound()
      }
    } else if (phase === 'message') {
      this.log(`Message round ${round} finished.`)
      this.handleIncomingMessageVector(result)

      this.pendingMessage = null
      this.myReservedSlot = null
      this.round++
      this.runReservationRound()
    }
  }

  private runMessageRound(): void {
    if (this.status !== 'connected' || !this.roomId || !this.myPeerId) return

    this.log('Message Round')

    const flatVector = new Array(21 * 128).fill(0)

    if (this.pendingMessage && this.myReservedSlot !== null) {
      const payloadStr = JSON.stringify(this.pendingMessage)
      const payloadBytes = new TextEncoder().encode(payloadStr)

      const offset = this.myReservedSlot * 128
      flatVector[offset] = payloadBytes.length
      for (let i = 0; i < payloadBytes.length && i < 500; i++) {
        const byteIdx = i
        const intIdx = Math.floor(byteIdx / 4) + 1
        const shift = (byteIdx % 4) * 8
        flatVector[offset + intIdx] |= payloadBytes[byteIdx] << shift
      }
    }

    const blinded = [...flatVector]
    for (const [peerId, peerPubKey] of Object.entries(this.peerPubKeys)) {
      if (peerId === this.myPeerId) continue
      if (!this.activePeers.has(peerId)) continue
      const sharedSecret = deriveSharedSecret(this.mySecretKeyB64, peerPubKey)

      for (let s = 0; s < 21; s++) {
        const offset = s * 128
        const blinder = generateBlinderBuffer(sharedSecret, this.round, s, 512)

        for (let i = 0; i < 128; i++) {
          const b0 = blinder[i * 4]
          const b1 = blinder[i * 4 + 1]
          const b2 = blinder[i * 4 + 2]
          const b3 = blinder[i * 4 + 3]
          const blinderVal = (b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)) >>> 0
          blinded[offset + i] ^= blinderVal
          blinded[offset + i] = blinded[offset + i] >>> 0
        }
      }
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: 'submit-vector',
          roomId: this.roomId,
          peerId: this.myPeerId,
          round: this.round,
          phase: 'message',
          vector: blinded
        })
      )
      this.log('Vector Sent')
    }
  }

  private handleIncomingMessageVector(result: number[]): void {
    for (let s = 0; s < 20; s++) {
      const offset = s * 128
      const length = result[offset]
      if (length > 0 && length <= 500) {
        const payloadBytes = new Uint8Array(length)
        for (let i = 0; i < length; i++) {
          const intIdx = Math.floor(i / 4) + 1
          const shift = (i % 4) * 8
          payloadBytes[i] = (result[offset + intIdx] >> shift) & 0xff
        }

        try {
          const payloadStr = new TextDecoder().decode(payloadBytes)
          const payload = JSON.parse(payloadStr) as EncryptedPayload
          if (payload.roomId && payload.ciphertext && payload.nonce) {
            this.log('Message successfully extracted from slot')
            this.messageListeners.forEach((l) => l(payload))
          }
        } catch {
          // Garbage slot or collision
        }
      }
    }
  }

  public onMessage(cb: (payload: EncryptedPayload) => void): void {
    this.messageListeners.push(cb)
  }

  public onStatusChange(cb: (status: TransportStatus, err?: string | null) => void): void {
    this.statusListeners.push(cb)
  }

  public onRoundResult(
    cb: (data: {
      roomId: string
      round: number
      phase: 'reservation' | 'message'
      result: number[]
      activePeersCount?: number
    }) => void
  ): () => void {
    this.roundResultListeners.push(cb)
    return () => {
      this.roundResultListeners = this.roundResultListeners.filter((l) => l !== cb)
    }
  }

  public getRound(): number {
    return this.round
  }

  public getMyReservedSlot(): number | null {
    return this.myReservedSlot
  }

  private updateStatus(newStatus: TransportStatus, err: string | null = null): void {
    this.status = newStatus
    this.error = err
    this.statusListeners.forEach((l) => l(newStatus, err))
  }
}
