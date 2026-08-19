import { useMidnight } from './hooks/useMidnight';
import { WalletConnect } from './components/WalletConnect';
import { SurveyCard } from './components/SurveyCard';
import './styles.css';

export function App() {
  const midnight = useMidnight();

  return (
    <div className="app">
      <header className="app-header">
        <h1>Anonymous Survey</h1>
        <p className="tagline">
          Verifiable participation, private responses. Everyone can check how many people answered — nobody can see
          what any one person said.
        </p>
      </header>

      <main>
        <WalletConnect {...midnight} />

        {midnight.status === 'connected' && midnight.connectedAPI ? (
          <SurveyCard connectedAPI={midnight.connectedAPI} />
        ) : (
          <p className="muted hint">
            Connect any Midnight-compatible wallet to deploy a survey or submit an anonymous response.
          </p>
        )}
      </main>

      <footer className="app-footer">
        <p className="muted">
          Built on Midnight. Ratings are private circuit inputs; only the response and positive tallies are public.
        </p>
      </footer>
    </div>
  );
}
