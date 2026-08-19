/**
 * survey.test.ts — Tests for the Anonymous Feedback Survey contract
 *
 * Tests cover:
 *  1. Circuit logic     — submit_response and reset_survey behave correctly,
 *                         and invalid ratings are rejected by the asserts
 *  2. State transitions — tallies accumulate correctly across many responses
 *  3. Privacy model     — the private `rating` never appears in ledger state,
 *                         and different ratings within the same bucket are
 *                         indistinguishable on the public ledger
 */

import {
  createConstructorContext,
  createCircuitContext,
  emptyZswapLocalState,
} from '@midnight-ntwrk/compact-runtime';
import { Contract, ledger } from '../managed/survey/contract/index.js';

const DUMMY_ADDRESS = '0'.repeat(64);
const DUMMY_KEY = '0'.repeat(64);

function freshState() {
  const contract = new Contract({});
  const ctx = createConstructorContext({}, DUMMY_ADDRESS);
  const init = contract.initialState(ctx);
  return { contract, contractState: init.currentContractState, privateState: init.currentPrivateState };
}

/** Reads public tallies from either an initial ContractState or a post-circuit ChargedState. */
function getTallies(contractState: any): { responses: bigint; positives: bigint } {
  const state = ledger(contractState.data ?? contractState);
  return { responses: state.response_count, positives: state.positive_count };
}

function callSubmit(contract: Contract<any>, contractState: any, privateState: any, rating: bigint) {
  const ctx = createCircuitContext(DUMMY_ADDRESS, emptyZswapLocalState(DUMMY_KEY), contractState, privateState);
  const result = contract.circuits.submit_response(ctx, rating);
  return { chargedState: result.context.currentQueryContext.state, privateState: result.context.currentPrivateState };
}

function callReset(contract: Contract<any>, contractState: any, privateState: any) {
  const ctx = createCircuitContext(DUMMY_ADDRESS, emptyZswapLocalState(DUMMY_KEY), contractState, privateState);
  const result = contract.circuits.reset_survey(ctx);
  return { chargedState: result.context.currentQueryContext.state, privateState: result.context.currentPrivateState };
}

/** Submits a whole list of ratings in sequence, returning the final state. */
function submitAll(ratings: bigint[]) {
  const { contract, contractState, privateState } = freshState();
  let state: any = contractState;
  let priv: any = privateState;
  for (const rating of ratings) {
    const r = callSubmit(contract, state, priv, rating);
    state = r.chargedState;
    priv = r.privateState;
  }
  return { contract, state, priv };
}

describe('Anonymous Feedback Survey Contract', () => {
  describe('Circuit logic', () => {
    it('starts with no responses and no positives', () => {
      const { contractState } = freshState();
      expect(getTallies(contractState)).toEqual({ responses: 0n, positives: 0n });
    });

    it('counts a positive rating (5) as both a response and a positive', () => {
      const { state } = submitAll([5n]);
      expect(getTallies(state)).toEqual({ responses: 1n, positives: 1n });
    });

    it('counts a negative rating (2) as a response but not a positive', () => {
      const { state } = submitAll([2n]);
      expect(getTallies(state)).toEqual({ responses: 1n, positives: 0n });
    });

    it('treats 4 as the lower boundary of a positive rating', () => {
      const { state } = submitAll([4n]);
      expect(getTallies(state)).toEqual({ responses: 1n, positives: 1n });
    });

    it('treats 3 as the upper boundary of a non-positive rating', () => {
      const { state } = submitAll([3n]);
      expect(getTallies(state)).toEqual({ responses: 1n, positives: 0n });
    });

    it('rejects a rating of 0 (below the valid range)', () => {
      const { contract, contractState, privateState } = freshState();
      expect(() => callSubmit(contract, contractState, privateState, 0n)).toThrow();
    });

    it('rejects a rating of 6 (above the valid range)', () => {
      const { contract, contractState, privateState } = freshState();
      expect(() => callSubmit(contract, contractState, privateState, 6n)).toThrow();
    });

    it('reset_survey clears both tallies back to zero', () => {
      const { contract, state, priv } = submitAll([5n, 1n, 4n]);
      const r = callReset(contract, state, priv);
      expect(getTallies(r.chargedState)).toEqual({ responses: 0n, positives: 0n });
    });
  });

  describe('State transitions', () => {
    it('accumulates responses and positives across many submissions', () => {
      // 5,4 are positive; 1,2,3 are not => 5 responses, 2 positives
      const { state } = submitAll([5n, 1n, 4n, 2n, 3n]);
      expect(getTallies(state)).toEqual({ responses: 5n, positives: 2n });
    });

    it('handles an all-positive survey round', () => {
      const { state } = submitAll([4n, 5n, 5n, 4n]);
      expect(getTallies(state)).toEqual({ responses: 4n, positives: 4n });
    });

    it('handles an all-negative survey round', () => {
      const { state } = submitAll([1n, 2n, 3n, 1n]);
      expect(getTallies(state)).toEqual({ responses: 4n, positives: 0n });
    });

    it('accepts new responses after a reset', () => {
      const { contract, state, priv } = submitAll([5n, 5n]);
      const afterReset = callReset(contract, state, priv);
      const afterNew = callSubmit(contract, afterReset.chargedState, afterReset.privateState, 2n);
      expect(getTallies(afterNew.chargedState)).toEqual({ responses: 1n, positives: 0n });
    });

    it('never lets positive_count exceed response_count', () => {
      const { state } = submitAll([5n, 3n, 4n, 1n, 5n, 2n]);
      const { responses, positives } = getTallies(state);
      expect(positives).toBeLessThanOrEqual(responses);
    });
  });

  describe('Privacy model — private ratings are never exposed', () => {
    it('ledger exposes only the two public tallies, not the rating', () => {
      const { contractState } = freshState();
      const publicState = ledger(contractState.data);
      expect(Object.keys(publicState).sort()).toEqual(['positive_count', 'response_count']);
      expect((publicState as any).rating).toBeUndefined();
    });

    it('ratings 4 and 5 are indistinguishable on the public ledger', () => {
      const withFour = submitAll([4n]);
      const withFive = submitAll([5n]);
      expect(getTallies(withFour.state)).toEqual(getTallies(withFive.state));
    });

    it('ratings 1, 2 and 3 are indistinguishable on the public ledger', () => {
      const withOne = submitAll([1n]);
      const withTwo = submitAll([2n]);
      const withThree = submitAll([3n]);
      expect(getTallies(withOne.state)).toEqual(getTallies(withTwo.state));
      expect(getTallies(withTwo.state)).toEqual(getTallies(withThree.state));
    });

    it('different rating sequences with the same bucket profile are indistinguishable', () => {
      // Both rounds: 3 responses, 2 positive — but entirely different exact ratings.
      const roundA = submitAll([4n, 5n, 1n]);
      const roundB = submitAll([5n, 4n, 3n]);
      expect(getTallies(roundA.state)).toEqual(getTallies(roundB.state));
    });

    it('the rating value is not serialised into the contract state', () => {
      const { state } = submitAll([5n]);
      const stateStr = state?.toString() ?? '';
      expect(stateStr).not.toContain('rating');
    });
  });
});
