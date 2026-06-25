import { EncryptedPayload, TransportStatus } from '../types'

export interface Transport {
  status: TransportStatus
  error: string | null
  connect(roomId: string, memberId: string): Promise<void>
  disconnect(): void
  send(payload: EncryptedPayload): Promise<void>
  onMessage(cb: (payload: EncryptedPayload) => void): void
  onStatusChange(cb: (status: TransportStatus, err?: string | null) => void): void
}
