import { Connection, PublicKey } from '@solana/web3.js';
import { createKaminoAdapter, type KaminoAdapter } from '@kast/kamino-adapter';
import { createMayanAdapter, type MayanAdapter } from '@kast/mayan-adapter';
import { env } from './env.js';

let connection: Connection | null = null;
let kamino: KaminoAdapter | null = null;
let mayan: MayanAdapter | null = null;

export function sharedConnection(): Connection {
  if (!connection) connection = new Connection(env.solanaRpcUrl(), 'confirmed');
  return connection;
}

export function sharedKamino(): KaminoAdapter {
  if (!kamino) {
    kamino = createKaminoAdapter({
      connection: sharedConnection(),
      marketAddress: new PublicKey(process.env.NEXT_PUBLIC_KAMINO_MARKET ?? ''),
    });
  }
  return kamino;
}

export function sharedMayan(): MayanAdapter {
  if (!mayan) {
    const referrer = env.mayanReferrer();
    mayan = createMayanAdapter({
      solanaConnection: sharedConnection(),
      ...(referrer !== undefined && { referrer }),
    });
  }
  return mayan;
}
