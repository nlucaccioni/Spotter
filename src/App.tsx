import { Board } from './components/Board.tsx';
import { ConnectionStatus } from './components/ConnectionStatus.tsx';
import { EventTicker } from './components/EventTicker.tsx';
import { useLiveSession } from './hooks/useLiveSession.ts';

export default function App() {
  const { session, status, lastChanged, nextPollAt, events, positionChanges, updateId, replay } =
    useLiveSession();

  return (
    <div className="app">
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
          <EventTicker events={events} />
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
        Unofficial fan project. Not affiliated with or endorsed by NASCAR. Data © NASCAR.
      </footer>
    </div>
  );
}
