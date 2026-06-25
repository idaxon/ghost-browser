import React, { useEffect, useState } from 'react'
import { Room } from '../types'
import { roomService } from '../services/RoomService'
import { identityService } from '../services/IdentityService'
import { contactService } from '../services/ContactService'
import { SidebarLayout } from '../components/SidebarLayout'
import { RoomView } from './RoomView'
import { NewRoomFlow } from './NewRoomFlow'
import { GhostIdSetup } from './GhostIdSetup'
import { DCNetView } from './DCNetView'

interface DarkRoomHomeProps {
  onClose?: () => void
  isSplitMode?: boolean
  onToggleSplitMode?: () => void
}

type ViewState = 'lobby' | 'new-room' | 'ghost-id' | 'dc-net' | 'chat'

export function DarkRoomHome({
  onClose,
  isSplitMode = false,
  onToggleSplitMode
}: DarkRoomHomeProps): React.ReactNode {
  const identity = identityService.getIdentity()

  const [activeViewState, setActiveViewState] = useState<ViewState>('lobby')
  const [rooms, setRooms] = useState<Room[]>([])
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null)

  // Privacy side panel toggle state
  const [showPrivacyPanel, setShowPrivacyPanel] = useState(false)

  useEffect(() => {
    const unsub = roomService.onRoomListChanged((roomList) => {
      setRooms(roomList)
    })
    return () => unsub()
  }, [])

  const handleSelectRoom = (roomId: string): void => {
    setSelectedRoomId(roomId)
    setActiveViewState('chat')
  }

  const handleLeaveRoom = (roomId: string): void => {
    if (
      confirm(
        'Are you sure you want to delete/leave this conversation? All ephemeral messages on this device will be cleared.'
      )
    ) {
      roomService.leaveRoom(roomId)
      setSelectedRoomId(null)
      setActiveViewState('lobby')
    }
  }

  const selectedRoom = rooms.find((r) => r.id === selectedRoomId)

  // ── 1. Local Navigation Sidebar (Icons) ──
  const sidebarContent = (
    <>
      {/* Home / Lobby button */}
      <button
        onClick={() => {
          setActiveViewState('lobby')
          setSelectedRoomId(null)
        }}
        style={{
          border: 'none',
          background: 'transparent',
          color:
            activeViewState === 'lobby' ? 'var(--dr-color-accent)' : 'var(--dr-text-secondary)',
          cursor: 'pointer',
          padding: 8
        }}
        title="Lobby"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </button>

      {/* Identity Ghost ID Setup */}
      <button
        onClick={() => setActiveViewState('ghost-id')}
        style={{
          border: 'none',
          background: 'transparent',
          color:
            activeViewState === 'ghost-id' ? 'var(--dr-color-accent)' : 'var(--dr-text-secondary)',
          cursor: 'pointer',
          padding: 8
        }}
        title="My Identity Settings"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      </button>

      {/* DC Net diagnostics button */}
      <button
        onClick={() => setActiveViewState('dc-net')}
        style={{
          border: 'none',
          background: 'transparent',
          color:
            activeViewState === 'dc-net' ? 'var(--dr-color-accent)' : 'var(--dr-text-secondary)',
          cursor: 'pointer',
          padding: 8
        }}
        title="DC-Net Engine Diagnostics"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>

      {/* Toggle Split Screen / Overlay */}
      {onToggleSplitMode && (
        <button
          onClick={onToggleSplitMode}
          style={{
            border: 'none',
            background: 'transparent',
            color: isSplitMode ? 'var(--dr-color-accent)' : 'var(--dr-text-secondary)',
            cursor: 'pointer',
            padding: 8,
            marginTop: 'auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          title={isSplitMode ? 'Switch to Overlay Mode' : 'Switch to Split Screen Mode'}
        >
          {isSplitMode ? (
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
            </svg>
          ) : (
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M9 3v18" />
            </svg>
          )}
        </button>
      )}

      {/* Close Dark Room Panel Button (if shown as overlay) */}
      {onClose && (
        <button
          onClick={onClose}
          style={{
            border: 'none',
            background: 'transparent',
            color: 'var(--dr-text-secondary)',
            cursor: 'pointer',
            marginTop: onToggleSplitMode ? 8 : 'auto',
            padding: 8
          }}
          title="Exit Dark Room"
        >
          ✕
        </button>
      )}
    </>
  )

  // ── 2. Room List Sidebar Pane ──
  const directRooms = rooms.filter((r) => r.kind === 'direct')
  const groupRooms = rooms.filter((r) => r.kind === 'group')

  const renderRoomItem = (r: Room): React.ReactNode => {
    const isSelected = selectedRoomId === r.id && activeViewState === 'chat'
    const isDirect = r.kind === 'direct'

    // For direct message, see if verified
    let isVerified = false
    if (isDirect) {
      const peer = r.members.find((m) => m.ghostId !== identity.ghostId)
      if (peer) {
        const contact = contactService.getContact(peer.ghostId)
        isVerified = contact?.isVerified || false
      }
    }

    return (
      <div
        key={r.id}
        onClick={() => handleSelectRoom(r.id)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 8px',
          borderRadius: 6,
          background: isSelected ? 'var(--dr-color-accent-subtle)' : 'transparent',
          border: isSelected ? '1px solid var(--dr-color-accent-muted)' : '1px solid transparent',
          color: isSelected ? 'var(--dr-color-accent)' : 'var(--dr-text-primary)',
          cursor: 'pointer',
          transition: 'all 150ms ease',
          gap: 6,
          userSelect: 'none'
        }}
        onMouseEnter={(e) => {
          if (!isSelected) {
            e.currentTarget.style.background = 'var(--dr-bg-primary)'
          }
        }}
        onMouseLeave={(e) => {
          if (!isSelected) {
            e.currentTarget.style.background = 'transparent'
          }
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
          {/* Avatar Icon */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              color: isSelected ? 'var(--dr-color-accent)' : 'var(--dr-text-secondary)',
              opacity: 0.8
            }}
          >
            {isDirect ? (
              // Single User SVG
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            ) : (
              // Users Group SVG
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            )}
          </div>

          {/* Name & Transport */}
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, gap: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span
                style={{
                  fontWeight: isSelected ? 700 : 500,
                  fontSize: 11,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}
              >
                {r.name}
              </span>
              {isDirect && isVerified && (
                <span
                  title="Key Verified"
                  style={{ color: '#10b981', display: 'inline-flex', alignItems: 'center' }}
                >
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                </span>
              )}
            </div>
            <span
              style={{
                fontSize: 7,
                color: 'var(--dr-text-secondary)',
                textTransform: 'uppercase',
                opacity: 0.7
              }}
            >
              {r.transportMode}
            </span>
          </div>
        </div>

        {/* Action / Settings Button */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            handleSelectRoom(r.id)
            setShowPrivacyPanel(true)
          }}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--dr-text-secondary)',
            cursor: 'pointer',
            padding: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 4,
            transition: 'all 150ms ease',
            opacity: isSelected ? 1 : 0.5
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--dr-border-subtle)'
            e.currentTarget.style.color = 'var(--dr-color-accent)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = 'var(--dr-text-secondary)'
          }}
          title={`${r.name} Settings`}
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
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>
    )
  }

  const roomListContent = (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden'
      }}
    >
      <div
        style={{
          padding: '14px 18px',
          borderBottom: '1px solid var(--dr-border-subtle)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 11 }} className="font-heading">
          CONVERSATIONS
        </span>
        <button
          onClick={() => setActiveViewState('new-room')}
          style={{
            background: 'var(--dr-color-accent-subtle)',
            border: '1px solid var(--dr-color-accent-muted)',
            borderRadius: 6,
            color: 'var(--dr-color-accent)',
            width: 24,
            height: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            fontWeight: 700,
            fontSize: 14
          }}
          title="New Direct Message or Group Room"
        >
          +
        </button>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px 4px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12
        }}
      >
        {rooms.length === 0 ? (
          <div
            style={{
              padding: 20,
              fontSize: 11,
              color: 'var(--dr-text-secondary)',
              textAlign: 'center'
            }}
            className="font-mono"
          >
            {"No active chats. Click '+' to start."}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Direct Messages Section */}
            {directRooms.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div
                  style={{
                    padding: '2px 8px',
                    fontSize: 9,
                    fontWeight: 700,
                    color: 'var(--dr-text-secondary)',
                    letterSpacing: '0.05em',
                    opacity: 0.8
                  }}
                >
                  PEOPLE ({directRooms.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {directRooms.map((r) => renderRoomItem(r))}
                </div>
              </div>
            )}

            {/* Groups Section */}
            {groupRooms.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div
                  style={{
                    padding: '2px 8px',
                    fontSize: 9,
                    fontWeight: 700,
                    color: 'var(--dr-text-secondary)',
                    letterSpacing: '0.05em',
                    opacity: 0.8
                  }}
                >
                  GROUPS ({groupRooms.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {groupRooms.map((r) => renderRoomItem(r))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )

  // ── 3. Chat Window View dispatcher ──
  let chatWindowContent: React.ReactNode
  if (activeViewState === 'chat' && selectedRoom) {
    chatWindowContent = (
      <RoomView
        key={selectedRoom.id}
        room={selectedRoom}
        showPrivacyPanel={showPrivacyPanel}
        onTogglePrivacyPanel={() => setShowPrivacyPanel(!showPrivacyPanel)}
        onLeaveRoom={() => handleLeaveRoom(selectedRoom.id)}
      />
    )
  } else if (activeViewState === 'new-room') {
    chatWindowContent = (
      <NewRoomFlow
        onSuccess={(id) => handleSelectRoom(id)}
        onClose={() => setActiveViewState('lobby')}
      />
    )
  } else if (activeViewState === 'ghost-id') {
    chatWindowContent = <GhostIdSetup onClose={() => setActiveViewState('lobby')} />
  } else if (activeViewState === 'dc-net') {
    chatWindowContent = (
      <DCNetView roomId={selectedRoomId || 'None'} onClose={() => setActiveViewState('lobby')} />
    )
  } else {
    // Default: Lobby homepage placeholder
    chatWindowContent = (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          flex: 1,
          padding: 40,
          textAlign: 'center',
          gap: 16,
          background: 'var(--dr-bg-primary)'
        }}
        className="font-mono"
      >
        <div
          style={{
            animation: 'pulse 2s infinite',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--dr-color-accent)',
            marginBottom: 8
          }}
        >
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
            <path
              d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="12" cy="12" r="3.2" fill="currentColor" />
          </svg>
        </div>
        <h2
          style={{
            fontSize: 16,
            fontWeight: 700,
            letterSpacing: '0.1em',
            color: 'var(--dr-color-accent)'
          }}
          className="font-heading"
        >
          GHOST BROWSER — DARK ROOM LOBBY
        </h2>
        <p
          style={{
            maxWidth: 420,
            fontSize: 12,
            color: 'var(--dr-text-secondary)',
            lineHeight: 1.5
          }}
        >
          Welcome to the built-in anonymous routing mesh. Direct messages and Group channels are
          fully end-to-end encrypted locally via XSalsa20-Poly1305. All records are memory-only and
          permanently wiped upon tab closure.
        </p>
        <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
          <button
            onClick={() => setActiveViewState('new-room')}
            style={{
              padding: '10px 18px',
              borderRadius: 6,
              background: 'var(--dr-color-accent)',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 12
            }}
          >
            START CHAT
          </button>
          <button
            onClick={() => setActiveViewState('ghost-id')}
            style={{
              padding: '10px 18px',
              borderRadius: 6,
              background: 'transparent',
              border: '1px solid var(--dr-border-subtle)',
              color: 'var(--dr-text-secondary)',
              cursor: 'pointer',
              fontSize: 12
            }}
          >
            MY GHOST ID
          </button>
        </div>
      </div>
    )
  }

  // ── 4. Dummy Privacy Settings panel when in Lobby state ──
  const dummyPrivacyPanel = (
    <div
      style={{ padding: 18, fontSize: 11, display: 'flex', flexDirection: 'column', gap: 20 }}
      className="font-mono"
    >
      <div>
        <span style={{ fontWeight: 700, color: 'var(--dr-text-secondary)' }}>
          MESH ROUTING METRICS
        </span>
        <p style={{ color: 'var(--dr-text-secondary)', marginTop: 8, lineHeight: 1.4 }}>
          Your local ID:{' '}
          <strong style={{ color: 'var(--dr-color-accent)' }}>{identity.ghostId}</strong>
        </p>
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div>[OS ENTROPY] SECURE</div>
          <div>[TOR NODE] AVAILABLE</div>
          <div>[DC-NET ENGINE] STANDBY</div>
        </div>
      </div>
    </div>
  )

  return (
    <SidebarLayout
      sidebar={sidebarContent}
      roomList={roomListContent}
      chatWindow={chatWindowContent}
      privacyPanel={
        selectedRoomId && activeViewState === 'chat' && selectedRoom
          ? // Renders custom side panel internally in RoomView, but SidebarLayout coordinates it
            // So we return null here and let RoomView handle its own side drawer rendering
            null
          : dummyPrivacyPanel
      }
      showPrivacyPanel={
        selectedRoomId !== null && activeViewState === 'chat' ? false : showPrivacyPanel
      }
      onTogglePrivacyPanel={() => setShowPrivacyPanel(!showPrivacyPanel)}
    />
  )
}
export default DarkRoomHome
