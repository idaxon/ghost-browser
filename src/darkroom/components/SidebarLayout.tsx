import React, { useState, useEffect } from 'react'

interface SidebarLayoutProps {
  sidebar: React.ReactNode
  roomList: React.ReactNode
  chatWindow: React.ReactNode
  privacyPanel: React.ReactNode
  showPrivacyPanel: boolean
  onTogglePrivacyPanel: () => void
}

export function SidebarLayout({
  sidebar,
  roomList,
  chatWindow,
  privacyPanel,
  showPrivacyPanel,
  onTogglePrivacyPanel
}: SidebarLayoutProps): React.ReactNode {
  const [isNarrow, setIsNarrow] = useState(false)

  useEffect(() => {
    const handleResize = (): void => {
      setIsNarrow(window.innerWidth < 1000)
    }
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return (
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        background: 'var(--dr-bg-primary)',
        color: 'var(--dr-text-primary)',
        overflow: 'hidden',
        position: 'relative'
      }}
      className="darkroom-container"
    >
      {/* Pane 1: Local Navigation Sidebar */}
      <div
        style={{
          width: 64,
          height: '100%',
          borderRight: '1px solid var(--dr-border-subtle)',
          background: 'var(--dr-bg-secondary)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '16px 0',
          gap: 20,
          flexShrink: 0
        }}
      >
        {sidebar}
      </div>

      {/* Pane 2: Room List Pane */}
      <div
        style={{
          width: 220,
          height: '100%',
          borderRight: '1px solid var(--dr-border-subtle)',
          background: 'var(--dr-bg-secondary)',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0
        }}
      >
        {roomList}
      </div>

      {/* Pane 3: Chat Window Pane */}
      <div
        style={{
          flex: 1,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--dr-bg-primary)',
          position: 'relative'
        }}
      >
        {chatWindow}
      </div>

      {/* Pane 4: Settings / Privacy Panel (Responsive) */}
      {showPrivacyPanel && (
        <>
          {isNarrow ? (
            // Slide-over style for narrow windows
            <>
              {/* Overlay Backdrop */}
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
              {/* Panel container */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  right: 0,
                  width: 320,
                  height: '100%',
                  background: 'var(--dr-bg-secondary)',
                  borderLeft: '1px solid var(--dr-border-subtle)',
                  boxShadow: '-8px 0 24px rgba(0, 0, 0, 0.5)',
                  display: 'flex',
                  flexDirection: 'column',
                  zIndex: 101,
                  animation: 'slideIn 0.2s ease-out'
                }}
              >
                {/* Custom slide-in style tag */}
                <style>{`
                  @keyframes slideIn {
                    from { transform: translateX(100%); }
                    to { transform: translateX(0); }
                  }
                `}</style>
                {privacyPanel}
              </div>
            </>
          ) : (
            // Inline pane style for large windows
            <div
              style={{
                width: 300,
                height: '100%',
                borderLeft: '1px solid var(--dr-border-subtle)',
                background: 'var(--dr-bg-secondary)',
                display: 'flex',
                flexDirection: 'column',
                flexShrink: 0
              }}
            >
              {privacyPanel}
            </div>
          )}
        </>
      )}
    </div>
  )
}
export default SidebarLayout
