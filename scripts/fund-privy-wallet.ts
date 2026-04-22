/**
 * Fund a Privy embedded wallet from the test wallet so the UI happy-path can
 * run end-to-end in the browser.
 *
 * Sends `--sol 0.26` (default) from .env.test.local's SOLANA_TEST_SECRET to
 * the Privy-created Solana address, and optionally `--eth 0.001` from
 * BASE_TEST_PRIVKEY to the Privy EVM address for the close leg's approve+swap
 * gas. Pass either or both addresses.
 *
 * Usage (after logging into localhost:3000 and copying the WalletPill addrs):
 *   pnpm tsx scripts/fund-privy-wallet.ts \
 *     --sol-to <privy_sol_address> \
 *     --evm-to <privy_evm_address>
 *   pnpm tsx scripts/fund-privy-wallet.ts --sol-to <addr> --sol 0.3
 *   pnpm tsx scripts/fund-privy-wallet.ts --evm-to 0x... --eth 0.002
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import bs58 from 'bs58';
import { createPublicClient, createWalletClient, http, parseEther, formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import { LAMPORTS_PER_SOL } from '@kast/shared';

interface Args {
  solTo?: string;
  evmTo?: `0x${string}`;
  solAmount: number;
  ethAmount: number;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const out: Args = { solAmount: 0.26, ethAmount: 0.001 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--sol-to') out.solTo = argv[++i];
    else if (a === '--evm-to') out.evmTo = argv[++i] as `0x${string}`;
    else if (a === '--sol') out.solAmount = Number(argv[++i]);
    else if (a === '--eth') out.ethAmount = Number(argv[++i]);
    else throw new Error(`unknown arg: ${a}`);
  }
  if (!out.solTo && !out.evmTo) {
    throw new Error('pass at least --sol-to <addr> or --evm-to <addr>');
  }
  return out;
}

function loadEnv(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, 'utf-8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith('#')) out[m[1]!] = m[2]!;
  }
  return out;
}

async function fundSol(rpc: string, secret: string, to: string, sol: number) {
  const connection = new Connection(rpc, 'confirmed');
  const signer = Keypair.fromSecretKey(bs58.decode(secret));
  const lamports = BigInt(Math.round(sol * Number(LAMPORTS_PER_SOL)));
  const bal = BigInt(await connection.getBalance(signer.publicKey));
  console.log(
    `sol: from ${signer.publicKey.toBase58()} → ${to}, sending ${sol} SOL (source bal ${(Number(bal) / Number(LAMPORTS_PER_SOL)).toFixed(6)})`,
  );
  if (bal < lamports + 5_000_000n) {
    throw new Error('source wallet has insufficient SOL for the transfer + fees');
  }
  const { blockhash } = await connection.getLatestBlockhash();
  const ix = SystemProgram.transfer({
    fromPubkey: signer.publicKey,
    toPubkey: new PublicKey(to),
    lamports,
  });
  const msg = new TransactionMessage({
    payerKey: signer.publicKey,
    recentBlockhash: blockhash,
    instructions: [ix],
  }).compileToV0Message();
  const tx = new VersionedTransaction(msg);
  tx.sign([signer]);
  const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
  console.log(`  sig: ${sig}`);
  const { lastValidBlockHeight } = await connection.getLatestBlockhash();
  await connection.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    'confirmed',
  );
  console.log('  ✓ confirmed');
}

async function fundEth(privkey: `0x${string}`, to: `0x${string}`, eth: number) {
  const account = privateKeyToAccount(privkey);
  const wallet = createWalletClient({ account, chain: base, transport: http() });
  const client = createPublicClient({ chain: base, transport: http() });
  const bal = await client.getBalance({ address: account.address });
  console.log(
    `eth: from ${account.address} → ${to}, sending ${eth} ETH (source bal ${formatEther(bal)})`,
  );
  const value = parseEther(String(eth));
  if (bal < value + parseEther('0.0001')) {
    throw new Error('source base wallet has insufficient ETH for the transfer + gas');
  }
  const nonce = await client.getTransactionCount({ address: account.address, blockTag: 'pending' });
  const hash = await wallet.sendTransaction({ to, value, nonce });
  console.log(`  hash: ${hash}`);
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error('transfer reverted');
  console.log(`  ✓ confirmed (block ${receipt.blockNumber})`);
}

async function main() {
  const args = parseArgs();
  const webEnv = loadEnv(resolve(process.cwd(), 'apps/web/.env.local'));
  const testEnv = loadEnv(resolve(process.cwd(), '.env.test.local'));

  if (args.solTo) {
    const rpc = webEnv.NEXT_PUBLIC_SOLANA_RPC_URL!;
    const secret = testEnv.SOLANA_TEST_SECRET!;
    if (!rpc || !secret)
      throw new Error('missing NEXT_PUBLIC_SOLANA_RPC_URL or SOLANA_TEST_SECRET');
    await fundSol(rpc, secret, args.solTo, args.solAmount);
  }
  if (args.evmTo) {
    const privkey = testEnv.BASE_TEST_PRIVKEY as `0x${string}` | undefined;
    if (!privkey) throw new Error('missing BASE_TEST_PRIVKEY');
    await fundEth(privkey, args.evmTo, args.ethAmount);
  }
}

main().catch((e: unknown) => {
  const msg = e instanceof Error ? (e.stack ?? e.message) : JSON.stringify(e);
  console.error('fatal:', msg);
  process.exit(1);
});
