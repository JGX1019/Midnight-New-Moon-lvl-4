# Product Proposal

## What is the product, and who uses it?

Anonymous Verified Reviews — a review platform where only people who actually bought the product can post a review, each buyer can review at most once, and nobody, not the merchant, not another buyer, not a chain observer, can tell which buyer wrote which review.

The privacy shape here is the inverse of a typical anonymous survey: the review *text and rating* are fully public — a review nobody can read is worthless — but the *author* is not. The hard problem is not concealing content, it's proving someone earned the right to post without ever learning who they are.

Fake reviews are now a legal liability rather than a nuisance. The FTC's Consumer Reviews and Testimonials Rule (16 CFR 465) took effect in October 2024 and carries civil penalties of up to $53,088 per violation, and the FTC began sending warning letters to companies over it in December 2025. Platforms are stuck between two bad options: verify reviewers by tying every review to a real account and purchase record, which means the platform permanently holds who said what about whom, or allow anonymity and get flooded with paid and AI-generated fakes.

Our first users are small and mid-size e-commerce merchants who want a review section they can point to as genuinely unmanipulated, and marketplaces/platforms that want to offer "verified purchase, anonymous author" as a feature rather than a false claim. A reader gets a review they can trust came from a real buyer. A reviewer gets to say the product was bad without the merchant ever learning who complained — which is exactly why honest negative reviews are so rare today.

## Why Midnight specifically?

On a transparent chain, the review author has no way to hide, because proving "I bought this" via any public record ties straight back to the buyer's wallet or account. The usual workaround — a platform that verifies purchases internally and publishes an "anonymized" review — just relocates the trust problem: now you're trusting the platform not to leak or misuse the purchase-to-author link it necessarily holds, and there's no way for anyone outside the platform to verify that link was ever actually severed.

Midnight lets us avoid holding that link at all. A buyer's purchase is recorded as a one-way commitment to a secret only they know, published in a Merkle tree. To review, they prove in zero knowledge that their commitment is somewhere in that tree — without revealing which leaf — and prove they haven't used this specific purchase to review before, via a nullifier that's deterministic per purchase but reveals nothing about which purchase produced it. The chain verifies both without ever learning the buyer's identity or which purchase is theirs. There's no database anywhere, including ours, capable of answering "who wrote this review."

## Data Model

| Data Point | Type | Disclosed To |
|------------|------|--------------|
| `merchantKey` — the merchant's public key | Public ledger | Everyone |
| `purchases` — Merkle tree of purchase commitments | Public ledger (root + leaf count) | Everyone (root/count only — not which leaf is which buyer) |
| Buyer's secret | Private witness | No one |
| Buyer's Merkle path (which leaf is theirs) | Private witness | No one |
| `purchaseCount` / `reviewCount` | Public ledger (Counter) | Everyone |
| `spentNullifiers` — one per reviewed purchase | Public ledger (Set) | Everyone (opaque hashes, not linkable to a purchase) |
| Review text and star rating | Public ledger (Map) | Everyone — this is the product |
| ZK proof of valid membership + unused nullifier | ZK proof | Chain (verifies without reading the secret or path) |

## Mainnet Feasibility

Realistic, with a specific and known list of gaps between this MVP and something a real merchant would run — none of them research problems.

The most important is out-of-band commitment delivery. Right now a buyer generates a commitment and has to hand it to the merchant somehow (paste it at checkout, email it, etc.), which is fine for a demo and clumsy for production. The real version needs this wired into an actual checkout flow, so the commitment is captured automatically at the moment of purchase.

Second is the anonymity-set caveat documented in the README: with very few recorded purchases, "some purchase was reviewed" barely hides anything. This isn't fixable by better cryptography — it's fixed by scale, the same way every mixnet and anonymous-credential system needs a large enough crowd to hide in. Worth stating plainly rather than glossing over.

Third, `ownPublicKey()`'s guarantee for "only the merchant can record purchases" is prover-side, not a wallet-signature check at the protocol level — sufficient for this MVP, but a production version serving a real business should layer a stronger authorization check (e.g. verified against a registered merchant list held by a marketplace contract) rather than trusting any prover who successfully calls `initMerchant` first.

Last, same as every level before this one: proof generation currently needs a local Docker proof server, which is fine for a merchant's own dashboard and unacceptable for an ordinary buyer leaving a review from a link. Wallet-side or hosted proving needs to be the default path before this goes in front of real customers.
