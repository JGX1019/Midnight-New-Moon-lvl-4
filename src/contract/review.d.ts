import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type Witnesses<PS> = {
  userSecret(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  userPath(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, { leaf: Uint8Array,
                                                                         path: { sibling: { field: bigint
                                                                                          },
                                                                                 goes_left: boolean
                                                                               }[]
                                                                       }];
}

export type ImpureCircuits<PS> = {
  initMerchant(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  recordPurchase(context: __compactRuntime.CircuitContext<PS>,
                 buyerCommitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  submitReview(context: __compactRuntime.CircuitContext<PS>,
               reviewText_0: string,
               rating_0: bigint): __compactRuntime.CircuitResults<PS, []>;
}

export type ProvableCircuits<PS> = {
  initMerchant(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  recordPurchase(context: __compactRuntime.CircuitContext<PS>,
                 buyerCommitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  submitReview(context: __compactRuntime.CircuitContext<PS>,
               reviewText_0: string,
               rating_0: bigint): __compactRuntime.CircuitResults<PS, []>;
}

export type PureCircuits = {
  commitmentOf(secret_0: Uint8Array): Uint8Array;
}

export type Circuits<PS> = {
  commitmentOf(context: __compactRuntime.CircuitContext<PS>,
               secret_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  initMerchant(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  recordPurchase(context: __compactRuntime.CircuitContext<PS>,
                 buyerCommitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  submitReview(context: __compactRuntime.CircuitContext<PS>,
               reviewText_0: string,
               rating_0: bigint): __compactRuntime.CircuitResults<PS, []>;
}

export type Ledger = {
  readonly merchantKey: Uint8Array;
  readonly initialized: boolean;
  purchases: {
    isFull(): boolean;
    checkRoot(rt_0: { field: bigint }): boolean;
    root(): __compactRuntime.MerkleTreeDigest;
    firstFree(): bigint;
    pathForLeaf(index_0: bigint, leaf_0: Uint8Array): __compactRuntime.MerkleTreePath<Uint8Array>;
    findPathForLeaf(leaf_0: Uint8Array): __compactRuntime.MerkleTreePath<Uint8Array> | undefined
  };
  readonly purchaseCount: bigint;
  readonly reviewCount: bigint;
  spentNullifiers: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>
  };
  reviews: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: bigint): boolean;
    lookup(key_0: bigint): string;
    [Symbol.iterator](): Iterator<[bigint, string]>
  };
  ratings: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: bigint): boolean;
    lookup(key_0: bigint): bigint;
    [Symbol.iterator](): Iterator<[bigint, bigint]>
  };
}

export type ContractReferenceLocations = any;

export declare const contractReferenceLocations : ContractReferenceLocations;

export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  provableCircuits: ProvableCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>): __compactRuntime.ConstructorResult<PS>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;
