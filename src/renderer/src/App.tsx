import { useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { BrowserProvider, useBrowser } from './context/BrowserContext'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import TopTabBar from './components/TabBar/TopTabBar'
import Toolbar from './components/Toolbar/Toolbar'
import TabArea from './components/TabArea/TabArea'
import CommandPalette from './components/CommandPalette/CommandPalette'
import SplashScreen from './components/SplashScreen/SplashScreen'
import SettingsPage from './components/Settings/SettingsPage'
import { DarkRoomHome } from '../../darkroom/pages/DarkRoomHome'
import { GhostIdSetup } from '../../darkroom/pages/GhostIdSetup'
import { DCNetView } from '../../darkroom/pages/DCNetView'

const getShortcutColor = (url: string): string => {
  try {
    const host = new URL(url).hostname.replace('www.', '')
    const colors = [
      '#e63946',
      '#4285f4',
      '#ff4500',
      '#3b82f6',
      '#10b981',
      '#f59e0b',
      '#8b5cf6',
      '#ec4899'
    ]
    let hash = 0
    for (let i = 0; i < host.length; i++) {
      hash = host.charCodeAt(i) + ((hash << 5) - hash)
    }
    return colors[Math.abs(hash) % colors.length]
  } catch {
    return '#f0f0f0'
  }
}

const getShortcutIcon = (title: string, url: string): string => {
  try {
    const host = new URL(url).hostname.replace('www.', '')
    if (host.includes('youtube.com')) return '▶'
    if (host.includes('github.com')) return '⬡'
    if (host.includes('reddit.com')) return '☻'
    if (host.includes('google.com')) return 'G'
    if (host.includes('x.com') || host.includes('twitter.com')) return '𝕏'

    const source = title || host
    return source.charAt(0).toUpperCase()
  } catch {
    return '★'
  }
}

const getCleanName = (title: string, url: string): string => {
  if (title && title.length < 25 && !title.includes('://')) {
    return title.split(' - ')[0].split(' | ')[0].trim()
  }
  try {
    const host = new URL(url).hostname.replace('www.', '')
    const parts = host.split('.')
    return parts[0].charAt(0).toUpperCase() + parts[0].slice(1)
  } catch {
    return 'Site'
  }
}

function BrowserShell(): React.ReactNode {
  const { state, dispatch, createNewTab } = useBrowser()
  useKeyboardShortcuts()

  useEffect(() => {
    window.api?.onMenuAction((action: string) => {
      if (action === 'new-tab') {
        createNewTab()
      } else if (action === 'commands') {
        dispatch({ type: 'TOGGLE_COMMAND_PALETTE' })
      } else if (action === 'settings') {
        dispatch({ type: 'TOGGLE_SETTINGS' })
      } else if (action === 'darkroom') {
        dispatch({ type: 'TOGGLE_DARK_ROOM' })
      } else if (action === 'add-shortcut') {
        const activeTab = state.tabs.find((t) => t.id === state.activeTabId)
        if (
          activeTab &&
          activeTab.url &&
          !activeTab.url.startsWith('ghost://') &&
          !activeTab.url.startsWith('about:')
        ) {
          const url = activeTab.url
          const name = getCleanName(activeTab.title, url)
          const icon = getShortcutIcon(activeTab.title, url)
          const color = getShortcutColor(url)
          dispatch({
            type: 'ADD_SHORTCUT',
            payload: { name, url, icon, color }
          })
        } else {
          window.dispatchEvent(new CustomEvent('trigger-add-shortcut-modal'))
        }
      }
    })
  }, [createNewTab, dispatch, state.tabs, state.activeTabId])

  const handleSplashFinished = useCallback(() => {
    dispatch({ type: 'HIDE_SPLASH' })
  }, [dispatch])

  useEffect(() => {
    if (!state.uiSettings) return
    const root = document.documentElement

    // Theme
    if (state.uiSettings.theme === 'dark') {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }

    // Accent Color
    if (state.uiSettings.accentColor) {
      root.style.setProperty('--color-accent', state.uiSettings.accentColor)
    }

    // Layout
    if (state.uiSettings.compactMode) {
      document.body.classList.add('compact')
    } else {
      document.body.classList.remove('compact')
    }

    // Transparency
    const alpha = (state.uiSettings.transparency ?? 80) / 100
    root.style.setProperty('--glass-alpha', alpha.toString())
  }, [state.uiSettings])

  useEffect(() => {
    const isOverlayOpen =
      state.commandPaletteOpen || state.settingsOpen || (state.darkRoomOpen && !state.darkRoomSplit)
    window.api?.setOverlayActive?.(isOverlayOpen)
  }, [state.commandPaletteOpen, state.settingsOpen, state.darkRoomOpen, state.darkRoomSplit])

  useEffect(() => {
    const activeOffset = state.darkRoomOpen && state.darkRoomSplit ? state.darkRoomWidth : 0
    window.api?.updateRightOffset?.(activeOffset)
  }, [state.darkRoomOpen, state.darkRoomSplit, state.darkRoomWidth])

  if (state.showSplash) {
    return <SplashScreen onFinished={handleSplashFinished} />
  }

  // Check if this is loaded inside an isolated ghost:// tab
  const query = new URLSearchParams(window.location.search)
  const tabRoute = query.get('tabRoute')
  const isTabView =
    (typeof window !== 'undefined' && window.location.protocol === 'ghost:') || !!tabRoute

  if (isTabView) {
    if (tabRoute === 'ghostid') {
      return <GhostIdSetup />
    } else if (tabRoute === 'dcnet') {
      return <DCNetView roomId="diagnostics" />
    } else {
      return <DarkRoomHome />
    }
  }

  return (
    <div
      className="flex flex-col h-full w-full animate-fade-in"
      style={{ background: 'var(--color-bg-primary)' }}
    >
      {/* Top Tab Bar */}
      <TopTabBar />

      {/* Toolbar */}
      <Toolbar />

      {/* Main Content Area (Tab Content + optional split-screen Dark Room) */}
      <div className="flex flex-row flex-1 w-full overflow-hidden relative">
        <TabArea />

        {state.darkRoomOpen && state.darkRoomSplit && (
          <>
            {/* Split Screen Divider handle */}
            <div
              style={{
                width: '6px',
                cursor: 'col-resize',
                background: 'var(--color-border-subtle)',
                borderLeft: '1px solid var(--color-border-subtle)',
                borderRight: '1px solid var(--color-border-subtle)',
                zIndex: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative'
              }}
              onMouseDown={(e) => {
                e.preventDefault()
                const startX = e.clientX
                const startWidth = state.darkRoomWidth

                const handleMouseMove = (moveEvent: MouseEvent): void => {
                  const deltaX = moveEvent.clientX - startX
                  // Drag left increases the size of the right panel
                  const newWidth = Math.max(
                    300,
                    Math.min(window.innerWidth * 0.8, startWidth - deltaX)
                  )
                  dispatch({ type: 'SET_DARK_ROOM_WIDTH', payload: newWidth })
                }

                const handleMouseUp = (): void => {
                  document.removeEventListener('mousemove', handleMouseMove)
                  document.removeEventListener('mouseup', handleMouseUp)
                }

                document.addEventListener('mousemove', handleMouseMove)
                document.addEventListener('mouseup', handleMouseUp)
              }}
              className="hover:bg-[rgba(192,57,43,0.15)] active:bg-[rgba(192,57,43,0.3)] transition-colors duration-150"
              title="Drag to resize panel"
            >
              {/* Grab handle sliding arrow badge */}
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: '20px',
                  height: '36px',
                  borderRadius: '10px',
                  background: 'var(--color-bg-secondary)',
                  border: '1px solid var(--color-border-subtle)',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--color-text-secondary)',
                  transition: 'all 150ms ease',
                  cursor: 'col-resize',
                  zIndex: 11
                }}
                className="hover:scale-110 hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] active:scale-95"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M6 17l-5-5 5-5M18 7l5 5-5 5M1 12h22" />
                </svg>
              </div>
            </div>
            {/* Split screen Dark Room panel */}
            <div
              style={{
                width: `${state.darkRoomWidth}px`,
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                background: 'var(--color-bg-secondary)',
                borderLeft: '1px solid var(--color-border-subtle)',
                zIndex: 9
              }}
            >
              <DarkRoomHome
                onClose={() => dispatch({ type: 'TOGGLE_DARK_ROOM' })}
                isSplitMode={true}
                onToggleSplitMode={() => dispatch({ type: 'TOGGLE_DARK_ROOM_SPLIT' })}
              />
            </div>
          </>
        )}
      </div>

      {/* Command Palette Overlay */}
      {state.commandPaletteOpen && <CommandPalette />}

      {/* Settings Overlay */}
      <SettingsPage />

      {/* Dark Room Panel (Overlay Drawer) */}
      <AnimatePresence>
        {state.darkRoomOpen && !state.darkRoomSplit && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: 'flex',
              justifyContent: 'flex-end',
              zIndex: 250,
              overflow: 'hidden'
            }}
          >
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => dispatch({ type: 'TOGGLE_DARK_ROOM' })}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0, 0, 0, 0.4)',
                backdropFilter: 'blur(4px)'
              }}
            />

            {/* Sliding Panel */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              style={{
                position: 'relative',
                width: '90%',
                maxWidth: '960px',
                height: '100%',
                boxShadow: '-10px 0 30px rgba(0, 0, 0, 0.5)',
                display: 'flex',
                flexDirection: 'column'
              }}
            >
              <DarkRoomHome
                onClose={() => dispatch({ type: 'TOGGLE_DARK_ROOM' })}
                isSplitMode={false}
                onToggleSplitMode={() => dispatch({ type: 'TOGGLE_DARK_ROOM_SPLIT' })}
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Ghost ID Panel */}
      {state.ghostIdOpen && <GhostIdSetup onClose={() => dispatch({ type: 'TOGGLE_GHOST_ID' })} />}
    </div>
  )
}

export default function App(): React.ReactNode {
  return (
    <BrowserProvider>
      <BrowserShell />
    </BrowserProvider>
  )
}
