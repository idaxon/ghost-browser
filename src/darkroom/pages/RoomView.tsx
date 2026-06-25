import React, { useEffect, useState, useRef } from 'react'
import { Room, Message, TransportStatus, TransportMode } from '../types'
import { roomService } from '../services/RoomService'
import { contactService } from '../services/ContactService'
import { identityService } from '../services/IdentityService'
import { deriveSafetyNumber } from '../crypto'
import { MessageBubble } from '../components/MessageBubble'
import { Composer } from '../components/Composer'
import { E2EProtectedBadge, VerifiedBadge } from '../components/Badges'

interface RoomViewProps {
  room: Room
  showPrivacyPanel: boolean
  onTogglePrivacyPanel: () => void
  onLeaveRoom: () => void
}

export function RoomView({
  room,
  showPrivacyPanel,
  onTogglePrivacyPanel,
  onLeaveRoom
}: RoomViewProps): React.ReactNode {
  const identity = identityService.getIdentity()

  // Responsive layout state using container queries (ResizeObserver)
  const containerRef = useRef<HTMLDivElement>(null)
  const [isNarrow, setIsNarrow] = useState(false)

  useEffect(() => {
    if (!containerRef.current) return
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setIsNarrow(entry.contentRect.width < 750)
      }
    })
    resizeObserver.observe(containerRef.current)
    return () => resizeObserver.disconnect()
  }, [])

  const [messages, setMessages] = useState<Message[]>(() => roomService.getMessages(room.id))
  const [transportStatus, setTransportStatus] = useState<TransportStatus>('disconnected')
  const [transportError, setTransportError] = useState<string | null>(null)

  // Safety Number State
  const [safetyNumber, setSafetyNumber] = useState<string>('Loading safety digits...')
  const [isVerified, setIsVerified] = useState(false)

  // Invitation State
  const [inviteeId, setInviteeId] = useState('')
  const [inviteePubKey, setInviteePubKey] = useState('')
  const [generatedInvite, setGeneratedInvite] = useState('')
  const [copyInviteLabel, setCopyInviteLabel] = useState('Copy Code')

  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Load initial messages and subscribe
  useEffect(() => {
    const unsubMsg = roomService.onNewMessage((msg) => {
      if (msg.roomId === room.id) {
        setMessages((prev) => [...prev, msg])
      }
    })

    const unsubStatus = roomService.onTransportStatusChange(room.id, (status, err) => {
      setTransportStatus(status)
      setTransportError(err || null)
    })

    return () => {
      unsubMsg()
      unsubStatus()
    }
  }, [room.id])

  // Derive Safety Number for 1:1
  useEffect(() => {
    if (room.kind === 'direct') {
      const peer = room.members.find((m) => m.ghostId !== identity.ghostId)
      if (peer) {
        deriveSafetyNumber(identity.pubKey, peer.publicKey).then((num) => {
          setSafetyNumber(num)
          const contact = contactService.getContact(peer.ghostId)
          setIsVerified(contact?.isVerified || false)
        })
      }
    }
  }, [room, identity])

  // Auto scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSendMessage = (text: string): void => {
    roomService.sendMessage(room.id, text).catch((e) => {
      alert(`Failed to send: ${e.message}`)
    })
  }

  const handleToggleVerify = (checked: boolean): void => {
    if (room.kind === 'direct') {
      const peer = room.members.find((m) => m.ghostId !== identity.ghostId)
      if (peer) {
        contactService.verifyContact(peer.ghostId, checked)
        setIsVerified(checked)
      }
    }
  }

  const handleGenerateInvite = (): void => {
    if (!inviteeId.trim() || !inviteePubKey.trim()) {
      alert('Invitee ID and Public Key are both required.')
      return
    }
    try {
      const code = roomService.inviteUserToGroup(room.id, inviteeId.trim(), inviteePubKey.trim())
      setGeneratedInvite(code)
      setInviteeId('')
      setInviteePubKey('')
    } catch (e) {
      const err = e as Error
      alert(err.message || 'Invitation failed.')
    }
  }

  const handleCopyInvite = (): void => {
    navigator.clipboard.writeText(generatedInvite).then(() => {
      setCopyInviteLabel('Copied!')
      setTimeout(() => setCopyInviteLabel('Copy Code'), 1500)
    })
  }

  const activePeer =
    room.kind === 'direct' ? room.members.find((m) => m.ghostId !== identity.ghostId) : null
  const activeContact = activePeer ? contactService.getContact(activePeer.ghostId) : null

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        flexDirection: 'row',
        flex: 1,
        height: '100%',
        overflow: 'hidden',
        background: 'var(--dr-bg-primary)',
        position: 'relative'
      }}
      className="darkroom-container"
    >
      {/* ── Chat Main Column ── */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          height: '100%',
          overflow: 'hidden',
          minWidth: 0
        }}
      >
        {/* Chat Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 20px',
            background: 'var(--dr-bg-secondary)',
            borderBottom: '1px solid var(--dr-border-subtle)',
            flexShrink: 0
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              onClick={onTogglePrivacyPanel}
              style={{
                display: 'flex',
                flexDirection: 'column',
                cursor: 'pointer',
                userSelect: 'none',
                gap: 2,
                padding: '4px 8px',
                borderRadius: 6,
                transition: 'all 150ms ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--dr-bg-primary)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
              }}
              title="Click to open conversation settings"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: showPrivacyPanel ? 'var(--dr-color-accent)' : 'var(--dr-text-primary)',
                    transition: 'color 150ms ease'
                  }}
                >
                  {room.name}
                </span>
                {room.kind === 'direct' && activeContact && (
                  <VerifiedBadge isVerified={isVerified} />
                )}
                {/* Dropdown chevron indicator */}
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    opacity: 0.5,
                    marginLeft: 2,
                    color: showPrivacyPanel ? 'var(--dr-color-accent)' : 'inherit'
                  }}
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </div>
              <span style={{ fontSize: 9, color: 'var(--dr-text-secondary)', opacity: 0.8 }}>
                {room.kind === 'direct'
                  ? '1:1 Direct Message • Click for settings'
                  : `Group Room • ${room.members.length} members • Click for settings`}
              </span>
            </div>

            <E2EProtectedBadge />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Transport status indicator */}
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '3px 8px',
                borderRadius: 4,
                border: '1px solid var(--dr-border-subtle)',
                background: 'var(--dr-bg-primary)',
                fontSize: 10
              }}
              className="font-mono text-xs"
            >
              {/* Dot */}
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background:
                    transportStatus === 'connected'
                      ? '#10b981'
                      : transportStatus === 'connecting'
                        ? '#f59e0b'
                        : transportStatus === 'reconnecting'
                          ? '#f97316'
                          : '#ef4444',
                  transition: 'background 200ms ease'
                }}
              />
              <span
                style={{
                  color: 'var(--dr-text-secondary)',
                  textTransform: room.transportMode === 'dcnet' ? 'none' : 'uppercase'
                }}
              >
                {room.transportMode === 'dcnet' ? (
                  transportStatus === 'connecting' ? (
                    'Connecting...'
                  ) : transportStatus === 'connected' ? (
                    'Connected'
                  ) : transportStatus === 'reconnecting' ? (
                    'Reconnecting...'
                  ) : transportStatus === 'disconnected' ? (
                    'Disconnected'
                  ) : transportStatus === 'error' ? (
                    'Coordinator Offline'
                  ) : (
                    transportStatus
                  )
                ) : (
                  <>
                    {room.transportMode}{' '}
                    {transportStatus === 'error' || transportStatus === 'disconnected'
                      ? 'offline'
                      : transportStatus === 'connecting'
                        ? 'connecting...'
                        : transportStatus === 'reconnecting'
                          ? 'reconnecting...'
                          : transportStatus}
                  </>
                )}
              </span>
            </div>

            <button
              onClick={onTogglePrivacyPanel}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 28,
                height: 28,
                borderRadius: 6,
                border: '1px solid var(--dr-border-subtle)',
                background: showPrivacyPanel ? 'var(--dr-color-accent-subtle)' : 'transparent',
                color: showPrivacyPanel ? 'var(--dr-color-accent)' : 'var(--dr-text-secondary)',
                cursor: 'pointer',
                transition: 'all 150ms ease'
              }}
              title="Privacy settings"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill={showPrivacyPanel ? 'currentColor' : 'none'}
                  fillOpacity={0.15}
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Message Log */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 6
          }}
        >
          {messages.length === 0 ? (
            <div
              style={{
                margin: 'auto',
                color: 'var(--dr-text-secondary)',
                fontSize: 12,
                textAlign: 'center',
                maxWidth: 300
              }}
              className="font-mono"
            >
              No message record on this device. Messages are ephemeral and memory-only.
            </div>
          ) : (
            messages.map((m) => (
              <MessageBubble
                key={m.id}
                message={m}
                isOwn={m.senderId === identity.ghostId}
                senderName={m.senderId}
              />
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Composer */}
        <Composer
          onSend={handleSendMessage}
          disabled={transportStatus !== 'connected'}
          placeholder={
            transportStatus !== 'connected'
              ? `Waiting for ${room.transportMode} transport...`
              : 'Enter E2E payload...'
          }
        />
      </div>

      {/* ── Privacy & Settings Side Panel ── */}
      {showPrivacyPanel && (
        <>
          {isNarrow && (
            <div
              onClick={onTogglePrivacyPanel}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0, 0, 0, 0.4)',
                zIndex: 100,
                backdropFilter: 'blur(2px)'
              }}
            />
          )}

          {isNarrow && (
            <style>{`
              @keyframes slideIn {
                from { transform: translateX(100%); }
                to { transform: translateX(0); }
              }
            `}</style>
          )}

          <div
            style={
              isNarrow
                ? {
                    position: 'absolute',
                    top: 0,
                    right: 0,
                    width: 300,
                    height: '100%',
                    background: 'var(--dr-bg-secondary)',
                    borderLeft: '1px solid var(--dr-border-subtle)',
                    boxShadow: '-8px 0 24px rgba(0, 0, 0, 0.5)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflowY: 'auto',
                    zIndex: 101,
                    animation: 'slideIn 0.2s ease-out'
                  }
                : {
                    width: 300,
                    height: '100%',
                    background: 'var(--dr-bg-secondary)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflowY: 'auto',
                    borderLeft: '1px solid var(--dr-border-subtle)',
                    flexShrink: 0
                  }
            }
            className="font-mono text-xs"
          >
            {/* Header */}
            <div
              style={{
                padding: '14px 18px',
                borderBottom: '1px solid var(--dr-border-subtle)',
                fontWeight: 700,
                fontSize: 11,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <span>PRIVACY & ROUTING PANEL</span>
              <button
                onClick={onTogglePrivacyPanel}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--dr-text-secondary)',
                  cursor: 'pointer'
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Transport Swapping */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontWeight: 600, color: 'var(--dr-text-secondary)', fontSize: 10 }}>
                  TRANSPORT PROTECTION MODE
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {['standard', 'tor', 'dcnet'].map((m) => (
                    <label
                      key={m}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        cursor: 'pointer',
                        padding: '6px 10px',
                        borderRadius: 4,
                        background:
                          room.transportMode === m
                            ? 'var(--dr-color-accent-subtle)'
                            : 'transparent',
                        border:
                          room.transportMode === m
                            ? '1px solid var(--dr-color-accent-muted)'
                            : '1px solid transparent'
                      }}
                    >
                      <input
                        type="radio"
                        name="transport-swap"
                        checked={room.transportMode === m}
                        onChange={() =>
                          roomService.changeRoomTransport(room.id, m as TransportMode)
                        }
                      />
                      <span
                        style={{
                          textTransform: 'uppercase',
                          fontWeight: room.transportMode === m ? 700 : 400
                        }}
                      >
                        {m}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Error notifications */}
              {transportError && (
                <div
                  style={{
                    border: '1px solid var(--dr-color-accent)',
                    background: 'var(--dr-color-accent-subtle)',
                    padding: '8px 12px',
                    borderRadius: 6,
                    color: 'var(--dr-color-accent)',
                    fontSize: 11
                  }}
                >
                  [DIAGNOSTIC ERR] {transportError}
                </div>
              )}

              {/* 1:1 Safety Number Verification */}
              {room.kind === 'direct' && activePeer && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Conversation Details for 1:1 */}
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                      borderBottom: '1px solid var(--dr-border-subtle)',
                      paddingBottom: 16
                    }}
                  >
                    <span
                      style={{ fontWeight: 600, color: 'var(--dr-text-secondary)', fontSize: 10 }}
                    >
                      CONVERSATION DETAILS
                    </span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={{ color: 'var(--dr-text-secondary)', fontSize: 9 }}>
                        PEER GHOST ID
                      </span>
                      <span
                        style={{
                          color: 'var(--dr-text-primary)',
                          fontWeight: 600,
                          fontSize: 10,
                          wordBreak: 'break-all'
                        }}
                        className="font-mono"
                      >
                        {activePeer.ghostId}
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={{ color: 'var(--dr-text-secondary)', fontSize: 9 }}>
                        YOUR GHOST ID
                      </span>
                      <span
                        style={{ color: 'var(--dr-color-accent)', fontWeight: 700, fontSize: 10 }}
                        className="font-mono"
                      >
                        {identity.ghostId}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <span
                      style={{ fontWeight: 600, color: 'var(--dr-text-secondary)', fontSize: 10 }}
                    >
                      KEY EXCHANGE VERIFICATION
                    </span>
                    <p
                      style={{
                        margin: 0,
                        color: 'var(--dr-text-secondary)',
                        fontSize: 10,
                        lineHeight: 1.35
                      }}
                    >
                      Verify safety digits with peer out-of-band to prevent active MITM
                      interception.
                    </p>
                    <div
                      style={{
                        padding: 10,
                        background: 'var(--dr-bg-primary)',
                        border: '1px solid var(--dr-border-subtle)',
                        borderRadius: 6,
                        fontSize: 12,
                        textAlign: 'center',
                        fontWeight: 700,
                        letterSpacing: '0.05em',
                        lineHeight: 1.5,
                        color: 'var(--dr-text-primary)'
                      }}
                    >
                      {safetyNumber}
                    </div>

                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        cursor: 'pointer',
                        padding: '6px 0'
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isVerified}
                        onChange={(e) => handleToggleVerify(e.target.checked)}
                      />
                      <span>Verify fingerprints are correct</span>
                    </label>
                  </div>
                </div>
              )}

              {/* Group Room Members & Invites */}
              {room.kind === 'group' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Group Info Section */}
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                      borderBottom: '1px solid var(--dr-border-subtle)',
                      paddingBottom: 16
                    }}
                  >
                    <span
                      style={{ fontWeight: 600, color: 'var(--dr-text-secondary)', fontSize: 10 }}
                    >
                      CONVERSATION DETAILS
                    </span>

                    {/* Room ID Display */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={{ color: 'var(--dr-text-secondary)', fontSize: 9 }}>
                        ROOM ID
                      </span>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <input
                          type="text"
                          readOnly
                          value={room.id}
                          style={{
                            flex: 1,
                            padding: '6px 8px',
                            background: 'var(--dr-bg-primary)',
                            border: '1px solid var(--dr-border-subtle)',
                            borderRadius: 4,
                            color: 'var(--dr-text-primary)',
                            fontSize: 9,
                            fontFamily: 'var(--dr-font-mono)'
                          }}
                        />
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(room.id)
                            alert('Room ID copied to clipboard!')
                          }}
                          style={{
                            padding: '6px 10px',
                            background: 'var(--dr-color-accent-subtle)',
                            border: '1px solid var(--dr-color-accent-muted)',
                            color: 'var(--dr-color-accent)',
                            borderRadius: 4,
                            cursor: 'pointer',
                            fontWeight: 600,
                            fontSize: 9
                          }}
                        >
                          Copy
                        </button>
                      </div>
                    </div>

                    {/* Local User's Ghost ID Display */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ color: 'var(--dr-text-secondary)', fontSize: 9 }}>
                        YOUR GHOST ID
                      </span>
                      <span
                        style={{ color: 'var(--dr-color-accent)', fontWeight: 700, fontSize: 10 }}
                      >
                        {identity.ghostId}
                      </span>
                    </div>
                  </div>

                  {/* How others can join */}
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      padding: '10px 12px',
                      background: 'var(--dr-bg-primary)',
                      border: '1px solid var(--dr-border-subtle)',
                      borderRadius: 6
                    }}
                  >
                    <span
                      style={{
                        fontWeight: 600,
                        color: 'var(--dr-color-accent)',
                        fontSize: 9,
                        letterSpacing: '0.05em',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4
                      }}
                    >
                      <svg
                        width="11"
                        height="11"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ flexShrink: 0 }}
                      >
                        <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .6 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
                        <path d="M9 18h6M10 22h4" />
                      </svg>
                      HOW OTHERS CAN JOIN
                    </span>
                    <ol
                      style={{
                        margin: 0,
                        paddingLeft: 14,
                        color: 'var(--dr-text-secondary)',
                        fontSize: 9,
                        lineHeight: 1.4,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4
                      }}
                    >
                      <li>
                        Share the <strong>Room ID</strong> above or ask the new member for their{' '}
                        <strong>Ghost ID</strong> &amp; <strong>Public Key</strong>.
                      </li>
                      <li>Fill in their details below in the invitation generator.</li>
                      <li>Generate and send them the encrypted invite code.</li>
                      <li>
                        They click the <strong>+</strong> button, select <strong>Join Group</strong>
                        , and paste the code!
                      </li>
                    </ol>
                  </div>

                  {/* Participants List */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <span
                      style={{ fontWeight: 600, color: 'var(--dr-text-secondary)', fontSize: 10 }}
                    >
                      PARTICIPANTS ({room.members.length})
                    </span>
                    <div
                      style={{
                        maxHeight: 120,
                        overflowY: 'auto',
                        border: '1px solid var(--dr-border-subtle)',
                        background: 'var(--dr-bg-primary)',
                        borderRadius: 6,
                        padding: 6,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4
                      }}
                    >
                      {room.members.map((m) => (
                        <div
                          key={m.ghostId}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            color:
                              m.ghostId === identity.ghostId
                                ? 'var(--dr-color-accent)'
                                : 'var(--dr-text-primary)',
                            fontSize: 10
                          }}
                        >
                          <span
                            style={{
                              fontWeight: 600,
                              textOverflow: 'ellipsis',
                              overflow: 'hidden',
                              whiteSpace: 'nowrap',
                              maxWidth: 180
                            }}
                            title={m.ghostId}
                          >
                            {m.ghostId === identity.ghostId
                              ? `${m.ghostId.slice(0, 12)} (You)`
                              : m.ghostId.slice(0, 15)}
                          </span>
                          <span style={{ fontSize: 9, opacity: 0.7 }}>
                            {m.isCreator ? 'Owner' : 'Peer'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Invite Generation */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <span
                      style={{ fontWeight: 600, color: 'var(--dr-text-secondary)', fontSize: 10 }}
                    >
                      GENERATE MEMBER INVITATION
                    </span>
                    <p
                      style={{
                        margin: 0,
                        color: 'var(--dr-text-secondary)',
                        fontSize: 9,
                        lineHeight: 1.35
                      }}
                    >
                      Wrap the E2E room key to add a new member. Send the generated code to them
                      out-of-band so they can join.
                    </p>
                    <input
                      type="text"
                      placeholder="Invitee's Ghost ID (ghost-xxxx)"
                      value={inviteeId}
                      onChange={(e) => setInviteeId(e.target.value)}
                      style={{
                        padding: 6,
                        background: 'var(--dr-bg-primary)',
                        border: '1px solid var(--dr-border-subtle)',
                        borderRadius: 4,
                        color: 'var(--dr-text-primary)'
                      }}
                    />
                    <textarea
                      placeholder="Invitee's Public Key Fingerprint"
                      value={inviteePubKey}
                      onChange={(e) => setInviteePubKey(e.target.value)}
                      rows={2}
                      style={{
                        padding: 6,
                        background: 'var(--dr-bg-primary)',
                        border: '1px solid var(--dr-border-subtle)',
                        borderRadius: 4,
                        color: 'var(--dr-text-primary)',
                        resize: 'none'
                      }}
                    />
                    <button
                      onClick={handleGenerateInvite}
                      style={{
                        padding: 6,
                        background: 'transparent',
                        border: '1px solid var(--dr-color-accent)',
                        color: 'var(--dr-color-accent)',
                        cursor: 'pointer',
                        borderRadius: 4,
                        fontWeight: 600,
                        transition: 'all 150ms ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'var(--dr-color-accent-subtle)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent'
                      }}
                    >
                      WRAP KEY & GENERATE INVITE
                    </button>

                    {generatedInvite && (
                      <div
                        style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}
                      >
                        <textarea
                          readOnly
                          value={generatedInvite}
                          rows={2}
                          style={{
                            padding: 6,
                            background: 'var(--dr-bg-primary)',
                            border: '1px solid var(--dr-border-subtle)',
                            borderRadius: 4,
                            color: 'var(--dr-text-primary)',
                            fontSize: 9,
                            resize: 'none'
                          }}
                        />
                        <button
                          onClick={handleCopyInvite}
                          style={{
                            padding: 4,
                            background: 'var(--dr-color-accent-subtle)',
                            border: '1px solid var(--dr-color-accent-muted)',
                            color: 'var(--dr-color-accent)',
                            cursor: 'pointer',
                            borderRadius: 4
                          }}
                        >
                          {copyInviteLabel}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Leave Room Button */}
              <div
                style={{
                  borderTop: '1px solid var(--dr-border-subtle)',
                  paddingTop: 18,
                  marginTop: 10
                }}
              >
                <button
                  onClick={onLeaveRoom}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 6,
                    background: 'transparent',
                    border: '1px solid var(--dr-color-accent)',
                    color: 'var(--dr-color-accent)',
                    cursor: 'pointer',
                    fontWeight: 600
                  }}
                >
                  LEAVE CONVERSATION
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
export default RoomView
