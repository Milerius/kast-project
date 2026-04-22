'use client';
import { PrivyProvider } from '@privy-io/react-auth';
import { KAMINO_MAIN_MARKET } from '@kast/shared';
import type { ReactNode } from 'react';
import { base as baseChain } from 'viem/chains';
import { env } from '../lib/env.js';

const base = { ...baseChain, testnet: baseChain.testnet ?? false };

// Privy's bundled styled-components forward an `isActive` prop to a DOM
// element inside their modal; React's dev-mode unknown-attribute warning
// floods the console on every render. Filter just that message — this is a
// library-side bug we can't patch without vendoring Privy.
if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
  const origError = console.error;
  console.error = (...args: unknown[]) => {
    const first = args[0];
    // React's warning template is "Received `%s` for a non-boolean attribute
    // `%s`…" — the prop name `isactive` is in a later arg, not the template.
    // Match when the first arg looks like one of these warning templates AND
    // any arg is the offending `isActive` prop (case-insensitive).
    if (typeof first === 'string') {
      const isAttrWarn =
        first.includes('non-boolean attribute') ||
        first.includes('does not recognize the `%s` prop');
      const mentionsIsActive = args.some((a) => typeof a === 'string' && /isactive/i.test(a));
      if (isAttrWarn && mentionsIsActive) return;
    }
    origError(...args);
  };
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <PrivyProvider
      appId={env.privyAppId()}
      config={{
        loginMethods: ['email', 'google'],
        embeddedWallets: {
          ethereum: { createOnLogin: 'users-without-wallets' },
          solana: { createOnLogin: 'users-without-wallets' },
        },
        // Pin the EVM embedded wallet to Base; otherwise it defaults to
        // Ethereum mainnet and Mayan approve/swap txs target the wrong chain.
        defaultChain: base,
        supportedChains: [base],
        appearance: { theme: 'dark' },
      }}
    >
      <div data-kamino-market={KAMINO_MAIN_MARKET}>{children}</div>
    </PrivyProvider>
  );
}
