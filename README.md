# Anonymous Survey

![CI](https://github.com/JGX1019/Midnight-New-Moon-lvl-3/actions/workflows/ci.yml/badge.svg)

> A feedback survey on Midnight where participation is publicly verifiable but individual responses stay private.

## Live Demo

[PASTE LIVE URL AFTER DEPLOYING FRONTEND]

## Contract Address

| Network | Address |
|---------|---------|
| Preprod | `[PASTE SURVEY CONTRACT ADDRESS AFTER DEPLOYING]` |

## What This Does

Participants answer a single satisfaction question with a rating from 1 to 5. The rating is a **private circuit input**: it is used to build a zero-knowledge proof locally in the browser and is never written to the chain.

What the contract does publish is two counters — how many people responded in total, and how many of those responses were positive (a rating of 4 or 5). That makes participation and the overall satisfaction rate verifiable by anyone, while keeping each individual answer private.

The proof also enforces that a rating is a well-formed answer (`1 <= rating <= 5`), so the public tallies cannot be poisoned with out-of-range values — without the value itself ever being revealed.

## Privacy Model

- **PUBLIC:** `response_count` (total responses) and `positive_count` (responses rated 4-5). Both are `Counter` values on the ledger, readable by anyone.
- **PRIVATE:** `rating` — the participant's exact 1-5 answer. It is a private circuit parameter, consumed inside the ZK proof, and never stored on-chain or transmitted.
- **PROVED without revealing:** that the rating is a valid survey answer (`1 <= rating <= 5`), and that `positive_count` was incremented if and only if the rating was `>= 4` — without disclosing which of `{1,2,3}` or which of `{4,5}` was chosen.

## Privacy Claim

**What an on-chain observer can learn:** the contract address; the total number of responses; how many responses were positive; the satisfaction rate derived from those two numbers; and, for each transaction, the wallet that submitted it and whether that response fell in the positive bucket (`positive_count` either moved or it did not).

**What an on-chain observer cannot learn:** the exact rating behind any response. A `1`, `2` and `3` are indistinguishable from each other on the ledger, as are a `4` and a `5`. No transcript, ledger field, or proof artifact contains the rating, and the contract state has no per-participant record at all — there is no stored list of who answered what.

**Honest limitation:** because the tallies update once per transaction, an observer who watches individual transactions learns one bit about that response — whether it was positive or not. Exact values stay hidden, but that single bit is disclosed by design, since publishing a verifiable satisfaction rate is the product's purpose. Hiding it too would require batching or aggregating responses before they hit the ledger; that is noted as productization work in [PROPOSAL.md](./PROPOSAL.md).

## Tech Stack

- Midnight Network (Preprod)
- Compact — ZK smart contract language
- Midnight.js SDK (`midnight-js-contracts` v4.1.1)
- DApp Connector API (`@midnight-ntwrk/dapp-connector-api`) — works with any Midnight-compatible wallet
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
git clone https://github.com/JGX1019/Midnight-New-Moon-lvl-3.git
cd Midnight-New-Moon-lvl-3
npm install --legacy-peer-deps

# Compile the contracts (outputs to managed/)
npm run compile

# Copy the survey's ZK assets into public/ so the browser can fetch them
npm run copy-assets

# Start the local proof server. Pin 8.1.0 — :latest and the 7.x line hang
# indefinitely generating proofs on Apple Silicon under Docker Desktop.
docker run --rm -p 6300:6300 midnightntwrk/proof-server:8.1.0

# In your wallet: set Proof server to Local (http://127.0.0.1:6300)

npm run dev
# Open http://localhost:5173, connect your wallet, then deploy a survey
# or join an existing one by address.
```

## Run Tests

```bash
npm test
```

28 tests passing across two suites — 18 for the survey contract and 10 carried over from the earlier counter contract. The survey tests cover:

- **Circuit logic** — positive/negative ratings tally correctly, boundary values (3 and 4) land in the right bucket, out-of-range ratings (0 and 6) are rejected by the in-circuit asserts, and `reset_survey` clears both tallies.
- **State transitions** — tallies accumulate correctly across many responses, all-positive and all-negative rounds behave, responses work again after a reset, and `positive_count` can never exceed `response_count`.
- **Privacy** — the ledger exposes only the two counters and never the rating; ratings within the same bucket (4 vs 5, and 1 vs 2 vs 3) are indistinguishable on the public ledger; different rating sequences with the same bucket profile produce identical public state; and the rating never appears in the serialized contract state.

## CI/CD

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every push to `main` and on every pull request against `main`. Each run:

1. Checks out the repository
2. Installs Node.js v22 (with npm caching)
3. Installs dependencies with `npm install --legacy-peer-deps`
4. Installs the Compact compiler CLI, then runs `compact update` to fetch the toolchain binary (without this step `compact compile` fails with "No default compiler set")
5. Compiles both `survey.compact` and `counter.compact`
6. Runs the full Jest test suite
7. Builds the production frontend bundle

A failure at any step fails the run, so a broken contract, a failing test, or a broken build all block the badge above from going green.

## Product Proposal

See [PROPOSAL.md](./PROPOSAL.md)

## Demo Video

[PLACEHOLDER — will be added after recording]

## Project Structure

```
contracts/survey.compact          — the survey contract (Level 3 product)
contracts/counter.compact         — earlier levels' contract, kept for CI coverage
managed/                          — compiler output (ZK keys, zkir, compiled JS)
public/managed/survey/            — ZK keys/zkir served to the browser at runtime
src/contract/survey.js            — compiled contract JS, statically imported by the frontend
src/hooks/useMidnight.ts          — wallet connect/disconnect hook
src/components/WalletConnect.tsx  — wallet connect/disconnect UI
src/components/SurveyCard.tsx     — deploy/join, rating picker, tallies, tx status
src/api/providers.ts              — browser-side midnight-js providers backed by the wallet
src/api/contract.ts               — deploy/join + typed circuit call helpers
tests/survey.test.ts              — survey contract test suite (18 tests)
tests/counter.test.ts             — counter contract test suite (10 tests)
.github/workflows/ci.yml          — CI pipeline
PROPOSAL.md                       — product proposal
```

## Note on deployment path

Contracts here are deployed **from the frontend** through a connected wallet, not via a Node.js CLI script. The CLI path builds its own wallet and syncs it directly against the public indexer, which proved unreliable against Preprod (the wallet-sdk's sync stream has no internal retry and can stall indefinitely on a transient indexer hiccup). Going through the wallet sidesteps this — the wallet extension owns its own sync, so the dApp never opens a raw indexer subscription.
