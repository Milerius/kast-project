import { describe, it, expect, vi } from 'vitest';
import { getOrderStatus } from './status.js';

describe('getOrderStatus', () => {
  it.each([
    ['ORDER_IN_PROGRESS', 'PENDING'],
    ['ORDER_COMPLETED', 'SETTLED'],
    ['ORDER_REFUNDED', 'REFUNDED'],
  ] as const)('maps %s → %s', async (sdk, expected) => {
    const fetchStatus = vi.fn().mockResolvedValue({ clientStatus: sdk });
    await expect(getOrderStatus({ fetchStatus } as never, '0xabc')).resolves.toBe(expected);
  });

  it('unknown status → PENDING', async () => {
    const fetchStatus = vi.fn().mockResolvedValue({ clientStatus: 'WHATEVER' });
    await expect(getOrderStatus({ fetchStatus } as never, 'h')).resolves.toBe('PENDING');
  });

  it('MCTP REDEEMED_ON_EVM_WITH_FEE → SETTLED', async () => {
    const fetchStatus = vi
      .fn()
      .mockResolvedValue({ clientStatus: 'ORDER_IN_PROGRESS', status: 'REDEEMED_ON_EVM_WITH_FEE' });
    await expect(getOrderStatus({ fetchStatus } as never, 'h')).resolves.toBe('SETTLED');
  });

  it('MCTP REDEEMED_ON_SOLANA_WITH_FEE → SETTLED', async () => {
    const fetchStatus = vi.fn().mockResolvedValue({
      clientStatus: 'ORDER_IN_PROGRESS',
      status: 'REDEEMED_ON_SOLANA_WITH_FEE',
    });
    await expect(getOrderStatus({ fetchStatus } as never, 'h')).resolves.toBe('SETTLED');
  });

  it('completedAt populated → SETTLED (even without known status)', async () => {
    const fetchStatus = vi.fn().mockResolvedValue({
      clientStatus: 'ORDER_IN_PROGRESS',
      completedAt: '2026-04-21T22:01:53.000Z',
    });
    await expect(getOrderStatus({ fetchStatus } as never, 'h')).resolves.toBe('SETTLED');
  });

  it('refundTxHash set → REFUNDED', async () => {
    const fetchStatus = vi
      .fn()
      .mockResolvedValue({ clientStatus: 'ORDER_IN_PROGRESS', refundTxHash: '0xabc' });
    await expect(getOrderStatus({ fetchStatus } as never, 'h')).resolves.toBe('REFUNDED');
  });
});
