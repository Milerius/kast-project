import { PublicKey, VersionedTransaction } from '@solana/web3.js';
import { SOLANA_SOL_MINT } from '@kast/shared';

export type MarketForWithdraw = {
  buildWithdrawTxns: (args: {
    owner: PublicKey;
    amount: bigint;
    mint: string;
    withdrawAll: boolean;
  }) => Promise<VersionedTransaction[]>;
};

export async function buildWithdrawCollateralTx(args: {
  market: MarketForWithdraw;
  owner: PublicKey;
  lamports: bigint | 'all';
}): Promise<VersionedTransaction[]> {
  if (args.lamports === 'all') {
    return args.market.buildWithdrawTxns({
      owner: args.owner,
      amount: 0n,
      mint: SOLANA_SOL_MINT,
      withdrawAll: true,
    });
  }
  if (args.lamports <= 0n) throw new Error('amount must be positive');
  return args.market.buildWithdrawTxns({
    owner: args.owner,
    amount: args.lamports,
    mint: SOLANA_SOL_MINT,
    withdrawAll: false,
  });
}
