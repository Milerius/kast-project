/**
 * Decompile the Kamino deposit tx the adapter builds and print every
 * instruction so we can see what's triggering ComputationalBudgetExceeded.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Connection, Keypair, PublicKey, TransactionMessage } from '@solana/web3.js';
import bs58 from 'bs58';
import { KAMINO_MAIN_MARKET, LAMPORTS_PER_SOL, TARGET_COLLATERAL_USD } from '@kast/shared';
import { createKaminoAdapter } from '@kast/kamino-adapter';

function loadDotEnv(p: string): Record<string, string> {
  const text = readFileSync(p, 'utf-8');
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith('#')) out[m[1]!] = m[2]!;
  }
  return out;
}

const COMPUTE_BUDGET = 'ComputeBudget111111111111111111111111111111';

function decodeCB(data: Buffer): string {
  const disc = data.readUInt8(0);
  if (disc === 2) {
    const units = data.readUInt32LE(1);
    return `setComputeUnitLimit(${units})`;
  }
  if (disc === 3) {
    const micro = data.readBigUInt64LE(1);
    return `setComputeUnitPrice(${micro})`;
  }
  if (disc === 1) {
    const bytes = data.readUInt32LE(1);
    return `requestHeapFrame(${bytes})`;
  }
  return `disc=${disc} data=${data.toString('hex')}`;
}

async function main(): Promise<void> {
  const webEnv = loadDotEnv(resolve(process.cwd(), 'apps/web/.env.local'));
  const testEnv = loadDotEnv(resolve(process.cwd(), '.env.test.local'));
  const rpc = webEnv.NEXT_PUBLIC_SOLANA_RPC_URL!;
  const market = webEnv.NEXT_PUBLIC_KAMINO_MARKET ?? KAMINO_MAIN_MARKET;
  const signer = Keypair.fromSecretKey(bs58.decode(testEnv.SOLANA_TEST_SECRET!));
  const solUsd = 85;
  const lamports = BigInt(Math.floor((TARGET_COLLATERAL_USD / solUsd) * Number(LAMPORTS_PER_SOL)));
  const connection = new Connection(rpc, 'confirmed');
  const kamino = createKaminoAdapter({ connection, marketAddress: new PublicKey(market) });
  const [tx] = await kamino.buildDepositCollateralTx({ owner: signer.publicKey, lamports });
  if (!tx) throw new Error('no tx');
  console.log(`LUT refs: ${tx.message.addressTableLookups.length}`);
  for (const lt of tx.message.addressTableLookups) {
    console.log(
      `  ${lt.accountKey.toBase58()} wr=${lt.writableIndexes.length} ro=${lt.readonlyIndexes.length}`,
    );
  }
  const msg = TransactionMessage.decompile(tx.message, {
    addressLookupTableAccounts: [],
  });
  console.log(`total ixs: ${msg.instructions.length}`);
  for (const [i, ix] of msg.instructions.entries()) {
    const pid = ix.programId.toBase58();
    const dataHex = Buffer.from(ix.data).toString('hex').slice(0, 32);
    let decoded = '';
    if (pid === COMPUTE_BUDGET) decoded = ` → ${decodeCB(Buffer.from(ix.data))}`;
    console.log(`  [${i}] ${pid} data=${dataHex}…${decoded}`);
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
