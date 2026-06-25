import {
  Message,
  Room,
  TransportMode,
  EncryptedPayload,
  TransportStatus,
  MessageType
} from '../types'
import {
  encryptAsymmetric,
  decryptAsymmetric,
  encryptSymmetric,
  decryptSymmetric,
  decodeBase64,
  encodeBase64
} from '../crypto'
import { identityService } from './IdentityService'
import { contactService } from './ContactService'
import { Transport } from '../transports/TransportInterface'
import { StandardTransport } from '../transports/StandardTransport'
import { TorTransport } from '../transports/TorTransport'
import { DCNetTransport } from '../transports/DCNetTransport'
import nacl from 'tweetnacl'

export class RoomService {
  private static instance: RoomService

  private rooms: Room[] = []
  private messages: Map<string, Message[]> = new Map() // roomId -> Message[] (Memory-only!)
  private transports: Map<string, Transport> = new Map() // roomId -> Transport

  private messageListeners: Set<(msg: Message) => void> = new Set()
  private roomListeners: Set<(rooms: Room[]) => void> = new Set()
  private transportStatusListeners: Map<
    string,
    Set<(status: TransportStatus, err?: string | null) => void>
  > = new Map()

  private constructor() {
    this.loadRooms()
  }

  public static getInstance(): RoomService {
    if (!RoomService.instance) {
      RoomService.instance = new RoomService()
    }
    return RoomService.instance
  }

  private loadRooms(): void {
    const stored = localStorage.getItem('dr_rooms_v1')
    if (stored) {
      try {
        this.rooms = JSON.parse(stored)
        // Connect transports for all rooms
        this.rooms.forEach((room) => {
          this.initializeTransport(room)
        })
      } catch (e) {
        console.error('[RoomService] Failed to load rooms:', e)
        this.rooms = []
      }
    }
  }

  private saveRooms(): void {
    localStorage.setItem('dr_rooms_v1', JSON.stringify(this.rooms))
    this.roomListeners.forEach((l) => l([...this.rooms]))
  }

  private initializeTransport(room: Room): void {
    const identity = identityService.getIdentity()
    let transport: Transport

    // Build peer public keys map (required for DC-Net blinding)
    const peerPubKeys: Record<string, string> = {}
    room.members.forEach((m) => {
      peerPubKeys[m.ghostId] = m.publicKey
    })

    // Tear down existing transport if active
    const existing = this.transports.get(room.id)
    if (existing) {
      existing.disconnect()
    }

    if (room.transportMode === 'tor') {
      transport = new TorTransport()
    } else if (room.transportMode === 'dcnet') {
      transport = new DCNetTransport(identity.privKey, peerPubKeys)
    } else {
      transport = new StandardTransport()
    }

    this.transports.set(room.id, transport)

    transport.onMessage((payload) => {
      this.handleIncomingPayload(room, payload)
    })

    transport.onStatusChange((status, err) => {
      console.log(`[RoomService] Room ${room.id} transport status: ${status}`)
      const listeners = this.transportStatusListeners.get(room.id)
      if (listeners) {
        listeners.forEach((cb) => cb(status, err))
      }
    })

    // Connect asynchronously
    transport.connect(room.id, identity.ghostId).catch((err) => {
      console.error(`[RoomService] Failed to connect transport for room ${room.id}:`, err)
    })
  }

  public changeRoomTransport(roomId: string, mode: TransportMode): void {
    const room = this.rooms.find((r) => r.id === roomId)
    if (!room) return

    room.transportMode = mode
    this.saveRooms()
    this.initializeTransport(room)
  }

  private handleIncomingPayload(room: Room, payload: EncryptedPayload): void {
    const identity = identityService.getIdentity()
    let decryptedText: string | null = null

    if (room.kind === 'direct') {
      // 1:1 message: decrypt using my secret key and peer's public key
      const peer = room.members.find((m) => m.ghostId !== identity.ghostId)
      if (peer) {
        decryptedText = decryptAsymmetric(
          payload.ciphertext,
          payload.nonce,
          peer.publicKey,
          identity.privKey
        )
      }
    } else {
      // Group message: decrypt using the symmetric room key
      if (room.roomKey) {
        const key = decodeBase64(room.roomKey)
        decryptedText = decryptSymmetric(payload.ciphertext, payload.nonce, key)
      }
    }

    if (decryptedText !== null) {
      const msg: Message = {
        id: Math.random().toString(36).substring(2, 9),
        roomId: room.id,
        senderId: payload.senderId,
        type: payload.type || 'text',
        content: decryptedText,
        status: 'encrypted', // shown as "encrypted" badge on incoming
        timestamp: Date.now(),
        fileName: payload.fileName,
        fileSize: payload.fileSize,
        mimeType: payload.mimeType
      }

      const roomMsgs = this.messages.get(room.id) || []
      roomMsgs.push(msg)
      this.messages.set(room.id, roomMsgs)

      this.messageListeners.forEach((l) => l(msg))
    }
  }

