import { useCallback, useEffect, useState } from 'react';
import { Board } from './components/Board.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { FeedStatusScreen } from './components/FeedStatusScreen.tsx';
import { Controls } from './components/Controls.tsx';
import { FooterClock } from './components/FooterClock.tsx';
import { EventTicker } from './components/EventTicker.tsx';
import { SettingsDrawer } from './components/SettingsDrawer.tsx';
import { useDisplayMode } from './hooks/useDisplayMode.ts';
import { setLiveDelaySeconds, useLiveSession } from './hooks/useLiveSession.ts';
import { useApplyTheme, usePreferences } from './hooks/usePreferences.ts';

export default function App() {
  const {
    session,
    status,
    lastChanged,
    nextPollAt,
    lastUpdated,
    events,
    positionChanges,
    updateId,
    outLaps,
    replay,
    error,
    retry,
    delaySeconds,
    holdingUntil,
  } = useLiveSession();
  const [prefs] = usePreferences();
  useEffect(() => setLiveDelaySeconds(prefs.delaySeconds), [prefs.delaySeconds]);
  useApplyTheme();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  // Keep the screen awake only while a session is actually running.
  const display = useDisplayMode(status === 'live' && session?.flag.kind !== 'checkered');
  const idle = display.idle && !settingsOpen;

  return (
    <div className={`app${idle ? ' app--idle' : ''}`}>
      {session ? (
        <>
          <ErrorBoundary>
            <Board
              session={session}
              status={status}
              lastChanged={lastChanged}
              nextPollAt={nextPollAt}
              replayLabel={replay && `Replay · ${replay.speed}×`}
              positionChanges={positionChanges}
              updateId={updateId}
              outLaps={outLaps}
              lastUpdated={lastUpdated}
              onRetry={retry}
            />
          </ErrorBoundary>
          {prefs.showTicker && <EventTicker events={events} />}
        </>
      ) : (
        <FeedStatusScreen
          status={status}
          error={error}
          nextPollAt={nextPollAt}
          onRetry={retry}
          holdingUntil={holdingUntil}
        />
      )}
      <footer className="app__footer">
        <span className="app__disclaimer">
          Unofficial fan project. Not affiliated with or endorsed by NASCAR. Data © NASCAR.
        </span>
        <FooterClock lastUpdated={lastUpdated} delaySeconds={delaySeconds} />
        {/* In the footer so they never cover timing data. */}
        <Controls
          fullscreen={display.fullscreen}
          canFullscreen={display.canFullscreen}
          onToggleFullscreen={display.toggleFullscreen}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      </footer>
      {settingsOpen && <SettingsDrawer session={session} onClose={closeSettings} />}
    </div>
  );
}
