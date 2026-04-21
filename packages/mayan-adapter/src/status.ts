import type { OrderStatus } from '@kast/shared';

type SdkLike = {
  fetchStatus: (orderHash: string) => Promise<{ clientStatus: string }>;
};

export async function getOrderStatus(sdk: SdkLike, orderHash: string): Promise<OrderStatus> {
  const { clientStatus } = await sdk.fetchStatus(orderHash);
  if (clientStatus === 'ORDER_COMPLETED') return 'SETTLED';
  if (clientStatus === 'ORDER_REFUNDED') return 'REFUNDED';
  return 'PENDING';
}
