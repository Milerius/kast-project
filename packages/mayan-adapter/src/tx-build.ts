import { VersionedTransaction, TransactionMessage, PublicKey } from '@solana/web3.js';
import type { BridgeTxBundle, Quote } from './adapter.js';

type RawQuote = { fromChain: 'solana' | 'base'; toChain: 'solana' | 'base' };

type SdkLike = {
  createSwapFromSolanaInstructions: (
    quote: unknown,
    fromAddress: string,
    toAddress: string,
    referrer: Record<string, string> | null,
    connection: unknown,
  ) => Promise<{
    instructions: unknown[];
    signers: unknown[];
    lookupTables: unknown[];
  }>;
  getSwapFromEvmTxPayload: (
    quote: unknown,
    fromAddress: string,
    toAddress: string,
    referrer: Record<string, string> | null,
    chainId: number,
    rpc: unknown,
    permit: unknown,
  ) => Promise<{
    approve: { to: `0x${string}`; data: `0x${string}`; value: bigint; chainId: number };
    swap: { to: `0x${string}`; data: `0x${string}`; value: bigint; chainId: number };
  }>;
  deriveOrderHash: (quote: unknown) => string;
};

export async function buildBridgeTx(
  sdk: SdkLike,
  quote: Quote,
  addresses: { fromAddress: string; toAddress: string },
): Promise<BridgeTxBundle> {
  const raw = quote.raw as RawQuote;
  const orderHash = sdk.deriveOrderHash(raw);

  if (raw.fromChain === 'solana') {
    const { instructions, lookupTables } = await sdk.createSwapFromSolanaInstructions(
      raw,
      addresses.fromAddress,
      addresses.toAddress,
      null,
      null,
    );
    const message = new TransactionMessage({
      payerKey: new PublicKey(addresses.fromAddress),
      recentBlockhash: '11111111111111111111111111111111',
      instructions: instructions as never,
    }).compileToV0Message(lookupTables as never);
    const tx = new VersionedTransaction(message);
    return { chain: 'solana', txs: [tx], orderHash };
  }

  const payload = await sdk.getSwapFromEvmTxPayload(
    raw,
    addresses.fromAddress,
    addresses.toAddress,
    null,
    8453,
    null,
    null,
  );
  return {
    chain: 'base',
    txs: [payload.approve, payload.swap],
    orderHash,
  };
}
