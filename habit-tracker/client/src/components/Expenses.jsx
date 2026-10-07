import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Pencil, Trash2 } from 'lucide-react';
import { api } from '../api';
import { fmt, parse } from '../lib';
import { Bar, Card, Field, btn, btnP, iconBtn, inp } from './ui';

const CATS = ['Food', 'Transport', 'Books & Study', 'Rent', 'Fees', 'Bills & Recharge', 'Entertainment', 'Health', 'Shopping', 'Other'];
const money = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const blank = (date) => ({ amount: '', category: CATS[0], date, note: '' });

export default function Expenses({ today }) {
  const [items, setItems] = useState([]);
  const [budget, setBudget] = useState(0);
  const [budgetText, setBudgetText] = useState('');
  const [m, setM] = useState(() => parse(today).getFullYear() * 12 + parse(today).getMonth());
  const [f, setF] = useState(blank(today));
  const [editId, setEditId] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    Promise.all([api.get('/expenses'), api.get('/settings')])
      .then(([e, s]) => { setItems(e); setBudget(s.budget || 0); setBudgetText(s.budget || ''); })
      .catch((x) => setErr(x.message));
  }, []);

  const y = Math.floor(m / 12), mo = m % 12;
  const prefix = `${y}-${String(mo + 1).padStart(2, '0')}`;
  const label = new Date(y, mo, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const dim = new Date(y, mo + 1, 0).getDate();
  const cur = today.slice(0, 7);

  const s = useMemo(() => {
    const list = items.filter((i) => i.date.startsWith(prefix)).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt?.localeCompare(a.createdAt));
    const total = list.reduce((a, i) => a + i.amount, 0);
    const by = {};
    list.forEach((i) => { by[i.category] = (by[i.category] || 0) + i.amount; });
    const cats = Object.entries(by).sort((a, b) => b[1] - a[1]);
    const elapsed = prefix === cur ? parse(today).getDate() : prefix < cur ? dim : 0;
    return { list, total, cats, avg: elapsed ? total / elapsed : 0, left: prefix === cur ? dim - parse(today).getDate() + 1 : 0 };
  }, [items, prefix, today, dim, cur]);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
 const submit = async (e) => {
  e.preventDefault();

  const amount = Number(f.amount);

  if (!(amount > 0)) {
    return setErr('Enter an amount greater than 0.');
  }

  if (!f.date) {
    return setErr('Pick a date.');
  }

  try {
    setErr('');

    const body = {
      ...f,
      amount,
      note: f.note.trim(),
    };

    if (editId) {
      const r = await api.put(`/expenses/${editId}`, body);

      setItems((list) =>
        list.map((item) =>
          item._id === editId ? r : item
        )
      );
    } else {
      const r = await api.post('/expenses', body);

      setItems((list) => [...list, r]);
    }

    setF(blank(today));
    setEditId(null);

  } catch (x) {
    setErr(x.message);
  }
};
  const edit = (i) => { setEditId(i._id); setF({ amount: i.amount, category: i.category, date: i.date, note: i.note }); };
  const del = async (id) => { try { await api.del(`/expenses/${id}`); setItems((l) => l.filter((x) => x._id !== id)); } catch (x) { setErr(x.message); } };
  const saveBudget = async (e) => {
    e.preventDefault();
    const v = Number(budgetText || 0);
    if (!(v >= 0)) return setErr('Budget cannot be negative.');
    try { setErr(''); await api.put('/settings/budget', { value: v }); setBudget(v); } catch (x) { setErr(x.message); }
  };

  const used = budget ? Math.min(100, (s.total / budget) * 100) : 0;
  const rem = budget - s.total;
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <Card title="Spending" action={
          <div className="flex items-center gap-1 text-sm">
            <button className={iconBtn} aria-label="Previous month" onClick={() => setM(m - 1)}><ChevronLeft size={16} /></button>
            <span className="w-32 text-center">{label}</span>
            <button className={iconBtn} aria-label="Next month" onClick={() => setM(m + 1)}><ChevronRight size={16} /></button>
          </div>}>
          <div className="grid grid-cols-3 gap-3 text-center">
            {[['Spent', money(s.total)], ['Daily average', money(s.avg)], ['Top category', s.cats[0]?.[0] || 'None']].map(([l, v]) => (
              <div key={l} className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-800/50"><p className="truncate text-lg font-semibold">{v}</p><p className="text-xs text-zinc-500">{l}</p></div>
            ))}
          </div>
          {budget > 0 && (
            <div className="mt-4">
              <div className="mb-1 flex justify-between text-sm">
                <span>{money(s.total)} of {money(budget)}</span>
                <span className={rem < 0 ? 'font-medium text-red-500' : 'text-zinc-500'}>{rem < 0 ? `${money(-rem)} over budget` : `${money(rem)} left`}</span>
              </div>
              <div className={rem < 0 ? '[&_div>div]:bg-red-500' : ''}><Bar value={used} /></div>
              {s.left > 0 && rem > 0 && <p className="mt-1 text-xs text-zinc-500">You can spend about {money(rem / s.left)} per day for the rest of the month.</p>}
            </div>
          )}
        </Card>

        <Card title={editId ? 'Edit expense' : 'Add expense'}>
          <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
            <Field label="Amount (₹)"><input type="number" min="0" step="0.01" className={inp} value={f.amount} onChange={set('amount')} placeholder="0" /></Field>
            <Field label="Category"><select className={inp} value={f.category} onChange={set('category')}>{CATS.map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Date"><input type="date" className={inp} value={f.date} onChange={set('date')} /></Field>
            <Field label="Note (optional)"><input maxLength={100} className={inp} value={f.note} onChange={set('note')} placeholder="e.g. Lunch at canteen" /></Field>
            {err && <p role="alert" className="text-xs text-red-500 sm:col-span-2">{err}</p>}
            <div className="flex gap-2 sm:col-span-2">
              <button className={btnP}>{editId ? 'Save changes' : 'Add expense'}</button>
              {editId && <button type="button" className={btn} onClick={() => { setEditId(null); setF(blank(today)); }}>Cancel</button>}
            </div>
          </form>
        </Card>

        <Card title="Transactions">
          {s.list.length === 0 ? <p className="py-6 text-center text-sm text-zinc-500">No expenses in {label}. Add one above.</p> : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {s.list.map((i) => (
                <li key={i._id} className="flex items-center gap-3 py-2.5">
                  <span className="w-14 shrink-0 text-xs text-zinc-500">{fmt(i.date, { month: 'short', day: 'numeric' })}</span>
                  <div className="min-w-0 flex-1"><p className="truncate text-sm">{i.note || i.category}</p>{i.note && <p className="text-xs text-zinc-500">{i.category}</p>}</div>
                  <span className="text-sm font-medium">{money(i.amount)}</span>
                  <button className={iconBtn} aria-label="Edit expense" onClick={() => edit(i)}><Pencil size={14} /></button>
                  <button className={iconBtn} aria-label="Delete expense" onClick={() => window.confirm('Delete this expense?') && del(i._id)}><Trash2 size={14} /></button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="min-w-0 space-y-6">
        <Card title="By category">
          {s.cats.length === 0 ? <p className="text-sm text-zinc-500">Nothing to show yet.</p> : (
            <ul className="space-y-3">
              {s.cats.map(([c, v]) => (
                <li key={c}>
                  <div className="mb-1 flex justify-between text-sm"><span>{c}</span><span>{money(v)} <span className="text-xs text-zinc-400">{Math.round((v / s.total) * 100)}%</span></span></div>
                  <Bar value={(v / s.total) * 100} />
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Monthly budget">
          <form onSubmit={saveBudget} className="flex gap-2">
            <input type="number" min="0" aria-label="Monthly budget" className={inp} value={budgetText} onChange={(e) => setBudgetText(e.target.value)} placeholder="e.g. 8000" />
            <button className={btnP}>Save</button>
          </form>
          <p className="mt-2 text-xs text-zinc-500">Applies to every month. Set it to 0 to turn it off.</p>
        </Card>
      </div>
    </div>
  );
}