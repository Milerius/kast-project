import { VersionedTransaction, TransactionMessage, PublicKey, type Signer } from '@solana/web3.js';
import type { BridgeRoute, BridgeTxBundle, EvmTransactionRequest, Quote } from './adapter.js';
import {
  computeSwiftOrderHash,
  extractEvmRandomKey,
  extractSolanaRandomKey,
  type SwiftHashableQuote,
} from './order-hash.js';

type RawQuote = SwiftHashableQuote & {
  type?: string;
  swiftVersion?: 'V1' | 'V2';
  fromChain: 'solana' | 'base';
  toChain: 'solana' | 'base';
};

type SolanaIx = {
  programId: PublicKey;
  data: Buffer | Uint8Array;
};

type SdkLike = {
  createSwapFromSolanaInstructions: (
    quote: unknown,
    fromAddress: string,
    toAddress: string,
    referrer: string | null,
  ) => Promise<{
    instructions: ReadonlyArray<SolanaIx>;
    signers: unknown[];
    lookupTables: unknown[];
  }>;
  getSwapFromEvmTxPayload: (
    quote: unknown,
    fromAddress: string,
    toAddress: string,
    referrer: string | null,
    chainId: number,
  ) =>
    | { approve: EvmTransactionRequest; swap: EvmTransactionRequest }
    | Promise<{ approve: EvmTransactionRequest; swap: EvmTransactionRequest }>;
};

function routeOf(raw: RawQuote): BridgeRoute {
  return raw.type === 'SWIFT' ? 'SWIFT' : 'FAST_MCTP';
}

// Our hash extraction & keccak layout only match Swift V1. V2 uses a
// different calldata selector + 272-byte order struct. We track orders by
// source tx signature anyway (Mayan explorer indexes by sig), so it's safe
// to skip the hash when it's not computable.
function canComputeOrderHash(raw: RawQuote): boolean {
  return raw.type === 'SWIFT' && raw.swiftVersion !== 'V2';
}

export async function buildBridgeTx(
  sdk: SdkLike,
  quote: Quote,
  addresses: { fromAddress: string; toAddress: string },
  referrer: string | null = null,
): Promise<BridgeTxBundle> {
  const raw = quote.raw as RawQuote;
  const route = routeOf(raw);

  if (raw.fromChain === 'solana') {
    const { instructions, signers, lookupTables } = await sdk.createSwapFromSolanaInstructions(
      raw,
      addresses.fromAddress,
      addresses.toAddress,
      referrer,
    );
    const message = new TransactionMessage({
      payerKey: new PublicKey(addresses.fromAddress),
      recentBlockhash: '11111111111111111111111111111111',
      instructions: instructions as never,
    }).compileToV0Message(lookupTables as never);
    const tx = new VersionedTransaction(message);
    const extraSigners = signers as Signer[];
    if (route === 'SWIFT' && canComputeOrderHash(raw)) {
      const randomKeyHex = extractSolanaRandomKey(instructions);
      const orderHash = computeSwiftOrderHash(
        raw,
        addresses.fromAddress,
        addresses.toAddress,
        referrer,
        randomKeyHex,
      );
      return { chain: 'solana', route, txs: [tx], extraSigners, orderHash };
    }
    return { chain: 'solana', route, txs: [tx], extraSigners };
  }

  const payload = await sdk.getSwapFromEvmTxPayload(
    raw,
    addresses.fromAddress,
    addresses.toAddress,
    referrer,
    8453,
  );
  if (route === 'SWIFT' && canComputeOrderHash(raw)) {
    const randomKeyHex = extractEvmRandomKey(payload.swap.data);
    const orderHash = computeSwiftOrderHash(
      raw,
      addresses.fromAddress,
      addresses.toAddress,
      referrer,
      randomKeyHex,
    );
    return { chain: 'base', route, txs: [payload.approve, payload.swap], orderHash };
  }
  return { chain: 'base', route, txs: [payload.approve, payload.swap] };
}
