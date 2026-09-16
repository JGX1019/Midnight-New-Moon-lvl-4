# How to Use Anonymous Verified Reviews

## What You Need

- A Midnight-compatible wallet browser extension (Lace, 1AM, or any wallet implementing the Midnight DApp Connector API), connected to the **Preprod** network.
- Some tDUST in that wallet, to pay transaction fees. Get it from the [Preprod faucet](https://faucet.preprod.midnight.network) if you're empty.
- Your wallet's proof server setting pointed at a running local proof server (`http://127.0.0.1:6300`) — proofs are generated on your own machine, not sent to us.

## Step-by-Step Guide

There are two roles in this app: a **merchant** (the person selling a product, who records purchases) and a **buyer** (the person who bought it and wants to leave a review). The same wallet can play either role — in a real deployment, only the merchant would be shown the "Record Purchase" screen, but for this demo both panels are visible so you can try the whole flow yourself.

### If you're trying this for the first time (playing both roles)

1. **Connect your wallet.** Click "Connect Wallet" in the top right. Approve the connection request in your wallet's popup.
2. **Deploy a new review contract.** Click "Deploy New Review Contract (become the merchant)". This also automatically registers you as that contract's merchant — you're now the only account allowed to record purchases on it.
3. **Switch to the "I'm a Buyer" tab** and click "Generate New Purchase Code". This creates a random secret in your browser and shows you its public commitment (a scrambled version of that secret — the actual secret never leaves your browser).
4. **Copy that commitment** and switch to the "I'm the Merchant" tab. Paste it into "Buyer's purchase commitment" and click "Record Purchase". This is the step a real merchant would do after confirming an order shipped.
5. **Switch back to the "I'm a Buyer" tab.** Your purchase code should now show "Use for review" instead of being greyed out. Click it, write your review, pick a star rating, and click "Submit Anonymous Review".
6. Watch the review appear at the bottom of the page, in the public reviews list, with no author name attached.

### If you're joining someone else's product

1. Connect your wallet.
2. Paste the product's contract address into "Or join an existing product's reviews" and click "Join".
3. If you already have a purchase code for this contract (given to you by the merchant after they recorded your purchase), it'll show up under the buyer tab, ready to review.
4. If you don't have one yet, generate a purchase code, send the commitment to the merchant however they've asked for it (email, checkout page, etc.), and wait for them to confirm it's recorded before trying to review.

## What Gets Proved (and What Stays Private)

| | Public (anyone can see it) | Private (never leaves your browser) |
|---|---|---|
| Your purchase | That *some* commitment exists in the purchases list | Which commitment is yours, and the secret behind it |
| Your review | The exact text and star rating you wrote | — (there's nothing to hide here, the review is meant to be read) |
| Your identity | The wallet address that submitted the transaction | Any link between that wallet and which purchase it reviewed |

When you submit a review, your browser builds a zero-knowledge proof that says: "I know a secret whose commitment is somewhere in this merchant's published purchase list, and I haven't used this specific secret to review before." The contract checks that proof and accepts the review if it's valid — at no point does the merchant, another buyer, or anyone watching the chain learn which purchase produced which review.

## Troubleshooting

**"No Midnight-compatible wallet found."**
Install a Midnight wallet extension and reload the page. If you just installed one, give it a few seconds — extensions can take a moment to inject themselves into the page.

**"Not enough tDUST to pay the transaction fee."**
Open your wallet and generate/request tDUST, then retry. On Preprod this usually means visiting the faucet if your balance is at zero.

**"Proof generation failed."**
Check that your wallet's proof server setting points at `http://127.0.0.1:6300` and that a proof server is actually running there (`docker run --rm -p 6300:6300 midnightntwrk/proof-server:8.1.0`). A cold proof server can take ~30 seconds to finish downloading its parameters before it's ready.

**"The merchant has not recorded this purchase yet."**
This means the commitment tied to your purchase code isn't in the on-chain purchases list yet. Double check the merchant recorded the exact commitment you gave them, and that you're both looking at the same contract address.

**"This purchase has already been reviewed."**
Each purchase code can only produce one review, by design — that's the whole point of the nullifier. If you want to review again, you'll need a new purchase (and a new code) recorded by the merchant.

**My review didn't show up after submitting.**
Click "Refresh". Indexer updates can lag the transaction by a few seconds even after it's confirmed.
