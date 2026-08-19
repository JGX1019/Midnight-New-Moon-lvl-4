/**
 * SurveyCard.tsx — deploy/join a survey contract, submit an anonymous
 * rating, and display the public tallies.
 *
 * The rating the participant picks is a PRIVATE circuit input. It is used
 * only to generate the proof locally in the browser, and is deliberately
 * cleared from component state after submission so it is never rendered
 * back to the user, never logged, and never included in any result view.
 */
import { useState } from 'react';
import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import { deploySurvey, joinSurvey, readTallies, resetSurvey, submitResponse, type SurveyTallies } from '../api/contract';

type TxStatus = 'idle' | 'deploying' | 'joining' | 'proving' | 'confirmed' | 'failed';

interface Props {
  connectedAPI: ConnectedAPI;
}

const RATINGS = [1, 2, 3, 4, 5] as const;

const RATING_LABELS: Record<number, string> = {
  1: 'Very dissatisfied',
  2: 'Dissatisfied',
  3: 'Neutral',
  4: 'Satisfied',
  5: 'Very satisfied',
};

/** Maps raw SDK/wallet errors onto messages a participant can act on. */
function friendlyError(e: any): string {
  const raw = String(e?.message ?? e ?? 'Unknown error');
  if (/not enough dust/i.test(raw)) {
    return 'Not enough tDUST to pay the transaction fee. Open your wallet, generate tDUST, then try again.';
  }
  if (/rejected/i.test(raw)) {
    return 'Request was rejected in your wallet.';
  }
  if (/timed out/i.test(raw)) {
    return `${raw}. The transaction may still land on-chain — refresh the tallies in a moment to check.`;
  }
  if (/proof server|proving/i.test(raw)) {
    return 'Proof generation failed. Check that your wallet is pointed at a running local proof server (http://127.0.0.1:6300).';
  }
  if (/failed to fetch|networkerror/i.test(raw)) {
    return 'Network request failed. Check your connection and that the indexer is reachable, then retry.';
  }
  return raw;
}

function satisfactionRate(t: SurveyTallies): string {
  if (t.responses === 0n) return '—';
  const pct = (Number(t.positives) / Number(t.responses)) * 100;
  return `${pct.toFixed(0)}%`;
}

