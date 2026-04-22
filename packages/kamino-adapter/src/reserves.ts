import type { Connection, PublicKey } from '@solana/web3.js';
// The real klend-sdk export is `KaminoMarket`; re-exported lazily to avoid
// importing browser-incompatible sub-paths from dependent pure-TS packages.
import { KaminoMarket } from '@kamino-finance/klend-sdk';

// Solana mainnet-beta nominal slot duration (~450ms). klend-sdk uses this to
// project refreshed reserve state; the exact value is not consensus-critical
// for our use case (we read obligations and let the SDK compute fresh amounts).
const RECENT_SLOT_DURATION_MS = 450;

export async function loadMarket(args: {
  connection: Connection;
  marketAddress: PublicKey;
}): Promise<KaminoMarket> {
  const market = await KaminoMarket.load(
    args.connection,
    args.marketAddress,
    RECENT_SLOT_DURATION_MS,
  );
  if (!market)
    throw new Error(`KaminoMarket.load returned null for ${args.marketAddress.toBase58()}`);
  return market;
}
