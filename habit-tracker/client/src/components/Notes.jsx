import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Pin, Plus, Search, Trash2, X } from 'lucide-react';
import { api } from '../api';
import RichEditor from './RichEditor';
import { Card, btn, btnP, iconBtn, inp } from './ui';

const MAX = 3000000; // characters; images count towards this
const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const plain = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
// Older notes were plain text; show them as paragraphs.
const toHtml = (n) => (n.format === 'html' ? n.content || '' : (n.content || '').split('\n').map((l) => `<p>${esc(l) || '<br>'}</p>`).join(''));
const chip = (on) => `rounded-full px-3 py-1 text-xs ${on ? 'bg-indigo-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800'}`;

export default function Notes() {
  const [notes, setNotes] = useState([]);
  const [topics, setTopics] = useState([]);
  const [q, setQ] = useState('');
  const [topic, setTopic] = useState('All');
  const [sub, setSub] = useState('All');
  const [newTopic, setNewTopic] = useState('');
  const [draft, setDraft] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [state, setState] = useState('saved');
  const [ek, setEk] = useState(0); // changes when a note is opened, so the editor reloads its text
  const [err, setErr] = useState('');
  const saving = useRef(false);
  const draftRef = useRef(null);
  draftRef.current = draft;

  useEffect(() => {
    Promise.all([api.get('/notes'), api.get('/topics')]).then(([n, t]) => { setNotes(n); setTopics(t); }).catch((e) => setErr(e.message));
  }, []);

  const names = useMemo(() => {
    const c = {};
    notes.forEach((n) => { const k = n.type || 'Personal'; c[k] = (c[k] || 0) + 1; });
    topics.forEach((t) => { c[t.name] = c[t.name] || 0; });
    return Object.entries(c).sort((a, b) => a[0].localeCompare(b[0]));
  }, [notes, topics]);
  const subs = (t) => [...new Set(notes.filter((n) => n.type === t && n.section).map((n) => n.section))];
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return notes
      .filter((n) => (topic === 'All' || n.type === topic) && (sub === 'All' || n.section === sub) && (!s || [n.title, n.preview, n.summary].join(' ').toLowerCase().includes(s)))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || new Date(b.updatedAt) - new Date(a.updatedAt));
  }, [notes, q, topic, sub]);

  const open = async (n) => {
    setErr('');
    try { const full = await api.get('/notes/' + n._id); setDraft({ ...full, content: toHtml(full) }); setEk((k) => k + 1); setDirty(false); setState('saved'); }
    catch (e) { setErr(e.message); }
  };
  const create = () => {
    setErr(''); setDraft({ title: '', type: topic === 'All' ? names[0]?.[0] || 'Personal' : topic, section: sub === 'All' ? '' : sub, content: '', pinned: false });
    setEk((k) => k + 1); setDirty(false); setState('saved');
  };
  const update = (patch) => { setDraft((d) => ({ ...d, ...patch })); setDirty(true); setState('unsaved'); };

  const save = async (d = draft) => {
    if (!d || saving.current) return false;
    if (d.content.length > MAX) { setErr('This note is too large. Remove or shrink some images.'); return false; }
    saving.current = true; setState('saving'); setErr('');
    let ok = false;
    try {
      const body = { title: d.title.trim() || 'Untitled', type: d.type, section: d.section || '', content: d.content, format: 'html', pinned: !!d.pinned,
        summary: d.summary || '', book: d.book || '', page: d.page || '', preview: plain(d.content).slice(0, 160) };
      const r = d._id ? await api.put(`/notes/${d._id}`, body) : await api.post('/notes', body);
      const { content, ...meta } = r; // eslint-disable-line no-unused-vars
      setNotes((l) => (l.some((n) => n._id === meta._id) ? l.map((n) => (n._id === meta._id ? meta : n)) : [...l, meta]));
      setDraft((x) => (x ? { ...x, _id: meta._id } : x));
      const cur = draftRef.current;
      const same = cur && ['title', 'type', 'section', 'content', 'pinned'].every((k) => cur[k] === d[k]);
      setDirty(!same); setState(same ? 'saved' : 'unsaved'); ok = true;
    } catch (e) { setErr(e.message); setState('unsaved'); }
    saving.current = false;
    return ok;
  };

  useEffect(() => {
    if (!dirty) return undefined;
    const t = setTimeout(() => save(), 1500);
    return () => clearTimeout(t);
  }, [draft, dirty]); // eslint-disable-line

  const back = async () => { if (dirty && !(await save())) return; setDraft(null); };
  const del = async () => {
    if (!window.confirm('Delete this note?')) return;
    try { if (draft._id) await api.del('/notes/' + draft._id); setNotes((l) => l.filter((n) => n._id !== draft._id)); setDraft(null); }
    catch (e) { setErr(e.message); }
  };
  const addTopic = async (e) => {
    e.preventDefault();
    const name = newTopic.trim();
    if (!name) return;
    const have = names.find(([n]) => n.toLowerCase() === name.toLowerCase());
    try {
      const t = have ? { name: have[0] } : await api.post('/topics', { name });
      if (!have) setTopics((l) => [...l, t]);
      setTopic(t.name); setSub('All'); setNewTopic('');
    } catch (x) { setErr(x.message); }
  };
  const delTopic = async (name) => {
    const t = topics.find((x) => x.name === name);
    if (!t) return;
    try { await api.del('/topics/' + t._id); setTopics((l) => l.filter((x) => x._id !== t._id)); if (topic === name) setTopic('All'); } catch (x) { setErr(x.message); }
  };

  if (draft) {
    const types = [...new Set([draft.type, ...names.map(([n]) => n)])];
    return (
      <div className="fixed inset-0 z-40 flex flex-col bg-zinc-100 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
          <button className={iconBtn} aria-label="Back to notes" onClick={back}><ArrowLeft size={18} /></button>
          <select aria-label="Topic" className={`${inp} w-auto py-1`} value={draft.type} onChange={(e) => update({ type: e.target.value, section: '' })}>
            {types.map((n) => <option key={n}>{n}</option>)}
          </select>
          <input list="subs" aria-label="Sub-topic" className={`${inp} w-32 py-1`} placeholder="Sub-topic" maxLength={40} value={draft.section || ''} onChange={(e) => update({ section: e.target.value })} />
          <datalist id="subs">{subs(draft.type).map((s) => <option key={s} value={s} />)}</datalist>
          <span className="ml-auto text-xs text-zinc-500">{state === 'saving' ? 'Saving...' : state === 'saved' ? 'Saved' : 'Unsaved changes'}</span>
          <button className={iconBtn} aria-label="Pin note" onClick={() => update({ pinned: !draft.pinned })}><Pin size={16} className={draft.pinned ? 'text-indigo-500' : ''} /></button>
          <button className={iconBtn} aria-label="Delete note" onClick={del}><Trash2 size={16} /></button>
        </div>
        {err && <p role="alert" className="shrink-0 bg-red-50 px-4 py-1.5 text-xs text-red-600 dark:bg-red-500/10">{err}</p>}
        <RichEditor key={ek} value={draft.content} onChange={(content) => update({ content })} onError={setErr}
          header={<input aria-label="Title" className="mb-4 w-full border-0 bg-transparent text-3xl font-semibold outline-none placeholder:text-zinc-300" placeholder="Untitled" maxLength={120} value={draft.title} onChange={(e) => update({ title: e.target.value })} />} />
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
      <Card title="Topics" className="h-fit">
        <ul className="space-y-1">
          {[['All', notes.length], ...names].map(([n, c]) => (
            <li key={n} className="flex items-center">
              <button onClick={() => { setTopic(n); setSub('All'); }} className={`flex min-w-0 flex-1 items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-sm ${topic === n ? 'bg-indigo-50 font-medium text-indigo-600 dark:bg-indigo-500/10' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'}`}>
                <span className="truncate">{n}</span><span className="text-xs text-zinc-400">{c}</span>
              </button>
              {n !== 'All' && c === 0 && <button className={iconBtn} aria-label={`Delete topic ${n}`} onClick={() => delTopic(n)}><X size={13} /></button>}
            </li>
          ))}
        </ul>
        <form onSubmit={addTopic} className="mt-3 flex gap-2">
          <input aria-label="New topic" className={`${inp} py-1`} placeholder="New topic" maxLength={40} value={newTopic} onChange={(e) => setNewTopic(e.target.value)} />
          <button className={btn} aria-label="Add topic"><Plus size={14} /></button>
        </form>
      </Card>
      <div className="min-w-0 space-y-4">
        {err && <p role="alert" className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600 dark:bg-red-500/10">{err}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1"><Search size={14} className="absolute left-3 top-3 text-zinc-400" />
            <input aria-label="Search notes" className={`${inp} pl-8`} placeholder="Search notes" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <button className={btnP} onClick={create}><Plus size={16} />New note</button>
        </div>
        {topic !== 'All' && subs(topic).length > 0 && (
          <div className="flex flex-wrap gap-1">{['All', ...subs(topic)].map((s) => <button key={s} onClick={() => setSub(s)} className={chip(sub === s)}>{s}</button>)}</div>
        )}
        {shown.length === 0 ? <Card><p className="py-8 text-center text-sm text-zinc-500">No notes here yet. Tap New note to write one.</p></Card> : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((n) => (
              <li key={n._id}>
                <button onClick={() => open(n)} className="h-full w-full rounded-xl border border-zinc-200 bg-white p-4 text-left shadow-sm transition hover:border-indigo-400 dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="flex items-center justify-between gap-2"><span className="truncate font-medium">{n.title}</span>{n.pinned && <Pin size={13} className="shrink-0 text-indigo-500" />}</div>
                  <p className="mt-0.5 truncate text-xs text-zinc-500">{n.type}{n.section && ` | ${n.section}`} | {new Date(n.updatedAt).toLocaleDateString()}</p>
                  <p className="mt-2 line-clamp-3 text-sm text-zinc-600 dark:text-zinc-400">{n.preview || n.summary}</p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}