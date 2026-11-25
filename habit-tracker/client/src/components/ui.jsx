import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Dumbbell, Code, Brain, BookOpen, Droplets, Flower2, Moon, Target } from 'lucide-react';

export const ICONS = { dumbbell: Dumbbell, code: Code, brain: Brain, book: BookOpen, water: Droplets, flower: Flower2, moon: Moon, target: Target };
export const inp = 'w-full min-h-10 rounded-lg border border-zinc-200 bg-transparent px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-zinc-700';
export const btn = 'inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800';
export const btnP = 'inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600';
export const iconBtn = 'inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200';

export const Card = ({ title, action, children, className = '' }) => (
  <section className={`app-card rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-5 ${className}`}>
    {(title || action) && (
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{title}</h2>{action}
      </div>
    )}
    {children}
  </section>
);

export const Field = ({ label, children }) => (
  <label className="block text-sm"><span className="mb-1 block text-zinc-500">{label}</span>{children}</label>
);

export const Bar = ({ value }) => (
  <div className="h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
    <div className="h-full rounded-full bg-indigo-600 transition-all duration-500" style={{ width: `${value}%` }} />
  </div>
);

// onSubmit may be async and may throw an Error(message) to show a validation/server error.
export function Modal({ title, onClose, onSubmit, children }) {
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submitLock = useRef(false);
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  const submit = async (e) => {
    e.preventDefault();
    if (submitLock.current) return;
    submitLock.current = true;
    setBusy(true);
    setErr('');
    try { await onSubmit(); onClose(); } catch (x) { setErr(x.message || 'Unable to save. Please try again.'); }
    finally { submitLock.current = false; setBusy(false); }
  };
  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-3 sm:p-4" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()}
        className="app-modal flex w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white p-4 shadow-xl dark:bg-zinc-900 sm:p-6">
        <div className="mb-3 flex shrink-0 items-center justify-between sm:mb-4">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button onClick={onClose} aria-label="Close" className={iconBtn}><X size={18} /></button>
        </div>
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain py-1 pr-1">
            {children}
          </div>
          <div className="flex shrink-0 flex-col gap-2 border-t border-zinc-100 bg-white pt-3 dark:border-zinc-800 dark:bg-zinc-900">
            {err && <p role="alert" className="text-sm text-red-500">{err}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className={btn}>Cancel</button>
              <button type="submit" disabled={busy} className={btnP}>{busy ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
