/**
 * Poll Mayan's explorer API for an expired Swift order until the keeper
 * refunds it, or timeout. Prints status transitions and exits with the
 * refundTxHash (or 1 on timeout).
 *
 * Mayan's `refundRelayerFee` is an on-chain bounty paid to any relayer that
 * processes the cancel+refund post-deadline, so this is typically automatic
 * within ~5-30 min of deadline. See docs/time-log.md (TODO) for notes.
 *
 * Usage:
 *   pnpm tsx scripts/wait-refund.ts <sourceTxSig> [--timeout-min 60]
 */
const EXPLORER = 'https://explorer-api.mayan.finance/v3/swap/trx';

interface OrderView {
  status?: string;
  clientStatus?: string;
  deadline?: string;
  driverAddress?: string | null;
  fulfillTxHash?: string | null;
  refundTxHash?: string | null;
  unlockTxHash?: string | null;
}

function parseArgs(): { sig: string; timeoutMs: number } {
  const args = process.argv.slice(2);
  const sig = args.find((a) => !a.startsWith('-'));
  if (!sig) {
    console.error('usage: pnpm tsx scripts/wait-refund.ts <sig> [--timeout-min N]');
    process.exit(1);
  }
  const tIdx = args.indexOf('--timeout-min');
  const mins = tIdx >= 0 && args[tIdx + 1] ? Number(args[tIdx + 1]) : 60;
  return { sig, timeoutMs: mins * 60_000 };
}

async function fetchOrder(sig: string): Promise<OrderView> {
  const r = await fetch(`${EXPLORER}/${sig}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as OrderView;
}

function fmtTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m${s % 60}s` : `${s}s`;
}

async function main(): Promise<void> {
  const { sig, timeoutMs } = parseArgs();
  console.log(`polling ${EXPLORER}/${sig}`);
  console.log(`explorer UI: https://explorer.mayan.finance/swap/${sig}`);

  const start = Date.now();
  let prev = '';
  while (Date.now() - start < timeoutMs) {
    try {
      const o = await fetchOrder(sig);
      const line = `${o.status}/${o.clientStatus} driver=${o.driverAddress ? 'yes' : 'none'} fulfill=${o.fulfillTxHash ? 'yes' : 'none'} refund=${o.refundTxHash ? 'yes' : 'none'}`;
      if (line !== prev) {
        console.log(`  [t+${fmtTime(Date.now() - start)}] ${line}`);
        prev = line;
      }
      if (o.refundTxHash) {
        console.log(`\n✓ REFUNDED — refundTxHash: ${o.refundTxHash}`);
        return;
      }
      if (o.fulfillTxHash) {
        console.log(`\n✓ FULFILLED (solver picked up!) — fulfillTxHash: ${o.fulfillTxHash}`);
        return;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`  [t+${fmtTime(Date.now() - start)}] fetch err: ${msg}`);
    }
    await new Promise((r) => setTimeout(r, 15_000));
  }
  console.error(`\n✗ timeout after ${fmtTime(timeoutMs)} — still unresolved`);
  process.exit(1);
}

main().catch((e: unknown) => {
  console.error('fatal:', e instanceof Error ? e.message : e);
  process.exit(1);
});
