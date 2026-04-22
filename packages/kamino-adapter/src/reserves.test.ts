import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Connection, PublicKey } from '@solana/web3.js';

const { loadSpy } = vi.hoisted(() => ({ loadSpy: vi.fn() }));
vi.mock('@kamino-finance/klend-sdk', () => ({
  KaminoMarket: { load: loadSpy },
}));

import { loadMarket } from './reserves.js';

describe('loadMarket', () => {
  beforeEach(() => loadSpy.mockReset());

  it('returns the market when KaminoMarket.load resolves', async () => {
    const fakeMarket = { programId: new PublicKey('11111111111111111111111111111111') };
    loadSpy.mockResolvedValue(fakeMarket);
    const connection = new Connection('http://localhost:8899');
    const marketAddress = new PublicKey('7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF');
    const result = await loadMarket({ connection, marketAddress });
    expect(result).toBe(fakeMarket);
    expect(loadSpy).toHaveBeenCalledWith(connection, marketAddress, 450);
  });

  it('throws a descriptive error when KaminoMarket.load returns null', async () => {
    loadSpy.mockResolvedValue(null);
    const connection = new Connection('http://localhost:8899');
    const marketAddress = new PublicKey('7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF');
    await expect(loadMarket({ connection, marketAddress })).rejects.toThrow(
      /KaminoMarket\.load returned null/,
    );
  });
});