export function SurveyCard({ connectedAPI }: Props) {
  const [contractAddress, setContractAddress] = useState<string | null>(null);
  const [addressInput, setAddressInput] = useState('');
  const [deployedContract, setDeployedContract] = useState<any>(null);
  const [selectedRating, setSelectedRating] = useState<number | null>(null);
  const [tallies, setTallies] = useState<SurveyTallies | null>(null);
  const [txStatus, setTxStatus] = useState<TxStatus>('idle');
  const [txId, setTxId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const busy = txStatus === 'deploying' || txStatus === 'joining' || txStatus === 'proving';

  const refreshTallies = async (address: string) => {
    try {
      setTallies(await readTallies(connectedAPI, address));
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  const handleDeploy = async () => {
    setError(null);
    setTxStatus('deploying');
    try {
      const contract = await deploySurvey(connectedAPI);
      const address = contract.deployTxData.public.contractAddress;
      setDeployedContract(contract);
      setContractAddress(address);
      setTallies({ responses: 0n, positives: 0n });
      setTxStatus('idle');
    } catch (e) {
      setTxStatus('failed');
      setError(friendlyError(e));
    }
  };

  const handleJoin = async () => {
    const address = addressInput.trim();
    if (!address) {
      setError('Enter a contract address to join.');
      return;
    }
    setError(null);
    setTxStatus('joining');
    try {
      const contract = await joinSurvey(connectedAPI, address);
      setDeployedContract(contract);
      setContractAddress(address);
      await refreshTallies(address);
      setTxStatus('idle');
    } catch (e) {
      setTxStatus('failed');
      setError(friendlyError(e));
    }
  };

  const handleSubmit = async () => {
    if (!deployedContract || selectedRating === null) return;
    setError(null);
    setTxStatus('proving');
    setTxId(null);
    try {
      const result = await submitResponse(deployedContract, BigInt(selectedRating));
      setTxId(result.txId);
      setTxStatus('confirmed');
      // Clear the private rating immediately — it has served its purpose as a
      // proof input and must not linger in UI state.
      setSelectedRating(null);
      if (contractAddress) await refreshTallies(contractAddress);
    } catch (e) {
      setTxStatus('failed');
      setError(friendlyError(e));
    }
  };

  const handleReset = async () => {
    if (!deployedContract) return;
    setError(null);
    setTxStatus('proving');
    setTxId(null);
    try {
      const result = await resetSurvey(deployedContract);
      setTxId(result.txId);
      setTxStatus('confirmed');
      if (contractAddress) await refreshTallies(contractAddress);
    } catch (e) {
      setTxStatus('failed');
      setError(friendlyError(e));
    }
  };

  if (!deployedContract) {
    return (
      <section className="section">
        <div className="section-head">
          <h2>Survey</h2>
        </div>

        <button onClick={handleDeploy} disabled={busy} className="btn btn-primary btn-block">
          {txStatus === 'deploying' ? (
            <>
              <span className="spinner" aria-hidden="true" /> Deploying survey
            </>
          ) : (
            'Deploy New Survey'
          )}
        </button>

        <div className="join-row">
          <label htmlFor="contract-address">Or join an existing survey</label>
          <div className="join-inputs">
            <input
              id="contract-address"
              type="text"
              value={addressInput}
              onChange={(e) => setAddressInput(e.target.value)}
              placeholder="Contract address (hex)"
              className="input"
              autoComplete="off"
              spellCheck={false}
            />
            <button onClick={handleJoin} disabled={busy} className="btn btn-secondary">
              {txStatus === 'joining' ? (
                <>
                  <span className="spinner" aria-hidden="true" /> Joining
                </>
              ) : (
                'Join'
              )}
            </button>
          </div>
        </div>

        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
      </section>
    );
  }

  return (
    <>
      <div className="stats">
        <div className="stat">
          <span className="label">Responses</span>
          <p className="stat-value">{tallies ? tallies.responses.toString() : '—'}</p>
          <p className="stat-note">Total submitted responses</p>
        </div>
        <div className="stat">
          <span className="label">Positive</span>
          <p className="stat-value">{tallies ? tallies.positives.toString() : '—'}</p>
          <p className="stat-note">Responses rated 4 or 5</p>
        </div>
        <div className="stat">
          <span className="label">Satisfaction</span>
          <p className="stat-value">{tallies ? satisfactionRate(tallies) : '—'}</p>
          <p className="stat-note">Positive share of all responses</p>
        </div>
      </div>

      <section className="section">
        <div className="section-head">
          <h2>Submit Response</h2>
        </div>

        <dl className="meta">
          <dt>Contract</dt>
          <dd className="mono break" title={contractAddress ?? ''}>
            {contractAddress}
          </dd>
        </dl>

        <fieldset className="rating-group" disabled={busy} style={{ marginTop: '1.25rem' }}>
          <legend>How satisfied are you?</legend>
          <div className="rating-options" role="radiogroup" aria-label="Your rating">
            {RATINGS.map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={selectedRating === r}
                aria-label={`${r} — ${RATING_LABELS[r]}`}
                title={RATING_LABELS[r]}
                className={`rating-btn${selectedRating === r ? ' is-selected' : ''}`}
                onClick={() => setSelectedRating(r)}
                disabled={busy}
              >
                {r}
              </button>
            ))}
          </div>
          <p className="privacy-label">
            Your rating stays private — it never leaves your browser. Only the tallies above change on-chain.
          </p>
        </fieldset>

        <div className="actions">
          <button
            onClick={handleSubmit}
            disabled={busy || selectedRating === null}
            className="btn btn-primary btn-block"
          >
            {txStatus === 'proving' ? (
              <>
                <span className="spinner" aria-hidden="true" /> Generating proof locally
              </>
            ) : (
              'Submit Anonymous Response'
            )}
          </button>
          <div className="actions-row">
            <button
              onClick={() => contractAddress && refreshTallies(contractAddress)}
              disabled={busy}
              className="btn btn-secondary"
            >
              Refresh Tallies
            </button>
            <button onClick={handleReset} disabled={busy} className="btn btn-secondary">
              Reset Survey
            </button>
          </div>
        </div>

        {txStatus === 'proving' && (
          <div className="status status-working" role="status">
            <p>
              Building a zero-knowledge proof in your browser. This proves your rating is a valid 1-5 answer without
              revealing which one it was.
            </p>
          </div>
        )}

        {txStatus === 'confirmed' && txId && (
          <div className="status status-ok" role="status">
            <span className="badge">Confirmed</span>
            <p>Response recorded on-chain.</p>
            <p className="mono break tx-id" title={txId}>
              tx: {txId}
            </p>
          </div>
        )}

        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
      </section>
    </>
  );
}
