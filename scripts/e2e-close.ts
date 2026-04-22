/**
 * Close leg of the assignment's happy path:
 *   1. Bridge wallet USDC Base → Solana via Mayan FAST_MCTP (EVM signing)
 *   2. Poll Mayan explorer until SETTLED, confirm USDC on Solana
 *   3. Kamino repay all debt
 *   4. Kamino withdraw all collateral
 *
 * Secrets come from .env.test.local (SOLANA_TEST_SECRET + BASE_TEST_PRIVKEY).
 * RPC from apps/web/.env.local.
 *
 * Usage:
 *   pnpm tsx scripts/e2e-close.ts                  # bridge ALL Base USDC back
 *   pnpm tsx scripts/e2e-close.ts --amount 5       # bridge exactly 5 USDC back
 *   pnpm tsx scripts/e2e-close.ts --skip-bridge    # skip bridge (already on Solana)
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  Connection,
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import bs58 from 'bs58';
import { createPublicClient, createWalletClient, http, erc20Abi, formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import { BASE_USDC, KAMINO_MAIN_MARKET, LAMPORTS_PER_SOL, SOLANA_USDC_MINT } from '@kast/shared';
import { createKaminoAdapter } from '@kast/kamino-adapter';
import { createMayanAdapter } from '@kast/mayan-adapter';

interface CliArgs {
  amount: bigint | 'all';
  skipBridge: boolean;
}

function parseCliArgs(): CliArgs {
  const argv = process.argv.slice(2);
  let amount: bigint | 'all' = 'all';
  let skipBridge = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--amount') {
      const v = argv[++i];
      if (!v) throw new Error('--amount needs a value');
      amount = BigInt(Math.round(Number(v) * 1_000_000));
    } else if (a === '--skip-bridge') {
      skipBridge = true;
    } else {
      throw new Error(`unknown arg: ${a}`);
    }
  }
  return { amount, skipBridge };
}

const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
const COMPUTE_BUDGET_PROGRAM = new PublicKey('ComputeBudget111111111111111111111111111111');
const MAX_COMPUTE_UNITS = 1_400_000;

async function patchComputeUnitLimit(
  connection: Connection,
  tx: VersionedTransaction,
  owner: PublicKey,
  limit: number = MAX_COMPUTE_UNITS,
): Promise<VersionedTransaction> {
  const decompiled = TransactionMessage.decompile(tx.message, {
    addressLookupTableAccounts: [],
  });
  let patched = false;
  const instructions = decompiled.instructions.map((ix) => {
    if (!ix.programId.equals(COMPUTE_BUDGET_PROGRAM)) return ix;
    const data = Buffer.from(ix.data);
    if (data.length >= 5 && data.readUInt8(0) === 2) {
      const newData = Buffer.alloc(5);
      newData.writeUInt8(2, 0);
      newData.writeUInt32LE(limit, 1);
      patched = true;
      return { ...ix, data: newData };
    }
    return ix;
  });
  if (!patched) return tx;
  const { blockhash } = await connection.getLatestBlockhash();
  const message = new TransactionMessage({
    payerKey: owner,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message();
  return new VersionedTransaction(message);
}

function ataFor(mint: PublicKey, owner: PublicKey): PublicKey {
  const [ata] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  return ata;
}

function loadDotEnv(path: string): Record<string, string> {
  const text = readFileSync(path, 'utf-8');
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith('#')) out[m[1]!] = m[2]!;
  }
  return out;
}

function section(title: string): void {
  console.log(`\n━━━ ${title} ${'━'.repeat(Math.max(0, 60 - title.length))}`);
}

function fmtSol(lamports: bigint): string {
  return (Number(lamports) / Number(LAMPORTS_PER_SOL)).toFixed(6);
}
function fmtUsdc(units: bigint): string {
  return (Number(units) / 1e6).toFixed(6);
}

async function signAndSend(
  connection: Connection,
  tx: VersionedTransaction,
  signer: Keypair,
  label: string,
): Promise<string> {
  tx.sign([signer]);
  const sig = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
  });
  console.log(`  sent ${label}: ${sig}`);
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  const conf = await connection.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    'confirmed',
  );
  if (conf.value.err) throw new Error(`${label} failed: ${JSON.stringify(conf.value.err)}`);
  console.log(`  ✓ confirmed ${label}`);
  return sig;
}

async function solanaUsdcBalance(connection: Connection, owner: PublicKey): Promise<bigint> {
  const ata = ataFor(new PublicKey(SOLANA_USDC_MINT), owner);
  const info = await connection.getAccountInfo(ata);
  if (!info) return 0n;
  return info.data.readBigUInt64LE(64);
}

async function main(): Promise<void> {
  const cli = parseCliArgs();
  const webEnv = loadDotEnv(resolve(process.cwd(), 'apps/web/.env.local'));
  const testEnv = loadDotEnv(resolve(process.cwd(), '.env.test.local'));

  const rpc = webEnv.NEXT_PUBLIC_SOLANA_RPC_URL;
  const marketAddr = webEnv.NEXT_PUBLIC_KAMINO_MARKET ?? KAMINO_MAIN_MARKET;
  const referrer = webEnv.NEXT_PUBLIC_MAYAN_REFERRER || undefined;
  if (!rpc) throw new Error('missing NEXT_PUBLIC_SOLANA_RPC_URL');

  const solSecret = testEnv.SOLANA_TEST_SECRET;
  const basePriv = testEnv.BASE_TEST_PRIVKEY as `0x${string}` | undefined;
  if (!solSecret) throw new Error('missing SOLANA_TEST_SECRET');
  if (!basePriv) throw new Error('missing BASE_TEST_PRIVKEY');

  const signer = Keypair.fromSecretKey(bs58.decode(solSecret));
  const solOwner = signer.publicKey;
  const connection = new Connection(rpc, 'confirmed');
  const kamino = createKaminoAdapter({ connection, marketAddress: new PublicKey(marketAddr) });
  const mayan = createMayanAdapter({ solanaConnection: connection, referrer });

  const evmAccount = privateKeyToAccount(basePriv);
  const evmWallet = createWalletClient({ account: evmAccount, chain: base, transport: http() });
  const evmClient = createPublicClient({ chain: base, transport: http() });

  section('Config');
  console.log(`  RPC        : ${rpc}`);
  console.log(`  market     : ${marketAddr}`);
  console.log(`  sol owner  : ${solOwner.toBase58()}`);
  console.log(`  base owner : ${evmAccount.address}`);
  console.log(
    `  bridge     : ${cli.skipBridge ? 'SKIPPED' : cli.amount === 'all' ? 'ALL base USDC' : fmtUsdc(cli.amount) + ' USDC'}`,
  );

  section('Starting balances');
  const baseEth = await evmClient.getBalance({ address: evmAccount.address });
  const baseUsdc = (await evmClient.readContract({
    address: BASE_USDC as `0x${string}`,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [evmAccount.address],
  })) as bigint;
  const solLamports = BigInt(await connection.getBalance(solOwner));
  const solUsdcAta = await solanaUsdcBalance(connection, solOwner);
  const obligation0 = await kamino.getObligation(solOwner);
  console.log(`  Base ETH   : ${formatEther(baseEth)} ETH`);
  console.log(`  Base USDC  : ${fmtUsdc(baseUsdc)} USDC`);
  console.log(`  Sol SOL    : ${fmtSol(solLamports)} SOL`);
  console.log(`  Sol USDC   : ${fmtUsdc(solUsdcAta)} USDC`);
  console.log(
    `  obligation : collateral=${obligation0 ? fmtSol(obligation0.collateralLamports) : 'null'} SOL, borrowed=${obligation0 ? fmtUsdc(obligation0.borrowedUsdcBaseUnits) : '-'} USDC`,
  );

  let bridgeAmount: bigint;
  if (!cli.skipBridge) {
    bridgeAmount = cli.amount === 'all' ? baseUsdc : cli.amount;
    if (bridgeAmount <= 0n) throw new Error('nothing to bridge (Base USDC = 0)');
    if (baseUsdc < bridgeAmount) {
      throw new Error(
        `Base USDC balance ${fmtUsdc(baseUsdc)} < requested ${fmtUsdc(bridgeAmount)}`,
      );
    }

    section(`Step 1 — Mayan BRIDGE IN ${fmtUsdc(bridgeAmount)} USDC (base → solana)`);
    const quote = await mayan.quote({
      fromChain: 'base',
      toChain: 'solana',
      amountUsdc: bridgeAmount,
      fromAddress: evmAccount.address,
      toAddress: solOwner.toBase58(),
    });
    console.log(
      `  quote: minOut=${fmtUsdc(quote.minAmountOut)} USDC, expires=${new Date(quote.expiresAt).toISOString()}`,
    );
    const bundle = await mayan.buildBridgeTx(quote);
    if (bundle.chain !== 'base') throw new Error('expected base bundle');
    console.log(`  route     : ${bundle.route}, steps=${bundle.txs.length}`);

    const [approveTxReq, swapTxReq] = bundle.txs;
    const currentAllowance = (await evmClient.readContract({
      address: BASE_USDC as `0x${string}`,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [evmAccount.address, approveTxReq.to],
    })) as bigint;
    const steps: Array<{ tx: (typeof bundle.txs)[number]; label: 'approve' | 'swap' }> = [];
    if (currentAllowance >= bridgeAmount) {
      console.log(
        `  allowance already ${currentAllowance === (1n << 256n) - 1n ? 'MAX_UINT256' : currentAllowance.toString()} — skipping approve`,
      );
    } else {
      steps.push({ tx: approveTxReq, label: 'approve' });
    }
    steps.push({ tx: swapTxReq, label: 'swap' });

    let nonce = await evmClient.getTransactionCount({
      address: evmAccount.address,
      blockTag: 'pending',
    });
    let lastHash: `0x${string}` | undefined;
    for (const { tx, label } of steps) {
      const gas = await evmClient.estimateGas({
        account: evmAccount.address,
        to: tx.to,
        data: tx.data,
        value: tx.value,
      });
      const hash = await evmWallet.sendTransaction({
        to: tx.to,
        data: tx.data,
        value: tx.value,
        gas: (gas * 120n) / 100n,
        nonce,
      });
      console.log(`  sent ${label}: ${hash} (nonce ${nonce})`);
      nonce += 1;
      const receipt = await evmClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== 'success') throw new Error(`${label} reverted`);
      console.log(`  ✓ confirmed ${label} (block ${receipt.blockNumber})`);
      lastHash = hash;
    }
    const trackingSig = lastHash!;
    console.log(`  tracking  : ${trackingSig}`);
    console.log(`  explorer  : https://explorer.mayan.finance/swap/${trackingSig}`);

    section('Step 2 — Poll Mayan until settled on Solana');
    const start = Date.now();
    let last: string = '';
    const timeoutMs = 15 * 60 * 1000;
    while (Date.now() - start < timeoutMs) {
      try {
        const s = await mayan.getOrderStatus(trackingSig);
        if (s !== last) {
          console.log(`  status=${s} (t+${Math.round((Date.now() - start) / 1000)}s)`);
          last = s;
        }
        if (s === 'SETTLED') break;
        if (s === 'REFUNDED') throw new Error('bridge was refunded');
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!msg.includes('404')) console.log(`  status fetch err: ${msg}`);
      }
      await new Promise((r) => setTimeout(r, 5000));
    }
    if (last !== 'SETTLED') throw new Error(`bridge-in did not settle in time (last=${last})`);
    const afterUsdc = await solanaUsdcBalance(connection, solOwner);
    console.log(
      `  Sol USDC after: ${fmtUsdc(afterUsdc)} USDC (Δ ${fmtUsdc(afterUsdc - solUsdcAta)})`,
    );
  }

  section('Step 3 — Kamino REPAY ALL');
  const [repayTxRaw] = await kamino.buildRepayTx({ owner: solOwner, amount: 'all' });
  if (!repayTxRaw) throw new Error('no repay tx');
  const repayTx = await patchComputeUnitLimit(connection, repayTxRaw, solOwner);
  await signAndSend(connection, repayTx, signer, 'repay');
  const obligation1 = await kamino.getObligation(solOwner);
  console.log(
    `  after repay: collateral=${obligation1 ? fmtSol(obligation1.collateralLamports) : 'null'} SOL, borrowed=${obligation1 ? fmtUsdc(obligation1.borrowedUsdcBaseUnits) : '-'} USDC`,
  );

  section('Step 4 — Kamino WITHDRAW ALL collateral');
  // klend-sdk builds withdraw tx remaining-accounts from a cached obligation
  // snapshot; refresh it so the just-repaid borrow reserve is no longer
  // included (otherwise refresh_obligation fails with InvalidAccountInput).
  await kamino.reload();
  const [withdrawTxRaw] = await kamino.buildWithdrawCollateralTx({
    owner: solOwner,
    lamports: 'all',
  });
  if (!withdrawTxRaw) throw new Error('no withdraw tx');
  const withdrawTx = await patchComputeUnitLimit(connection, withdrawTxRaw, solOwner);
  await signAndSend(connection, withdrawTx, signer, 'withdraw');
  const obligation2 = await kamino.getObligation(solOwner);
  console.log(
    `  after withdraw: ${obligation2 ? `collateral=${fmtSol(obligation2.collateralLamports)} SOL, borrowed=${fmtUsdc(obligation2.borrowedUsdcBaseUnits)} USDC` : 'null (closed)'}`,
  );

  section('Final balances');
  const endSol = BigInt(await connection.getBalance(solOwner));
  const endSolUsdc = await solanaUsdcBalance(connection, solOwner);
  const endBaseUsdc = (await evmClient.readContract({
    address: BASE_USDC as `0x${string}`,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [evmAccount.address],
  })) as bigint;
  console.log(`  Sol SOL    : ${fmtSol(endSol)} SOL`);
  console.log(`  Sol USDC   : ${fmtUsdc(endSolUsdc)} USDC`);
  console.log(`  Base USDC  : ${fmtUsdc(endBaseUsdc)} USDC`);

  section('Summary');
  const fullyClosed =
    !obligation2 ||
    (obligation2.collateralLamports === 0n && obligation2.borrowedUsdcBaseUnits === 0n);
  if (fullyClosed) {
    console.log('  ✓ CLOSE flow succeeded — position fully closed end-to-end');
  } else {
    console.log(`  ✗ position not fully closed`);
    process.exitCode = 1;
  }
}

main().catch((e: unknown) => {
  const msg = e instanceof Error ? (e.stack ?? e.message) : JSON.stringify(e);
  console.error('fatal:', msg);
  process.exit(1);
});
