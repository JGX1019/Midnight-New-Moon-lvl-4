# Product Proposal

## What is the product, and who uses it?

An anonymous feedback survey where the results are verifiable but the individual answers are not. Participants answer a satisfaction question with a 1-5 rating, and the contract publishes only two numbers: how many people responded, and how many of those responses were positive.

The users we have in mind are groups where honest feedback and trustworthy numbers are both required, and where the two currently conflict. A DAO surveying contributors about a controversial proposal, a company running an employee engagement survey, or a cohort-based program collecting course feedback. In all three, people soften their answers when they suspect the response can be traced back to them, and the organiser has no way to prove they did not quietly discard the answers they disliked. We fix both ends: the participant knows their exact rating was never recorded anywhere, and everyone can independently verify the tally on-chain.

## Why Midnight specifically?

On a transparent chain the survey answer has to be readable to be counted, so "anonymous" reduces to hoping nobody links the wallet to the person. Hashing the rating does not help either — there are only five possible answers, so anyone can hash all five and match. The usual escape is to let a trusted server collect responses and publish the totals, which just moves the problem: now you are trusting the organiser not to drop inconvenient answers, and the verifiability is gone.

Midnight lets us keep both properties at once. The rating is a private circuit input, so it is consumed while the proof is built on the participant's machine and never leaves it. The proof still enforces that the rating is a well-formed answer between 1 and 5, so the tally cannot be poisoned with junk, and it enforces that the positive counter moved if and only if the rating was 4 or 5. The chain verifies all of that without ever seeing the number.

## Data Model

| Data Point | Type | Disclosed To |
|------------|------|--------------|
| `response_count` — total responses submitted | Public ledger (Counter) | Everyone |
| `positive_count` — responses rated 4-5 | Public ledger (Counter) | Everyone |
| `rating` — the participant's exact 1-5 answer | Private witness (circuit input) | No one |
| Satisfaction rate — derived from the two counters | Derived public | Everyone |
| ZK proof of a valid response | ZK proof | Chain (verifies without reading the rating) |

## Mainnet Feasibility

Yes, with a handful of gaps to close first — none of them research problems, all of them normal productization work.

The main one is the per-transaction leak. Because the counters update once per response, someone watching individual transactions learns one bit about that response: whether it was positive. Exact ratings stay hidden, but that bit is more than we want to give away. The fix is to stop writing one response per transaction — batch them, or aggregate before settling — which is a design change rather than a new primitive.

The second is that a survey needs to be a real object rather than a single global pair of counters. That means multiple concurrent surveys with owners, an open/closed state so results are only meaningful once, and a nullifier so one participant cannot answer twice. Nullifiers are the interesting piece here, since doing it without re-identifying people is exactly the kind of thing Compact's private state is for.

Last is UX. Requiring a local Docker proof server is fine for a demo and unacceptable for someone filling in a survey link. Wallet-side or hosted proving needs to be the default path before this goes in front of ordinary participants.
