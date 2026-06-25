export type TransportMode = 'standard' | 'tor' | 'dcnet'

export type TransportStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error'

export interface EncryptedPayload {
  roomId: string
  senderId: string
  ciphertext: string // base64
  nonce: string // base64
  type?: 'text' | 'image' | 'file' | 'link'
  fileName?: string
  fileSize?: number
  mimeType?: string
  keyVersion?: number
}

export type MessageType = 'text' | 'image' | 'file' | 'link'

export type MessageStatus = 'sent' | 'delivered' | 'encrypted'

export interface Message {
  id: string
  roomId: string
  senderId: string // ghost-id
  type: MessageType
  content: string // Decrypted plaintext
  status: MessageStatus
  timestamp: number
  fileName?: string
  fileSize?: number
  mimeType?: string
}

export interface Member {
  ghostId: string
  publicKey: string // base64
  isCreator: boolean
  isTyping?: boolean
}

export interface Room {
  id: string
  name: string
  kind: 'direct' | 'group'
  transportMode: TransportMode
  members: Member[]
  roomKey?: string // base64 (only decrypted and stored in-memory for current user)
  wrappedKeys?: Record<string, { ciphertext: string; nonce: string; senderPubKey: string }>
  createdAt: number
  keyVersion?: number
}

export interface Identity {
  pubKey: string // base64 Curve25519 public key
  privKey: string // base64 Curve25519 secret key
  ghostId: string // e.g. ghost-a1b2c3
}

export interface Contact {
  ghostId: string
  publicKey: string // base64
  name: string
  isVerified: boolean
  addedAt: number
}

export interface Transport {
  status: TransportStatus
  error: string | null
  connect(roomId: string, memberId: string): Promise<void>
  disconnect(): void
  send(payload: EncryptedPayload): Promise<void>
  onMessage(cb: (payload: EncryptedPayload) => void): void
  onStatusChange(cb: (status: TransportStatus, err?: string | null) => void): void
}
