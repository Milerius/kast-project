/**
 * Simulate the Kamino + Mayan legs of the happy path without broadcasting.
 *
 * Usage:
 *   pnpm sim:e2e <solanaOwnerPubkey> [baseAddress] [--fund-check]
 *
 * Flags:
 *   --fund-check  Report SOL balance vs the target collateral + rent buffer,
 *                 and flag whether the wallet is fund-ready.
 *
 * Reads NEXT_PUBLIC_SOLANA_RPC_URL / NEXT_PUBLIC_KAMINO_MARKET /
 * NEXT_PUBLIC_MAYAN_REFERRER from apps/web/.env.local.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Connection, PublicKey } from '@solana/web3.js';
import {
  DEFAULT_BORROW_USDC_UNITS,
  KAMINO_MAIN_MARKET,
  LAMPORTS_PER_SOL,
  TARGET_COLLATERAL_USD,
} from '@kast/shared';
import { createKaminoAdapter } from '@kast/kamino-adapter';
import { createMayanAdapter } from '@kast/mayan-adapter';

// Approximate rent + fees buffer we want to leave in the wallet after collateral
const RENT_BUFFER_LAMPORTS = 10_000_000n; // 0.01 SOL

function loadEnv(): Record<string, string> {
  const envPath = resolve(process.cwd(), 'apps/web/.env.local');
  const text = readFileSync(envPath, 'utf-8');
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]!] = m[2]!;
  }
  return out;
}

async function fetchSolUsd(): Promise<number> {
  const r = await fetch(
    'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd',
  );
  const j = (await r.json()) as { solana?: { usd?: number } };
  const usd = j.solana?.usd;
  if (typeof usd !== 'number' || usd <= 0) throw new Error('bad SOL price');
  return usd;
}

function section(title: string): void {
  console.log(`\n─── ${title} ${'─'.repeat(Math.max(0, 60 - title.length))}`);
}

function formatErr(e: unknown): string {
  if (e instanceof Error) return e.message;
  return JSON.stringify(e);
}

function fmtSol(lamports: bigint): string {
  return (Number(lamports) / Number(LAMPORTS_PER_SOL)).toFixed(6);
}

async function simulate(
  connection: Connection,
  tx: import('@solana/web3.js').VersionedTransaction,
  label: string,
): Promise<{ ok: boolean; err: unknown; units: number | null; logs: string[] }> {
  const res = await connection.simulateTransaction(tx, {
    sigVerify: false,
    replaceRecentBlockhash: true,
    commitment: 'confirmed',
  });
  const { err, logs, unitsConsumed } = res.value;
  const ok = err == null;
  console.log(`  ${ok ? '✓' : '✗'} ${label}: err=${err == null ? 'null' : JSON.stringify(err)}`);
  if (unitsConsumed != null) console.log(`    compute units: ${unitsConsumed}`);
  if (!ok && logs) {
    console.log('    last logs:');
    for (const l of logs.slice(-8)) console.log(`      ${l}`);
  }
  return { ok, err, units: unitsConsumed ?? null, logs: logs ?? [] };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  const positional = argv.filter((a) => !a.startsWith('--'));
  const [ownerArg, baseArg] = positional;
  const fundCheck = flags.has('--fund-check');

  if (!ownerArg) {
    console.error(
      'Usage: pnpm sim:e2e <solanaOwnerPubkey> [baseAddress] [--fund-check]\n' +
        '  ownerPubkey = Solana address that would sign (use your Privy embedded address)',
    );
    process.exit(1);
  }

  const env = loadEnv();
  const rpc = env.NEXT_PUBLIC_SOLANA_RPC_URL;
  const market = env.NEXT_PUBLIC_KAMINO_MARKET ?? KAMINO_MAIN_MARKET;
  const referrer = env.NEXT_PUBLIC_MAYAN_REFERRER || undefined;
  if (!rpc) throw new Error('missing NEXT_PUBLIC_SOLANA_RPC_URL in apps/web/.env.local');

  const owner = new PublicKey(ownerArg);
  const baseAddress = baseArg ?? '0x0000000000000000000000000000000000000001';

  const connection = new Connection(rpc, 'confirmed');
  const kamino = createKaminoAdapter({ connection, marketAddress: new PublicKey(market) });
  const mayan = createMayanAdapter({ solanaConnection: connection, referrer });

  section('Config');
  console.log(`  RPC:       ${rpc}`);
  console.log(`  market:    ${market}`);
  console.log(`  owner:     ${owner.toBase58()}`);
  console.log(`  base:      ${baseAddress}`);
  console.log(`  fund-check:${fundCheck ? ' on' : ' off'}`);

  const solUsd = await fetchSolUsd();
  const lamports = BigInt(Math.floor((TARGET_COLLATERAL_USD / solUsd) * Number(LAMPORTS_PER_SOL)));
  section('Price & size');
  console.log(`  SOL/USD:   $${solUsd}`);
  console.log(
    `  collateral:${fmtSol(lamports)} SOL (${lamports} lamports, target $${TARGET_COLLATERAL_USD})`,
  );
  console.log(`  borrow:    5 USDC (${DEFAULT_BORROW_USDC_UNITS} base units)`);

  let isFunded = false;
  if (fundCheck) {
    section('Fund check');
    const balance = BigInt(await connection.getBalance(owner));
    const required = lamports + RENT_BUFFER_LAMPORTS;
    isFunded = balance >= required;
    console.log(`  balance:   ${fmtSol(balance)} SOL (${balance} lamports)`);
    console.log(`  required:  ${fmtSol(required)} SOL  (collateral + ~0.01 SOL rent buffer)`);
    console.log(`  status:    ${isFunded ? '✓ ready to deposit' : '✗ under-funded'}`);
    if (!isFunded) {
      const short = required - balance;
      console.log(`  short by:  ${fmtSol(short)} SOL`);
    }
  }

  section('Kamino: build + simulate DEPOSIT');
  try {
    const [depositTx] = await kamino.buildDepositCollateralTx({ owner, lamports });
    if (!depositTx) throw new Error('no deposit tx');
    console.log('  ✓ deposit tx built');
    await simulate(connection, depositTx, 'deposit');
  } catch (e) {
    console.log(`  ✗ deposit build failed: ${formatErr(e)}`);
  }

  section('Kamino: build + simulate BORROW (requires existing obligation)');
  try {
    const [borrowTx] = await kamino.buildBorrowTx({
      owner,
      amountUsdc: DEFAULT_BORROW_USDC_UNITS,
    });
    if (!borrowTx) throw new Error('no borrow tx');
    console.log('  ✓ borrow tx built');
    await simulate(connection, borrowTx, 'borrow');
  } catch (e) {
    console.log(
      `  ~ borrow build expectedly skipped (no prior obligation for this owner): ${formatErr(e)}`,
    );
  }

  section('Mayan: quote solana → base');
  try {
    const q = await mayan.quote({
      fromChain: 'solana',
      toChain: 'base',
      amountUsdc: DEFAULT_BORROW_USDC_UNITS,
      fromAddress: owner.toBase58(),
      toAddress: baseAddress,
    });
    console.log(`  ✓ quote ok · expiresAt=${new Date(q.expiresAt).toISOString()}`);
    console.log(`    minAmountOut: ${q.minAmountOut}`);
    const bundle = await mayan.buildBridgeTx(q);
    const hashHint = bundle.orderHash
      ? `orderHash=${bundle.orderHash.slice(0, 14)}…`
      : 'no orderHash (tracked by sig)';
    console.log(
      `  ✓ bridge tx built · chain=${bundle.chain} · route=${bundle.route} · ${hashHint}`,
    );
    if (bundle.chain === 'solana') {
      await simulate(connection, bundle.txs[0], 'mayan bridge-out');
    }
  } catch (e) {
    console.log(`  ✗ mayan quote/build failed: ${formatErr(e)}`);
  }

  section('Mayan: quote base → solana (close leg)');
  try {
    const q2 = await mayan.quote({
      fromChain: 'base',
      toChain: 'solana',
      amountUsdc: DEFAULT_BORROW_USDC_UNITS,
      fromAddress: baseAddress,
      toAddress: owner.toBase58(),
    });
    console.log(`  ✓ quote ok · minAmountOut=${q2.minAmountOut}`);
    const bundle2 = await mayan.buildBridgeTx(q2);
    const hashHint2 = bundle2.orderHash
      ? `orderHash=${bundle2.orderHash.slice(0, 14)}…`
      : 'no orderHash (tracked by sig)';
    console.log(
      `  ✓ bridge tx built · chain=${bundle2.chain} · route=${bundle2.route} · steps=${bundle2.txs.length} · ${hashHint2}`,
    );
  } catch (e) {
    console.log(`  ✗ mayan base→sol failed: ${formatErr(e)}`);
  }

  console.log('\ndone.');
}

main().catch((e: unknown) => {
  console.error('fatal:', formatErr(e));
  process.exit(1);
});
