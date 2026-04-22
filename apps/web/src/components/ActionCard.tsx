'use client';
import type { ReactNode } from 'react';
import { Icon } from './Icon.js';
import type { ExplorerLink } from '../lib/explorers.js';

type Status = 'done' | 'active' | 'locked' | 'disabled';

export function ActionCard({
  index,
  icon,
  title,
  subtitle,
  status,
  onClick,
  busy,
  links,
  children,
}: {
  index: number;
  icon: string;
  title: string;
  subtitle: string;
  status: Status;
  onClick?: () => void;
  busy?: boolean;
  links?: ExplorerLink[];
  children?: ReactNode;
}) {
  const disabled = status !== 'active' || busy;
  const ring =
    status === 'done'
      ? 'border-primary-container/40'
      : status === 'active'
        ? 'border-primary-container/70 ring-2 ring-primary-container/20'
        : 'border-outline-variant/10';
  const iconBg =
    status === 'done'
      ? 'bg-primary-container text-on-primary-container'
      : status === 'active'
        ? 'bg-surface-container-high text-primary-container border border-primary-container/40'
        : 'bg-surface-container text-on-surface/30';
  const stateIcon =
    status === 'done'
      ? 'check_circle'
      : status === 'locked' || status === 'disabled'
        ? 'lock'
        : busy
          ? 'hourglass_top'
          : 'arrow_forward_ios';
  const stateIconClass =
    status === 'done'
      ? 'text-primary-container'
      : status === 'active'
        ? 'text-primary-container'
        : 'text-on-surface/20';

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`text-left w-full flex items-start gap-5 p-5 rounded-2xl bg-surface-container-low border ${ring} transition-all ${
        disabled
          ? 'opacity-80 cursor-not-allowed'
          : 'hover:bg-surface-container hover:border-primary-container/90 cursor-pointer'
      }`}
    >
      <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${iconBg}`}>
        <Icon name={icon} filled={status === 'done'} className="text-xl" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-technical text-[10px] tracking-widest text-outline">
            STEP {index}
          </span>
          {status === 'done' && (
            <span className="font-technical text-[10px] tracking-widest text-primary-container">
              · COMPLETE
            </span>
          )}
          {status === 'active' && (
            <span className="font-technical text-[10px] tracking-widest text-primary-container">
              · READY
            </span>
          )}
        </div>
        <div className="text-lg font-bold tracking-tight text-on-surface">{title}</div>
        <div className="font-technical text-xs text-on-surface-variant mt-1 truncate">
          {subtitle}
        </div>
        {links && links.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="font-technical text-[10px] tracking-widest text-primary-container hover:underline flex items-center gap-1 bg-primary-container/10 px-2 py-0.5 rounded-full"
              >
                {l.label}
                <Icon name="open_in_new" className="text-xs" />
              </a>
            ))}
          </div>
        )}
        {children && <div className="mt-3">{children}</div>}
      </div>
      <Icon name={stateIcon} className={`text-lg mt-1 ${stateIconClass}`} />
    </button>
  );
}
