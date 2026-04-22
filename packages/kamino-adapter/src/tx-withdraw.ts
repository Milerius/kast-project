import { PublicKey, type TransactionInstruction, type VersionedTransaction } from '@solana/web3.js';
import { SOLANA_SOL_MINT } from '@kast/shared';
import { compileV0, type BlockhashSource } from './compile-v0.js';

const U64_MAX = '18446744073709551615';

export interface KaminoActionStaticsWithdraw {
  buildWithdrawTxns: (
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

export async function buildWithdrawCollateralTx(args: {
  connection: BlockhashSource;
  kaminoAction: KaminoActionStaticsWithdraw;
  market: unknown;
  obligation: unknown;
  owner: PublicKey;
  lamports: bigint | 'all';
}): Promise<VersionedTransaction[]> {
  let amountStr: string;
  if (args.lamports === 'all') {
    amountStr = U64_MAX;
  } else {
    if (args.lamports <= 0n) throw new Error('amount must be positive');
    amountStr = args.lamports.toString();
  }
  const action = await args.kaminoAction.buildWithdrawTxns(
    args.market,
    amountStr,
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
