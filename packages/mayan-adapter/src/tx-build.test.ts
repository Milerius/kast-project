import { describe, it, expect, vi } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import { buildBridgeTx } from './tx-build.js';
import { SWIFT_PROGRAM_ID } from './order-hash.js';

const SOL_USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const BASE_USDC_ADDR = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

function baseSwiftQuote(overrides: Record<string, unknown>) {
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

describe('buildBridgeTx', () => {
  it('solana quote → solana bundle, orderHash computed from init_order data', async () => {
    const rawQuote = baseSwiftQuote({ fromChain: 'solana', toChain: 'base' });
    const randomKey = Buffer.alloc(32, 7);
    const initData = Buffer.concat([Buffer.alloc(166, 0), randomKey]);
    const initIx = {
      programId: new PublicKey(SWIFT_PROGRAM_ID),
      keys: [],
      data: initData,
    };
    const sdk = {
      createSwapFromSolanaInstructions: vi.fn().mockResolvedValue({
        instructions: [initIx],
        signers: [],
        lookupTables: [],
      }),
      getSwapFromEvmTxPayload: vi.fn(),
    };
    const bundle = await buildBridgeTx(
      sdk as never,
      { expiresAt: 0, minAmountOut: 0n, raw: rawQuote },
      {
        fromAddress: '11111111111111111111111111111111',
        toAddress: '0x1111111111111111111111111111111111111111',
      },
    );
    expect(bundle.chain).toBe('solana');
    expect(bundle.orderHash).toMatch(/^0x[0-9a-f]{64}$/);
    if (bundle.chain !== 'solana') throw new Error('narrowing');
    expect(bundle.extraSigners).toEqual([]);
  });

  it('base quote → [approveTx, bridgeTx] bundle, orderHash computed from calldata random', async () => {
    const rawQuote = baseSwiftQuote({
      fromChain: 'base',
      toChain: 'solana',
      swiftInputContract: BASE_USDC_ADDR,
      toToken: { contract: SOL_USDC, decimals: 6 },
    });
    const randomHex = '7'.repeat(64);
    const orderTuple = [
      `0x${'00'.repeat(32)}`,
      `0x${'00'.repeat(32)}`,
      0n,
      0n,
      0n,
      0n,
      BigInt(rawQuote.deadline64),
      `0x${'00'.repeat(32)}`,
      1,
      `0x${'00'.repeat(32)}`,
      0,
      0,
      `0x${randomHex}`,
    ];
    const { encodeFunctionData } = await import('viem');
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
    const swiftCall = encodeFunctionData({
      abi: SWIFT_ABI,
      functionName: 'createOrderWithToken',
      args: [BASE_USDC_ADDR as `0x${string}`, 0n, orderTuple as never],
    });
    const forwarderCall = encodeFunctionData({
      abi: FORWARDER_ABI,
      functionName: 'forwardERC20',
      args: [
        BASE_USDC_ADDR as `0x${string}`,
        0n,
        [0n, 0n, 0, `0x${'00'.repeat(32)}`, `0x${'00'.repeat(32)}`] as never,
        '0x0000000000000000000000000000000000000001',
        swiftCall,
      ],
    });

    const sdk = {
      createSwapFromSolanaInstructions: vi.fn(),
      getSwapFromEvmTxPayload: vi.fn().mockResolvedValue({
        approve: { to: '0xA', data: '0x01', value: 0n, chainId: 8453 },
        swap: { to: '0xS', data: forwarderCall, value: 0n, chainId: 8453 },
      }),
    };
    const bundle = await buildBridgeTx(
      sdk as never,
      { expiresAt: 0, minAmountOut: 0n, raw: rawQuote },
      {
        fromAddress: '0x6aAb71f67f31Aca815Cdf9b42F6C8fA019600844',
        toAddress: '11111111111111111111111111111111',
      },
    );
    expect(bundle.chain).toBe('base');
    if (bundle.chain !== 'base') throw new Error('narrowing');
    expect(bundle.txs).toHaveLength(2);
    expect(bundle.orderHash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('FAST_MCTP solana→base → bundle surfaces extraSigners from SDK', async () => {
    const rawQuote = {
      type: 'FAST_MCTP',
      fromChain: 'solana',
      toChain: 'base',
    };
    const { Keypair } = await import('@solana/web3.js');
    const ephemeral = Keypair.generate();
    const sdk = {
      createSwapFromSolanaInstructions: vi.fn().mockResolvedValue({
        instructions: [],
        signers: [ephemeral],
        lookupTables: [],
      }),
      getSwapFromEvmTxPayload: vi.fn(),
    };
    const bundle = await buildBridgeTx(
      sdk as never,
      { expiresAt: 0, minAmountOut: 0n, raw: rawQuote },
      {
        fromAddress: '11111111111111111111111111111111',
        toAddress: '0x1111111111111111111111111111111111111111',
      },
    );
    expect(bundle.chain).toBe('solana');
    expect(bundle.route).toBe('FAST_MCTP');
    expect(bundle.orderHash).toBeUndefined();
    if (bundle.chain !== 'solana') throw new Error('narrowing');
    expect(bundle.extraSigners).toHaveLength(1);
    expect(bundle.extraSigners[0]?.publicKey.toBase58()).toBe(ephemeral.publicKey.toBase58());
  });

  it('FAST_MCTP base→solana → bundle without orderHash', async () => {
    const rawQuote = {
      type: 'FAST_MCTP',
      fromChain: 'base',
      toChain: 'solana',
    };
    const sdk = {
      createSwapFromSolanaInstructions: vi.fn(),
      getSwapFromEvmTxPayload: vi.fn().mockResolvedValue({
        approve: { to: '0xA', data: '0x01', value: 0n, chainId: 8453 },
        swap: { to: '0xS', data: '0x02', value: 0n, chainId: 8453 },
      }),
    };
    const bundle = await buildBridgeTx(
      sdk as never,
      { expiresAt: 0, minAmountOut: 0n, raw: rawQuote },
      {
        fromAddress: '0x6aAb71f67f31Aca815Cdf9b42F6C8fA019600844',
        toAddress: '11111111111111111111111111111111',
      },
    );
    expect(bundle.chain).toBe('base');
    expect(bundle.route).toBe('FAST_MCTP');
    expect(bundle.orderHash).toBeUndefined();
    if (bundle.chain !== 'base') throw new Error('narrowing');
    expect(bundle.txs).toHaveLength(2);
  });
});
