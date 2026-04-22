'use client';
import { usePrivy } from '@privy-io/react-auth';
import { Icon } from './Icon.js';

export function Login() {
  const { login, ready } = usePrivy();
  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-md w-full bg-surface-container-low rounded-3xl p-10 border border-outline-variant/10 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary-container/5 to-transparent pointer-events-none" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-6">
            <span className="text-3xl font-black tracking-tighter text-tertiary">KAST</span>
            <span className="font-technical text-[10px] tracking-widest text-outline">
              · V1.0.0-LIVE
            </span>
          </div>
          <h1 className="text-4xl font-black tracking-tighter mb-3">
            Cross-chain
            <br />
            <span className="text-primary-container">yield curator</span>
          </h1>
          <p className="text-on-surface-variant mb-8 leading-relaxed">
            Deposit SOL on Kamino, borrow USDC, bridge to Base via Mayan Swift, and unwind it all in
            one atomic workflow.
          </p>
          <button
            onClick={login}
            disabled={!ready}
            className="w-full bg-primary-container text-on-primary-container font-bold py-4 rounded-2xl flex items-center justify-center gap-3 hover:brightness-110 transition disabled:opacity-50"
          >
            <Icon name="login" className="text-lg" />
            <span className="tracking-tight">Connect with Privy</span>
          </button>
          <div className="grid grid-cols-3 gap-3 mt-8">
            <div className="bg-surface-container rounded-xl p-3 flex flex-col items-center gap-2 border border-outline-variant/10">
              <Icon name="security" className="text-secondary" />
              <span className="font-technical text-[9px] tracking-widest text-on-surface-variant uppercase">
                Embedded
              </span>
            </div>
            <div className="bg-surface-container rounded-xl p-3 flex flex-col items-center gap-2 border border-outline-variant/10">
              <Icon name="bolt" className="text-secondary" />
              <span className="font-technical text-[9px] tracking-widest text-on-surface-variant uppercase">
                Atomic
              </span>
            </div>
            <div className="bg-surface-container rounded-xl p-3 flex flex-col items-center gap-2 border border-outline-variant/10">
              <Icon name="verified" className="text-secondary" />
              <span className="font-technical text-[9px] tracking-widest text-on-surface-variant uppercase">
                Audited SDKs
              </span>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