  public getRooms(): Room[] {
    return [...this.rooms]
  }

  public getRoom(roomId: string): Room | undefined {
    return this.rooms.find((r) => r.id === roomId)
  }

  public getMessages(roomId: string): Message[] {
    return this.messages.get(roomId) || []
  }

  public createDirectMessage(
    contactGhostId: string,
    peerPublicKey: string,
    peerName: string
  ): Room {
    const identity = identityService.getIdentity()
    const roomId = `dm-${[identity.ghostId, contactGhostId].sort().join('-')}`

    const existing = this.rooms.find((r) => r.id === roomId)
    if (existing) {
      return existing
    }

    // Add to contacts list if not already there
    contactService.addContact(contactGhostId, peerPublicKey, peerName)

    const room: Room = {
      id: roomId,
      name: peerName || contactGhostId,
      kind: 'direct',
      transportMode: 'standard',
      members: [
        { ghostId: identity.ghostId, publicKey: identity.pubKey, isCreator: true },
        { ghostId: contactGhostId, publicKey: peerPublicKey, isCreator: false }
      ],
      createdAt: Date.now()
    }

    this.rooms.push(room)
    this.saveRooms()
    this.initializeTransport(room)
    return room
  }

  public createGroupRoom(name: string, transportMode: TransportMode = 'standard'): Room {
    const identity = identityService.getIdentity()
    const roomId = `group-${Math.random().toString(36).substring(2, 9)}`

    // Generate room key for group messages
    const roomKeyBytes = nacl.randomBytes(32)
    const roomKey = encodeBase64(roomKeyBytes)

    const room: Room = {
      id: roomId,
      name: name || 'Anonymous Group',
      kind: 'group',
      transportMode,
      members: [{ ghostId: identity.ghostId, publicKey: identity.pubKey, isCreator: true }],
      roomKey,
      createdAt: Date.now(),
      keyVersion: 1
    }

    // Encrypt room key for myself
    const wrapped: Record<string, { ciphertext: string; nonce: string; senderPubKey: string }> = {}
    const encResult = encryptAsymmetric(roomKey, identity.pubKey, identity.privKey)
    wrapped[identity.ghostId] = {
      ciphertext: encResult.ciphertext,
      nonce: encResult.nonce,
      senderPubKey: identity.pubKey
    }
    room.wrappedKeys = wrapped

    this.rooms.push(room)
    this.saveRooms()
    this.initializeTransport(room)
    return room
  }

  public joinGroupRoom(inviteCode: string): Room {
    const identity = identityService.getIdentity()

    // Invite code format: ROOMID:MODE:KEY_BASE64:NAME or similar
    const parts = inviteCode.trim().split(':')
    if (parts.length < 3) {
      throw new Error('Invalid invite code format')
    }

    const roomId = parts[0]
    const transportMode = parts[1] as TransportMode
    const roomKey = parts[2]
    const name = parts[3] || 'Joined Group'

    const existing = this.rooms.find((r) => r.id === roomId)
    if (existing) {
      return existing
    }

    const room: Room = {
      id: roomId,
      name,
      kind: 'group',
      transportMode,
      members: [{ ghostId: identity.ghostId, publicKey: identity.pubKey, isCreator: false }],
      roomKey,
      createdAt: Date.now(),
      keyVersion: 1
    }

    this.rooms.push(room)
    this.saveRooms()
    this.initializeTransport(room)
    return room
  }

  public inviteUserToGroup(
    roomId: string,
    inviteeGhostId: string,
    inviteePublicKey: string
  ): string {
    const room = this.rooms.find((r) => r.id === roomId)
    if (!room || room.kind !== 'group' || !room.roomKey) {
      throw new Error('Room not found or not a group')
    }

    const identity = identityService.getIdentity()

    // Check cap for DC-Net
    if (room.transportMode === 'dcnet' && room.members.length >= 20) {
      throw new Error('DC-Net rooms are capped at 20 participants.')
    }

    // Add user to member list if not already there
    const existing = room.members.find((m) => m.ghostId === inviteeGhostId)
    if (!existing) {
      room.members.push({
        ghostId: inviteeGhostId,
        publicKey: inviteePublicKey,
        isCreator: false
      })
    }

    // Wrap the room key using the invitee's public key
    const encResult = encryptAsymmetric(room.roomKey, inviteePublicKey, identity.privKey)
    if (!room.wrappedKeys) room.wrappedKeys = {}
    room.wrappedKeys[inviteeGhostId] = {
      ciphertext: encResult.ciphertext,
      nonce: encResult.nonce,
      senderPubKey: identity.pubKey
    }

    this.saveRooms()
    this.initializeTransport(room) // Re-initialize to register new peer for DC-Net/DH keys

    // Invite link format: ROOMID:MODE:KEY_BASE64:NAME
    return `${room.id}:${room.transportMode}:${room.roomKey}:${encodeURIComponent(room.name)}`
  }

