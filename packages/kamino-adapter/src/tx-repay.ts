import type { PublicKey, VersionedTransaction } from '@solana/web3.js';
import { SOLANA_USDC_MINT } from '@kast/shared';

export type MarketForRepay = {
  buildRepayTxns: (args: {
    owner: PublicKey;
    amount: bigint;
    mint: string;
    repayAll: boolean;
  }) => Promise<VersionedTransaction[]>;
};

export async function buildRepayTx(args: {
  market: MarketForRepay;
  owner: PublicKey;
  amount: bigint | 'all';
}): Promise<VersionedTransaction[]> {
  if (args.amount === 'all') {
    return args.market.buildRepayTxns({
      owner: args.owner,
      amount: 0n,
      mint: SOLANA_USDC_MINT,
      repayAll: true,
    });
  }
  if (args.amount <= 0n) throw new Error('amount must be positive');
  return args.market.buildRepayTxns({
    owner: args.owner,
    amount: args.amount,
    mint: SOLANA_USDC_MINT,
    repayAll: false,
  });
}
