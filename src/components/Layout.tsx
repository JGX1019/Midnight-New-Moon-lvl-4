/**
 * Layout.tsx — shared page chrome: the dark top bar (brand + network status
 * + wallet connect) and the page footer. Pulled out of App.tsx so the app
 * shell and the product-specific content underneath it are separate
 * concerns.
 */
import type { ReactNode } from 'react';
import type { UseMidnightResult } from '../hooks/useMidnight';
import { WalletConnect } from './WalletConnect';

interface Props {
  children: ReactNode;
  wallet: UseMidnightResult;
}

export function Layout({ children, wallet }: Props) {
  return (
    <>
      <header className="topbar">
        <h1 className="brand">
          <img src="/anony-reviews.png" alt="" className="brand-logo" aria-hidden="true" />
          Anonymous Verified Reviews
        </h1>

        <div className="topbar-meta">
          {wallet.status === 'connected' && (
            <span className="net-name">
              Preprod <span className="wallet-status-dot" aria-hidden="true" /> Connected
            </span>
          )}
          <WalletConnect {...wallet} />
        </div>
      </header>

      <div className="page">
        {children}

        <footer className="page-footer">
          <p>
            Built on Midnight. Review text and ratings are public by design — the buyer's identity and which
            specific purchase is theirs are never disclosed.
          </p>
        </footer>
      </div>
    </>
  );
}
