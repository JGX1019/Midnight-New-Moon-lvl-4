/**
 * contract.ts — deploy/join the review contract, plus typed helpers for the
 * merchant flow (initMerchant, recordPurchase) and the buyer flow
 * (submitReview), and for reading back the public reviews.
 *
 * Uses the browser-side providers from providers.ts (backed by the
 * connected wallet) so proving, balancing, and submission all happen
 * through the wallet rather than a Node.js script.
 *
 * WITNESS HANDLING — this contract is different from Level 3's survey in
 * one important way: it has REAL witnesses (userSecret, userPath), not
 * vacant ones. Witnesses are synchronous functions the proving pipeline
 * calls internally, so the buyer's secret and their Merkle path have to be
 * resolved *before* we build the CompiledContract for a submitReview call.
 * `buildCompiledContractForReview` takes them as plain arguments and
 * closes over them in the witness functions. initMerchant/recordPurchase
 * never invoke either witness, so a placeholder witness pair is fine there
 * — see buildCompiledContractForMerchant.
 */
import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { deployContract, findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import { Contract, ledger, pureCircuits } from '../contract/review.js';
import { buildProviders } from './providers.js';

// ZK assets are served as static files from public/managed/review — this must
// be re-copied (npm run copy-assets) every time the contract is recompiled.
// A stale copy here compiles and deploys fine but proves against the old
// circuit shape and fails opaquely at proof time.
const ZK_ASSETS_PATH = '/managed/review';

const PLACEHOLDER_PATH = { leaf: new Uint8Array(32), path: [] as never[] };

export interface ReviewEntry {
  id: bigint;
  text: string;
  rating: number;
}

export interface ReviewState {
  initialized: boolean;
  merchantKey: string | null;
  purchaseCount: bigint;
  reviewCount: bigint;
  reviews: ReviewEntry[];
}

/**
 * Client-side timeout wrapper. callTx / deployContract can hang
 * indefinitely waiting on indexer finalization with zero UI feedback
 * otherwise — this doesn't affect the actual transaction, it just stops a
 * spinner from spinning forever with no explanation.
 */
function withTimeout<T>(promise: Promise<T>, ms = 120_000, label = 'operation'): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * Used for deploy / join / initMerchant / recordPurchase — none of these
 * circuits read userSecret() or userPath(), so the witnesses never
 * actually execute. The placeholder exists purely to satisfy the
 * contract's declared Witnesses shape.
 */
function buildCompiledContractIdle() {
  return CompiledContract.make('review', Contract).pipe(
    CompiledContract.withWitnesses({
      userSecret: (ctx: any) => [ctx.privateState, new Uint8Array(32)],
      userPath: (ctx: any) => [ctx.privateState, PLACEHOLDER_PATH],
    } as any),
    CompiledContract.withCompiledFileAssets(ZK_ASSETS_PATH),
  );
}

/**
 * Used specifically for submitReview. `secret` and `path` are resolved by
 * the caller ahead of time (secret from local storage, path fetched from
 * public ledger state) and closed over here so the proving pipeline gets
 * them synchronously when it calls the witnesses.
 */
function buildCompiledContractForReview(secret: Uint8Array, path: unknown) {
  return CompiledContract.make('review', Contract).pipe(
    CompiledContract.withWitnesses({
      userSecret: (ctx: any) => [ctx.privateState, secret],
      userPath: (ctx: any) => [ctx.privateState, path],
    } as any),
    CompiledContract.withCompiledFileAssets(ZK_ASSETS_PATH),
  );
}

/** Deploys a fresh review contract and immediately initialises the caller as its merchant. */
export async function deployReviewContract(connectedAPI: ConnectedAPI) {
  const providers = await buildProviders(connectedAPI);
  const compiledContract = buildCompiledContractIdle();
  const deployed = await withTimeout(
    deployContract(providers as any, { compiledContract: compiledContract as any, args: [] } as any),
    120_000,
    'Deploy',
  );
  await withTimeout((deployed as any).callTx.initMerchant(), 120_000, 'Initialize merchant');
  return deployed;
}

/** Connects to an already-deployed review contract by address. */
export async function joinReviewContract(connectedAPI: ConnectedAPI, contractAddress: string) {
  const providers = await buildProviders(connectedAPI);
  const compiledContract = buildCompiledContractIdle();
  return withTimeout(
    findDeployedContract(providers as any, {
      contractAddress,
      compiledContract: compiledContract as any,
    } as any),
    120_000,
    'Join',
  );
}

/**
 * Merchant-only: records a purchase commitment. `buyerCommitment` is a
 * value the merchant received from the buyer out of band (shown at
 * checkout, emailed, etc) — see `deriveBuyerSecret` / `commitmentFor` for
 * how a buyer computes their own commitment without the merchant ever
 * seeing the secret behind it.
 */
export async function recordPurchase(deployedContract: any, buyerCommitment: Uint8Array) {
  const result: any = await withTimeout(
    deployedContract.callTx.recordPurchase(buyerCommitment),
    120_000,
    'Record purchase',
  );
  return result.public;
}

/**
 * Submits a review. `reviewText` and `rating` are PUBLIC circuit
 * parameters — they are meant to be read, and land on-chain exactly as
 * given. `secret` is a PRIVATE circuit input: it is consumed only while
 * generating the proof locally in the browser, never included in the
 * submitted transaction, never logged, and never returned from this
 * function.
 */
export async function submitReview(
  connectedAPI: ConnectedAPI,
  contractAddress: string,
  secret: Uint8Array,
  reviewText: string,
  rating: bigint,
) {
  const providers = await buildProviders(connectedAPI);
  const commitment = pureCircuits.commitmentOf(secret);
  const state = await providers.publicDataProvider.queryContractState(contractAddress as any);
  if (!state) throw new Error('Contract not found — check the address and try again.');
  const publicState = ledger((state as any).data ?? state);
  const path = publicState.purchases.findPathForLeaf(commitment);
  if (!path) {
    throw new Error(
      'No purchase commitment found for your secret on this contract. Ask the merchant to record your purchase first.',
    );
  }

  const compiledContract = buildCompiledContractForReview(secret, path);
  const deployed = await withTimeout(
    findDeployedContract(providers as any, {
      contractAddress,
      compiledContract: compiledContract as any,
    } as any),
    120_000,
    'Connect to contract',
  );
  const result: any = await withTimeout(
    (deployed as any).callTx.submitReview(reviewText, rating),
    120_000,
    'Submit review',
  );
  return result.public;
}

/** Computes the purchase commitment for a given secret — a pure, local computation, no chain access. */
export function commitmentFor(secret: Uint8Array): Uint8Array {
  return pureCircuits.commitmentOf(secret);
}

/** Generates a fresh random 32-byte buyer secret. Never sent anywhere — see storage helpers in the component. */
export function generateSecret(): Uint8Array {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytes;
}

/** Reads the full public state of a review contract: counts, merchant key, and every posted review. */
export async function readReviewState(connectedAPI: ConnectedAPI, contractAddress: string): Promise<ReviewState | null> {
  const providers = await buildProviders(connectedAPI);
  const state = await providers.publicDataProvider.queryContractState(contractAddress as any);
  if (!state) return null;
  const publicState = ledger((state as any).data ?? state);

  const reviews: ReviewEntry[] = [];
  for (const [id, text] of publicState.reviews) {
    const rating = publicState.ratings.member(id) ? Number(publicState.ratings.lookup(id)) : 0;
    reviews.push({ id, text, rating });
  }
  reviews.sort((a, b) => Number(a.id) - Number(b.id));

  return {
    initialized: publicState.initialized,
    merchantKey: publicState.initialized ? toHexString(publicState.merchantKey) : null,
    purchaseCount: publicState.purchaseCount,
    reviewCount: publicState.reviewCount,
    reviews,
  };
}

function toHexString(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
