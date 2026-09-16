# Anonymous Verified Reviews

![CI](https://github.com/JGX1019/Midnight-New-Moon-lvl-4/actions/workflows/ci.yml/badge.svg)

> Prove you actually bought the product before you can review it, review only once, and stay anonymous doing it.

## Live Demo

[PASTE LIVE URL AFTER DEPLOYING FRONTEND]

## Contract Address

| Network | Address |
|---------|---------|
| Preprod | `[ADDRESS — PASTE AFTER DEPLOYING FROM THE FRONTEND]` |

## What This Product Does

Fake reviews are now a legal liability, not just a nuisance — the FTC's Consumer Reviews and Testimonials Rule (16 CFR 465) took effect in October 2024 and carries civil penalties of up to $53,088 per violation. Platforms are stuck between two bad options: verify reviewers by tying every review to a real account and purchase record, which means the platform permanently holds who said what about whom, or allow anonymity and get flooded with paid and AI-generated fakes.

This dApp gives both at once. When a buyer purchases something, the merchant records a *commitment* to that buyer's own secret in a public Merkle tree — a one-way hash that reveals nothing about who the buyer is. To post a review, the buyer proves in zero knowledge that their commitment sits somewhere in that tree, without revealing which one, and publishes a nullifier that stops them from reviewing the same purchase twice. The review text and star rating are fully public — that's the whole point of a review — but the link between a specific purchase and a specific review is never disclosed to anyone, including the merchant.

Anyone can read every review posted for a product. Nobody, not the merchant, not another buyer, not a chain observer, can tell which buyer wrote which one.

## Privacy Model

- **PUBLIC:** the merchant's key; the Merkle tree of purchase commitments (its root and leaf count, not which leaf belongs to which real buyer); `purchaseCount` and `reviewCount`; the set of spent nullifiers (so the "one review per purchase" rule is itself auditable); and — deliberately — every review's full text and star rating.
- **PRIVATE:** each buyer's own secret, generated on their device and never shared with the merchant or anyone else; and the Merkle path proving which specific commitment is theirs.
- **PROVED without revealing:** that the reviewer holds a genuine purchase commitment somewhere in the published set, without revealing which one; and that they have not reviewed this purchase before, via a nullifier that is deterministic per purchase but reveals nothing about which purchase produced it.

This is the inverse of a typical anonymous survey: there, the *answer* is hidden and only a count is published. Here, the *content* is fully public — a review nobody can read is worthless — and what's hidden is the *author*.

## Privacy Claim

**What an on-chain observer can learn:** the contract address; the merchant's public key; how many purchases have been recorded and how many reviews posted; every review's exact text and rating; the set of nullifiers already spent (opaque hashes, not linkable to any purchase); and, for each transaction, the wallet address that submitted it.

**What an on-chain observer cannot learn:** which of the published purchase commitments belongs to any given review. The Merkle membership proof is zero-knowledge with respect to the leaf index — a `checkRoot` verification succeeding reveals only that *some* leaf matches, never which one. There is no on-chain link, direct or inferable from ledger state alone, between a purchase commitment and the review that later consumed it.

**Honest limitations:**
- **The submitting wallet address is still public.** The Merkle proof hides *which purchase* is yours; it does not hide *which wallet* sent this transaction. A buyer who wants full unlinkability from their everyday wallet identity should submit from a fresh one — the contract has no opinion on this either way.
- **`ownPublicKey()` is prover-supplied, not signature-verified at the protocol level.** `initMerchant` and `recordPurchase` use it to gate who can act as "the merchant," but that value is something the *prover* asserts when building their own proof, not something checked against a wallet signature by the protocol itself. For this contract's purposes, whoever successfully proves they are the merchant *is* the merchant.
- **A merchant who colludes with a specific buyer, or who is the only merchant with very few recorded purchases, can narrow the anonymity set.** With 1000 recorded purchases, "some purchase reviewed" hides well among the crowd; with 2, it barely hides anything. This is a property of every anonymity-set-based scheme (mixnets, ring signatures, anonymous credentials) and not specific to this contract — it's the reason the demo video below records a run with more than a handful of purchases.

## Tech Stack

- Midnight Network (Preprod)
- Compact — ZK smart contract language
- Midnight.js SDK (`midnight-js-contracts` v4.1.1)
- DApp Connector API (`@midnight-ntwrk/dapp-connector-api`) — works with any Midnight-compatible wallet (Lace, 1AM, etc.)
- React 19 + Vite 6 + TypeScript
- Jest (contract tests)
- GitHub Actions (CI)

## Prerequisites

- A Midnight-compatible wallet browser extension (e.g. [Lace](https://chromewebstore.google.com/detail/lace/gafhhkghbfjjkeiendhlofajokpaflmk)), set to the **Preprod** network
- In your wallet's settings: **Proof server → Local** (`http://127.0.0.1:6300`). Proofs are generated locally in the browser through the connected wallet, which needs a running local proof server.
- tDUST in the wallet to pay transaction fees (wallet → Tokens → Generate tDUST)
- Docker Desktop running (for the local proof server)
- Node.js v22+

## Setup & Run Locally

```bash
git clone https://github.com/JGX1019/Midnight-New-Moon-lvl-4.git
cd Midnight-New-Moon-lvl-4
npm install --legacy-peer-deps

# Compile the contracts (outputs to managed/)
npm run compile

# Copy the review contract's ZK assets into public/ so the browser can fetch them
npm run copy-assets

# Start the local proof server. Pin 8.1.0 — :latest and the 7.x line hang
# indefinitely generating proofs on Apple Silicon under Docker Desktop.
docker run --rm -p 6300:6300 midnightntwrk/proof-server:8.1.0

# In your wallet: set Proof server to Local (http://127.0.0.1:6300)

npm run dev
# Open http://localhost:5173, connect your wallet, then deploy a new
# review contract or join an existing one by address.
```

See [docs/USAGE.md](./docs/USAGE.md) for a full walkthrough of the merchant and buyer flows.

## Run Tests

```bash
npm test
```

46 tests passing across three suites — 18 for the review contract, 18 carried over from Level 3's survey contract, and 10 from the earlier counter contract (all three `.compact` files are kept and compiled in CI; only `review.compact` backs this level's product). The review contract's own tests cover:

- **Circuit logic** — `initMerchant` can only run once, `recordPurchase` is rejected before the merchant is initialised, a genuine buyer can submit a review with their real purchase path, out-of-range ratings (0 and 6) are rejected, and a corrupted Merkle path is rejected with "not a verified purchase".
- **State transitions** — `purchaseCount` increments once per recorded purchase, multiple distinct buyers can independently purchase and review, and `reviewCount` never exceeds `purchaseCount`.
- **Privacy** — the ledger exposes exactly the documented public fields and never a secret; a forged membership proof (reusing another buyer's already-public commitment as your own path) is rejected because the circuit re-derives the expected commitment from *your* secret; a second review against the same purchase is rejected via the nullifier; two different purchases produce two non-colliding nullifiers; a purchase commitment never appears in the spent-nullifier set (the two hashes are domain-separated); the buyer's secret is never serialized into contract state; and — deliberately — the review text and rating *are* public, since that's the product, not a leak.

## CI/CD

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every push to `main` and on every pull request against `main`. Each run:

1. Checks out the repository
2. Installs Node.js v22 (with npm caching)
3. Installs dependencies with `npm install --legacy-peer-deps`
4. Installs the Compact compiler CLI, then runs `compact update` to fetch the toolchain binary (without this step `compact compile` fails with "No default compiler set")
5. Compiles `review.compact`, `survey.compact`, and `counter.compact`
6. Runs the full Jest test suite
7. Builds the production frontend bundle

A failure at any step fails the run, so a broken contract, a failing test, or a broken build all block the badge above from going green.

## Usage Guide

See [docs/USAGE.md](./docs/USAGE.md) for a step-by-step guide covering both the merchant flow (recording a purchase) and the buyer flow (generating a purchase code and submitting a review), plus a table of what's public vs private and a troubleshooting section.

## Product X Profile

[PLACEHOLDER — I will add after creating the account]

## Demo Video

[PLACEHOLDER — I will add after recording]

## Product Proposal

See [PROPOSAL.md](./PROPOSAL.md)

## Project Structure

```
contracts/review.compact          — the review contract (Level 4 product)
contracts/survey.compact          — Level 3's contract, kept for CI coverage
contracts/counter.compact         — earlier levels' contract, kept for CI coverage
managed/                          — compiler output (ZK keys, zkir, compiled JS)
public/managed/review/            — ZK keys/zkir served to the browser at runtime
src/contract/review.js            — compiled contract JS, statically imported by the frontend
src/hooks/useMidnight.ts          — wallet connect/disconnect hook
src/components/Layout.tsx         — page chrome: topbar, wallet connect, footer
src/components/WalletConnect.tsx  — wallet connect/disconnect UI
src/components/ReviewCard.tsx     — deploy/join, merchant tab, buyer tab, public reviews list
src/utils/providers.ts            — browser-side midnight-js providers backed by the wallet
src/utils/contract.ts             — deploy/join + typed circuit call helpers
tests/review.test.ts              — review contract test suite (18 tests)
tests/survey.test.ts              — survey contract test suite (18 tests)
tests/counter.test.ts             — counter contract test suite (10 tests)
docs/USAGE.md                     — step-by-step usage guide
.github/workflows/ci.yml          — CI pipeline
PROPOSAL.md                       — product proposal
```

## Note on deployment path

Contracts here are deployed **from the frontend** through a connected wallet, not via a Node.js CLI script. The CLI path builds its own wallet and syncs it directly against the public indexer, which proved unreliable against Preprod in earlier levels (the wallet-sdk's sync stream has no internal retry and can stall indefinitely on a transient indexer hiccup). Going through the wallet sidesteps this — the wallet extension owns its own sync, so the dApp never opens a raw indexer subscription. `src/deploy.ts`, `src/network.ts`, and `src/wallet.ts` are kept from earlier levels for reference but are not part of this level's active deploy path.
