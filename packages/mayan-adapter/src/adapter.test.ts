import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import type * as MayanSdk from '@mayanfinance/swap-sdk';

const { fetchQuoteSpy, createSwapSpy, getEvmPayloadSpy } = vi.hoisted(() => ({
  fetchQuoteSpy: vi.fn(),
  createSwapSpy: vi.fn(),
  getEvmPayloadSpy: vi.fn(),
}));

vi.mock('@mayanfinance/swap-sdk', async () => {
  const actual = await vi.importActual<typeof MayanSdk>('@mayanfinance/swap-sdk');
  return {
    ...actual,
    fetchQuote: fetchQuoteSpy,
    createSwapFromSolanaInstructions: createSwapSpy,
    getSwapFromEvmTxPayload: getEvmPayloadSpy,
  };
});

import { createMayanAdapter } from './adapter.js';
import { SWIFT_PROGRAM_ID } from './order-hash.js';
import { encodeFunctionData } from 'viem';

const SOL_USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const BASE_USDC_ADDR = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const fakeConnection = { rpcEndpoint: 'http://localhost:8899' } as never;

function swiftQuoteFields(overrides: Record<string, unknown>) {
  return {
    type: 'SWIFT',
    swiftInputContract: SOL_USDC,
    toToken: { contract: BASE_USDC_ADDR, decimals: 6 },
    minAmountOut: 4.9,
    gasDrop: 0,
    cancelRelayerFee64: '0',
    refundRelayerFee64: '0',
    deadline64: String(Math.floor(Date.now() / 1000) + 3600),
    referrerBps: 0,
    protocolBps: 0,
    swiftAuctionMode: 0,
    ...overrides,
  };
}

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

  it('prefers FAST_MCTP when the API returns both SWIFT and FAST_MCTP', async () => {
    fetchQuoteSpy.mockResolvedValue([
      {
        type: 'SWIFT',
        deadline64: '1800000000',
        minAmountOut: 4.9,
        toToken: { decimals: 6 },
      },
      {
        type: 'FAST_MCTP',
        deadline64: '1800000500',
        minAmountOut: 4.94,
        toToken: { decimals: 6 },
      },
    ]);
    const adapter = createMayanAdapter({ solanaConnection: fakeConnection });
    const q = await adapter.quote({
      fromChain: 'solana',
      toChain: 'base',
      amountUsdc: 5_000_000n,
      fromAddress: 'Src',
      toAddress: '0xDst',
    });
    expect(q.expiresAt).toBe(1_800_000_500_000);
    expect(q.minAmountOut).toBe(4_940_000n);
    const raw = q.raw as { type: string };
    expect(raw.type).toBe('FAST_MCTP');
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

  it('builds a base-chain approve+swap bundle with computed orderHash', async () => {
    const randomHex = '7'.repeat(64);
    const SWIFT_ABI = [
      {
        type: 'function',
        name: 'createOrderWithToken',
        stateMutability: 'nonpayable',
        inputs: [
          { name: 'tokenIn', type: 'address' },
          { name: 'amountIn', type: 'uint256' },
          {
            name: 'params',
            type: 'tuple',
            components: [
              { name: 'trader', type: 'bytes32' },
              { name: 'tokenOut', type: 'bytes32' },
              { name: 'minAmountOut', type: 'uint64' },
              { name: 'gasDrop', type: 'uint64' },
              { name: 'cancelFee', type: 'uint64' },
              { name: 'refundFee', type: 'uint64' },
              { name: 'deadline', type: 'uint64' },
              { name: 'destAddr', type: 'bytes32' },
              { name: 'destChainId', type: 'uint16' },
              { name: 'referrerAddr', type: 'bytes32' },
              { name: 'referrerBps', type: 'uint8' },
              { name: 'auctionMode', type: 'uint8' },
              { name: 'random', type: 'bytes32' },
            ],
          },
        ],
        outputs: [],
      },
    ] as const;
    const FORWARDER_ABI = [
      {
        type: 'function',
        name: 'forwardERC20',
        stateMutability: 'payable',
        inputs: [
          { name: 'tokenIn', type: 'address' },
          { name: 'amountIn', type: 'uint256' },
          {
            name: 'permitParams',
            type: 'tuple',
            components: [
              { name: 'value', type: 'uint256' },
              { name: 'deadline', type: 'uint256' },
              { name: 'v', type: 'uint8' },
              { name: 'r', type: 'bytes32' },
              { name: 's', type: 'bytes32' },
            ],
          },
          { name: 'mayanProtocol', type: 'address' },
          { name: 'protocolData', type: 'bytes' },
        ],
        outputs: [],
      },
    ] as const;
    const zero32: `0x${string}` = `0x${'00'.repeat(32)}`;
    const swiftCall = encodeFunctionData({
      abi: SWIFT_ABI,
      functionName: 'createOrderWithToken',
      args: [
        BASE_USDC_ADDR as `0x${string}`,
        0n,
        [
          zero32,
          zero32,
          0n,
          0n,
          0n,
          0n,
          BigInt(Math.floor(Date.now() / 1000) + 3600),
          zero32,
          1,
          zero32,
          0,
          0,
          `0x${randomHex}`,
        ] as never,
      ],
    });
    const forwarderCall = encodeFunctionData({
      abi: FORWARDER_ABI,
      functionName: 'forwardERC20',
      args: [
        BASE_USDC_ADDR as `0x${string}`,
        0n,
        [0n, 0n, 0, zero32, zero32] as never,
        '0x0000000000000000000000000000000000000001',
        swiftCall,
      ],
    });
    getEvmPayloadSpy.mockReturnValue({
      to: '0x1111111111111111111111111111111111111111',
      data: forwarderCall,
      value: 0n,
    });
    fetchQuoteSpy.mockResolvedValue([
      {
        ...swiftQuoteFields({
          swiftInputContract: BASE_USDC_ADDR,
          toToken: { contract: SOL_USDC, decimals: 6 },
        }),
        deadline64: String(Math.floor(Date.now() / 1000) + 3600),
        minAmountOut: 4.9,
      },
    ]);
    const adapter = createMayanAdapter({ solanaConnection: fakeConnection });
    const q = await adapter.quote({
      fromChain: 'base',
      toChain: 'solana',
      amountUsdc: 5_000_000n,
      fromAddress: '0x6aAb71f67f31Aca815Cdf9b42F6C8fA019600844',
      toAddress: '11111111111111111111111111111111',
    });
    const bundle = await adapter.buildBridgeTx(q);
    expect(bundle.chain).toBe('base');
    expect(bundle.orderHash).toMatch(/^0x[0-9a-f]{64}$/);
    if (bundle.chain !== 'base') throw new Error('expected base');
    expect(bundle.txs).toHaveLength(2);
    const [approve, swap] = bundle.txs;
    expect(approve.to.toLowerCase()).toBe('0x833589fcd6edb6e08f4c7c32d4f71b54bda02913');
    expect(approve.data.startsWith('0x095ea7b3')).toBe(true);
    expect(approve.data.endsWith('f'.repeat(64))).toBe(true);
    expect(swap.to).toBe('0x1111111111111111111111111111111111111111');
    expect(swap.chainId).toBe(8453);
  });

  it('builds a solana-chain single-tx bundle via createSwapFromSolanaInstructions', async () => {
    const randomKey = Buffer.alloc(32, 7);
    const initData = Buffer.concat([Buffer.alloc(166, 0), randomKey]);
    createSwapSpy.mockResolvedValue({
      instructions: [{ programId: new PublicKey(SWIFT_PROGRAM_ID), keys: [], data: initData }],
      signers: [],
      lookupTables: [],
    });
    fetchQuoteSpy.mockResolvedValue([
      {
        ...swiftQuoteFields({}),
        deadline64: String(Math.floor(Date.now() / 1000) + 3600),
        minAmountOut: 4.9,
      },
    ]);
    const adapter = createMayanAdapter({ solanaConnection: fakeConnection });
    const q = await adapter.quote({
      fromChain: 'solana',
      toChain: 'base',
      amountUsdc: 5_000_000n,
      fromAddress: '11111111111111111111111111111111',
      toAddress: '0x1111111111111111111111111111111111111111',
    });
    const bundle = await adapter.buildBridgeTx(q);
    expect(bundle.chain).toBe('solana');
    expect(bundle.orderHash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('throws when the Solana init_order instruction is missing', async () => {
    createSwapSpy.mockResolvedValue({ instructions: [], signers: [], lookupTables: [] });
    fetchQuoteSpy.mockResolvedValue([
      {
        ...swiftQuoteFields({}),
        deadline64: String(Math.floor(Date.now() / 1000) + 3600),
        minAmountOut: 4.9,
      },
    ]);
    const adapter = createMayanAdapter({ solanaConnection: fakeConnection });
    const q = await adapter.quote({
      fromChain: 'solana',
      toChain: 'base',
      amountUsdc: 5_000_000n,
      fromAddress: '11111111111111111111111111111111',
      toAddress: '0x1111111111111111111111111111111111111111',
    });
    await expect(adapter.buildBridgeTx(q)).rejects.toThrow(/init_order/);
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
