import React, { useState } from 'react'
import { roomService } from '../services/RoomService'
import { TransportMode } from '../types'

interface NewRoomFlowProps {
  onSuccess: (roomId: string) => void
  onClose?: () => void
}

type TabType = 'create' | 'join' | 'dm'

export function NewRoomFlow({ onSuccess, onClose }: NewRoomFlowProps): React.ReactNode {
  const [activeTab, setActiveTab] = useState<TabType>('create')

  // Group Create State
  const [groupName, setGroupName] = useState('')
  const [mode, setMode] = useState<TransportMode>('standard')
  const [groupError, setGroupError] = useState('')

  // Join State
  const [inviteCode, setInviteCode] = useState('')
  const [joinError, setJoinError] = useState('')

  // DM State
  const [contactId, setContactId] = useState('')
  const [contactPubKey, setContactPubKey] = useState('')
  const [contactName, setContactName] = useState('')
  const [dmError, setDmError] = useState('')

  const handleCreateGroup = (): void => {
    setGroupError('')
    if (!groupName.trim()) {
      setGroupError('Room name is required.')
      return
    }

    try {
      const room = roomService.createGroupRoom(groupName.trim(), mode)
      onSuccess(room.id)
    } catch (e) {
      const err = e as Error
      setGroupError(err.message || 'Failed to create room.')
    }
  }

  const handleJoinGroup = (): void => {
    setJoinError('')
    if (!inviteCode.trim()) {
      setJoinError('Invite code is required.')
      return
    }

    try {
      const room = roomService.joinGroupRoom(inviteCode.trim())
      onSuccess(room.id)
    } catch (e) {
      const err = e as Error
      setJoinError(err.message || 'Failed to join group room. Verify invite code.')
    }
  }

  const handleStartDM = (): void => {
    setDmError('')
    if (!contactId.trim() || !contactPubKey.trim()) {
      setDmError('Ghost ID and Public Key are both required.')
      return
    }

    try {
      const room = roomService.createDirectMessage(
        contactId.trim(),
        contactPubKey.trim(),
        contactName.trim() || contactId.trim()
      )
      onSuccess(room.id)
    } catch (e) {
      const err = e as Error
      setDmError(err.message || 'Failed to start direct message.')
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        padding: 24,
        background: 'var(--dr-bg-primary)',
        color: 'var(--dr-text-primary)',
        maxWidth: 600,
        margin: '0 auto',
        gap: 20
      }}
      className="darkroom-container"
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--dr-border-subtle)',
          paddingBottom: 12
        }}
      >
        <h2 className="font-heading text-lg font-bold tracking-wide">NEW CONVERSATION</h2>
        {onClose && (
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--dr-text-secondary)',
              cursor: 'pointer',
              fontSize: 16
            }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Tabs Row */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--dr-border-subtle)',
          gap: 16
        }}
        className="font-mono text-xs"
      >
        <button
          onClick={() => setActiveTab('create')}
          style={{
            padding: '8px 12px',
            background: 'transparent',
            border: 'none',
            borderBottom:
              activeTab === 'create' ? '2px solid var(--dr-color-accent)' : '2px solid transparent',
            color: activeTab === 'create' ? 'var(--dr-color-accent)' : 'var(--dr-text-secondary)',
            cursor: 'pointer',
            fontWeight: 600
          }}
        >
          CREATE GROUP
        </button>
        <button
          onClick={() => setActiveTab('join')}
          style={{
            padding: '8px 12px',
            background: 'transparent',
            border: 'none',
            borderBottom:
              activeTab === 'join' ? '2px solid var(--dr-color-accent)' : '2px solid transparent',
            color: activeTab === 'join' ? 'var(--dr-color-accent)' : 'var(--dr-text-secondary)',
            cursor: 'pointer',
            fontWeight: 600
          }}
        >
          JOIN GROUP
        </button>
        <button
          onClick={() => setActiveTab('dm')}
          style={{
            padding: '8px 12px',
            background: 'transparent',
            border: 'none',
            borderBottom:
              activeTab === 'dm' ? '2px solid var(--dr-color-accent)' : '2px solid transparent',
            color: activeTab === 'dm' ? 'var(--dr-color-accent)' : 'var(--dr-text-secondary)',
            cursor: 'pointer',
            fontWeight: 600
          }}
        >
          1:1 DIRECT MESSAGE
        </button>
      </div>

      {/* ── Tab: Create Group ── */}
      {activeTab === 'create' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label className="font-mono text-[10px] uppercase text-secondary">Group Name</label>
            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="e.g. Cypherpunk Resistance"
              style={{
                padding: '10px 14px',
                borderRadius: 6,
                background: 'var(--dr-bg-secondary)',
                border: '1px solid var(--dr-border-subtle)',
                color: 'var(--dr-text-primary)',
                outline: 'none',
                fontSize: 13
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label className="font-mono text-[10px] uppercase text-secondary">
              Privacy Transport Mode
            </label>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  cursor: 'pointer',
                  fontSize: 13
                }}
              >
                <input
                  type="radio"
                  name="transport"
                  checked={mode === 'standard'}
                  onChange={() => setMode('standard')}
                />
                <span>Standard (WebSocket - Fast, public rooms)</span>
              </label>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  cursor: 'pointer',
                  fontSize: 13
                }}
              >
                <input
                  type="radio"
                  name="transport"
                  checked={mode === 'tor'}
                  onChange={() => setMode('tor')}
                />
                <span>Tor (.onion service - Tunneled anonymity)</span>
              </label>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  cursor: 'pointer',
                  fontSize: 13
                }}
              >
                <input
                  type="radio"
                  name="transport"
                  checked={mode === 'dcnet'}
                  onChange={() => setMode('dcnet')}
                />
                <span style={{ color: 'var(--dr-color-accent)' }}>
                  DC-Net (Experimental — max 20 users)
                </span>
              </label>
            </div>
          </div>

          {groupError && (
            <div style={{ color: 'red', fontSize: 12, fontFamily: 'monospace' }}>
              [ERROR] {groupError}
            </div>
          )}

          <button
            onClick={handleCreateGroup}
            style={{
              padding: '12px',
              borderRadius: 6,
              background: 'var(--dr-color-accent)',
              border: 'none',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              marginTop: 10
            }}
            className="font-mono"
          >
            INITIALIZE CONVERSATION
          </button>
        </div>
      )}

      {/* ── Tab: Join Group ── */}
      {activeTab === 'join' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label className="font-mono text-[10px] uppercase text-secondary">
              Invite Link / Code
            </label>
            <textarea
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              placeholder="Paste invite link (ROOMID:TRANSPORT:KEY_BASE64:NAME)"
              rows={4}
              style={{
                padding: '10px 14px',
                borderRadius: 6,
                background: 'var(--dr-bg-secondary)',
                border: '1px solid var(--dr-border-subtle)',
                color: 'var(--dr-text-primary)',
                outline: 'none',
                fontSize: 12,
                fontFamily: 'monospace',
                resize: 'none'
              }}
            />
          </div>

          {joinError && (
            <div style={{ color: 'red', fontSize: 12, fontFamily: 'monospace' }}>
              [ERROR] {joinError}
            </div>
          )}

          <button
            onClick={handleJoinGroup}
            style={{
              padding: '12px',
              borderRadius: 6,
              background: 'var(--dr-color-accent)',
              border: 'none',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              marginTop: 10
            }}
            className="font-mono"
          >
            DECRYPT & JOIN ROOM
          </button>
        </div>
      )}

      {/* ── Tab: Start DM ── */}
      {activeTab === 'dm' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label className="font-mono text-[10px] uppercase text-secondary">
              Contact Name (Alias)
            </label>
            <input
              type="text"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="e.g. Alice"
              style={{
                padding: '10px 14px',
                borderRadius: 6,
                background: 'var(--dr-bg-secondary)',
                border: '1px solid var(--dr-border-subtle)',
                color: 'var(--dr-text-primary)',
                outline: 'none',
                fontSize: 13
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label className="font-mono text-[10px] uppercase text-secondary">
              Contact Ghost ID
            </label>
            <input
              type="text"
              value={contactId}
              onChange={(e) => setContactId(e.target.value)}
              placeholder="ghost-xxxxxx"
              style={{
                padding: '10px 14px',
                borderRadius: 6,
                background: 'var(--dr-bg-secondary)',
                border: '1px solid var(--dr-border-subtle)',
                color: 'var(--dr-text-primary)',
                outline: 'none',
                fontSize: 13,
                fontFamily: 'monospace'
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label className="font-mono text-[10px] uppercase text-secondary">
              Contact Curve25519 Public Key
            </label>
            <textarea
              value={contactPubKey}
              onChange={(e) => setContactPubKey(e.target.value)}
              placeholder="Paste public key fingerprint (base64)"
              rows={3}
              style={{
                padding: '10px 14px',
                borderRadius: 6,
                background: 'var(--dr-bg-secondary)',
                border: '1px solid var(--dr-border-subtle)',
                color: 'var(--dr-text-primary)',
                outline: 'none',
                fontSize: 12,
                fontFamily: 'monospace',
                resize: 'none'
              }}
            />
          </div>

          {dmError && (
            <div style={{ color: 'red', fontSize: 12, fontFamily: 'monospace' }}>
              [ERROR] {dmError}
            </div>
          )}

          <button
            onClick={handleStartDM}
            style={{
              padding: '12px',
              borderRadius: 6,
              background: 'var(--dr-color-accent)',
              border: 'none',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              marginTop: 10
            }}
            className="font-mono"
          >
            START DIRECT MESSAGE
          </button>
        </div>
      )}
    </div>
  )
}
export default NewRoomFlow
