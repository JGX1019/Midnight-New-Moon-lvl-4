/**
 * review.test.ts — Tests for the Anonymous Verified Reviews contract
 *
 * Tests cover:
 *  1. Circuit logic     — initMerchant / recordPurchase / submitReview behave
 *                         correctly, and invalid calls are rejected by the
 *                         circuit's own asserts
 *  2. State transitions — purchase and review counts accumulate correctly
 *                         across multiple buyers, and reviewCount can never
 *                         outrun purchaseCount
 *  3. Privacy model     — a buyer can prove they purchased without revealing
 *                         which purchase is theirs, forged membership proofs
 *                         are rejected, double-reviewing the same purchase
 *                         is rejected by the nullifier, and the buyer's
 *                         secret never appears in ledger state. The review
 *                         TEXT and RATING are deliberately public — that
 *                         half is checked too, since it's the point of the
 *                         product, not a leak.
 */

import {
  createConstructorContext,
  createCircuitContext,
  emptyZswapLocalState,
} from '@midnight-ntwrk/compact-runtime';
import { Contract, ledger, pureCircuits } from '../managed/review/contract/index.js';

const DUMMY_ADDRESS = '0'.repeat(64);
const DUMMY_KEY = '0'.repeat(64);

const SECRET_A = new Uint8Array(32).fill(0xaa);
const SECRET_B = new Uint8Array(32).fill(0xbb);
const SECRET_C = new Uint8Array(32).fill(0xcc);

type Path = { leaf: Uint8Array; path: { sibling: { field: bigint }; goes_left: boolean }[] };

// Never actually used to satisfy a real submitReview call — every test that
// calls submitReview overwrites pathBox.value with a genuine path fetched
// from ledger state first. It only exists so pathBox has a well-typed
// initial value before that happens.
const UNSET_PATH: Path = { leaf: new Uint8Array(32), path: [] };

/** Builds a Contract instance whose witnesses read from mutable boxes, so a
 * single instance can be reused across calls while the "current buyer"
 * changes from test to test. */
function buildContract(secretBox: { value: Uint8Array }, pathBox: { value: Path }) {
  return new Contract({
    userSecret: (ctx: any) => [ctx.privateState, secretBox.value],
    userPath: (ctx: any) => [ctx.privateState, pathBox.value],
  });
}

function freshState(contract: Contract<any>) {
  const ctx = createConstructorContext({}, DUMMY_ADDRESS);
  const init = contract.initialState(ctx);
  return { contractState: init.currentContractState, privateState: init.currentPrivateState };
}

function readLedger(contractState: any) {
  return ledger(contractState.data ?? contractState);
}

function run(contract: Contract<any>, state: any, priv: any, fn: (ctx: any, ...args: any[]) => any, ...args: any[]) {
  const ctx = createCircuitContext(DUMMY_ADDRESS, emptyZswapLocalState(DUMMY_KEY), state, priv);
  const result = fn(ctx, ...args);
  return { state: result.context.currentQueryContext.state, priv: result.context.currentPrivateState };
}

function deepClonePath(path: Path): Path {
  return {
    leaf: new Uint8Array(path.leaf),
    path: path.path.map((entry) => ({
      sibling: { field: entry.sibling.field },
      goes_left: entry.goes_left,
    })),
  };
}

/** Sets up a contract with the merchant initialised and one purchase
 * recorded for `secret`. Returns the state plus the genuine Merkle path for
 * that purchase, ready to hand to submitReview. */
function withOnePurchase(secret: Uint8Array) {
  const secretBox = { value: secret };
  const pathBox: { value: Path } = { value: UNSET_PATH };
  const contract = buildContract(secretBox, pathBox);
  let { contractState, privateState } = freshState(contract);

  ({ state: contractState, priv: privateState } = run(contract, contractState, privateState, contract.circuits.initMerchant));

  const commitment = pureCircuits.commitmentOf(secret);
  ({ state: contractState, priv: privateState } = run(
    contract,
    contractState,
    privateState,
    contract.circuits.recordPurchase,
    commitment,
  ));

  const path = readLedger(contractState).purchases.findPathForLeaf(commitment) as Path;
  return { contract, contractState, privateState, secretBox, pathBox, commitment, path };
}

