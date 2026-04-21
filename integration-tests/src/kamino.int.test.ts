import { describe, it, expect } from 'vitest';
import { Connection, PublicKey } from '@solana/web3.js';
import { createKaminoAdapter } from '@kast/kamino-adapter';
import { KAMINO_MAIN_MARKET } from '@kast/shared';

const rpc = process.env.SOLANA_RPC_URL ?? 'https://api.mainnet-beta.solana.com';

describe.skipIf(!process.env.KAST_INTEGRATION)('Kamino live', () => {
  it('loads main market and getObligation returns null for fresh pubkey', async () => {
    const connection = new Connection(rpc, 'confirmed');
    const kamino = createKaminoAdapter({
      connection,
      marketAddress: new PublicKey(KAMINO_MAIN_MARKET),
    });
    const fresh = new PublicKey('11111111111111111111111111111111');
    const obligation = await kamino.getObligation(fresh);
    expect(obligation).toBeNull();
  });
});
