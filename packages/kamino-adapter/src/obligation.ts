import { PublicKey } from '@solana/web3.js';
import { SOLANA_SOL_MINT, SOLANA_USDC_MINT, type ObligationView } from '@kast/shared';

type MarketLike = {
  getObligationByWallet: (
    owner: PublicKey,
    programId?: PublicKey,
  ) => Promise<{
    deposits: Map<string, { amount: bigint }>;
    borrows: Map<string, { amount: bigint }>;
  } | null>;
};

export async function getObligation(args: {
  market: MarketLike;
  owner: PublicKey;
}): Promise<ObligationView | null> {
  const obligation = await args.market.getObligationByWallet(args.owner);
  if (!obligation) return null;
  const sol = obligation.deposits.get(SOLANA_SOL_MINT)?.amount ?? 0n;
  const usdc = obligation.borrows.get(SOLANA_USDC_MINT)?.amount ?? 0n;
  return { collateralLamports: sol, borrowedUsdcBaseUnits: usdc };
}
