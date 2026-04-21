import type { Connection, VersionedTransaction } from '@solana/web3.js';
import { encodeFunctionData, erc20Abi } from 'viem';
import {
  fetchQuote,
  createSwapFromSolanaInstructions,
  getSwapFromEvmTxPayload,
} from '@mayanfinance/swap-sdk';
import type { Chain, OrderStatus } from '@kast/shared';
import { BASE_USDC } from '@kast/shared';
import { quote as quoteImpl } from './quote.js';
import { buildBridgeTx as buildBridgeTxImpl } from './tx-build.js';
import { getOrderStatus as getOrderStatusImpl } from './status.js';

export interface Quote {
  expiresAt: number;
  minAmountOut: bigint;
  raw: unknown;
}

export interface EvmTransactionRequest {
  to: `0x${string}`;
  data: `0x${string}`;
  value: bigint;
  chainId: number;
}

export type BridgeTxBundle =
  | { chain: 'solana'; txs: [VersionedTransaction]; orderHash: string }
  | {
      chain: 'base';
      txs: [EvmTransactionRequest, EvmTransactionRequest];
      orderHash: string;
    };

export interface MayanAdapter {
  quote(p: {
    fromChain: Chain;
    toChain: Chain;
    amountUsdc: bigint;
    fromAddress: string;
    toAddress: string;
  }): Promise<Quote>;
  buildBridgeTx(quote: Quote): Promise<BridgeTxBundle>;
  getOrderStatus(orderHash: string): Promise<OrderStatus>;
}

export interface MayanAdapterConfig {
  solanaConnection: Connection;
  referrer?: string;
}

const EXPLORER_STATUS_URL = 'https://explorer-api.mayan.finance/v3/swap/trx';
const MAX_UINT256 = (1n << 256n) - 1n;

type RawEvmQuote = {
  fromAddress: string;
  toAddress: string;
  fromChain: 'solana' | 'base';
  toChain: 'solana' | 'base';
};

export function createMayanAdapter(config: MayanAdapterConfig): MayanAdapter {
  const sdk = {
    fetchQuote: async (args: {
      amount: number;
      fromToken: string;
      toToken: string;
      fromChain: string;
      toChain: string;
      slippageBps: number;
      referrer?: string;
    }): Promise<
      Array<{ deadline64: string; minAmountOut: number; toToken: { decimals: number } }>
    > => {
      const quotes = await fetchQuote({
        amount: args.amount,
        fromToken: args.fromToken,
        toToken: args.toToken,
        fromChain: args.fromChain as 'solana' | 'base',
        toChain: args.toChain as 'solana' | 'base',
        slippageBps: args.slippageBps,
        ...(args.referrer !== undefined && { referrer: args.referrer }),
      });
      return quotes as unknown as Array<{
        deadline64: string;
        minAmountOut: number;
        toToken: { decimals: number };
      }>;
    },

    createSwapFromSolanaInstructions: async (
      quote: unknown,
      fromAddress: string,
      toAddress: string,
      _referrer: Record<string, string> | null,
    ) => {
      const res = await createSwapFromSolanaInstructions(
        quote as never,
        fromAddress,
        toAddress,
        null,
        config.solanaConnection,
      );
      return {
        instructions: res.instructions,
        signers: res.signers,
        lookupTables: res.lookupTables,
      };
    },

    getSwapFromEvmTxPayload: (
      quote: unknown,
      fromAddress: string,
      toAddress: string,
      _referrer: Record<string, string> | null,
      chainId: number,
    ) => {
      const tx = getSwapFromEvmTxPayload(
        quote as never,
        fromAddress,
        toAddress,
        null,
        fromAddress,
        chainId,
        null,
        null,
      );
      const approve: EvmTransactionRequest = {
        to: BASE_USDC as `0x${string}`,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: 'approve',
          args: [tx.to as `0x${string}`, MAX_UINT256],
        }),
        value: 0n,
        chainId,
      };
      const swap: EvmTransactionRequest = {
        to: tx.to as `0x${string}`,
        data: (tx.data ?? '0x') as `0x${string}`,
        value: BigInt(tx.value ?? 0),
        chainId,
      };
      return { approve, swap };
    },

    fetchStatus: async (orderHash: string): Promise<{ clientStatus: string }> => {
      const res = await fetch(`${EXPLORER_STATUS_URL}/${orderHash}`);
      if (!res.ok) throw new Error(`Mayan status ${res.status} for ${orderHash}`);
      const json = (await res.json()) as { clientStatus?: string };
      return { clientStatus: json.clientStatus ?? 'ORDER_IN_PROGRESS' };
    },

    deriveOrderHash: (q: unknown) => {
      const hash = (q as { orderHash?: string }).orderHash;
      if (!hash) throw new Error('Mayan quote missing orderHash');
      return hash;
    },
  };

  return {
    quote: (p) =>
      quoteImpl(sdk, { ...p, ...(config.referrer !== undefined && { referrer: config.referrer }) }),
    buildBridgeTx: (q) => {
      const raw = q.raw as RawEvmQuote;
      return buildBridgeTxImpl(sdk, q, {
        fromAddress: raw.fromAddress,
        toAddress: raw.toAddress,
      });
    },
    getOrderStatus: (h) => getOrderStatusImpl(sdk, h),
  };
}
