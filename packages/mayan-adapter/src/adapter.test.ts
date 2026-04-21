import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { fetchQuoteSpy, createSwapSpy, getEvmPayloadSpy } = vi.hoisted(() => ({
  fetchQuoteSpy: vi.fn(),
  createSwapSpy: vi.fn(),
  getEvmPayloadSpy: vi.fn(),
}));

vi.mock('@mayanfinance/swap-sdk', () => ({
  fetchQuote: fetchQuoteSpy,
  createSwapFromSolanaInstructions: createSwapSpy,
  getSwapFromEvmTxPayload: getEvmPayloadSpy,
}));

import { createMayanAdapter } from './adapter.js';

const fakeConnection = { rpcEndpoint: 'http://localhost:8899' } as never;

describe('createMayanAdapter — quote shim', () => {
  beforeEach(() => {
    fetchQuoteSpy.mockReset();
    createSwapSpy.mockReset();
    getEvmPayloadSpy.mockReset();
  });

  it('maps USDC mints, forwards slippage, and converts minAmountOut to base units', async () => {
    fetchQuoteSpy.mockResolvedValue([
      { deadline64: '1800000000', minAmountOut: 4.95, toToken: { decimals: 6 } },
    ]);
    const adapter = createMayanAdapter({ solanaConnection: fakeConnection });
    const q = await adapter.quote({
      fromChain: 'solana',
      toChain: 'base',
      amountUsdc: 5_000_000n,
      fromAddress: 'Src',
      toAddress: '0xDst',
    });
    expect(q.minAmountOut).toBe(4_950_000n);
    expect(q.expiresAt).toBe(1_800_000_000_000);
    expect(fetchQuoteSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 5,
        fromChain: 'solana',
        toChain: 'base',
        slippageBps: 50,
      }),
    );
  });

  it('forwards referrer when config provides one', async () => {
    fetchQuoteSpy.mockResolvedValue([
      { deadline64: '1800000000', minAmountOut: 1, toToken: { decimals: 6 } },
    ]);
    const adapter = createMayanAdapter({
      solanaConnection: fakeConnection,
      referrer: 'kast-ref',
    });
    await adapter.quote({
      fromChain: 'solana',
      toChain: 'base',
      amountUsdc: 1_000_000n,
      fromAddress: 'a',
      toAddress: 'b',
    });
    expect(fetchQuoteSpy).toHaveBeenCalledWith(expect.objectContaining({ referrer: 'kast-ref' }));
  });
});

describe('createMayanAdapter — buildBridgeTx shim', () => {
  beforeEach(() => {
    fetchQuoteSpy.mockReset();
    createSwapSpy.mockReset();
    getEvmPayloadSpy.mockReset();
  });

  it('builds a base-chain approve+swap bundle with MAX_UINT256 allowance', async () => {
    getEvmPayloadSpy.mockReturnValue({
      to: '0x1111111111111111111111111111111111111111',
      data: '0xcafebabe',
      value: 0n,
    });
    const adapter = createMayanAdapter({ solanaConnection: fakeConnection });
    const raw = {
      fromChain: 'base',
      toChain: 'solana',
      fromAddress: '0xFromUserAddress000000000000000000000000000',
      toAddress: 'SolanaDestAddress',
      orderHash: 'hash-b',
    };
    const bundle = await adapter.buildBridgeTx({
      expiresAt: 0,
      minAmountOut: 0n,
      raw,
    });
    expect(bundle.chain).toBe('base');
    expect(bundle.orderHash).toBe('hash-b');
    if (bundle.chain !== 'base') throw new Error('expected base');
    expect(bundle.txs).toHaveLength(2);
    const [approve, swap] = bundle.txs;
    expect(approve.to.toLowerCase()).toBe('0x833589fcd6edb6e08f4c7c32d4f71b54bda02913');
    expect(approve.data.startsWith('0x095ea7b3')).toBe(true);
    expect(approve.data.endsWith('f'.repeat(64))).toBe(true);
    expect(swap.to).toBe('0x1111111111111111111111111111111111111111');
    expect(swap.data).toBe('0xcafebabe');
    expect(swap.chainId).toBe(8453);
  });

  it('builds a solana-chain single-tx bundle via createSwapFromSolanaInstructions', async () => {
    createSwapSpy.mockResolvedValue({ instructions: [], signers: [], lookupTables: [] });
    const adapter = createMayanAdapter({ solanaConnection: fakeConnection });
    const raw = {
      fromChain: 'solana',
      toChain: 'base',
      fromAddress: '11111111111111111111111111111111',
      toAddress: '0x1111111111111111111111111111111111111111',
      orderHash: 'hash-s',
    };
    const bundle = await adapter.buildBridgeTx({ expiresAt: 0, minAmountOut: 0n, raw });
    expect(bundle.chain).toBe('solana');
    expect(bundle.orderHash).toBe('hash-s');
    expect(createSwapSpy).toHaveBeenCalledWith(
      raw,
      raw.fromAddress,
      raw.toAddress,
      null,
      fakeConnection,
    );
  });

  it('throws when the raw quote is missing orderHash', async () => {
    const adapter = createMayanAdapter({ solanaConnection: fakeConnection });
    await expect(
      adapter.buildBridgeTx({
        expiresAt: 0,
        minAmountOut: 0n,
        raw: { fromChain: 'base', toChain: 'solana', fromAddress: '0xa', toAddress: 'b' },
      }),
    ).rejects.toThrow(/missing orderHash/);
  });
});

describe('createMayanAdapter — status shim', () => {
  const origFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  it('maps ORDER_COMPLETED from the explorer to SETTLED', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ clientStatus: 'ORDER_COMPLETED' }),
    }) as never;
    const adapter = createMayanAdapter({ solanaConnection: fakeConnection });
    const status = await adapter.getOrderStatus('order-1');
    expect(status).toBe('SETTLED');
  });

  it('throws when the explorer returns a non-200', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve({}) }) as never;
    const adapter = createMayanAdapter({ solanaConnection: fakeConnection });
    await expect(adapter.getOrderStatus('order-x')).rejects.toThrow(/Mayan status 500/);
  });
});
