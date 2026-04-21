export type Chain = 'solana' | 'base';

export type PersistedOrder = {
  orderHash: string;
  direction: 'out' | 'back';
  amountUsdc: string; // bigint serialized as decimal string
  startedAt: number;
};

export type ObligationView = {
  collateralLamports: bigint;
  borrowedUsdcBaseUnits: bigint;
};

export type OrderStatus = 'PENDING' | 'SETTLED' | 'REFUNDED';
