import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Pin, Plus, Search, Trash2 } from 'lucide-react';
import { api } from '../api';
import { Card, btn, iconBtn } from './ui';

const TYPES = ['Personal', 'Spiritual', 'Book'];
const blank = { title: '', type: 'Personal', book: '', page: '', content: '', summary: '', pinned: false };
const field = 'w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900';

export default function Notes() {
  const [notes, setNotes] = useState([]);
  const [draft, setDraft] = useState(null); // null = no note open
  const [q, setQ] = useState('');
  const [type, setType] = useState('All');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.get('/notes').then(setNotes).catch((e) => setErr(e.message)); }, []);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return notes
      .filter((n) => (type === 'All' || n.type === type) &&
        (!s || [n.title, n.book, n.content, n.summary].join(' ').toLowerCase().includes(s)))
      .sort((a, b) => b.pinned - a.pinned || new Date(b.updatedAt) - new Date(a.updatedAt));
  }, [notes, q, type]);

  const set = (k) => (e) => setDraft({ ...draft, [k]: e.target.value });

  const save = async () => {
    if (!draft.title.trim()) return setErr('Give the note a title.');
    setBusy(true); setErr('');
    try {
      const r = draft._id ? await api.put(`/notes/${draft._id}`, draft) : await api.post('/notes', draft);
      setNotes((l) => (draft._id ? l.map((n) => (n._id === r._id ? r : n)) : [...l, r]));
      setDraft(r);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const del = async () => {
    if (!window.confirm('Delete this note?')) return;
    try {
      await api.del(`/notes/${draft._id}`);
      setNotes((l) => l.filter((n) => n._id !== draft._id));
      setDraft(null);
    } catch (e) { setErr(e.message); }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* LIST */}
      <div className={`min-w-0 ${draft ? 'hidden lg:block' : ''}`}>
        <Card title="Notes" action={<button className={iconBtn} aria-label="New note" onClick={() => { setErr(''); setDraft({ ...blank }); }}><Plus size={16} /></button>}>
          <div className="relative mb-3">
            <Search size={14} className="absolute left-3 top-3 text-zinc-400" />
            <input className={`${field} pl-8`} placeholder="Search notes" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="mb-3 flex flex-wrap gap-1">
            {['All', ...TYPES].map((t) => (
              <button key={t} onClick={() => setType(t)}
                className={`rounded-full px-3 py-1 text-xs ${type === t ? 'bg-indigo-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800'}`}>{t}</button>
            ))}
          </div>
          {shown.length === 0 && <p className="py-4 text-center text-sm text-zinc-500">No notes yet.</p>}
          <ul className="space-y-2">
            {shown.map((n) => (
              <li key={n._id}>
                <button onClick={() => { setErr(''); setDraft(n); }}
                  className={`w-full rounded-lg border p-3 text-left transition hover:border-indigo-400 ${draft?._id === n._id ? 'border-indigo-600' : 'border-zinc-200 dark:border-zinc-800'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{n.title}</span>
                    {n.pinned && <Pin size={12} className="shrink-0 text-indigo-500" />}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-zinc-500">
                    {n.type}{n.book && ` · ${n.book}`} · {new Date(n.updatedAt).toLocaleDateString()}
                  </p>
                  {n.summary && <p className="mt-1 line-clamp-2 text-xs text-zinc-600 dark:text-zinc-400">{n.summary}</p>}
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* EDITOR */}
      <div className={`min-w-0 lg:col-span-2 ${draft ? '' : 'hidden lg:block'}`}>
        {!draft ? (
          <Card title="Editor"><p className="py-8 text-center text-sm text-zinc-500">Select a note or tap + to write a new one.</p></Card>
        ) : (
          <Card title={draft._id ? 'Edit note' : 'New note'}
            action={<div className="flex gap-1">
              <button className={iconBtn} aria-label="Back" onClick={() => setDraft(null)}><ArrowLeft size={15} /></button>
              <button className={iconBtn} aria-label="Pin" onClick={() => setDraft({ ...draft, pinned: !draft.pinned })}><Pin size={15} className={draft.pinned ? 'text-indigo-500' : ''} /></button>
              {draft._id && <button className={iconBtn} aria-label="Delete" onClick={del}><Trash2 size={15} /></button>}
            </div>}>
            {err && <p role="alert" className="mb-3 text-xs text-red-500">{err}</p>}
            <div className="space-y-3">
              <input className={field} placeholder="Title" maxLength={120} value={draft.title} onChange={set('title')} />
              <div className="flex flex-wrap gap-1">
                {TYPES.map((t) => (
                  <button key={t} onClick={() => setDraft({ ...draft, type: t })}
                    className={`rounded-full px-3 py-1 text-xs ${draft.type === t ? 'bg-indigo-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800'}`}>{t}</button>
                ))}
              </div>
              {draft.type === 'Book' && (
                <div className="grid grid-cols-3 gap-2">
                  <input className={`${field} col-span-2`} placeholder="Book title" maxLength={120} value={draft.book} onChange={set('book')} />
                  <input className={field} placeholder="Page" maxLength={20} value={draft.page} onChange={set('page')} />
                </div>
              )}
              <textarea className={`${field} min-h-[240px] resize-y`} placeholder="Write your notes..." value={draft.content} onChange={set('content')} />
              <textarea className={`${field} min-h-[80px] resize-y`} placeholder="Summary / key takeaway (1-2 lines)" maxLength={1000} value={draft.summary} onChange={set('summary')} />
              <button className={btn} disabled={busy} onClick={save}>{busy ? 'Saving...' : 'Save note'}</button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}