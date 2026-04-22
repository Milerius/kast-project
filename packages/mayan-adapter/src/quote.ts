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
    amount: Number(args.amountUsdc) / 1_000_000,
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
    minAmountOut: BigInt(Math.round(best.minAmountOut * 10 ** best.toToken.decimals)),
    raw: {
      ...best,
      fromChain: args.fromChain,
      toChain: args.toChain,
      fromAddress: args.fromAddress,
      toAddress: args.toAddress,
    },
  };
}
