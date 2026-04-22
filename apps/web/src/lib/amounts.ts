import { LAMPORTS_PER_SOL, TARGET_COLLATERAL_USD } from '@kast/shared';

export function targetCollateralLamports(solUsdPrice: number): bigint {
  if (solUsdPrice <= 0) throw new Error('solUsdPrice must be positive');
  const sol = TARGET_COLLATERAL_USD / solUsdPrice;
  return BigInt(Math.floor(sol * Number(LAMPORTS_PER_SOL)));
}

export function formatUsdc(baseUnits: bigint): string {
  return (Number(baseUnits) / 1_000_000).toFixed(6);
}

export function formatSol(lamports: bigint, decimals: number = 4): string {
  return (Number(lamports) / Number(LAMPORTS_PER_SOL)).toFixed(decimals);
}
