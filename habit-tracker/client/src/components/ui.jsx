import { useEffect, useState } from 'react';
import { X, Dumbbell, Code, Brain, BookOpen, Droplets, Flower2, Moon, Target } from 'lucide-react';

export const ICONS = { dumbbell: Dumbbell, code: Code, brain: Brain, book: BookOpen, water: Droplets, flower: Flower2, moon: Moon, target: Target };
export const inp = 'w-full rounded-lg border border-zinc-200 bg-transparent px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-zinc-700';
export const btn = 'inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800';
export const btnP = 'inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600';
export const iconBtn = 'rounded-md p-1.5 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200';

export const Card = ({ title, action, children, className = '' }) => (
  <section className={`rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 ${className}`}>
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
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  const submit = async (e) => {
    e.preventDefault();
    try { await onSubmit(); onClose(); } catch (x) { setErr(x.message); }
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl dark:bg-zinc-900">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button onClick={onClose} aria-label="Close" className={iconBtn}><X size={18} /></button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          {children}
          {err && <p role="alert" className="text-sm text-red-500">{err}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className={btn}>Cancel</button>
            <button className={btnP}>Save</button>
          </div>
        </form>
      </div>
    </div>
  );
}
