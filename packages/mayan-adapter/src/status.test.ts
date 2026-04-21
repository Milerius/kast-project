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
});
