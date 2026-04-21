import type { Connection, PublicKey, VersionedTransaction } from '@solana/web3.js';
import type { ObligationView } from '@kast/shared';
import { VanillaObligation } from '@kamino-finance/klend-sdk';
import { loadMarket } from './reserves.js';
import { getObligation as getObligationImpl } from './obligation.js';
import { buildDepositCollateralTx } from './tx-deposit.js';
import { buildBorrowTx } from './tx-borrow.js';
import { buildRepayTx } from './tx-repay.js';
import { buildWithdrawCollateralTx } from './tx-withdraw.js';

export interface KaminoAdapter {
  getObligation(owner: PublicKey): Promise<ObligationView | null>;
  buildDepositCollateralTx(p: {
    owner: PublicKey;
    lamports: bigint;
  }): Promise<VersionedTransaction[]>;
  buildBorrowTx(p: { owner: PublicKey; amountUsdc: bigint }): Promise<VersionedTransaction[]>;
  buildRepayTx(p: { owner: PublicKey; amount: bigint | 'all' }): Promise<VersionedTransaction[]>;
  buildWithdrawCollateralTx(p: {
    owner: PublicKey;
    lamports: bigint | 'all';
  }): Promise<VersionedTransaction[]>;
}

export interface KaminoAdapterConfig {
  connection: Connection;
  marketAddress: PublicKey;
}

export function createKaminoAdapter(config: KaminoAdapterConfig): KaminoAdapter {
  const marketPromise = loadMarket(config);

  return {
    async getObligation(owner) {
      return getObligationImpl({
        market: (await marketPromise) as never,
        owner,
        VanillaObligation: VanillaObligation as never,
      });
    },
    async buildDepositCollateralTx(p) {
      return buildDepositCollateralTx({ market: (await marketPromise) as never, ...p });
    },
    async buildBorrowTx(p) {
      return buildBorrowTx({ market: (await marketPromise) as never, ...p });
    },
    async buildRepayTx(p) {
      return buildRepayTx({ market: (await marketPromise) as never, ...p });
    },
    async buildWithdrawCollateralTx(p) {
      return buildWithdrawCollateralTx({ market: (await marketPromise) as never, ...p });
    },
  };
}
