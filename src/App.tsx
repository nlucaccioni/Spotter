import { useCallback, useState } from 'react';
import { Board } from './components/Board.tsx';
import { ConnectionStatus } from './components/ConnectionStatus.tsx';
import { Controls } from './components/Controls.tsx';
import { EventTicker } from './components/EventTicker.tsx';
import { SettingsDrawer } from './components/SettingsDrawer.tsx';
import { useDisplayMode } from './hooks/useDisplayMode.ts';
import { useLiveSession } from './hooks/useLiveSession.ts';
import { useApplyTheme, usePreferences } from './hooks/usePreferences.ts';

export default function App() {
  const { session, status, lastChanged, nextPollAt, events, positionChanges, updateId, replay } =
    useLiveSession();
  const [prefs] = usePreferences();
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
          <Board
            session={session}
            status={status}
            lastChanged={lastChanged}
            nextPollAt={nextPollAt}
            replayLabel={replay && `Replay · ${replay.speed}×`}
            positionChanges={positionChanges}
            updateId={updateId}
          />
          {prefs.showTicker && <EventTicker events={events} />}
        </>
      ) : (
        <main className="app__main app__main--empty">
          <h1>Spotter</h1>
          <ConnectionStatus
            status={status}
            hasData={false}
            lastChanged={lastChanged}
            nextPollAt={nextPollAt}
          />
        </main>
      )}
      <footer className="app__footer">
        <span>
          Unofficial fan project. Not affiliated with or endorsed by NASCAR. Data © NASCAR.
        </span>
        {/* In the footer so they never cover timing data; they fade out when the mouse is still. */}
        <Controls
          hidden={idle}
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
