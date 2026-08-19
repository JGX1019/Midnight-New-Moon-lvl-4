/**
 * contract.ts — deploy/join the survey contract and expose typed circuit
 * call helpers for the frontend.
 *
 * Uses the browser-side providers from providers.ts (backed by the
 * connected wallet) so proving, balancing, and submission all happen
 * through the wallet rather than a Node.js script.
 */
import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { deployContract, findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import { Contract, ledger } from '../contract/survey.js';
import { buildProviders } from './providers.js';

// ZK assets are served as static files from public/managed/survey — this must
// be re-copied (npm run copy-assets) every time the contract is recompiled.
// A stale copy here compiles and deploys fine but proves against the old
// circuit shape and fails opaquely at proof time.
const ZK_ASSETS_PATH = '/managed/survey';

export interface SurveyTallies {
  responses: bigint;
  positives: bigint;
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

function buildCompiledContract() {
  return CompiledContract.make('survey', Contract).pipe(
    CompiledContract.withVacantWitnesses,
    CompiledContract.withCompiledFileAssets(ZK_ASSETS_PATH),
  );
}

/** Deploys a fresh survey contract. */
export async function deploySurvey(connectedAPI: ConnectedAPI) {
  const providers = await buildProviders(connectedAPI);
  const compiledContract = buildCompiledContract();
  return withTimeout(
    deployContract(providers as any, { compiledContract: compiledContract as any, args: [] } as any),
    120_000,
    'Deploy',
  );
}

/** Connects to an already-deployed survey contract by address. */
export async function joinSurvey(connectedAPI: ConnectedAPI, contractAddress: string) {
  const providers = await buildProviders(connectedAPI);
  const compiledContract = buildCompiledContract();
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
 * Submits a survey response. `rating` is a PRIVATE circuit input: it is
 * consumed while generating the proof locally in the browser and is never
 * included in the submitted transaction, never logged, and never returned
 * from this function. Only the public tallies change on-chain.
 */
export async function submitResponse(deployedContract: any, rating: bigint) {
  const result: any = await withTimeout(
    deployedContract.callTx.submit_response(rating),
    120_000,
    'Submit response',
  );
  return result.public;
}

/** Resets both public tallies to zero, starting a new survey round. */
export async function resetSurvey(deployedContract: any) {
  const result: any = await withTimeout(deployedContract.callTx.reset_survey(), 120_000, 'Reset survey');
  return result.public;
}

/** Reads the public tallies (response count and positive count) from the ledger. */
export async function readTallies(connectedAPI: ConnectedAPI, contractAddress: string): Promise<SurveyTallies | null> {
  const providers = await buildProviders(connectedAPI);
  const state = await providers.publicDataProvider.queryContractState(contractAddress as any);
  if (!state) return null;
  const publicState = ledger((state as any).data ?? state);
  return { responses: publicState.response_count, positives: publicState.positive_count };
}
