import { ConnectionStatus } from './components/ConnectionStatus.tsx';
import { FlagBanner } from './components/FlagBanner.tsx';
import { SessionHeader } from './components/SessionHeader.tsx';
import { TimingTable } from './components/TimingTable.tsx';
import { useLiveSession } from './hooks/useLiveSession.ts';

export default function App() {
  const { session, status, lastChanged, nextPollAt } = useLiveSession();

  return (
    <div className="app">
      {session ? (
        <>
          <FlagBanner
            flag={session.flag}
            lap={session.lap}
            lapsInRace={session.lapsInRace}
            lapsToGo={session.lapsToGo}
          />
          <SessionHeader
            session={session}
            status={status}
            lastChanged={lastChanged}
            nextPollAt={nextPollAt}
          />
          <main className="app__main">
            <TimingTable session={session} />
          </main>
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
