import { ConnectionStatus } from './components/ConnectionStatus.tsx';
import { useLiveSession } from './hooks/useLiveSession.ts';

export default function App() {
  const { session, status, lastChanged, nextPollAt } = useLiveSession();

  return (
    <div className="app">
      <main className="app__main">
        <h1>Spotter</h1>
        <ConnectionStatus
          status={status}
          hasData={session !== null}
          lastChanged={lastChanged}
          nextPollAt={nextPollAt}
        />
        {/* Placeholder until the timing board lands in milestone 4. */}
        {session && (
          <p className="muted">
            {session.series.name} · {session.runName} · {session.track.name} · Lap {session.lap} /{' '}
            {session.lapsInRace} · {session.flag.label} · {session.cars.length} cars
          </p>
        )}
      </main>
      <footer className="app__footer">
        Unofficial fan project. Not affiliated with or endorsed by NASCAR. Data © NASCAR.
      </footer>
    </div>
  );
}