  public leaveRoom(roomId: string): void {
    const roomIdx = this.rooms.findIndex((r) => r.id === roomId)
    if (roomIdx === -1) return

    const transport = this.transports.get(roomId)
    if (transport) {
      transport.disconnect()
      this.transports.delete(roomId)
    }

    this.messages.delete(roomId)
    this.rooms.splice(roomIdx, 1)
    this.saveRooms()
  }

  public deleteRoom(roomId: string): void {
    // For creator only
    const room = this.rooms.find((r) => r.id === roomId)
    if (!room) return

    const identity = identityService.getIdentity()
    const creator = room.members.find((m) => m.isCreator)
    if (creator && creator.ghostId !== identity.ghostId) {
      throw new Error('Only the room creator can delete the conversation.')
    }

    this.leaveRoom(roomId)
  }

  public async sendMessage(
    roomId: string,
    content: string,
    type: MessageType = 'text',
    fileMeta?: { fileName?: string; fileSize?: number; mimeType?: string }
  ): Promise<void> {
    const room = this.rooms.find((r) => r.id === roomId)
    if (!room) throw new Error('Room not found')

    const identity = identityService.getIdentity()
    const transport = this.transports.get(roomId)
    if (!transport || transport.status !== 'connected') {
      throw new Error('Transport is not connected.')
    }

    let payload: EncryptedPayload

    if (room.kind === 'direct') {
      // 1:1 message
      const peer = room.members.find((m) => m.ghostId !== identity.ghostId)
      if (!peer) throw new Error('Recipient not found in DM')

      const encResult = encryptAsymmetric(content, peer.publicKey, identity.privKey)
      payload = {
        roomId: room.id,
        senderId: identity.ghostId,
        ciphertext: encResult.ciphertext,
        nonce: encResult.nonce,
        type,
        ...fileMeta
      }
    } else {
      // Group message
      if (!room.roomKey) throw new Error('Missing group room key')
      const key = decodeBase64(room.roomKey)

      const encResult = encryptSymmetric(content, key)
      payload = {
        roomId: room.id,
        senderId: identity.ghostId,
        ciphertext: encResult.ciphertext,
        nonce: encResult.nonce,
        type,
        keyVersion: room.keyVersion,
        ...fileMeta
      }
    }

    // Send ciphertext over transport (type-safety guarantee)
    await transport.send(payload)

    // Save plaintext locally in memory-only list
    const msg: Message = {
      id: Math.random().toString(36).substring(2, 9),
      roomId: room.id,
      senderId: identity.ghostId,
      type,
      content,
      status: 'sent',
      timestamp: Date.now(),
      ...fileMeta
    }

    const roomMsgs = this.messages.get(room.id) || []
    roomMsgs.push(msg)
    this.messages.set(room.id, roomMsgs)

    this.messageListeners.forEach((l) => l(msg))
  }

  public onNewMessage(cb: (msg: Message) => void): () => void {
    this.messageListeners.add(cb)
    return () => {
      this.messageListeners.delete(cb)
    }
  }

  public onRoomListChanged(cb: (rooms: Room[]) => void): () => void {
    this.roomListeners.add(cb)
    cb([...this.rooms])
    return () => {
      this.roomListeners.delete(cb)
    }
  }

  public onTransportStatusChange(
    roomId: string,
    cb: (status: TransportStatus, err?: string | null) => void
  ): () => void {
    let listeners = this.transportStatusListeners.get(roomId)
    if (!listeners) {
      listeners = new Set()
      this.transportStatusListeners.set(roomId, listeners)
    }
    listeners.add(cb)

    // Provide initial status if transport exists
    const transport = this.transports.get(roomId)
    if (transport) {
      cb(transport.status, transport.error)
    }

    return () => {
      const list = this.transportStatusListeners.get(roomId)
      if (list) {
        list.delete(cb)
        if (list.size === 0) {
          this.transportStatusListeners.delete(roomId)
        }
      }
    }
  }

  public getTransport(roomId: string): Transport | undefined {
    return this.transports.get(roomId)
  }
}

export const roomService = RoomService.getInstance()
