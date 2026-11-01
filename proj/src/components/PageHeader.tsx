import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { AccountButton } from './AccountButton';

/** Header seragam semua halaman: eyebrow + judul + (opsional) sub, tombol aksi, dan tombol akun 👤 di kanan. */
export const HeaderIconButton: React.FC<{ label: string; onClick: () => void; children: React.ReactNode }> = ({ label, onClick, children }) => (
  <button onClick={onClick} className="ds-icon-btn" aria-label={label} title={label}>{children}</button>
);

export const PageHeader: React.FC<{
  title: React.ReactNode; eyebrow?: string; sub?: React.ReactNode; onBack?: () => void;
  actions?: React.ReactNode; account?: boolean;
}> = ({ title, eyebrow, sub, onBack, actions, account = true }) => (
  <header className="ds-header">
    {onBack && <button onClick={onBack} className="ds-icon-btn -ml-1" aria-label="Kembali"><ArrowLeft size={22} /></button>}
    <div className="min-w-0 flex-1">
      {eyebrow && <p className="ds-eyebrow">{eyebrow}</p>}
      <h1 className="ds-title truncate">{title}</h1>
      {sub && <div className="mt-1">{sub}</div>}
    </div>
    <div className="flex items-center gap-2 shrink-0">
      {actions}
      {account && <AccountButton />}
    </div>
  </header>
);
