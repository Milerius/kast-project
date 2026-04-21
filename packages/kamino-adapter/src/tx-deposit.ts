import { PublicKey, VersionedTransaction } from '@solana/web3.js';
import { SOLANA_SOL_MINT } from '@kast/shared';

// Thin wrapper around what the klend-sdk exposes at runtime. The concrete
// helper used is `KaminoAction.buildDepositTxns`; we inject a market-like
// object that exposes the helper so we can mock it in tests.
export type DepositBuilder = (args: {
  owner: PublicKey;
  amount: bigint;
  mint: string;
}) => Promise<VersionedTransaction[]>;

export type MarketForDeposit = {
  buildDepositTxns: DepositBuilder;
};

export async function buildDepositCollateralTx(args: {
  market: MarketForDeposit;
  owner: PublicKey;
  lamports: bigint;
}): Promise<VersionedTransaction[]> {
  if (args.lamports <= 0n) throw new Error('amount must be positive');
  return args.market.buildDepositTxns({
    owner: args.owner,
    amount: args.lamports,
    mint: SOLANA_SOL_MINT,
  });
}
