import { useEffect, useMemo, useState } from "react";

const pad = (n) => String(n).padStart(2, "0");
// Local-time value for <input type="datetime-local"> (toISOString() would give UTC).
const toLocalInput = (v) => {
  const d = v ? new Date(v) : null;
  if (!d || Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const emptyTrade = {
  pair: "NIFTY CE",
  direction: "Long",
  entry: "",
  exit: "",
  stopLoss: "",
  takeProfit: "",
  result: "Open",
  setup: "",
  capitalUsed: "",
  riskAmount: "",
  quantity: "",
  leverage: "1",
  fees: "0",
  openedAt: toLocalInput(new Date()),
  closedAt: "",
  emotionBefore: "Calm",
  emotionAfter: "Calm",
  mistake: "",
  lesson: "",
  notes: "",
  // Use only when your broker/instrument configuration provides the correct multiplier.
  contractMultiplier: "",
  brokerPnl: "",
};

const NUMERIC_KEYS = [
  "entry", "exit", "stopLoss", "takeProfit", "capitalUsed", "riskAmount",
  "quantity", "leverage", "fees", "contractMultiplier", "brokerPnl",
];

const EMOTIONS = ["Calm", "Confident", "Fearful", "Greedy", "FOMO", "Frustrated", "Tired", "Overconfident"];

const money = (value) =>
  Number.isFinite(value)
    ? new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2,
      }).format(value)
    : "—";

