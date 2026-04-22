import { PublicKey, type TransactionInstruction, type VersionedTransaction } from '@solana/web3.js';
import { SOLANA_USDC_MINT } from '@kast/shared';
import { compileV0, type BlockhashSource } from './compile-v0.js';

export interface KaminoActionStaticsBorrow {
  buildBorrowTxns: (
    market: unknown,
    amount: string,
    mint: PublicKey,
    owner: PublicKey,
    obligation: unknown,
    useV2Ixs: boolean,
    scopeRefreshConfig: undefined,
  ) => Promise<unknown>;
  actionToIxs: (action: unknown) => TransactionInstruction[];
}

export async function buildBorrowTx(args: {
  connection: BlockhashSource;
  kaminoAction: KaminoActionStaticsBorrow;
  market: unknown;
  obligation: unknown;
  owner: PublicKey;
  amountUsdc: bigint;
}): Promise<VersionedTransaction[]> {
  if (args.amountUsdc <= 0n) throw new Error('amount must be positive');
  const action = await args.kaminoAction.buildBorrowTxns(
    args.market,
    args.amountUsdc.toString(),
    new PublicKey(SOLANA_USDC_MINT),
    args.owner,
    args.obligation,
    true,
    undefined,
  );
  const ixs = args.kaminoAction.actionToIxs(action);
  const tx = await compileV0({
    connection: args.connection,
    payer: args.owner,
    instructions: ixs,
  });
  return [tx];
}
