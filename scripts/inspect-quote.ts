/**
 * Fetch raw Mayan quotes for USDC solana→base and print the swiftVersion of
 * each. Used to check whether the route offers V2 at all (the deprecation
 * notice says all new integrations should use V2, but the server picks the
 * version per-route).
 */
import { fetchQuote } from '@mayanfinance/swap-sdk';

async function main(): Promise<void> {
  const amount = Number(process.argv[2] ?? '5');
  const res = await fetchQuote({
    amount,
    fromToken: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    toToken: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
    fromChain: 'solana',
    toChain: 'base',
    slippageBps: 100,
  });
  console.log(`got ${res.length} quote(s) for ${amount} USDC:`);
  for (const q of res) {
    const r = q as unknown as Record<string, unknown>;
    const minOut = r.minAmountOut as number | undefined;
    const refundFee = r.refundRelayerFee64 as string | undefined;
    const cancelFee = r.cancelRelayerFee64 as string | undefined;
    console.log(
      `  type=${r.type as string} swiftVersion=${(r.swiftVersion as string) ?? '-'} minOut=${minOut ?? '-'} refundFee=${refundFee ?? '-'} cancelFee=${cancelFee ?? '-'}`,
    );
  }
}

main().catch((e: unknown) => {
  console.error('fatal:', e instanceof Error ? e.message : e);
  process.exit(1);
});
