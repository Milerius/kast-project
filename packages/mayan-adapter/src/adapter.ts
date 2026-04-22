import type { Connection, PublicKey, Signer, VersionedTransaction } from '@solana/web3.js';
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

export type BridgeRoute = 'SWIFT' | 'FAST_MCTP';

export type BridgeTxBundle =
  | {
      chain: 'solana';
      route: BridgeRoute;
      txs: [VersionedTransaction];
      // Ephemeral signers the SDK requires to co-sign the bridge tx alongside
      // the user wallet (e.g. the payload writer keypair for FAST_MCTP).
      // Empty for routes that don't need extra signers.
      extraSigners: Signer[];
      // Present for SWIFT (computed pre-broadcast). FAST_MCTP has no equivalent;
      // callers track by source tx signature post-broadcast.
      orderHash?: string;
    }
  | {
      chain: 'base';
      route: BridgeRoute;
      txs: [EvmTransactionRequest, EvmTransactionRequest];
      orderHash?: string;
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
  /**
   * Poll the Mayan explorer for order status.
   *
   * NOTE: The Mayan public explorer (`/v3/swap/trx/:hash`) only indexes by the
   * *source tx signature* (the Solana sig or EVM tx hash of the bridge-out tx),
   * NOT by the Swift orderHash. Callers must pass the sig returned from
   * broadcasting the bridge tx, not the orderHash computed pre-broadcast.
   */
  getOrderStatus(sourceSig: string): Promise<OrderStatus>;
}

export interface MayanAdapterConfig {
  solanaConnection: Connection;
  referrer?: string;
}

const EXPLORER_STATUS_URL = 'https://explorer-api.mayan.finance/v3/swap/trx';
const MAX_UINT256 = (1n << 256n) - 1n;

type RawAddressedQuote = {
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
      _referrer: string | null,
    ) => {
      const res = await createSwapFromSolanaInstructions(
        quote as never,
        fromAddress,
        toAddress,
        null,
        config.solanaConnection,
      );
      return {
        instructions: res.instructions as ReadonlyArray<{
          programId: PublicKey;
          data: Buffer | Uint8Array;
        }>,
        signers: res.signers,
        lookupTables: res.lookupTables,
      };
    },

    getSwapFromEvmTxPayload: async (
      quote: unknown,
      fromAddress: string,
      toAddress: string,
      _referrer: string | null,
      chainId: number,
    ) => {
      // SDK 13.x: getSwapFromEvmTxPayload returns Promise<TransactionRequest>.
      const tx = await getSwapFromEvmTxPayload(
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

    fetchStatus: async (
      orderHash: string,
    ): Promise<{
      clientStatus: string;
      status?: string;
      completedAt?: string | null;
      refundTxHash?: string | null;
    }> => {
      const res = await fetch(`${EXPLORER_STATUS_URL}/${orderHash}`);
      if (!res.ok) throw new Error(`Mayan status ${res.status} for ${orderHash}`);
      const json = (await res.json()) as {
        clientStatus?: string;
        status?: string;
        completedAt?: string | null;
        refundTxHash?: string | null;
      };
      return {
        clientStatus: json.clientStatus ?? 'ORDER_IN_PROGRESS',
        ...(json.status !== undefined && { status: json.status }),
        ...(json.completedAt !== undefined && { completedAt: json.completedAt }),
        ...(json.refundTxHash !== undefined && { refundTxHash: json.refundTxHash }),
      };
    },
  };

  return {
    quote: (p) =>
      quoteImpl(sdk, { ...p, ...(config.referrer !== undefined && { referrer: config.referrer }) }),
    buildBridgeTx: (q) => {
      const raw = q.raw as RawAddressedQuote;
      return buildBridgeTxImpl(
        sdk,
        q,
        { fromAddress: raw.fromAddress, toAddress: raw.toAddress },
        null,
      );
    },
    getOrderStatus: (h) => getOrderStatusImpl(sdk, h),
  };
}
