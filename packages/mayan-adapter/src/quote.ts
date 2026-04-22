import { SOLANA_USDC_MINT, BASE_USDC, type Chain } from '@kast/shared';
import type { Quote } from './adapter.js';

type RouteQuote = {
  type?: string;
  deadline64: string;
  minAmountOut: number;
  toToken: { decimals: number };
};

type SdkLike = {
  fetchQuote: (args: {
    amount: number;
    fromToken: string;
    toToken: string;
    fromChain: string;
    toChain: string;
    slippageBps: number;
    referrer?: string;
  }) => Promise<Array<RouteQuote>>;
};

const USDC_FOR_CHAIN: Record<Chain, string> = {
  solana: SOLANA_USDC_MINT,
  base: BASE_USDC,
};

const USDC_DECIMALS = 6;

// Mayan's SDK takes `amount` as a JS number. Guard against silent precision
// loss when the bigint exceeds MAX_SAFE_INTEGER (~9e15 ≈ 9 billion USDC base
// units) so callers get a loud error instead of a rounded amount.
function baseUnitsToHuman(units: bigint, decimals: number): number {
  if (units < 0n) throw new Error(`negative amount: ${units}`);
  if (units > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`amount ${units} exceeds safe Number range for Mayan quote`);
  }
  return Number(units) / 10 ** decimals;
}

// Convert a human-decimal float back to base units using string arithmetic so
// we don't round-trip through float * 10 ** decimals (which drifts by ULPs for
// many decimal values, e.g. 0.1 + 0.2).
function humanToBaseUnits(value: number, decimals: number): bigint {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`invalid amount: ${value}`);
  }
  const fixed = value.toFixed(decimals);
  const [whole = '0', frac = ''] = fixed.split('.');
  const fracPadded = frac.padEnd(decimals, '0').slice(0, decimals);
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fracPadded || '0');
}

// FAST_MCTP avoids Swift's solver auction (no stranding risk on small amounts)
// and uses Circle CCTPv2 — cheaper refunds, no orderHash to track.
function selectRoute(quotes: ReadonlyArray<RouteQuote>): RouteQuote {
  const fastMctp = quotes.find((q) => q.type === 'FAST_MCTP');
  if (fastMctp) return fastMctp;
  const first = quotes[0];
  if (!first) throw new Error('Mayan returned no quote');
  return first;
}

export async function quote(
  sdk: SdkLike,
  args: {
    fromChain: Chain;
    toChain: Chain;
    amountUsdc: bigint;
    fromAddress: string;
    toAddress: string;
    referrer?: string;
  },
): Promise<Quote> {
  const quotes = await sdk.fetchQuote({
    amount: baseUnitsToHuman(args.amountUsdc, USDC_DECIMALS),
    fromToken: USDC_FOR_CHAIN[args.fromChain],
    toToken: USDC_FOR_CHAIN[args.toChain],
    fromChain: args.fromChain,
    toChain: args.toChain,
    slippageBps: 50,
    ...(args.referrer !== undefined && { referrer: args.referrer }),
  });
  const best = selectRoute(quotes);
  return {
    expiresAt: Number(best.deadline64) * 1000,
    minAmountOut: humanToBaseUnits(best.minAmountOut, best.toToken.decimals),
    raw: {
      ...best,
      fromChain: args.fromChain,
      toChain: args.toChain,
      fromAddress: args.fromAddress,
      toAddress: args.toAddress,
    },
  };
}
