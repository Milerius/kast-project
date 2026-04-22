import type { StepSig } from './store.js';

export type ExplorerLink = { href: string; label: string };

export function explorerLinks(sig: StepSig): ExplorerLink[] {
  switch (sig.kind) {
    case 'sol':
      return [{ href: `https://solscan.io/tx/${sig.sig}`, label: 'Solscan' }];
    case 'base':
      return [{ href: `https://basescan.org/tx/${sig.sig}`, label: 'Basescan' }];
    case 'mayan': {
      const chain =
        sig.sourceChain === 'solana'
          ? { href: `https://solscan.io/tx/${sig.sig}`, label: 'Solscan' }
          : { href: `https://basescan.org/tx/${sig.sig}`, label: 'Basescan' };
      // Mayan explorer indexes by source tx sig for all routes.
      return [{ href: `https://explorer.mayan.finance/swap/${sig.sig}`, label: 'Mayan' }, chain];
    }
  }
}
