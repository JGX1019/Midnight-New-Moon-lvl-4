import { useMidnight } from './hooks/useMidnight';
import { WalletConnect } from './components/WalletConnect';
import { SurveyCard } from './components/SurveyCard';
import './styles.css';

export function App() {
  const midnight = useMidnight();

  return (
    <>
      <header className="topbar">
        <h1 className="brand">
          <span className="brand-mark" aria-hidden="true">◔</span>
          Anonymous Survey
        </h1>

        <div className="topbar-meta">
          {midnight.status === 'connected' && (
            <span className="net-name">
              Preprod <span className="wallet-status-dot" aria-hidden="true" /> Connected
            </span>
          )}
          <WalletConnect {...midnight} />
        </div>
      </header>

      <div className="page">
        <div className="intro">
          <p>
            Verifiable participation, private responses. Anyone can check how many people answered and the overall
            satisfaction rate — nobody can see what any one person said.
          </p>
        </div>

        {midnight.status === 'connected' && midnight.connectedAPI ? (
          <SurveyCard connectedAPI={midnight.connectedAPI} />
        ) : (
          <p className="hint">
            Connect any Midnight-compatible wallet to deploy a survey or submit an anonymous response.
          </p>
        )}

        <footer className="page-footer">
          <p>
            Built on Midnight. Ratings are private circuit inputs — only the response and positive tallies are
            written on-chain.
          </p>
        </footer>
      </div>
    </>
  );
}
