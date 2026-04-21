import { SOLANA_USDC_MINT, BASE_USDC, type Chain } from '@kast/shared';
import type { Quote } from './adapter.js';

type SdkLike = {
  fetchQuote: (args: {
    amount: number;
    fromToken: string;
    toToken: string;
    fromChain: string;
    toChain: string;
    slippageBps: number;
    referrer?: string;
  }) => Promise<Array<{ deadline64: string; minAmountOut64: string }>>;
};

const USDC_FOR_CHAIN: Record<Chain, string> = {
  solana: SOLANA_USDC_MINT,
  base: BASE_USDC,
};

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
  const best = quotes[0];
  if (!best) throw new Error('Mayan returned no quote');
  return {
    expiresAt: Number(best.deadline64) * 1000,
    minAmountOut: BigInt(best.minAmountOut64),
    raw: best,
  };
}
