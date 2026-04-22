import { PublicKey, type Connection, type VersionedTransaction } from '@solana/web3.js';
import { SOLANA_SOL_MINT, SOLANA_USDC_MINT, type ObligationView } from '@kast/shared';
import { KaminoAction, VanillaObligation } from '@kamino-finance/klend-sdk';
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
  // Force a reload of cached market + reserves. Required between two txs that
  // mutate the same obligation (e.g. repay then withdraw) because the SDK
  // builds tx remaining-accounts from its cached obligation snapshot, which
  // otherwise still lists the now-repaid borrow reserve.
  reload(): Promise<void>;
}

export interface KaminoAdapterConfig {
  connection: Connection;
  marketAddress: PublicKey;
}

export function createKaminoAdapter(config: KaminoAdapterConfig): KaminoAdapter {
  const marketPromise = loadMarket(config);
  const obligationSeed = marketPromise.then(
    (m) => new VanillaObligation((m as { programId: PublicKey }).programId),
  );
  const solMintPubkey = new PublicKey(SOLANA_SOL_MINT);
  const usdcMintPubkey = new PublicKey(SOLANA_USDC_MINT);

  return {
    async reload() {
      const market = (await marketPromise) as unknown as { reload: () => Promise<void> };
      await market.reload();
    },
    async getObligation(owner) {
      return getObligationImpl({
        market: (await marketPromise) as never,
        owner,
        VanillaObligation: VanillaObligation as never,
        solMintPubkey,
        usdcMintPubkey,
      });
    },
    async buildDepositCollateralTx(p) {
      const [market, obligation] = await Promise.all([marketPromise, obligationSeed]);
      return buildDepositCollateralTx({
        connection: config.connection,
        kaminoAction: KaminoAction as never,
        market,
        obligation,
        ...p,
      });
    },
    async buildBorrowTx(p) {
      const [market, obligation] = await Promise.all([marketPromise, obligationSeed]);
      return buildBorrowTx({
        connection: config.connection,
        kaminoAction: KaminoAction as never,
        market,
        obligation,
        ...p,
      });
    },
    async buildRepayTx(p) {
      const [market, obligation, currentSlot] = await Promise.all([
        marketPromise,
        obligationSeed,
        config.connection.getSlot(),
      ]);
      return buildRepayTx({
        connection: config.connection,
        kaminoAction: KaminoAction as never,
        market,
        obligation,
        currentSlot,
        ...p,
      });
    },
    async buildWithdrawCollateralTx(p) {
      const [market, obligation] = await Promise.all([marketPromise, obligationSeed]);
      return buildWithdrawCollateralTx({
        connection: config.connection,
        kaminoAction: KaminoAction as never,
        market,
        obligation,
        ...p,
      });
    },
  };
}