describe('Anonymous Verified Reviews Contract', () => {
  describe('Circuit logic', () => {
    it('starts uninitialised with no purchases or reviews', () => {
      const contract = buildContract({ value: SECRET_A }, { value: UNSET_PATH });
      const { contractState } = freshState(contract);
      const state = readLedger(contractState);
      expect(state.initialized).toBe(false);
      expect(state.purchaseCount).toBe(0n);
      expect(state.reviewCount).toBe(0n);
    });

    it('initMerchant captures a merchant key and flips initialized to true', () => {
      const contract = buildContract({ value: SECRET_A }, { value: UNSET_PATH });
      const { contractState, privateState } = freshState(contract);
      const r = run(contract, contractState, privateState, contract.circuits.initMerchant);
      const state = readLedger(r.state);
      expect(state.initialized).toBe(true);
      expect(state.merchantKey).toBeInstanceOf(Uint8Array);
      expect(state.merchantKey.length).toBe(32);
    });

    it('initMerchant cannot be called a second time', () => {
      const contract = buildContract({ value: SECRET_A }, { value: UNSET_PATH });
      const { contractState, privateState } = freshState(contract);
      const r = run(contract, contractState, privateState, contract.circuits.initMerchant);
      expect(() => run(contract, r.state, r.priv, contract.circuits.initMerchant)).toThrow();
    });

    it('recordPurchase is rejected before the merchant is initialised', () => {
      const contract = buildContract({ value: SECRET_A }, { value: UNSET_PATH });
      const { contractState, privateState } = freshState(contract);
      const commitment = pureCircuits.commitmentOf(SECRET_A);
      expect(() => run(contract, contractState, privateState, contract.circuits.recordPurchase, commitment)).toThrow();
    });

    it('a genuine buyer can submit a review using their real purchase path', () => {
      const { contract, contractState, privateState, pathBox, path } = withOnePurchase(SECRET_A);
      pathBox.value = path;
      const r = run(contract, contractState, privateState, contract.circuits.submitReview, 'Great product, works as described.', 5n);
      const state = readLedger(r.state);
      expect(state.reviewCount).toBe(1n);
      expect(state.reviews.lookup(0n)).toBe('Great product, works as described.');
      expect(state.ratings.lookup(0n)).toBe(5n);
    });

    it('rejects a rating of 0 (below the valid range)', () => {
      const { contract, contractState, privateState, pathBox, path } = withOnePurchase(SECRET_A);
      pathBox.value = path;
      expect(() => run(contract, contractState, privateState, contract.circuits.submitReview, 'Bad.', 0n)).toThrow();
    });

    it('rejects a rating of 6 (above the valid range)', () => {
      const { contract, contractState, privateState, pathBox, path } = withOnePurchase(SECRET_A);
      pathBox.value = path;
      expect(() => run(contract, contractState, privateState, contract.circuits.submitReview, 'Great.', 6n)).toThrow();
    });

    it('rejects a review whose Merkle path does not resolve to the stored root', () => {
      const { contract, contractState, privateState, pathBox, path } = withOnePurchase(SECRET_A);
      const corrupted = deepClonePath(path);
      corrupted.path[0].sibling.field = corrupted.path[0].sibling.field + 1n;
      pathBox.value = corrupted;
      expect(() =>
        run(contract, contractState, privateState, contract.circuits.submitReview, 'Forged root attempt.', 5n),
      ).toThrow(/not a verified purchase/);
    });
  });

  describe('State transitions', () => {
    it('purchaseCount increments once per recorded purchase', () => {
      const secretBox = { value: SECRET_A };
      const contract = buildContract(secretBox, { value: UNSET_PATH });
      let { contractState, privateState } = freshState(contract);
      ({ state: contractState, priv: privateState } = run(contract, contractState, privateState, contract.circuits.initMerchant));

      for (const secret of [SECRET_A, SECRET_B, SECRET_C]) {
        const commitment = pureCircuits.commitmentOf(secret);
        ({ state: contractState, priv: privateState } = run(
          contract,
          contractState,
          privateState,
          contract.circuits.recordPurchase,
          commitment,
        ));
      }

      expect(readLedger(contractState).purchaseCount).toBe(3n);
    });

    it('multiple distinct buyers can each purchase and review independently', () => {
      const secretBox = { value: SECRET_A };
      const pathBox: { value: Path } = { value: UNSET_PATH };
      const contract = buildContract(secretBox, pathBox);
      let { contractState, privateState } = freshState(contract);
      ({ state: contractState, priv: privateState } = run(contract, contractState, privateState, contract.circuits.initMerchant));

      const commitmentA = pureCircuits.commitmentOf(SECRET_A);
      const commitmentB = pureCircuits.commitmentOf(SECRET_B);
      ({ state: contractState, priv: privateState } = run(
        contract,
        contractState,
        privateState,
        contract.circuits.recordPurchase,
        commitmentA,
      ));
      ({ state: contractState, priv: privateState } = run(
        contract,
        contractState,
        privateState,
        contract.circuits.recordPurchase,
        commitmentB,
      ));

      secretBox.value = SECRET_A;
      pathBox.value = readLedger(contractState).purchases.findPathForLeaf(commitmentA) as Path;
      ({ state: contractState, priv: privateState } = run(
        contract,
        contractState,
        privateState,
        contract.circuits.submitReview,
        'From buyer A.',
        4n,
      ));

      secretBox.value = SECRET_B;
      pathBox.value = readLedger(contractState).purchases.findPathForLeaf(commitmentB) as Path;
      ({ state: contractState, priv: privateState } = run(
        contract,
        contractState,
        privateState,
        contract.circuits.submitReview,
        'From buyer B.',
        2n,
      ));

      const state = readLedger(contractState);
      expect(state.purchaseCount).toBe(2n);
      expect(state.reviewCount).toBe(2n);
      expect(state.reviews.lookup(0n)).toBe('From buyer A.');
      expect(state.reviews.lookup(1n)).toBe('From buyer B.');
      expect(state.ratings.lookup(0n)).toBe(4n);
      expect(state.ratings.lookup(1n)).toBe(2n);
    });

    it('reviewCount never exceeds purchaseCount', () => {
      const { contract, contractState, privateState, pathBox, path } = withOnePurchase(SECRET_A);
      pathBox.value = path;
      const r = run(contract, contractState, privateState, contract.circuits.submitReview, 'Only one purchase exists.', 3n);
      const state = readLedger(r.state);
      expect(state.reviewCount).toBeLessThanOrEqual(state.purchaseCount);
    });
  });

  describe('Privacy model', () => {
    it('the ledger exposes exactly the documented public fields, and never a secret', () => {
      const contract = buildContract({ value: SECRET_A }, { value: UNSET_PATH });
      const { contractState } = freshState(contract);
      const state = readLedger(contractState);
      expect(Object.keys(state).sort()).toEqual(
        ['initialized', 'merchantKey', 'purchaseCount', 'purchases', 'ratings', 'reviewCount', 'reviews', 'spentNullifiers'].sort(),
      );
      expect((state as any).userSecret).toBeUndefined();
    });

    it('rejects a forged membership proof: another buyer cannot reuse your public commitment as their own path', () => {
      const { contract, contractState, privateState, pathBox, path } = withOnePurchase(SECRET_A);
      // Buyer B tries to submit a review using buyer A's genuine path (whose
      // leaf is A's public commitment), but the witness still supplies B's
      // secret. The circuit re-derives the expected commitment from B's own
      // secret, which will not match A's path.leaf.
      const forgedContract = buildContract({ value: SECRET_B }, { value: path });
      const forgedCtx = createCircuitContext(DUMMY_ADDRESS, emptyZswapLocalState(DUMMY_KEY), contractState, {});
      expect(() => forgedContract.circuits.submitReview(forgedCtx, 'Forged review.', 5n)).toThrow(
        /does not match your purchase commitment/,
      );
      // Sanity: the same path DOES work for the real owner of the secret.
      pathBox.value = path;
      expect(() =>
        run(contract, contractState, privateState, contract.circuits.submitReview, 'Legitimate review.', 5n),
      ).not.toThrow();
    });

    it('rejects a second review from the same purchase (nullifier reuse)', () => {
      const { contract, contractState, privateState, pathBox, path } = withOnePurchase(SECRET_A);
      pathBox.value = path;
      const r1 = run(contract, contractState, privateState, contract.circuits.submitReview, 'First review.', 5n);
      expect(() => run(contract, r1.state, r1.priv, contract.circuits.submitReview, 'Trying again.', 1n)).toThrow(
        /already been reviewed/,
      );
    });

    it('two different purchases produce two distinct, non-colliding nullifiers', () => {
      const secretBox = { value: SECRET_A };
      const pathBox: { value: Path } = { value: UNSET_PATH };
      const contract = buildContract(secretBox, pathBox);
      let { contractState, privateState } = freshState(contract);
      ({ state: contractState, priv: privateState } = run(contract, contractState, privateState, contract.circuits.initMerchant));

      const commitmentA = pureCircuits.commitmentOf(SECRET_A);
      const commitmentB = pureCircuits.commitmentOf(SECRET_B);
      ({ state: contractState, priv: privateState } = run(
        contract,
        contractState,
        privateState,
        contract.circuits.recordPurchase,
        commitmentA,
      ));
      ({ state: contractState, priv: privateState } = run(
        contract,
        contractState,
        privateState,
        contract.circuits.recordPurchase,
        commitmentB,
      ));

      secretBox.value = SECRET_A;
      pathBox.value = readLedger(contractState).purchases.findPathForLeaf(commitmentA) as Path;
      ({ state: contractState, priv: privateState } = run(
        contract,
        contractState,
        privateState,
        contract.circuits.submitReview,
        'A.',
        5n,
      ));

      secretBox.value = SECRET_B;
      pathBox.value = readLedger(contractState).purchases.findPathForLeaf(commitmentB) as Path;
      ({ state: contractState, priv: privateState } = run(
        contract,
        contractState,
        privateState,
        contract.circuits.submitReview,
        'B.',
        4n,
      ));

      // Two successful reviews with no collision means both nullifiers were
      // accepted as distinct entries in the set.
      expect(readLedger(contractState).spentNullifiers.size()).toBe(2n);
    });

    it("a purchase commitment does not itself appear as a spent nullifier (domain separation)", () => {
      const { contract, contractState, privateState, pathBox, path, commitment } = withOnePurchase(SECRET_A);
      pathBox.value = path;
      const r = run(contract, contractState, privateState, contract.circuits.submitReview, 'Domain separated.', 5n);
      const state = readLedger(r.state);
      // commitmentOf(secret) and the review nullifier are hashed with
      // different domain tags ("purchase-v1" vs "review-v1"), so an
      // observer who knows the public commitment still cannot find it in
      // the nullifier set — the two values are unrelated-looking.
      expect(state.spentNullifiers.member(commitment)).toBe(false);
    });

    it('the private secret is never written into contract state', () => {
      const { contract, contractState, privateState, pathBox, path } = withOnePurchase(SECRET_A);
      pathBox.value = path;
      const r = run(contract, contractState, privateState, contract.circuits.submitReview, 'No secret leakage.', 5n);
      const stateStr = r.state?.toString() ?? '';
      expect(stateStr).not.toContain('userSecret');
      expect(stateStr).not.toContain(Buffer.from(SECRET_A).toString('hex'));
    });

    it('the review text and rating ARE public — that half is the product, not a leak', () => {
      const { contract, contractState, privateState, pathBox, path } = withOnePurchase(SECRET_A);
      pathBox.value = path;
      const r = run(
        contract,
        contractState,
        privateState,
        contract.circuits.submitReview,
        'Fast shipping, exactly as pictured.',
        5n,
      );
      const state = readLedger(r.state);
      // Unlike the Level 3 survey (where the rating stays hidden), here the
      // whole point is that anyone can read the review back.
      expect(state.reviews.lookup(0n)).toBe('Fast shipping, exactly as pictured.');
      expect(state.ratings.lookup(0n)).toBe(5n);
    });
  });
});
