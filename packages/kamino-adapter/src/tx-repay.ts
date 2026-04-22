import { PublicKey, type TransactionInstruction, type VersionedTransaction } from '@solana/web3.js';
import { SOLANA_USDC_MINT } from '@kast/shared';
import { compileV0, type BlockhashSource } from './compile-v0.js';

const U64_MAX = '18446744073709551615';

export interface KaminoActionStaticsRepay {
  buildRepayTxns: (
    market: unknown,
    amount: string,
    mint: PublicKey,
    owner: PublicKey,
    obligation: unknown,
    useV2Ixs: boolean,
    scopeRefreshConfig: undefined,
    currentSlot: number,
  ) => Promise<unknown>;
  actionToIxs: (action: unknown) => TransactionInstruction[];
}

export async function buildRepayTx(args: {
  connection: BlockhashSource;
  kaminoAction: KaminoActionStaticsRepay;
  market: unknown;
  obligation: unknown;
  owner: PublicKey;
  amount: bigint | 'all';
  currentSlot: number;
}): Promise<VersionedTransaction[]> {
  let amountStr: string;
  if (args.amount === 'all') {
    amountStr = U64_MAX;
  } else {
    if (args.amount <= 0n) throw new Error('amount must be positive');
    amountStr = args.amount.toString();
  }
  const action = await args.kaminoAction.buildRepayTxns(
    args.market,
    amountStr,
    new PublicKey(SOLANA_USDC_MINT),
    args.owner,
    args.obligation,
    true,
    undefined,
    args.currentSlot,
  );
  const ixs = args.kaminoAction.actionToIxs(action);
  const tx = await compileV0({
    connection: args.connection,
    payer: args.owner,
    instructions: ixs,
  });
  return [tx];
}
