'use client';
import { PrivyProvider } from '@privy-io/react-auth';
import { KAMINO_MAIN_MARKET } from '@kast/shared';
import type { ReactNode } from 'react';
import { env } from '../lib/env.js';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <PrivyProvider
      appId={env.privyAppId()}
      config={{
        loginMethods: ['email', 'google'],
        embeddedWallets: {
          createOnLogin: 'users-without-wallets',
          solana: { createOnLogin: 'users-without-wallets' },
        },
        appearance: { theme: 'dark' },
      }}
    >
      <div data-kamino-market={KAMINO_MAIN_MARKET}>{children}</div>
    </PrivyProvider>
  );
}
