import {
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
  type AddressLookupTableAccount,
  type Connection,
  type TransactionInstruction,
} from '@solana/web3.js';

export interface BlockhashSource {
  getLatestBlockhash: Connection['getLatestBlockhash'];
}

// klend-sdk emits a setComputeUnitLimit sentinel (usually value = 1) expecting
// the caller to patch it post-simulation. Without patching, the tx fails with
// "Computational budget exceeded".
const COMPUTE_BUDGET_PROGRAM = new PublicKey('ComputeBudget111111111111111111111111111111');
const MAX_COMPUTE_UNITS = 1_400_000;

function patchComputeUnitLimit(ixs: TransactionInstruction[]): TransactionInstruction[] {
  return ixs.map((ix) => {
    if (!ix.programId.equals(COMPUTE_BUDGET_PROGRAM)) return ix;
    const data = Buffer.from(ix.data);
    if (data.length < 5 || data.readUInt8(0) !== 2) return ix;
    const newData = Buffer.alloc(5);
    newData.writeUInt8(2, 0);
    newData.writeUInt32LE(MAX_COMPUTE_UNITS, 1);
    return { ...ix, data: newData };
  });
}

export async function compileV0(args: {
  connection: BlockhashSource;
  payer: PublicKey;
  instructions: TransactionInstruction[];
  lookupTables?: AddressLookupTableAccount[];
}): Promise<VersionedTransaction> {
  const { blockhash } = await args.connection.getLatestBlockhash();
  const message = new TransactionMessage({
    payerKey: args.payer,
    recentBlockhash: blockhash,
    instructions: patchComputeUnitLimit(args.instructions),
  }).compileToV0Message(args.lookupTables);
  return new VersionedTransaction(message);
}
