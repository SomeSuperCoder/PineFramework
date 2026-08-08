import { useState, useEffect, useCallback } from 'react';
import { TopBar } from './TopBar';
import { Sidebar } from './Sidebar';
import { ContentArea } from './ContentArea';
import { tokens } from '../theme/tokens';

export type PanelId = 'dashboard' | 'telegram' | 'backtest' | 'settings' | 'bot';

export interface ControlPanelProps {
  /** Currently active panel */
  activePanel: PanelId;
  /** Callback when panel changes */
  onPanelChange: (panel: PanelId) => void;
  /** Bot connection status */
  botConnected: boolean;
  /** Bot state label (Idle, Running, etc.) */
  botState: string;
  /** Number of active errors */
  errorCount: number;
  /** Whether settings popup is open (for topbar indicator) */
  settingsOpen: boolean;
  /** Children to render in the content area */
  children: React.ReactNode;
}

export function ControlPanel({
  activePanel,
  onPanelChange,
  botConnected,
  botState,
  errorCount,
  settingsOpen,
  children,
}: ControlPanelProps) {
  const [sidebarExpanded, setSidebarExpanded] = useState(false);

  // Keyboard shortcuts: 1-4 to switch panels
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore when typing in inputs
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.target as HTMLElement).closest('.editor-modal, .CodeMirror, [contenteditable]'))
        return;

      switch (e.key) {
        case '1':
          onPanelChange('dashboard');
          break;
        case '2':
          onPanelChange('bot');
          break;
        case '3':
          onPanelChange('telegram');
          break;
        case '4':
          onPanelChange('backtest');
          break;
        case '5':
          onPanelChange('settings');
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onPanelChange]);

  const handleSidebarHover = useCallback((hovering: boolean) => {
    setSidebarExpanded(hovering);
  }, []);

  return (
    <div style={styles.root}>
      <TopBar
        botConnected={botConnected}
        botState={botState}
        errorCount={errorCount}
        settingsOpen={settingsOpen}
        onOpenSettings={() => onPanelChange('settings')}
      />

      <div style={styles.body}>
        <Sidebar
          activePanel={activePanel}
          onPanelChange={onPanelChange}
          expanded={sidebarExpanded}
          onHoverChange={handleSidebarHover}
        />

        <ContentArea>{children}</ContentArea>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    width: '100vw',
    height: '100vh',
    background: tokens.colors.canvas,
    overflow: 'hidden',
  },
  body: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
};
