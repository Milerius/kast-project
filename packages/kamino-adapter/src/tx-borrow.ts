import { PublicKey, VersionedTransaction } from '@solana/web3.js';
import { SOLANA_USDC_MINT } from '@kast/shared';

export type MarketForBorrow = {
  buildBorrowTxns: (args: {
    owner: PublicKey;
    amount: bigint;
    mint: string;
  }) => Promise<VersionedTransaction[]>;
};

export async function buildBorrowTx(args: {
  market: MarketForBorrow;
  owner: PublicKey;
  amountUsdc: bigint;
}): Promise<VersionedTransaction[]> {
  if (args.amountUsdc <= 0n) throw new Error('amount must be positive');
  return args.market.buildBorrowTxns({
    owner: args.owner,
    amount: args.amountUsdc,
    mint: SOLANA_USDC_MINT,
  });
}
