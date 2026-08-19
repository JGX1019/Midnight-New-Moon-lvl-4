# Product Proposal

## What is the product, and who uses it?

[I WILL FILL THIS IN]

## Why Midnight specifically?

[I WILL FILL THIS IN — what does Midnight do that a transparent chain could not do well for this product?]

## Data Model

| Data Point | Type | Disclosed To |
|------------|------|--------------|
| `response_count` — total number of responses submitted | Public ledger (Counter) | Everyone |
| `positive_count` — how many responses were positive (rating 4-5) | Public ledger (Counter) | Everyone |
| `rating` — the participant's exact 1-5 answer | Private witness (circuit input) | No one |
| Satisfaction rate — derived from the two public counters | Derived public | Everyone |
| ZK proof of a valid response | ZK proof | Chain (verifies without reading the rating) |

[I WILL FILL IN / ADJUST THE ROWS]

## Mainnet Feasibility

[I WILL FILL THIS IN — is this realistic to reach Mainnet by Level 6?]
