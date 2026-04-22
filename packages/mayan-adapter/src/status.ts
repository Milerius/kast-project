import type { OrderStatus } from '@kast/shared';

type StatusResponse = {
  clientStatus: string;
  // MCTP orders populate `status` (e.g. `REDEEMED_ON_EVM_WITH_FEE`) instead of
  // the Swift-style `clientStatus`. `completedAt` is set universally once the
  // destination tx lands, so it's the most robust settlement signal.
  status?: string;
  completedAt?: string | null;
  refundTxHash?: string | null;
};

type SdkLike = {
  fetchStatus: (orderHash: string) => Promise<StatusResponse>;
};

export async function getOrderStatus(sdk: SdkLike, orderHash: string): Promise<OrderStatus> {
  const r = await sdk.fetchStatus(orderHash);
  if (r.clientStatus === 'ORDER_REFUNDED' || r.status === 'REFUNDED' || r.refundTxHash) {
    return 'REFUNDED';
  }
  if (
    r.clientStatus === 'ORDER_COMPLETED' ||
    r.completedAt ||
    r.status === 'REDEEMED_ON_EVM_WITH_FEE' ||
    r.status === 'REDEEMED_ON_SOLANA_WITH_FEE' ||
    (r.status?.startsWith('REDEEMED') ?? false)
  ) {
    return 'SETTLED';
  }
  return 'PENDING';
}
