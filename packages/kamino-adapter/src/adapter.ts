import type { Connection, PublicKey, VersionedTransaction } from '@solana/web3.js';
import type { ObligationView } from '@kast/shared';

export interface KaminoAdapter {
  getObligation(owner: PublicKey): Promise<ObligationView | null>;

  buildDepositCollateralTx(p: {
    owner: PublicKey;
    lamports: bigint;
  }): Promise<VersionedTransaction[]>;

  buildBorrowTx(p: { owner: PublicKey; amountUsdc: bigint }): Promise<VersionedTransaction[]>;

  buildRepayTx(p: {
    owner: PublicKey;
    amount: bigint | 'all';
  }): Promise<VersionedTransaction[]>;

  buildWithdrawCollateralTx(p: {
    owner: PublicKey;
    lamports: bigint | 'all';
  }): Promise<VersionedTransaction[]>;
}

export interface KaminoAdapterConfig {
  connection: Connection;
  marketAddress: PublicKey;
}

// Implementations in tx-*.ts and obligation.ts — wired together in createKaminoAdapter.
export function createKaminoAdapter(_config: KaminoAdapterConfig): KaminoAdapter {
  throw new Error('not implemented — see Tasks 12-16');
}
