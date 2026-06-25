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
    this.updateStatus('connecting')
    this.log('Connecting')

    return this.establishConnection()
  }

  private establishConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.connectResolver = resolve
      this.connectRejecter = reject

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
        }, 10000)

        this.ws.onopen = () => {
          this.log('Connected')
          if (this.roomId && this.myPeerId) {
            this.ws?.send(
              JSON.stringify({
                type: 'join',
                roomId: this.roomId,
                peerId: this.myPeerId
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
        })
        .catch((err) => {
          this.log('Reconnect attempt failed:', err.message)
        })
    }, 3000)
  }

  private startHeartbeat(): void {
    if (this.heartbeatIntervalId) {
      clearInterval(this.heartbeatIntervalId)
    }

    this.heartbeatIntervalId = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }))
      }
    }, 30000)
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
  }

  public async send(payload: EncryptedPayload): Promise<void> {
    if (this.status !== 'connected') {
      throw new Error('DC-Net transport not connected')
    }
    // Queue message for broadcast
    this.pendingMessage = payload
    this.log('Message queued, waiting for slot reservation')
  }

  private runReservationRound(): void {
    if (this.status !== 'connected' || !this.roomId || !this.myPeerId) return

    this.log('Reservation Round')

    const vector = new Array(21).fill(0)

    // If we have a pending message and haven't successfully reserved a slot yet, pick one
    if (this.pendingMessage && this.myReservedSlot === null) {
      this.myReservedSlot = Math.floor(Math.random() * 20)
      this.myReservationToken = Math.floor(Math.random() * 0x7fffffff) + 1 // non-zero 31-bit token
      vector[this.myReservedSlot] = this.myReservationToken
      // Mark slot 20 with a non-zero token to indicate we are trying to reserve
      vector[20] = Math.floor(Math.random() * 0x7fffffff) + 1
    } else if (this.myReservedSlot !== null && this.pendingMessage) {
      // If we already successfully reserved a slot, keep writing it to keep it reserved
      vector[this.myReservedSlot] = this.myReservationToken
      vector[20] = 0 // we succeeded, so we don't block transition to message phase
    } else {
      // Nothing to send
      vector[20] = 0
    }

    // Blind the vector using pairwise Curve25519 secrets
    const blinded = [...vector]
    for (const [peerId, peerPubKey] of Object.entries(this.peerPubKeys)) {
      if (peerId === this.myPeerId) continue
      const sharedSecret = deriveSharedSecret(this.mySecretKeyB64, peerPubKey)

      for (let s = 0; s < 21; s++) {
        const pad = hashPad(sharedSecret, this.round, s)
        blinded[s] ^= pad
        blinded[s] = blinded[s] >>> 0 // unsigned 32-bit
      }
    }

    // Submit to coordinator
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
          this.myReservedSlot = null // reset to retry
        }
      }

      // Check slot 20 (ready status)
      const reservationStatus = result[20]
      if (reservationStatus === 0) {
        this.log('No active reservations pending. Transitioning to MESSAGE phase.')
        this.runMessageRound()
      } else {
        // Run another reservation round
        this.round++
        this.runReservationRound()
      }
    } else if (phase === 'message') {
      this.log(`Message round ${round} finished.`)
      this.handleIncomingMessageVector(result)

      // Reset for next messages
      this.pendingMessage = null
      this.myReservedSlot = null
      this.round++
      this.runReservationRound()
    }
  }

  private runMessageRound(): void {
    if (this.status !== 'connected' || !this.roomId || !this.myPeerId) return

    this.log('Message Round')

    // Flat vector of size 21 slots * 128 elements = 2688 elements.
    const flatVector = new Array(21 * 128).fill(0)

    if (this.pendingMessage && this.myReservedSlot !== null) {
      // Encode the JSON string of our message payload to UTF-8
      const payloadStr = JSON.stringify(this.pendingMessage)
      const payloadBytes = new TextEncoder().encode(payloadStr)

      // Copy payload bytes to our reserved slot (each slot is 128 integers, starting at myReservedSlot * 128)
      const offset = this.myReservedSlot * 128
      // Write the length of the payload in the first byte
      flatVector[offset] = payloadBytes.length
      for (let i = 0; i < payloadBytes.length && i < 500; i++) {
        const byteIdx = i
        const intIdx = Math.floor(byteIdx / 4) + 1 // index 0 is length
        const shift = (byteIdx % 4) * 8
        flatVector[offset + intIdx] |= payloadBytes[byteIdx] << shift
      }
    }

    // Blind the flat vector
    const blinded = [...flatVector]
    for (const [peerId, peerPubKey] of Object.entries(this.peerPubKeys)) {
      if (peerId === this.myPeerId) continue
      const sharedSecret = deriveSharedSecret(this.mySecretKeyB64, peerPubKey)

      // XOR each element with a pseudo-random 32-bit number
      for (let s = 0; s < 21; s++) {
        const offset = s * 128
        const blinder = generateBlinderBuffer(sharedSecret, this.round, s, 512)

        // Pack blinder bytes into 32-bit integers and XOR
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

    // Submit to coordinator
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
    // There are 20 slots. Each slot is 128 integers.
    for (let s = 0; s < 20; s++) {
      const offset = s * 128
      const length = result[offset]
      if (length > 0 && length <= 500) {
        // Unpack payload bytes
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