const num = (value) => {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const isVerified = (t) => t.pnlStatus === "broker" || t.pnlStatus === "calculated";

// jsPDF's built-in fonts have no ₹ glyph (it renders as garbage), so the PDF uses "Rs.".
const pdfMoney = (v) => {
  if (!Number.isFinite(v)) return "-";
  const s = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(Math.abs(v));
  return `${v < 0 ? "-" : ""}Rs. ${s}`;
};

// Text shown in the "i" tooltip next to each field label.
const INFO = {
  pair: { text: "The instrument you traded. Pick one, or add a new one. Pairs are saved to your account and reused next time.", example: "NIFTY CE, NIFTY PE, XAUUSD" },
  entry: { text: "Price per unit at which you opened the trade. Not the total money spent.", example: "Option bought at 79 → enter 79." },
  exit: { text: "Price per unit at which you closed. Leave blank while the trade is open. Entering it marks the trade as closed.", example: "Sold at 84 → enter 84." },
  stopLoss: { text: "Price where you plan to exit at a loss. For Long it must be below entry; for Short, above entry. Used for risk-to-reward.", example: "Long entry 79 → stop-loss 72." },
  takeProfit: { text: "Price where you plan to take profit. For Long it must be above entry; for Short, below.", example: "Long entry 79 → target 93." },
  result: { text: "Open, Win, Loss or Break-even. Once net P/L is known it is set automatically from net P/L after fees (above 0 = Win, below 0 = Loss, exactly 0 = Break-even). Until then your choice is kept but the trade stays Unverified.", example: "Entry 79, exit 84, qty 75, multiplier 1, fees ₹20 → net ₹355 → Win." },
  capitalUsed: { text: "Total money allocated to this position. Used for return % and risk %.", example: "₹5,925" },
  riskAmount: { text: "Money you accept losing if the stop-loss is hit. Used for risk as % of capital.", example: "₹1,050 on ₹5,925 capital = 17.72%." },
  quantity: { text: "Number of units traded, not the rupee value. If you trade in lots, convert to units or set the multiplier accordingly.", example: "75" },
  leverage: { text: "Leverage on the position. Use 1 for none. Stored for review; it does not change P/L.", example: "1 or 10" },
  fees: { text: "Brokerage, taxes and other charges in ₹. Subtracted from gross P/L to get net P/L. Not subtracted again if you enter a broker P/L.", example: "₹20" },
  contractMultiplier: { text: "Converts a price move into rupees: P/L = price difference × quantity × multiplier. Leave blank if you are not sure; the app will not guess and the trade stays Unverified.", example: "1 when quantity is in units. If quantity is in lots, use your broker's lot size." },
  brokerPnl: { text: "Net P/L exactly as your broker reports it (already after charges). If filled, it is used instead of any estimate, and fees are not subtracted again. Negative for a loss.", example: "-340" },
  riskPct: { text: "Planned risk amount ÷ capital used. Calculated for you.", example: "1,050 ÷ 5,925 = 17.72%" },
  rr: { text: "Potential reward ÷ potential risk, from entry, stop-loss and target. Needs all three prices.", example: "Entry 79, stop 72, target 93 → 1 : 2.00" },
  openedAt: { text: "When you entered the trade, in your local time. Used for date filtering." },
  closedAt: { text: "When you exited, in your local time. Entering it marks the trade as closed. Clear it to reopen the trade." },
};

// A span (not a button) so it never hijacks the surrounding <label>'s focus behaviour.
function InfoTip({ text, example }) {
  return (
    <span className="tj-info" tabIndex={0} role="button" aria-label="More info" onClick={(e) => e.preventDefault()}>
      i
      <span className="tj-tip" role="tooltip">
        {text}
        {example ? <em>Example: {example}</em> : null}
      </span>
    </span>
  );
}

function Field({ label, children, hint, info }) {
  return (
    <label className="tj-field">
      <span className="tj-label">{label}{info ? <InfoTip {...info} /> : null}</span>
      {children}
      {hint ? <small className="tj-hint">{hint}</small> : null}
    </label>
  );
}

function Input({ value, onChange, ...props }) {
  return (
    <input
      className="tj-input"
      value={value ?? ""}
      onChange={(event) => onChange(event.target.value)}
      {...props}
    />
  );
}

function Select({ value, onChange, options, ...props }) {
  return (
    <select
      className="tj-input"
      value={value ?? ""}
      onChange={(event) => onChange(event.target.value)}
      {...props}
    >
      {options.map((option) => (
        <option key={option} value={option}>{option}</option>
      ))}
    </select>
  );
}

function Section({ title, description, children }) {
  return (
    <section className="tj-section">
      <div className="tj-section-head">
        <h3>{title}</h3>
        {description ? <p>{description}</p> : null}
      </div>
      <div className="tj-grid">{children}</div>
    </section>
  );
}

export default function TradingJournal() {
  const [trades, setTrades] = useState([]);
  const [pairs, setPairs] = useState(["NIFTY CE", "NIFTY PE", "NIFTY", "XAUUSD", "BTCUSD"]);
  const [form, setForm] = useState(emptyTrade);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [filterPair, setFilterPair] = useState("All pairs");
  const [filterResult, setFilterResult] = useState("All results");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [addingPair, setAddingPair] = useState(false);
  const [newPair, setNewPair] = useState("");
  const [pairBusy, setPairBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  const token = () =>
    localStorage.getItem("token") ||
    localStorage.getItem("authToken") ||
    localStorage.getItem("accessToken") ||
    "";

  async function request(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
        ...options.headers,
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || data.message || `Request failed (${response.status})`);
    return data;
  }

  async function loadTrades() {
    setLoading(true);
    setError("");
    try {
      const data = await request("/api/trading/trades");
      setTrades(Array.isArray(data) ? data : data.trades || []);
    } catch (err) {
      setError(err.message || "Could not load trades.");
    } finally {
      setLoading(false);
    }
  }

  async function loadSetupPairs() {
    try {
      const data = await request("/api/trading/setup");
      const configured = (data?.pairs || data?.setup?.pairs || [])
        .map((item) => typeof item === "string" ? item : item?.symbol || item?.pair || item?.name)
        .filter(Boolean);
      if (configured.length) setPairs([...new Set(configured)]);
    } catch {
      // Keep the fallback list if the setup endpoint is not available.
    }
  }

  useEffect(() => {
    loadTrades();
    loadSetupPairs();
  }, []);

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  // Live preview. Mirrors derivePnl() on the backend; the backend value is what gets saved.
  const computed = useMemo(() => {
    const entry = num(form.entry);
    const exit = num(form.exit);
    const stop = num(form.stopLoss);
    const target = num(form.takeProfit);
    const qty = num(form.quantity);
    const multiplier = num(form.contractMultiplier);
    const capital = num(form.capitalUsed);
    const risk = num(form.riskAmount);
    const fees = num(form.fees) || 0;
    const broker = num(form.brokerPnl);

    const riskPct = capital > 0 && risk !== null ? (risk / capital) * 100 : null;
    const riskPerUnit = entry !== null && stop !== null
      ? (form.direction === "Long" ? entry - stop : stop - entry)
      : null;
    const rewardPerUnit = entry !== null && target !== null
      ? (form.direction === "Long" ? target - entry : entry - target)
      : null;
    const rr = riskPerUnit > 0 && rewardPerUnit !== null && rewardPerUnit > 0
      ? rewardPerUnit / riskPerUnit
      : null;

    // Do not guess P/L from price alone. A verified multiplier is required.
    const grossPnl = entry !== null && exit !== null && qty > 0 && multiplier > 0
      ? (form.direction === "Long" ? exit - entry : entry - exit) * qty * multiplier
      : null;
    const isClosed = exit !== null || !!form.closedAt;
    const netPnl = !isClosed
      ? null
      : broker !== null
        ? broker
        : grossPnl !== null ? grossPnl - fees : null;
    const rounded = netPnl === null ? null : Math.round(netPnl * 100) / 100;
    const autoResult = rounded === null ? null : rounded > 0 ? "Win" : rounded < 0 ? "Loss" : "Break-even";
    const returnPct = capital > 0 && netPnl !== null ? (netPnl / capital) * 100 : null;
    const estimatedRisk = riskPerUnit !== null && qty > 0 && multiplier > 0
      ? Math.max(0, riskPerUnit) * qty * multiplier
      : null;
    const estimatedReward = rewardPerUnit !== null && qty > 0 && multiplier > 0
      ? Math.max(0, rewardPerUnit) * qty * multiplier
      : null;

    return {
      riskPct, rr, grossPnl, netPnl, autoResult, returnPct,
      estimatedRisk, estimatedReward, multiplierReady: multiplier > 0,
      fromBroker: broker !== null && isClosed,
    };
  }, [form]);

  const filteredTrades = useMemo(
    () => trades.filter((t) => {
      const day = toLocalInput(t.openedAt).slice(0, 10);
      return (filterPair === "All pairs" || t.pair === filterPair)
        && (filterResult === "All results" || (t.result || "Open") === filterResult)
        && (!filterFrom || day >= filterFrom)
        && (!filterTo || day <= filterTo);
    }),
    [trades, filterPair, filterResult, filterFrom, filterTo]
  );

  const stats = useMemo(() => {
    const closed = filteredTrades.filter((trade) => trade.result && trade.result !== "Open");
    const verified = closed.filter(isVerified);
    const wins = closed.filter((trade) => trade.result === "Win").length;
    const totalPnl = verified.reduce((s, t) => s + (num(t.pnl) || 0), 0);
    const totalCapital = verified.reduce((s, t) => s + (num(t.capitalUsed) || 0), 0);
    return {
      count: filteredTrades.length,
      closed: closed.length,
      verified: verified.length,
      winRate: closed.length ? (wins / closed.length) * 100 : null,
      totalPnl,
      returnPct: totalCapital > 0 ? (totalPnl / totalCapital) * 100 : null,
    };
  }, [filteredTrades]);

  const byPair = useMemo(() => {
    const m = {};
    filteredTrades.filter(isVerified).forEach((t) => {
      const r = (m[t.pair] ||= { pair: t.pair, trades: 0, wins: 0, capital: 0, pnl: 0 });
      r.trades++;
      if (t.result === "Win") r.wins++;
      r.capital += num(t.capitalUsed) || 0;
      r.pnl += num(t.pnl) || 0;
    });
    return Object.values(m).map((r) => ({
      ...r,
      ret: r.capital > 0 ? (r.pnl / r.capital) * 100 : null,
    }));
  }, [filteredTrades]);

  // Risk-management summary (used in the PDF report).
  const riskSummary = useMemo(() => {
    const withRisk = filteredTrades.filter((t) => num(t.capitalUsed) > 0 && num(t.riskAmount) > 0);
    const withRR = filteredTrades.map((t) => {
      const e = num(t.entry), s = num(t.stopLoss), tp = num(t.takeProfit);
      if (e === null || s === null || tp === null) return null;
      const risk = t.direction === "Short" ? s - e : e - s;
      const reward = t.direction === "Short" ? e - tp : tp - e;
      return risk > 0 && reward > 0 ? reward / risk : null;
    }).filter((v) => v !== null);
    const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
    return {
      avgRiskPct: avg(withRisk.map((t) => (num(t.riskAmount) / num(t.capitalUsed)) * 100)),
      avgRR: avg(withRR),
      noStopLoss: filteredTrades.filter((t) => num(t.stopLoss) === null).length,
      unverifiedClosed: stats.closed - stats.verified,
    };
  }, [filteredTrades, stats]);

  // Persists a new pair via the existing PUT /api/trading/setup route, then selects it in the form.
  async function addPair() {
    const name = newPair.trim().replace(/\s+/g, " ").toUpperCase();
    if (!name) { setError("Enter a pair name, for example XAUUSD."); return; }
    if (name.length > 30) { setError("Pair name can be at most 30 characters."); return; }
    setPairBusy(true);
    setError("");
    try {
      const merged = [...new Set([...pairs, name])];
      const data = await request("/api/trading/setup", {
        method: "PUT",
        body: JSON.stringify({ pairs: merged }),
      });
      setPairs(data.pairs?.length ? data.pairs : merged);
      set("pair", name);
      setNewPair("");
      setAddingPair(false);
    } catch (err) {
      setError(err.message || "Could not add the pair.");
    } finally {
      setPairBusy(false);
    }
  }

  function openNew() {
    setForm({ ...emptyTrade, openedAt: toLocalInput(new Date()) });
    setEditingId(null);
    setAddingPair(false);
    setNewPair("");
    setError("");
    setNotice("");
    setShowForm(true);
  }

  function openEdit(trade) {
    const next = { ...emptyTrade, ...trade };
    NUMERIC_KEYS.forEach((key) => {
      next[key] = next[key] ?? "";
    });
    next.openedAt = toLocalInput(next.openedAt);
    next.closedAt = toLocalInput(next.closedAt);
    setForm(next);
    setEditingId(trade._id || trade.id);
    setAddingPair(false);
    setNewPair("");
    setError("");
    setNotice("");
    setShowForm(true);
  }

  async function saveTrade(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");

    const payload = {
      ...form,
      entry: num(form.entry),
      exit: num(form.exit),
      stopLoss: num(form.stopLoss),
      takeProfit: num(form.takeProfit),
      capitalUsed: num(form.capitalUsed),
      riskAmount: num(form.riskAmount),
      quantity: num(form.quantity),
      leverage: num(form.leverage) || 1,
      fees: num(form.fees) || 0,
      contractMultiplier: num(form.contractMultiplier),
      brokerPnl: num(form.brokerPnl),
      // "" (not undefined) so a cleared date actually reaches the backend.
      openedAt: form.openedAt ? new Date(form.openedAt).toISOString() : "",
      closedAt: form.closedAt ? new Date(form.closedAt).toISOString() : "",
    };

    try {
      const url = editingId ? `/api/trading/trades/${editingId}` : "/api/trading/trades";
      const data = await request(url, {
        method: editingId ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
      const saved = data.trade || data;
      setTrades((current) => {
        const id = saved._id || saved.id || editingId;
        if (editingId) return current.map((item) => (item._id || item.id) === id ? saved : item);
        return [saved, ...current];
      });
      if (saved.pair) setPairs((current) => (current.includes(saved.pair) ? current : [...current, saved.pair]));
      setShowForm(false);
      setEditingId(null);
      setForm(emptyTrade);
      setNotice(editingId ? "Trade updated successfully." : "Trade saved successfully.");
    } catch (err) {
      setError(err.message || "Could not save trade. Your form is still open.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteTrade(trade) {
    const id = trade._id || trade.id;
    if (!id || !window.confirm("Delete this trade permanently?")) return;
    setError("");
    try {
      await request(`/api/trading/trades/${id}`, { method: "DELETE" });
      setTrades((current) => current.filter((item) => (item._id || item.id) !== id));
      setNotice("Trade deleted.");
    } catch (err) {
      setError(err.message || "Could not delete trade.");
    }
  }

  async function downloadPdf() {
    setPdfBusy(true);
    setError("");
    try {
      const [{ jsPDF }, { default: autoTable }] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
      ]);
      const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      const left = 40;
      const dt = (v) => toLocalInput(v).replace("T", " ") || "-";

      doc.setFont("helvetica", "bold").setFontSize(18).text("Trading Journal Report", left, 44);
      doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(100);
      doc.text(`Generated ${new Date().toLocaleString("en-IN")}`, left, 60);
      doc.text(
        `Filters: ${filterPair} | ${filterResult} | ${filterFrom || "start"} to ${filterTo || "today"}`,
        left, 73
      );
      doc.setTextColor(0);

      autoTable(doc, {
        startY: 88,
        head: [["Trades", "Closed", "Verified", "Win rate", "Verified net P/L", "Return on capital"]],
        body: [[
          stats.count, stats.closed, stats.verified,
          stats.winRate === null ? "-" : `${stats.winRate.toFixed(1)}%`,
          pdfMoney(stats.totalPnl),
          stats.returnPct === null ? "-" : `${stats.returnPct.toFixed(2)}%`,
        ]],
        theme: "grid", headStyles: { fillColor: [37, 99, 235] }, styles: { fontSize: 9 },
      });

      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 16,
        head: [["Risk metrics", "Value"]],
        body: [
          ["Average planned risk as % of capital", riskSummary.avgRiskPct === null ? "-" : `${riskSummary.avgRiskPct.toFixed(2)}%`],
          ["Average planned risk-to-reward", riskSummary.avgRR === null ? "-" : `1 : ${riskSummary.avgRR.toFixed(2)}`],
          ["Trades without a stop-loss", String(riskSummary.noStopLoss)],
          ["Closed trades with unverified P/L (excluded from totals)", String(riskSummary.unverifiedClosed)],
        ],
        theme: "grid", headStyles: { fillColor: [71, 85, 105] }, styles: { fontSize: 9 },
        columnStyles: { 0: { cellWidth: 320 } }, tableWidth: 460,
      });

      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 16,
        head: [["Pair", "Trades", "Win rate", "Capital used", "Net P/L", "Return"]],
        body: byPair.length
          ? byPair.map((r) => [
              r.pair, r.trades, `${((r.wins / r.trades) * 100).toFixed(0)}%`,
              pdfMoney(r.capital), pdfMoney(r.pnl), r.ret === null ? "-" : `${r.ret.toFixed(2)}%`,
            ])
          : [["No verified trades", "", "", "", "", ""]],
        theme: "grid", headStyles: { fillColor: [71, 85, 105] }, styles: { fontSize: 9 },
      });

      doc.addPage();
      doc.setFont("helvetica", "bold").setFontSize(13).text("Trade history", left, 44);
      autoTable(doc, {
        startY: 56,
        head: [["Opened", "Pair", "Dir", "Entry", "Exit", "SL", "TP", "Qty", "Fees", "Result", "Net P/L", "P/L source", "Mistake / lesson"]],
        body: filteredTrades.map((t) => [
          dt(t.openedAt), t.pair, t.direction, t.entry ?? "-", t.exit ?? "-",
          t.stopLoss ?? "-", t.takeProfit ?? "-", t.quantity ?? "-", t.fees ?? "-",
          t.result || "Open",
          isVerified(t) ? pdfMoney(num(t.pnl)) : "Unverified",
          t.pnlStatus === "broker" ? "Broker" : t.pnlStatus === "calculated" ? "Calculated" : "-",
          [t.mistake, t.lesson].filter(Boolean).join(" / ") || "-",
        ]),
        theme: "striped", headStyles: { fillColor: [37, 99, 235] },
        styles: { fontSize: 7.5, cellPadding: 3, overflow: "linebreak" },
        columnStyles: { 12: { cellWidth: 150 } },
        margin: { left, right: left },
      });

      const pages = doc.getNumberOfPages();
      for (let i = 1; i <= pages; i++) {
        doc.setPage(i);
        doc.setFontSize(8).setTextColor(130);
        doc.text(
          `Page ${i} of ${pages}  |  Unverified trades are excluded from P/L totals. Broker-reported P/L is authoritative.`,
          left, doc.internal.pageSize.getHeight() - 20
        );
      }
      doc.save(`trading-report-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (err) {
      setError(err.message || "Could not create the PDF.");
    } finally {
      setPdfBusy(false);
    }
  }

  function exportCsv() {
    const columns = [
      "pair", "direction", "entry", "exit", "stopLoss", "takeProfit", "result",
      "capitalUsed", "riskAmount", "quantity", "leverage", "fees", "contractMultiplier",
      "brokerPnl", "pnl", "pnlStatus",
      "setup", "openedAt", "closedAt", "emotionBefore", "emotionAfter", "mistake", "lesson", "notes",
    ];
    const escape = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const csv = [columns.join(","), ...filteredTrades.map((trade) => columns.map((key) => escape(trade[key])).join(","))].join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "trading-journal.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="tj-page">
      <style>{`
        .tj-page{color:#172033;font-family:Inter,ui-sans-serif,system-ui,sans-serif;max-width:1440px;margin:0 auto;padding:4px 0 28px}
        .tj-page *{box-sizing:border-box}
        .tj-top{display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:16px;background:linear-gradient(125deg,#172554,#4338ca);color:#fff;padding:18px 20px;border-radius:16px;box-shadow:0 10px 28px #1720331c}
        .tj-title{font-size:clamp(24px,3vw,32px);font-weight:800;letter-spacing:-.04em;margin:0;color:#fff}
        .tj-subtitle{color:#cbd5e1;margin:7px 0 0;font-size:14px}
        .tj-btn{border:1px solid #d9dfeb;background:#fff;color:#263247;border-radius:10px;padding:10px 14px;font-weight:700;cursor:pointer;transition:transform .15s ease,box-shadow .15s ease}.tj-btn:hover{box-shadow:0 5px 14px #17203314;transform:translateY(-1px)}
        .tj-btn-primary{background:#2563eb;border-color:#2563eb;color:#fff}
        .tj-btn:disabled{opacity:.6;cursor:not-allowed}
        .tj-btn-sm{padding:7px 10px;font-size:12px}
        .tj-actions{display:flex;gap:9px;flex-wrap:wrap;align-items:center}
        .tj-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:16px}
        .tj-stat,.tj-panel{border:1px solid #e3e8f1;border-radius:15px;background:#fff;padding:15px;box-shadow:0 5px 22px #17203308}.tj-stat{min-height:90px;transition:box-shadow .18s ease,transform .18s ease}.tj-stat:hover{box-shadow:0 10px 28px #17203312;transform:translateY(-2px)}
        .tj-stat span{display:block;color:#788296;font-size:12px;font-weight:700;margin-bottom:8px}
        .tj-stat strong{font-size:clamp(20px,2vw,25px);letter-spacing:-.035em;display:block;overflow-wrap:anywhere}
        .tj-panel-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:12px}
        .tj-panel h2{font-size:17px;margin:0;font-weight:800;letter-spacing:-.02em}
        .tj-muted{color:#778196;font-size:13px}
        .tj-table-wrap{overflow:auto}
        .tj-table{border-collapse:collapse;width:100%;min-width:800px;font-size:13px}
        .tj-table th{text-align:left;color:#778196;font-size:11px;text-transform:uppercase;letter-spacing:.06em;padding:13px 12px;border-bottom:1px solid #e8ecf3;background:#f8fafc;white-space:nowrap}
        .tj-table td{padding:14px 12px;border-bottom:1px solid #eef1f6;white-space:nowrap}.tj-table tbody tr:hover{background:#f8fafc}
        .tj-pill{display:inline-flex;border-radius:999px;padding:4px 8px;font-size:11px;font-weight:800;background:#f1f5f9;color:#475569}
        .tj-pill-win{background:#dcfce7;color:#166534}.tj-pill-loss{background:#fee2e2;color:#991b1b}
        .tj-link{border:0;background:none;color:#2563eb;font-weight:700;cursor:pointer;padding:4px 7px}
        .tj-positive{color:#15803d}.tj-negative{color:#b91c1c}
        .tj-alert{border-radius:10px;padding:11px 13px;margin:12px 0;font-size:13px;background:#eff6ff;color:#1d4ed8}
        .tj-alert-error{background:#fff1f2;color:#be123c}
        .tj-modal-backdrop{position:fixed;inset:0;background:#0f172a99;z-index:999;display:flex;align-items:center;justify-content:center;padding:16px}
        .tj-modal{background:#f8fafc;width:min(980px,100%);max-height:92vh;border-radius:18px;box-shadow:0 24px 80px #0004;display:flex;flex-direction:column;overflow:hidden}
        .tj-modal-head,.tj-modal-foot{background:#fff;padding:16px 22px;display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid #e8edf4}
        .tj-modal-foot{border-top:1px solid #e8edf4;border-bottom:0;justify-content:flex-end}
        .tj-modal-head h2{margin:0;font-size:20px;font-weight:800}.tj-modal-head p{margin:5px 0 0;color:#778196;font-size:12px}
        .tj-modal-body{overflow-y:auto;padding:18px 22px;overscroll-behavior:contain}
        .tj-section{background:#fff;border:1px solid #e4e9f2;border-radius:13px;padding:14px;margin-bottom:12px}
        .tj-section-head{margin-bottom:10px}.tj-section-head h3{margin:0;font-size:14px;font-weight:800}.tj-section-head p{margin:5px 0 0;font-size:12px;color:#778196}
        .tj-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
        .tj-field{display:flex;flex-direction:column;gap:7px;min-width:0}
        .tj-label{font-size:12px;font-weight:750;color:#39465c}
        .tj-input{width:100%;min-width:0;border:1px solid #d8dfeb;background:#fff;border-radius:9px;padding:10px 11px;font:inherit;font-size:13px;color:#172033;outline:none}
        .tj-input:focus{border-color:#6094f8;box-shadow:0 0 0 3px #3b82f61c}
        .tj-hint{font-size:11px;line-height:1.45;color:#7b8598}
        .tj-preview{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:10px}
        .tj-preview div{padding:11px;border-radius:10px;background:#f1f5f9}.tj-preview span{display:block;font-size:11px;color:#68758a;margin-bottom:5px}.tj-preview strong{font-size:14px}
        .tj-empty{text-align:center;padding:35px 10px;color:#778196}
        .tj-filters .tj-input{width:auto;min-width:130px}
        .tj-info{position:relative;display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;margin-left:6px;border-radius:50%;background:#e8eefc;color:#2563eb;font:italic 800 10px Georgia,serif;cursor:help;vertical-align:middle;outline:none}
        .tj-info:focus-visible{box-shadow:0 0 0 3px #3b82f633}
        .tj-tip{display:none;position:absolute;top:calc(100% + 8px);left:-6px;z-index:20;width:max-content;max-width:min(260px,70vw);padding:10px 12px;border-radius:10px;background:#172033;color:#f1f5f9;font:500 12px/1.5 Inter,system-ui,sans-serif;font-style:normal;text-align:left;white-space:normal;box-shadow:0 10px 30px #0004;cursor:default}
        .tj-tip em{display:block;margin-top:6px;color:#9fc0ff;font-style:normal}
        .tj-info:hover .tj-tip,.tj-info:focus .tj-tip{display:block}
        .tj-grid>.tj-field:nth-child(3n) .tj-tip{left:auto;right:-6px}
        .tj-addpair{display:flex;gap:6px;flex-wrap:wrap}
        .tj-addpair .tj-input{flex:1;min-width:120px}
        @media(max-width:760px){.tj-top{padding:18px}.tj-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.tj-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.tj-preview{grid-template-columns:repeat(2,minmax(0,1fr))}.tj-modal-backdrop{padding:8px}.tj-modal{max-height:96vh}.tj-modal-body{padding:12px}.tj-modal-head,.tj-modal-foot{padding:13px}.tj-section{padding:12px}.tj-grid>.tj-field:nth-child(3n) .tj-tip{left:-6px;right:auto}.tj-grid>.tj-field:nth-child(2n) .tj-tip{left:auto;right:-6px}}
        @media(max-width:480px){.tj-grid{grid-template-columns:1fr}.tj-stats{gap:8px}.tj-stat{padding:13px}.tj-stat strong{font-size:18px}.tj-filters .tj-input{width:100%}.tj-grid>.tj-field .tj-tip{left:-6px!important;right:auto!important}}
        .dark .tj-page{color:#e4e4e7}
        .dark .tj-top{background:linear-gradient(125deg,#312e81,#4338ca)}
        .dark .tj-stat,.dark .tj-panel,.dark .tj-section{background:#18181b;border-color:#3f3f46}
        .dark .tj-stat span,.dark .tj-muted,.dark .tj-section-head p,.dark .tj-hint{color:#a1a1aa}
        .dark .tj-table th{background:#27272a;color:#a1a1aa;border-color:#3f3f46}
        .dark .tj-table td{border-color:#3f3f46}
        .dark .tj-table tbody tr:hover{background:#27272a}
        .dark .tj-pill{background:#27272a;color:#d4d4d8}
        .dark .tj-pill-win{background:#064e3b;color:#a7f3d0}.dark .tj-pill-loss{background:#881337;color:#fecdd3}
        .dark .tj-positive{color:#6ee7b7}.dark .tj-negative{color:#fda4af}
        .dark .tj-alert{background:#172554;color:#bfdbfe}.dark .tj-alert-error{background:#4c0519;color:#fecdd3}
        .dark .tj-modal{background:#09090b;color:#e4e4e7}
        .dark .tj-modal-head,.dark .tj-modal-foot{background:#18181b;border-color:#3f3f46}
        .dark .tj-modal-head p{color:#a1a1aa}
        .dark .tj-input{background:#09090b;border-color:#52525b;color:#e4e4e7}
        .dark .tj-preview div{background:#27272a}.dark .tj-preview span{color:#a1a1aa}
        .dark .tj-label{color:#d4d4d8}
      `}</style>

      <div className="tj-top">
        <div>
          <h1 className="tj-title">Trading Journal</h1>
          <p className="tj-subtitle">Record price levels separately from money amounts. Review risk, execution and verified performance in one place.</p>
        </div>
        <div className="tj-actions">
          <button className="tj-btn" onClick={exportCsv}>Export CSV</button>
          <button className="tj-btn" onClick={downloadPdf} disabled={pdfBusy || filteredTrades.length === 0}>{pdfBusy ? "Preparing…" : "Download PDF"}</button>
          <button className="tj-btn tj-btn-primary" onClick={openNew}>+ Log trade</button>
        </div>
      </div>

      {error && !showForm ? <div className="tj-alert tj-alert-error">{error}</div> : null}
      {notice ? <div className="tj-alert">{notice}</div> : null}

      <div className="tj-stats">
        <div className="tj-stat"><span>Trades</span><strong>{stats.count}</strong></div>
        <div className="tj-stat"><span>Closed trades</span><strong>{stats.closed}</strong></div>
        <div className="tj-stat"><span>Win rate</span><strong>{stats.winRate === null ? "—" : `${stats.winRate.toFixed(1)}%`}</strong></div>
        <div className="tj-stat">
          <span>Verified net P/L ({stats.verified}/{stats.closed} closed)</span>
          <strong className={stats.totalPnl >= 0 ? "tj-positive" : "tj-negative"}>{money(stats.totalPnl)}</strong>
        </div>
      </div>

      <div className="tj-panel" style={{ marginBottom: 20 }}>
        <div className="tj-panel-head">
          <h2>Pair-wise performance</h2>
          <span className="tj-muted">Verified trades only</span>
        </div>
        <div className="tj-table-wrap">
          <table className="tj-table" style={{ minWidth: 600 }}>
            <thead>
              <tr><th>Pair</th><th>Trades</th><th>Win rate</th><th>Capital used</th><th>Net P/L</th><th>Return</th></tr>
            </thead>
            <tbody>
              {byPair.length ? byPair.map((r) => (
                <tr key={r.pair}>
                  <td><strong>{r.pair}</strong></td>
                  <td>{r.trades}</td>
                  <td>{((r.wins / r.trades) * 100).toFixed(0)}%</td>
                  <td>{money(r.capital)}</td>
                  <td className={r.pnl >= 0 ? "tj-positive" : "tj-negative"}>{money(r.pnl)}</td>
                  <td>{r.ret === null ? "—" : `${r.ret.toFixed(2)}%`}</td>
                </tr>
              )) : (
                <tr><td colSpan={6} className="tj-empty">No verified trades yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="tj-panel">
        <div className="tj-panel-head">
          <div><h2>Trade history</h2><span className="tj-muted">Edit any trade to review or correct it.</span></div>
          <div className="tj-actions tj-filters">
            <Select value={filterPair} onChange={setFilterPair} options={["All pairs", ...pairs]} aria-label="Filter by pair" />
            <Select value={filterResult} onChange={setFilterResult} options={["All results", "Open", "Win", "Loss", "Break-even"]} aria-label="Filter by result" />
            <input className="tj-input" type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} aria-label="From date" />
            <input className="tj-input" type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} aria-label="To date" />
          </div>
        </div>
        {loading ? <div className="tj-empty">Loading trades…</div> : filteredTrades.length === 0 ? <div className="tj-empty">No trades match. Select “Log trade” to add one, or adjust the filters.</div> : (
          <div className="tj-table-wrap">
            <table className="tj-table">
              <thead><tr><th>Pair</th><th>Direction</th><th>Entry price</th><th>Exit price</th><th>Stop loss</th><th>Target</th><th>Result</th><th>Net P/L</th><th>Actions</th></tr></thead>
              <tbody>
                {filteredTrades.map((trade) => (
                  <tr key={trade._id || trade.id}>
                    <td><strong>{trade.pair}</strong></td>
                    <td>{trade.direction}</td>
                    <td>{trade.entry ?? "—"}</td>
                    <td>{trade.exit ?? "—"}</td>
                    <td>{trade.stopLoss ?? "—"}</td>
                    <td>{trade.takeProfit ?? "—"}</td>
                    <td><span className={`tj-pill ${trade.result === "Win" ? "tj-pill-win" : trade.result === "Loss" ? "tj-pill-loss" : ""}`}>{trade.result || "Open"}</span></td>
                    <td className={!isVerified(trade) ? "" : num(trade.pnl) >= 0 ? "tj-positive" : "tj-negative"}>
                      {isVerified(trade)
                        ? money(num(trade.pnl))
                        : <span className="tj-pill" title="Add a verified multiplier or broker P/L">Unverified</span>}
                    </td>
                    <td><button className="tj-link" onClick={() => openEdit(trade)}>Edit</button><button className="tj-link" onClick={() => deleteTrade(trade)}>Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm ? (
        // Backdrop clicks intentionally do nothing: the form closes only after a successful save, or via Close/Cancel.
        <div className="tj-modal-backdrop" role="presentation">
          <form className="tj-modal" onSubmit={saveTrade} role="dialog" aria-modal="true" aria-labelledby="tj-modal-title">
            <header className="tj-modal-head">
              <div><h2 id="tj-modal-title">{editingId ? "Edit trade" : "Log a trade"}</h2><p>Prices are price levels; capital, risk and P/L are money amounts.</p></div>
              <button type="button" className="tj-btn" onClick={() => setShowForm(false)} disabled={saving}>Close</button>
            </header>
            <div className="tj-modal-body">
              {error ? <div className="tj-alert tj-alert-error">{error}</div> : null}

              <Section title="1. Trade details" description="Enter the instrument’s quoted prices. These are not capital or profit amounts.">
                <Field label="Instrument / pair" info={INFO.pair}>
                  <Select value={form.pair} onChange={(v) => set("pair", v)} options={[...new Set([...pairs, form.pair].filter(Boolean))]} required />
                  {addingPair ? (
                    <div className="tj-addpair">
                      <input
                        className="tj-input"
                        autoFocus
                        maxLength={30}
                        placeholder="e.g. XAUUSD"
                        value={newPair}
                        onChange={(e) => setNewPair(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { e.preventDefault(); addPair(); }
                          if (e.key === "Escape") { e.preventDefault(); setAddingPair(false); setNewPair(""); }
                        }}
                      />
                      <button type="button" className="tj-btn tj-btn-primary tj-btn-sm" onClick={addPair} disabled={pairBusy}>{pairBusy ? "Adding…" : "Add"}</button>
                      <button type="button" className="tj-btn tj-btn-sm" onClick={() => { setAddingPair(false); setNewPair(""); }} disabled={pairBusy}>Cancel</button>
                    </div>
                  ) : (
                    <button type="button" className="tj-link" style={{ alignSelf: "flex-start", padding: 0 }} onClick={() => setAddingPair(true)}>+ Add new pair</button>
                  )}
                </Field>
                <Field label="Trade direction">
                  <Select value={form.direction} onChange={(v) => set("direction", v)} options={["Long", "Short"]} />
                </Field>
                <Field
                  label="Trade result"
                  info={INFO.result}
                  hint={computed.autoResult ? `Will be saved as ${computed.autoResult} (from net P/L).` : "Manual until P/L can be calculated."}
                >
                  <Select value={form.result} onChange={(v) => set("result", v)} options={["Open", "Win", "Loss", "Break-even"]} />
                </Field>
                <Field label="Buy / entry price (₹ or quote)" info={INFO.entry} hint="Example: NIFTY option bought at 79. This is a price per unit.">
                  <Input type="number" step="any" min="0" placeholder="e.g. 79" value={form.entry} onChange={(v) => set("entry", v)} required />
                </Field>
                <Field label="Exit / sell price" info={INFO.exit} hint="Leave blank while the trade is open.">
                  <Input type="number" step="any" min="0" placeholder="e.g. 84 or blank if open" value={form.exit} onChange={(v) => set("exit", v)} />
                </Field>
                <Field label="Stop-loss price" info={INFO.stopLoss} hint="Example: 65 — the price level where you plan to exit on a loss.">
                  <Input type="number" step="any" min="0" placeholder="e.g. 65" value={form.stopLoss} onChange={(v) => set("stopLoss", v)} />
                </Field>
                <Field label="Target price" info={INFO.takeProfit} hint="Example: 90 — the planned take-profit price level.">
                  <Input type="number" step="any" min="0" placeholder="e.g. 90" value={form.takeProfit} onChange={(v) => set("takeProfit", v)} />
                </Field>
                <Field label="Setup / strategy">
                  <Input placeholder="e.g. Breakout, EMA pullback" value={form.setup} onChange={(v) => set("setup", v)} />
                </Field>
              </Section>

              <Section title="2. Position & money" description="These fields are monetary values or position sizing—not market prices.">
                <Field label="Capital used (₹)" info={INFO.capitalUsed} hint="Total money allocated to this position.">
                  <Input type="number" step="any" min="0" placeholder="e.g. 5925" value={form.capitalUsed} onChange={(v) => set("capitalUsed", v)} />
                </Field>
                <Field label="Planned risk amount (₹)" info={INFO.riskAmount} hint="Money you are willing to lose if stop loss is hit.">
                  <Input type="number" step="any" min="0" placeholder="e.g. 1050" value={form.riskAmount} onChange={(v) => set("riskAmount", v)} />
                </Field>
                <Field label="Quantity (units)" info={INFO.quantity} hint="Actual number of units; not the rupee value of the position.">
                  <Input type="number" step="any" min="0" placeholder="e.g. 75" value={form.quantity} onChange={(v) => set("quantity", v)} />
                </Field>
                <Field label="Leverage" info={INFO.leverage} hint="Use 1 for no leverage.">
                  <Input type="number" step="any" min="1" placeholder="e.g. 1 or 10" value={form.leverage} onChange={(v) => set("leverage", v)} />
                </Field>
                <Field label="Fees & charges (₹)" info={INFO.fees} hint="Brokerage, taxes and other applicable charges.">
                  <Input type="number" step="any" min="0" placeholder="e.g. 20" value={form.fees} onChange={(v) => set("fees", v)} />
                </Field>
                <Field label="Contract multiplier" info={INFO.contractMultiplier} hint="Instrument-specific P/L multiplier. Leave blank if unknown; the app will not guess P/L.">
                  <Input type="number" step="any" min="0" placeholder="Enter verified multiplier" value={form.contractMultiplier} onChange={(v) => set("contractMultiplier", v)} />
                </Field>
                <Field label="Broker-reported net P/L (₹)" info={INFO.brokerPnl} hint="If entered, this is used instead of any estimate. Negative for a loss.">
                  <Input type="number" step="any" placeholder="e.g. -340" value={form.brokerPnl} onChange={(v) => set("brokerPnl", v)} />
                </Field>
                <Field label="Risk as % of capital" info={INFO.riskPct}>
                  <Input value={computed.riskPct === null ? "—" : `${computed.riskPct.toFixed(2)}%`} readOnly />
                </Field>
                <Field label="Risk-to-reward" info={INFO.rr}>
                  <Input value={computed.rr === null ? "—" : `1 : ${computed.rr.toFixed(2)}`} readOnly />
                </Field>
              </Section>

              <Section title="3. Execution & review" description="Capture when you traded and what you learned.">
                <Field label="Entry date & time" info={INFO.openedAt}>
                  <Input type="datetime-local" value={form.openedAt || ""} onChange={(v) => set("openedAt", v)} />
                </Field>
                <Field label="Exit date & time" info={INFO.closedAt}>
                  <Input type="datetime-local" value={form.closedAt || ""} onChange={(v) => set("closedAt", v)} />
                </Field>
                <Field label="Emotion before trade">
                  <Select value={form.emotionBefore} onChange={(v) => set("emotionBefore", v)} options={EMOTIONS} />
                </Field>
                <Field label="Emotion after trade">
                  <Select value={form.emotionAfter} onChange={(v) => set("emotionAfter", v)} options={EMOTIONS} />
                </Field>
                <Field label="Mistake / rule broken">
                  <Input placeholder="e.g. Entered before confirmation" value={form.mistake} onChange={(v) => set("mistake", v)} />
                </Field>
                <Field label="Lesson / next action">
                  <Input placeholder="e.g. Wait for candle close" value={form.lesson} onChange={(v) => set("lesson", v)} />
                </Field>
                <Field label="Notes">
                  <textarea className="tj-input" rows={3} placeholder="Trade thesis, context, what went well…" value={form.notes} onChange={(e) => set("notes", e.target.value)} />
                </Field>
              </Section>

              <Section
                title="Calculated preview"
                description="Preview only. The server recalculates P/L and result on save. Broker-reported P/L takes priority over any estimate."
              >
                <div className="tj-preview" style={{ gridColumn: "1 / -1" }}>
                  <div>
                    <span>{computed.fromBroker ? "Broker net P/L" : "Estimated gross P/L"}</span>
                    <strong>{computed.fromBroker ? money(computed.netPnl) : computed.grossPnl === null ? "Need multiplier" : money(computed.grossPnl)}</strong>
                  </div>
                  <div><span>Net P/L</span><strong>{computed.netPnl === null ? "Need multiplier or broker P/L" : money(computed.netPnl)}</strong></div>
                  <div><span>Return on capital</span><strong>{computed.returnPct === null ? "—" : `${computed.returnPct.toFixed(2)}%`}</strong></div>
                  <div><span>Potential risk / reward</span><strong>{computed.estimatedRisk === null || computed.estimatedReward === null ? "Need multiplier" : `${money(computed.estimatedRisk)} / ${money(computed.estimatedReward)}`}</strong></div>
                </div>
              </Section>
              <p className="tj-muted">Trades without a broker P/L or a verified multiplier are saved as “Unverified” and excluded from dashboard totals.</p>
            </div>
            <footer className="tj-modal-foot">
              <button type="button" className="tj-btn" onClick={() => setShowForm(false)} disabled={saving}>Cancel</button>
              <button type="submit" className="tj-btn tj-btn-primary" disabled={saving}>{saving ? "Saving…" : editingId ? "Save changes" : "Save trade"}</button>
            </footer>
          </form>
        </div>
      ) : null}
    </div>
  );
}
