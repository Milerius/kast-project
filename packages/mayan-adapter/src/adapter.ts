import type { VersionedTransaction } from '@solana/web3.js';
import type { Chain, OrderStatus } from '@kast/shared';

export interface Quote {
  expiresAt: number;
  minAmountOut: bigint;
  raw: unknown; // SDK's opaque quote payload, passed back to buildBridgeTx
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
  referrer?: string;
}

export function createMayanAdapter(_config: MayanAdapterConfig = {}): MayanAdapter {
  throw new Error('not implemented — see Tasks 18-20');
}
