import { PublicKey, type TransactionInstruction, type VersionedTransaction } from '@solana/web3.js';
import { SOLANA_SOL_MINT } from '@kast/shared';
import { compileV0, type BlockhashSource } from './compile-v0.js';

export interface KaminoActionStaticsDeposit {
  buildDepositTxns: (
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

export async function buildDepositCollateralTx(args: {
  connection: BlockhashSource;
  kaminoAction: KaminoActionStaticsDeposit;
  market: unknown;
  obligation: unknown;
  owner: PublicKey;
  lamports: bigint;
}): Promise<VersionedTransaction[]> {
  if (args.lamports <= 0n) throw new Error('amount must be positive');
  const action = await args.kaminoAction.buildDepositTxns(
    args.market,
    args.lamports.toString(),
    new PublicKey(SOLANA_SOL_MINT),
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
