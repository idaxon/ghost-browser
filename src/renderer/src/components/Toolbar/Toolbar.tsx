import { useBrowser } from '../../context/BrowserContext'
import AddressBar from './AddressBar'
import NavButton from './NavButton'
import NetworkHUD from '../HUD/NetworkHUD'
import PerformanceMonitor from './PerformanceMonitor'

export default function Toolbar() {
  const { state, goBack, goForward, reload, createNewTab, dispatch } = useBrowser()
  const activeTab = state.tabs.find((t) => t.id === state.activeTabId)

  return (
    <div
      className="flex items-center gap-2 px-2 no-drag toolbar-glass transition-all duration-300 relative z-50"
      style={{
        height: 52,
        borderBottom: '1px solid var(--color-border-subtle)'
      }}
    >
      {/* Drag region sliver */}
      <div className="drag-region" style={{ width: 6, height: '100%' }} />

      {/* Navigation cluster */}
      <div className="flex items-center gap-[2px]">
        <NavButton onClick={goBack} disabled={!activeTab?.canGoBack} title="Back (Alt+←)">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M8.5 3L4.5 7l4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </NavButton>

        <NavButton onClick={goForward} disabled={!activeTab?.canGoForward} title="Forward (Alt+→)">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M5.5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </NavButton>

        <NavButton onClick={reload} disabled={!activeTab} title="Reload (Ctrl+R)">
          {activeTab?.isLoading ? (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M4 4l6 6M10 4l-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2.5 7a4.5 4.5 0 018.1-2.7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              <path d="M11.5 7a4.5 4.5 0 01-8.1 2.7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              <path d="M10.5 2v2.3h-2.3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M3.5 12v-2.3h2.3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </NavButton>
      </div>

      {/* Address bar */}
      <AddressBar />

      {/* Right actions cluster */}
      <div className="flex items-center gap-[2px]">
        <PerformanceMonitor />
        <NetworkHUD />
        {/* Split view */}
        <NavButton
          onClick={() => {
            if (state.splitViewMode !== 'none') {
              dispatch({ type: 'SET_SPLIT_VIEW', payload: { mode: 'none', tabId: null } })
              if (state.activeTabId) window.api?.toggleSplitView('none', state.activeTabId, null)
            }
          }}
          title="Split view (Ctrl+Shift+S)"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="2" y="3" width="10" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
            <path d="M7 3v8" stroke="currentColor" strokeWidth="1.2"/>
          </svg>
        </NavButton>

        {/* Command palette */}
        <NavButton
          onClick={() => dispatch({ type: 'TOGGLE_COMMAND_PALETTE' })}
          title="Commands (Ctrl+K)"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="6" cy="6" r="3.5" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M9 9l3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
        </NavButton>

        {/* New tab */}
        <NavButton onClick={() => createNewTab()} title="New tab (Ctrl+T)">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 3v8M3 7h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </NavButton>

        {/* Divider */}
        <div style={{ width: 1, height: 16, background: 'var(--color-border-subtle)', margin: '0 4px' }} />

        {/* Window controls */}
        <button onClick={() => window.api?.minimizeWindow()} className="win-btn" title="Minimize">
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <path d="M2 5.5h7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
        </button>

        <button onClick={() => window.api?.maximizeWindow()} className="win-btn" title="Maximize">
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <rect x="2" y="2" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.1"/>
          </svg>
        </button>

        <button onClick={() => window.api?.closeWindow()} className="win-btn close" title="Close">
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <path d="M3 3l5 5M8 3l-5 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
        </button>
      </div>
    </div>
  )
}
