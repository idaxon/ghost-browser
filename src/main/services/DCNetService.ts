import { ipcMain, WebContents } from 'electron'

interface DCNetRoomState {
  roomId: string
  peers: Set<string>
  submissions: Map<string, number[]> // peerId -> vector (length 20)
  currentRound: number
  currentPhase: 'reservation' | 'message'
  webContentsList: Set<WebContents>
}

class DCNetService {
  private rooms: Map<string, DCNetRoomState> = new Map()

  constructor() {
    this.registerIpcHandlers()
  }

  private registerIpcHandlers(): void {
    ipcMain.handle('dcnet:join', (event, roomId: string, peerId: string) => {
      console.log(`[DCNetService] Peer ${peerId} joining room ${roomId}`)
      let room = this.rooms.get(roomId)
      if (!room) {
        room = {
          roomId,
          peers: new Set(),
          submissions: new Map(),
          currentRound: 0,
          currentPhase: 'reservation',
          webContentsList: new Set()
        }
        this.rooms.set(roomId, room)
      }

      room.peers.add(peerId)
      room.webContentsList.add(event.sender)

      // Clean up on WebContents destroyed
      event.sender.on('destroyed', () => {
        this.handleLeave(roomId, peerId, event.sender)
      })

      return { ok: true, activePeers: Array.from(room.peers) }
    })

    ipcMain.handle('dcnet:leave', (event, roomId: string, peerId: string) => {
      this.handleLeave(roomId, peerId, event.sender)
      return { ok: true }
    })

    ipcMain.handle(
      'dcnet:submit-vector',
      (
        _event,
        roomId: string,
        round: number,
        phase: 'reservation' | 'message',
        peerId: string,
        vector: number[]
      ) => {
        const room = this.rooms.get(roomId)
        if (!room) {
          return { ok: false, error: 'ROOM_NOT_FOUND' }
        }

        if (!room.peers.has(peerId)) {
          return { ok: false, error: 'PEER_NOT_IN_ROOM' }
        }

        // Validate vector size: 21 for reservation, 2688 for message phase
        const expectedLength = phase === 'reservation' ? 21 : 2688
        if (!Array.isArray(vector) || vector.length !== expectedLength) {
          return { ok: false, error: 'INVALID_VECTOR' }
        }

        // Check if we need to reset/update phase or round
        if (room.currentRound !== round || room.currentPhase !== phase) {
          // If we transitioned to a new round/phase, clear old submissions
          room.submissions.clear()
          room.currentRound = round
          room.currentPhase = phase
        }

        room.submissions.set(peerId, vector)

        console.log(
          `[DCNetService] Vector submitted by ${peerId} for room ${roomId} (Round: ${round}, Phase: ${phase}). Submissions: ${room.submissions.size}/${room.peers.size}`
        )

        // If everyone has submitted, calculate XOR sum and broadcast
        if (room.submissions.size >= room.peers.size) {
          const result = this.calculateXorSum(Array.from(room.submissions.values()))

          console.log(
            `[DCNetService] All submissions received for room ${roomId} (Round: ${round}, Phase: ${phase}). Broadcasting XOR result.`
          )

          // Broadcast to all WebContents in the room
          room.webContentsList.forEach((wc) => {
            if (!wc.isDestroyed()) {
              wc.send('dcnet:round-result', {
                roomId,
                round,
                phase,
                result,
                activePeersCount: room.peers.size
              })
            }
          })

          // Clear submissions for next round
          room.submissions.clear()
        }

        return { ok: true }
      }
    )
  }

  private handleLeave(roomId: string, peerId: string, wc: WebContents): void {
    const room = this.rooms.get(roomId)
    if (!room) return

    room.peers.delete(peerId)
    room.submissions.delete(peerId)
    room.webContentsList.delete(wc)

    console.log(
      `[DCNetService] Peer ${peerId} left room ${roomId}. Active peers remaining: ${room.peers.size}`
    )

    if (room.peers.size === 0) {
      this.rooms.delete(roomId)
      console.log(`[DCNetService] Room ${roomId} empty. Deleted room state.`)
    }
  }

  private calculateXorSum(vectors: number[][]): number[] {
    if (vectors.length === 0) return []
    const len = vectors[0].length
    const result = new Array(len).fill(0)
    for (let s = 0; s < len; s++) {
      let xor = 0
      for (const vec of vectors) {
        xor ^= vec[s] || 0
      }
      // Ensure 32-bit unsigned integer behavior
      result[s] = xor >>> 0
    }
    return result
  }
}

export const dcNetService = new DCNetService()
