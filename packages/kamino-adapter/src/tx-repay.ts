import { PublicKey, VersionedTransaction } from '@solana/web3.js';
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
  const repayAll = args.amount === 'all';
  if (!repayAll && args.amount <= 0n) throw new Error('amount must be positive');
  return args.market.buildRepayTxns({
    owner: args.owner,
    amount: repayAll ? 0n : (args.amount as bigint),
    mint: SOLANA_USDC_MINT,
    repayAll,
  });
}
