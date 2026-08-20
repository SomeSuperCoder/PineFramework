import { useState, useEffect, useCallback } from 'react';
import { TopBar } from './TopBar';
import { Sidebar } from './Sidebar';
import { ContentArea } from './ContentArea';
import { FadeIn } from '@/components/ui/motion/fade-in';

export type PanelId = 'dashboard' | 'telegram' | 'backtest' | 'bot';

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
  /** Opens the landing page (About / logo click). Optional — existing consumers
   *  compile unchanged (D4). */
  onShowLanding?: () => void;
  /** Children to render in the content area */
  children: React.ReactNode;
}

export function ControlPanel({
  activePanel,
  onPanelChange,
  botConnected,
  botState,
  errorCount,
  onShowLanding,
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
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onPanelChange]);

  const handleSidebarHover = useCallback((hovering: boolean) => {
    setSidebarExpanded(hovering);
  }, []);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background">
      <TopBar
        botConnected={botConnected}
        botState={botState}
        errorCount={errorCount}
        onShowLanding={onShowLanding}
      />

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <Sidebar
          activePanel={activePanel}
          onPanelChange={onPanelChange}
          expanded={sidebarExpanded}
          onHoverChange={handleSidebarHover}
        />

        {/* Content region — the panel swaps its payload here; the key forces a
            remount on switch so FadeIn plays a fresh entrance every time.
            Wrapper carries ml-16 (collapsed rail = 64px) so content never sits
            under the rail and never resizes when the sidebar widens. */}
        <div className="ml-16 flex min-h-0 flex-1 flex-col">
          <ContentArea>
            <FadeIn
              key={activePanel}
              role="region"
              aria-label={`${activePanel} panel`}
              className="flex min-h-0 flex-1 flex-col"
              duration="base"
            >
              {children}
            </FadeIn>
          </ContentArea>
        </div>
      </div>
    </div>
  );
}
