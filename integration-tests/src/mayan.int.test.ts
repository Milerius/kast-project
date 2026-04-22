import { describe, it, expect } from 'vitest';
import { Connection } from '@solana/web3.js';
import { createMayanAdapter } from '@kast/mayan-adapter';

describe.skipIf(!process.env.KAST_INTEGRATION)('Mayan live', () => {
  it('fetches a live quote for 5 USDC sol→base', async () => {
    const mayan = createMayanAdapter({
      solanaConnection: new Connection(
        process.env.SOLANA_RPC_URL ?? 'https://api.mainnet-beta.solana.com',
      ),
    });
    const q = await mayan.quote({
      fromChain: 'solana',
      toChain: 'base',
      amountUsdc: 5_000_000n,
      fromAddress: '11111111111111111111111111111111',
      toAddress: '0x0000000000000000000000000000000000000000',
    });
    expect(q.minAmountOut).toBeGreaterThan(0n);
    expect(q.expiresAt).toBeGreaterThan(Date.now());
  });
});
