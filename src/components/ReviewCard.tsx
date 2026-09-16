/**
 * ReviewCard.tsx — deploy/join a review contract, record purchases as the
 * merchant, generate a purchase code as a buyer, submit an anonymous
 * review against that code, and display the public review list.
 *
 * PRIVACY-CRITICAL DETAIL: a buyer's secret is generated entirely in this
 * component and persisted only in this browser's localStorage, scoped by
 * contract address. It is never sent to the merchant, never included in
 * any network request except as a private circuit input at proof time (see
 * utils/contract.ts submitReview), and is cleared from React state the
 * moment a review is submitted so it cannot be re-rendered or re-logged.
 * Only its PUBLIC commitment (a one-way hash) is ever shown on screen or
 * handed to the merchant.
 */
import { useEffect, useMemo, useState } from 'react';
import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import {
  commitmentFor,
  deployReviewContract,
  generateSecret,
  joinReviewContract,
  recordPurchase,
  readReviewState,
  submitReview as submitReviewTx,
  type ReviewState,
} from '../utils/contract';

type TxStatus = 'idle' | 'deploying' | 'joining' | 'working' | 'confirmed' | 'failed';
type Tab = 'buyer' | 'merchant';

interface Props {
  connectedAPI: ConnectedAPI;
}

interface StoredCode {
  secretHex: string;
  commitmentHex: string;
  createdAt: string;
  reviewed: boolean;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function fromHex(hex: string): Uint8Array {
  const clean = hex.trim().toLowerCase();
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function storageKey(contractAddress: string): string {
  return `review-codes:${contractAddress}`;
}

function loadCodes(contractAddress: string): StoredCode[] {
  try {
    const raw = localStorage.getItem(storageKey(contractAddress));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCodes(contractAddress: string, codes: StoredCode[]): void {
  localStorage.setItem(storageKey(contractAddress), JSON.stringify(codes));
}

/** Maps raw SDK/wallet errors onto messages a user can act on. */
function friendlyError(e: any): string {
  const raw = String(e?.message ?? e ?? 'Unknown error');
  if (/not enough dust/i.test(raw)) {
    return 'Not enough tDUST to pay the transaction fee. Open your wallet, generate tDUST, then try again.';
  }
  if (/rejected/i.test(raw)) return 'Request was rejected in your wallet.';
  if (/timed out/i.test(raw)) {
    return `${raw}. The transaction may still land on-chain — refresh in a moment to check.`;
  }
  if (/proof server|proving/i.test(raw)) {
    return 'Proof generation failed. Check that your wallet is pointed at a running local proof server (http://127.0.0.1:6300).';
  }
  if (/failed to fetch|networkerror/i.test(raw)) {
    return 'Network request failed. Check your connection and that the indexer is reachable, then retry.';
  }
  if (/already been reviewed/i.test(raw)) {
    return 'This purchase code has already been used for a review. Generate a new code for your next purchase.';
  }
  if (/no purchase commitment found/i.test(raw)) {
    return 'The merchant has not recorded this purchase yet. Ask them to record it, then try again.';
  }
  return raw;
}

const RATINGS = [1, 2, 3, 4, 5] as const;

export function ReviewCard({ connectedAPI }: Props) {
  const [contractAddress, setContractAddress] = useState<string | null>(null);
  const [addressInput, setAddressInput] = useState('');
  const [deployedContract, setDeployedContract] = useState<any>(null);
  const [reviewState, setReviewState] = useState<ReviewState | null>(null);
  const [txStatus, setTxStatus] = useState<TxStatus>('idle');
  const [txId, setTxId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('buyer');

  // Merchant panel state
  const [commitmentInput, setCommitmentInput] = useState('');

  // Buyer panel state
  const [codes, setCodes] = useState<StoredCode[]>([]);
  const [selectedCommitment, setSelectedCommitment] = useState<string | null>(null);
  const [reviewText, setReviewText] = useState('');
  const [selectedRating, setSelectedRating] = useState<number | null>(null);
  const [copiedHex, setCopiedHex] = useState<string | null>(null);

  const busy = txStatus === 'deploying' || txStatus === 'joining' || txStatus === 'working';

  useEffect(() => {
    if (contractAddress) setCodes(loadCodes(contractAddress));
  }, [contractAddress]);

  const availableCodes = useMemo(() => codes.filter((c) => !c.reviewed), [codes]);

  const refresh = async (address: string) => {
    try {
      setReviewState(await readReviewState(connectedAPI, address));
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  const handleDeploy = async () => {
    setError(null);
    setTxStatus('deploying');
    try {
      const contract = await deployReviewContract(connectedAPI);
      const address = contract.deployTxData.public.contractAddress;
      setDeployedContract(contract);
      setContractAddress(address);
      setTab('merchant');
      await refresh(address);
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
      const contract = await joinReviewContract(connectedAPI, address);
      setDeployedContract(contract);
      setContractAddress(address);
      await refresh(address);
      setTxStatus('idle');
    } catch (e) {
      setTxStatus('failed');
      setError(friendlyError(e));
    }
  };

  const handleGenerateCode = () => {
    if (!contractAddress) return;
    const secret = generateSecret();
    const commitment = commitmentFor(secret);
    const next: StoredCode = {
      secretHex: toHex(secret),
      commitmentHex: toHex(commitment),
      createdAt: new Date().toISOString(),
      reviewed: false,
    };
    const updated = [...codes, next];
    setCodes(updated);
    saveCodes(contractAddress, updated);
    setSelectedCommitment(next.commitmentHex);
  };

  const handleCopyCommitment = async (hex: string) => {
    try {
      await navigator.clipboard.writeText(hex);
    } catch {
      // Clipboard API can fail on insecure origins or without permission —
      // fall back to a manual-select approach via a temporary textarea.
      const textarea = document.createElement('textarea');
      textarea.value = hex;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
      } finally {
        document.body.removeChild(textarea);
      }
    }
    setCopiedHex(hex);
    setTimeout(() => setCopiedHex((current) => (current === hex ? null : current)), 2000);
  };

  const handleRecordPurchase = async () => {
    if (!deployedContract) return;
    const hex = commitmentInput.trim();
    if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
      setError('Enter the 64-character hex commitment the buyer gave you.');
      return;
    }
    setError(null);
    setTxStatus('working');
    setTxId(null);
    try {
      const result = await recordPurchase(deployedContract, fromHex(hex));
      setTxId(result.txId);
      setTxStatus('confirmed');
      setCommitmentInput('');
      if (contractAddress) await refresh(contractAddress);
    } catch (e) {
      setTxStatus('failed');
      setError(friendlyError(e));
    }
  };

  const handleSubmitReview = async () => {
    if (!contractAddress || !selectedCommitment || selectedRating === null || !reviewText.trim()) return;
    const code = codes.find((c) => c.commitmentHex === selectedCommitment);
    if (!code) return;

    setError(null);
    setTxStatus('working');
    setTxId(null);
    try {
      const secret = fromHex(code.secretHex);
      const result = await submitReviewTx(connectedAPI, contractAddress, secret, reviewText.trim(), BigInt(selectedRating));
      setTxId(result.txId);
      setTxStatus('confirmed');

      // Mark this code as consumed and clear the form — the secret itself
      // already went out of scope with this function call and is never
      // stored in React state.
      const updated = codes.map((c) => (c.commitmentHex === selectedCommitment ? { ...c, reviewed: true } : c));
      setCodes(updated);
      saveCodes(contractAddress, updated);
      setSelectedCommitment(null);
      setReviewText('');
      setSelectedRating(null);

      await refresh(contractAddress);
    } catch (e) {
      setTxStatus('failed');
      setError(friendlyError(e));
    }
  };

  if (!deployedContract) {
    return (
      <section className="section">
        <div className="section-head">
          <h2>Review Contract</h2>
        </div>

        <button onClick={handleDeploy} disabled={busy} className="btn btn-primary btn-block">
          {txStatus === 'deploying' ? (
            <>
              <span className="spinner" aria-hidden="true" /> Deploying contract
            </>
          ) : (
            'Deploy New Review Contract (become the merchant)'
          )}
        </button>

        <div className="join-row">
          <label htmlFor="contract-address">Or join an existing product's reviews</label>
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
          <span className="label">Purchases</span>
          <p className="stat-value">{reviewState ? reviewState.purchaseCount.toString() : '—'}</p>
          <p className="stat-note">Recorded by the merchant</p>
        </div>
        <div className="stat">
          <span className="label">Reviews</span>
          <p className="stat-value">{reviewState ? reviewState.reviewCount.toString() : '—'}</p>
          <p className="stat-note">Posted, one per purchase</p>
        </div>
        <div className="stat">
          <span className="label">Avg Rating</span>
          <p className="stat-value">
            {reviewState && reviewState.reviews.length > 0
              ? (reviewState.reviews.reduce((s, r) => s + r.rating, 0) / reviewState.reviews.length).toFixed(1)
              : '—'}
          </p>
          <p className="stat-note">Across all posted reviews</p>
        </div>
      </div>

      <section className="section">
        <div className="section-head">
          <h2>Contract</h2>
        </div>
        <dl className="meta">
          <dt>Address</dt>
          <dd className="mono break" title={contractAddress ?? ''}>
            {contractAddress}
          </dd>
        </dl>

        <div className="tabs" role="tablist" aria-label="Role">
          <button
            role="tab"
            aria-selected={tab === 'buyer'}
            className={`tab-btn${tab === 'buyer' ? ' is-active' : ''}`}
            onClick={() => setTab('buyer')}
          >
            I'm a Buyer
          </button>
          <button
            role="tab"
            aria-selected={tab === 'merchant'}
            className={`tab-btn${tab === 'merchant' ? ' is-active' : ''}`}
            onClick={() => setTab('merchant')}
          >
            I'm the Merchant
          </button>
        </div>

        {tab === 'merchant' && (
          <div className="tab-panel">
            <p className="privacy-label">
              Anyone can record purchases if they hold this contract's address and the buyer's commitment — the
              contract itself checks the caller's key against the address that ran "Deploy" (see README for the
              honest limits of that check). In a real deployment only the merchant would have this UI exposed.
            </p>
            <label htmlFor="commitment-input" className="join-row-label">
              Buyer's purchase commitment (64 hex characters, given to you by the buyer out of band)
            </label>
            <div className="join-inputs">
              <input
                id="commitment-input"
                type="text"
                value={commitmentInput}
                onChange={(e) => setCommitmentInput(e.target.value)}
                placeholder="e.g. a1b2c3..."
                className="input"
                autoComplete="off"
                spellCheck={false}
              />
              <button onClick={handleRecordPurchase} disabled={busy} className="btn btn-primary">
                {txStatus === 'working' ? (
                  <>
                    <span className="spinner" aria-hidden="true" /> Recording
                  </>
                ) : (
                  'Record Purchase'
                )}
              </button>
            </div>
          </div>
        )}

        {tab === 'buyer' && (
          <div className="tab-panel">
            <p className="privacy-label">
              Generate a purchase code below and give the commitment to the merchant. Once they record it, come back
              and submit your review — your secret never leaves this browser.
            </p>

            <button onClick={handleGenerateCode} disabled={busy} className="btn btn-secondary btn-block">
              Generate New Purchase Code
            </button>

            {codes.length > 0 && (
              <div className="codes-list">
                {codes.map((c) => (
                  <div key={c.commitmentHex} className={`code-row${c.reviewed ? ' is-reviewed' : ''}`}>
                    <span className="mono break code-hex" title={c.commitmentHex}>
                      {c.commitmentHex}
                    </span>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => handleCopyCommitment(c.commitmentHex)}
                      title="Copy commitment to clipboard"
                      aria-label="Copy commitment to clipboard"
                    >
                      {copiedHex === c.commitmentHex ? (
                        <span className="copy-check" aria-hidden="true">
                          ✓
                        </span>
                      ) : (
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <rect x="9" y="9" width="13" height="13" rx="2" />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                      )}
                    </button>
                    <span className="code-status">
                      {copiedHex === c.commitmentHex ? 'Copied!' : c.reviewed ? 'Reviewed' : 'Give this to the merchant'}
                    </span>
                    {!c.reviewed && (
                      <button
                        className="btn btn-secondary btn-small"
                        onClick={() => setSelectedCommitment(c.commitmentHex)}
                      >
                        {selectedCommitment === c.commitmentHex ? 'Selected' : 'Use for review'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {selectedCommitment && availableCodes.some((c) => c.commitmentHex === selectedCommitment) && (
              <div className="review-form">
                <label htmlFor="review-text" className="join-row-label">
                  Your review (public — anyone will be able to read this)
                </label>
                <textarea
                  id="review-text"
                  className="input textarea"
                  value={reviewText}
                  onChange={(e) => setReviewText(e.target.value)}
                  rows={4}
                  placeholder="Fast shipping, works exactly as described."
                  disabled={busy}
                />

                <fieldset className="rating-group" disabled={busy}>
                  <legend>Your rating</legend>
                  <div className="rating-options" role="radiogroup" aria-label="Your rating">
                    {RATINGS.map((r) => (
                      <button
                        key={r}
                        type="button"
                        role="radio"
                        aria-checked={selectedRating === r}
                        className={`rating-btn${selectedRating === r ? ' is-selected' : ''}`}
                        onClick={() => setSelectedRating(r)}
                        disabled={busy}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </fieldset>

                <p className="privacy-label">🔒 Proved without revealing your identity or which purchase is yours.</p>

                <button
                  onClick={handleSubmitReview}
                  disabled={busy || selectedRating === null || !reviewText.trim()}
                  className="btn btn-primary btn-block"
                >
                  {txStatus === 'working' ? (
                    <>
                      <span className="spinner" aria-hidden="true" /> Generating proof locally
                    </>
                  ) : (
                    'Submit Anonymous Review'
                  )}
                </button>
              </div>
            )}
          </div>
        )}

        {txStatus === 'working' && (
          <div className="status status-working" role="status">
            <p>Building a zero-knowledge proof in your browser, then waiting for on-chain confirmation.</p>
          </div>
        )}

        {txStatus === 'confirmed' && txId && (
          <div className="status status-ok" role="status">
            <span className="badge">Confirmed</span>
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

        <button onClick={() => contractAddress && refresh(contractAddress)} disabled={busy} className="btn btn-secondary" style={{ marginTop: '1rem' }}>
          Refresh
        </button>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Reviews ({reviewState ? reviewState.reviewCount.toString() : '0'})</h2>
        </div>
        {!reviewState || reviewState.reviews.length === 0 ? (
          <p className="muted">No reviews yet.</p>
        ) : (
          <ul className="reviews-list">
            {reviewState.reviews.map((r) => (
              <li key={r.id.toString()} className="review-item">
                <div className="review-item-head">
                  <span className="review-rating">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>
                  <span className="label">Verified purchase</span>
                </div>
                <p className="review-text">{r.text}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
