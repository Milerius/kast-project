import { describe, it, expect, vi } from 'vitest';
import { buildBridgeTx } from './tx-build.js';

describe('buildBridgeTx', () => {
  it('solana quote → solana bundle with orderHash', async () => {
    const rawQuote = { fromChain: 'solana', toChain: 'base' };
    const sdk = {
      createSwapFromSolanaInstructions: vi.fn().mockResolvedValue({
        instructions: [],
        signers: [],
        lookupTables: [],
      }),
      getSwapFromEvmTxPayload: vi.fn(),
      deriveOrderHash: vi.fn().mockReturnValue('0xabc'),
    };
    const bundle = await buildBridgeTx(
      sdk as never,
      {
        expiresAt: 0,
        minAmountOut: 0n,
        raw: rawQuote,
      },
      {
        fromAddress: '11111111111111111111111111111111',
        toAddress: '0xBase',
      },
    );
    expect(bundle.chain).toBe('solana');
    expect(bundle.orderHash).toBe('0xabc');
  });

  it('base quote → [approveTx, bridgeTx] bundle with orderHash', async () => {
    const rawQuote = { fromChain: 'base', toChain: 'solana' };
    const sdk = {
      createSwapFromSolanaInstructions: vi.fn(),
      getSwapFromEvmTxPayload: vi.fn().mockResolvedValue({
        approve: { to: '0xA', data: '0x01', value: 0n, chainId: 8453 },
        swap: { to: '0xS', data: '0x02', value: 0n, chainId: 8453 },
      }),
      deriveOrderHash: vi.fn().mockReturnValue('0xdef'),
    };
    const bundle = await buildBridgeTx(
      sdk as never,
      {
        expiresAt: 0,
        minAmountOut: 0n,
        raw: rawQuote,
      },
      {
        fromAddress: '0xBase',
        toAddress: 'DstSol',
      },
    );
    expect(bundle.chain).toBe('base');
    if (bundle.chain !== 'base') throw new Error('narrowing');
    expect(bundle.txs).toHaveLength(2);
    expect(bundle.orderHash).toBe('0xdef');
  });
});
