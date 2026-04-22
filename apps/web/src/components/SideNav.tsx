'use client';
import { Icon } from './Icon.js';

const NAV = [
  { label: 'Overview', icon: 'dashboard', active: true },
  { label: 'Assets', icon: 'account_balance', active: false },
  { label: 'Yield', icon: 'trending_up', active: false },
  { label: 'Bridge', icon: 'swap_calls', active: false },
  { label: 'Security', icon: 'verified_user', active: false },
];

export function SideNav() {
  return (
    <aside className="h-screen w-64 fixed left-0 top-0 pt-24 hidden md:flex flex-col border-r border-outline-variant/10 bg-surface z-40">
      <div className="px-6 py-4">
        <div className="text-[10px] font-technical uppercase tracking-[0.2em] text-outline">
          Technical Curator
        </div>
        <div className="text-[10px] font-technical text-outline/50 mt-1">V1.0.0-LIVE</div>
      </div>
      <nav className="flex-grow mt-8">
        {NAV.map((n) =>
          n.active ? (
            <div
              key={n.label}
              className="text-primary-container bg-surface-container-low font-bold border-l-4 border-primary-container px-6 py-4 flex items-center gap-4"
            >
              <Icon name={n.icon} />
              <span className="font-technical text-[12px] uppercase tracking-widest">
                {n.label}
              </span>
            </div>
          ) : (
            <div
              key={n.label}
              title="Coming soon"
              className="text-secondary/40 cursor-not-allowed px-6 py-4 flex items-center gap-4"
            >
              <Icon name={n.icon} />
              <span className="font-technical text-[12px] uppercase tracking-widest">
                {n.label}
              </span>
              <span className="font-technical text-[9px] tracking-widest text-outline ml-auto">
                SOON
              </span>
            </div>
          ),
        )}
      </nav>
      <div className="mt-auto p-6 space-y-4">
        <div className="flex flex-col gap-2">
          <div
            title="Coming soon"
            className="text-secondary/40 flex items-center gap-2 text-[10px] uppercase tracking-widest cursor-not-allowed"
          >
            <Icon name="menu_book" className="text-sm" /> Documentation
          </div>
          <div
            title="Coming soon"
            className="text-secondary/40 flex items-center gap-2 text-[10px] uppercase tracking-widest cursor-not-allowed"
          >
            <Icon name="help_outline" className="text-sm" /> Support
          </div>
        </div>
      </div>
    </aside>
  );
}
