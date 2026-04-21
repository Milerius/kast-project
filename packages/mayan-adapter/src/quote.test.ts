import { describe, it, expect, vi } from 'vitest';
import { quote } from './quote.js';

describe('quote', () => {
  it('calls fetchQuote with USDC mints for sol→base', async () => {
    const fakeQuote = { deadline64: '1800000000', minAmountOut64: '4950000' };
    const fetchQuote = vi.fn().mockResolvedValue([fakeQuote]);
    const out = await quote({ fetchQuote } as never, {
      fromChain: 'solana',
      toChain: 'base',
      amountUsdc: 5_000_000n,
      fromAddress: 'Src',
      toAddress: '0xDst',
    });
    expect(out.minAmountOut).toBe(4_950_000n);
    expect(out.expiresAt).toBe(1_800_000_000_000);
  });

  it('throws when SDK returns empty array', async () => {
    const fetchQuote = vi.fn().mockResolvedValue([]);
    await expect(
      quote({ fetchQuote } as never, {
        fromChain: 'solana',
        toChain: 'base',
        amountUsdc: 5_000_000n,
        fromAddress: 'a',
        toAddress: 'b',
      }),
    ).rejects.toThrow(/no quote/i);
  });
});
