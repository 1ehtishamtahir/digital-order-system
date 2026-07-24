"use client";

import React, { useState, useEffect, useRef } from "react";
import { DollarSign, CheckCircle2, LogOut, RefreshCw, Printer, History, Clock, CreditCard, Banknote } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────
interface OrderItem { id: number; name: string; qty: number; price: number; status: string; }
interface Order {
  id: number; table_label: string; total: number; status: string;
  order_type: string; created_at: string; items: OrderItem[];
}
interface StaffUser { username: string; role: string; }
interface Settings { name: string; address: string | null; phone: string | null; tax_rate: number; currency: string; receipt_footer: string | null; }

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/ws";

const SETTINGS_KEY = "cashier_settings";

function getToken(): string | null { return typeof window === "undefined" ? null : localStorage.getItem("cashier_token"); }
function getUser(): StaffUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("cashier_user");
  return raw ? JSON.parse(raw) : null;
}
function saveAuth(t: string, u: StaffUser) { localStorage.setItem("cashier_token", t); localStorage.setItem("cashier_user", JSON.stringify(u)); }
function clearAuth() { localStorage.removeItem("cashier_token"); localStorage.removeItem("cashier_user"); localStorage.removeItem(SETTINGS_KEY); }

function loadCachedSettings(): Settings | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(SETTINGS_KEY);
  return raw ? JSON.parse(raw) : null;
}
function cacheSettings(s: Settings) { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); }

const STATUS_BORDER: Record<string, string> = {
  placed: "border-l-[#4C9BD1]",
  preparing: "border-l-[#D1A63C]",
  ready: "border-l-[#4CAF6D]",
  served: "border-l-teal-500",
  paid: "border-l-indigo-500",
};
const STATUS_PAID_BADGE = "bg-[#4CAF6D]/15 text-[#4CAF6D] border-[#4CAF6D]/25";

function LoginScreen({ onLogin }: { onLogin: (u: StaffUser) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(""); setLoading(true);
    try {
      const form = new URLSearchParams(); form.append("username", username); form.append("password", password);
      const res = await fetch(`${API}/auth/login`, {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form,
      });
      if (!res.ok) { const d = await res.json(); setError(d.detail || "Login failed"); return; }
      const data = await res.json();
      if (data.role !== "cashier") { setError("Only cashier staff can access this page"); return; }
      saveAuth(data.access_token, { username: data.username, role: data.role });
      onLogin({ username: data.username, role: data.role });
    } catch { setError("Cannot connect to server"); } finally { setLoading(false); }
  };
  return (
    <div className="min-h-screen bg-[#15171B] flex items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-[#1F2229] rounded-2xl border border-[#282C34] p-8 shadow-2xl space-y-6">
        <div className="text-center">
          <div className="w-14 h-14 mx-auto bg-gradient-to-tr from-[#C98A2E] to-rose-500 rounded-2xl flex items-center justify-center shadow-lg mb-4">
            <DollarSign size={26} className="text-white" />
          </div>
          <h1 className="text-xl font-bold text-[#EDEAE3]">Cashier Station</h1>
          <p className="text-sm text-[#8B8F98] mt-1">Staff login required</p>
        </div>
        {error && <div className="p-3 bg-[#D1495B]/10 border border-[#D1495B]/30 rounded-xl text-[#D1495B] text-xs font-semibold text-center">{error}</div>}
        <div className="space-y-4">
          <input type="text" placeholder="Username" value={username} onChange={e => setUsername(e.target.value)}
            className="w-full p-3 bg-[#15171B] border border-[#282C34] rounded-xl focus:border-[#C98A2E] focus:outline-none text-[#EDEAE3] text-sm" required />
          <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)}
            className="w-full p-3 bg-[#15171B] border border-[#282C34] rounded-xl focus:border-[#C98A2E] focus:outline-none text-[#EDEAE3] text-sm" required />
        </div>
        <button type="submit" disabled={loading}
          className="w-full py-3 bg-[#C98A2E] hover:bg-[#C98A2E]/90 text-white font-bold rounded-xl text-sm transition disabled:opacity-50">
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </form>
    </div>
  );
}

// ─── Receipt Component ───────────────────────────────────────────────────────
function Receipt({ order, settings, onClose }: { order: Order; settings: Settings; onClose: () => void }) {
  const cur = settings.currency || "$";
  const taxRate = settings.tax_rate || 0;
  const subtotal = order.items.reduce((s, i) => s + i.price * i.qty, 0);
  const tax = subtotal * taxRate;
  const grandTotal = subtotal + tax;
  const created = new Date(order.created_at);
  const dateStr = created.toLocaleDateString();
  const timeStr = created.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const handlePrint = () => {
    const printWin = window.open("", "_blank");
    if (!printWin) return;
    printWin.document.write(`
      <html><head><title>Bill - Order #${order.id}</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Courier New', monospace; padding: 16px; color: #000; width: 80mm; font-size: 12px; line-height: 1.4; }
        .center { text-align: center; }
        .line { border-top: 1px dashed #000; margin: 8px 0; }
        .row { display: flex; justify-content: space-between; }
        table { width: 100%; border-collapse: collapse; }
        td { padding: 3px 0; vertical-align: top; }
        .right { text-align: right; }
        .bold { font-weight: bold; }
        .total { font-size: 16px; font-weight: bold; }
        .footer { text-align: center; font-size: 11px; margin-top: 8px; color: #555; }
        .thank { font-size: 14px; font-weight: bold; letter-spacing: 1px; }
        @page { margin: 0; }
      </style></head><body>
        <div class="center">
          <h2 style="font-size:18px;margin-bottom:2px">${settings.name}</h2>
          ${settings.address ? `<p style="font-size:11px">${settings.address}</p>` : ""}
          ${settings.phone ? `<p style="font-size:11px">${settings.phone}</p>` : ""}
        </div>
        <div class="line"></div>
        <div class="row"><span>Bill #${order.id}</span><span>${order.table_label}</span></div>
        <div class="row" style="font-size:11px;color:#666"><span>${dateStr}</span><span>${timeStr}</span></div>
        <div class="line"></div>
        <table>
          <tr><td class="bold">Item</td><td class="right bold">Qty</td><td class="right bold">Price</td></tr>
          ${order.items.map(i => `<tr><td>${i.name}</td><td class="right">${i.qty}</td><td class="right">${cur}${(i.price * i.qty).toFixed(2)}</td></tr>`).join("")}
        </table>
        <div class="line"></div>
        <div class="row"><span>Subtotal</span><span>${cur}${subtotal.toFixed(2)}</span></div>
        ${taxRate > 0 ? `<div class="row"><span>Tax (${(taxRate*100).toFixed(0)}%)</span><span>${cur}${tax.toFixed(2)}</span></div>` : ""}
        <div class="line"></div>
        <div class="row total"><span>Total</span><span>${cur}${grandTotal.toFixed(2)}</span></div>
        <p style="margin:6px 0;font-size:11px;text-align:center">${order.status.toUpperCase()}</p>
        ${settings.receipt_footer ? `<div class="line"></div><div class="footer">${settings.receipt_footer}</div>` : ""}
        <div class="center" style="margin-top:10px"><span class="thank">Thank You!</span></div>
      </body></html>
    `);
    printWin.document.close();
    printWin.focus();
    setTimeout(() => printWin.print(), 300);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-[#1F2229] rounded-2xl border border-[#282C34] p-6 shadow-2xl max-h-[90vh] overflow-y-auto animate-slide-up">
        <div className="text-center mb-4 border-b border-[#282C34] pb-4">
          <h2 className="font-bold text-[#C98A2E]">{settings.name}</h2>
          {settings.address && <p className="text-xs text-[#8B8F98]">{settings.address}</p>}
          {settings.phone && <p className="text-xs text-[#8B8F98]">{settings.phone}</p>}
        </div>
        <div className="flex justify-between text-xs text-[#8B8F98] mb-2">
          <span className="font-bold text-[#EDEAE3]">Bill #{order.id}</span>
          <span>{order.table_label}</span>
        </div>
        <div className="text-[10px] text-[#8B8F98] mb-4 flex justify-between">
          <span>{dateStr}</span>
          <span>{timeStr}</span>
        </div>
        <div className="border-t border-b border-[#282C34] py-2.5 space-y-1.5">
          <div className="flex justify-between text-[10px] text-[#8B8F98] font-bold uppercase tracking-wider pb-1">
            <span>Item</span>
            <span>Amount</span>
          </div>
          {order.items.map(item => (
            <div key={item.id} className="flex justify-between text-xs">
              <span className="text-[#EDEAE3]">{item.name} <span className="text-[#8B8F98]">x{item.qty}</span></span>
              <span className="text-[#C98A2E] font-semibold">{cur}{(item.price * item.qty).toFixed(2)}</span>
            </div>
          ))}
        </div>
        <div className="space-y-1 mt-3 text-xs">
          <div className="flex justify-between"><span className="text-[#8B8F98]">Subtotal</span><span>{cur}{subtotal.toFixed(2)}</span></div>
          {taxRate > 0 && <div className="flex justify-between"><span className="text-[#8B8F98]">Tax ({(taxRate*100).toFixed(0)}%)</span><span>{cur}{tax.toFixed(2)}</span></div>}
          <div className="flex justify-between text-base font-bold text-[#C98A2E] border-t border-[#282C34] pt-2 mt-2">
            <span>Total</span><span>{cur}{grandTotal.toFixed(2)}</span>
          </div>
        </div>
        <div className="text-center text-[10px] text-[#8B8F98] mt-4 border-t border-[#282C34] pt-3">
          {settings.receipt_footer && <p className="italic mb-2">{settings.receipt_footer}</p>}
          <p className="font-semibold text-[#C98A2E]">Thank You!</p>
        </div>
        <div className="flex gap-3 mt-4">
          <button onClick={handlePrint} className="flex-1 py-3 bg-[#C98A2E] hover:bg-[#C98A2E]/90 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition shadow-md">
            <Printer size={16} /> Print Bill
          </button>
          <button onClick={onClose} className="px-4 py-3 border border-[#282C34] rounded-xl text-xs font-bold text-[#8B8F98] hover:text-[#EDEAE3] transition">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Cashier Dashboard ───────────────────────────────────────────────────────
export default function CashierPage() {
  const [user, setUser] = useState<StaffUser | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [paidOrders, setPaidOrders] = useState<Order[]>([]);
  const [settings, setSettings] = useState<Settings>(() => {
    const cached = loadCachedSettings();
    return cached || { name: "Restaurant", address: null, phone: null, tax_rate: 0, currency: "$", receipt_footer: null };
  });
  const [wsConnected, setWsConnected] = useState(false);
  const [error, setError] = useState("");
  const [billOrder, setBillOrder] = useState<Order | null>(null);
  const [tab, setTab] = useState<"pending" | "records">("pending");
  const [settleMethod, setSettleMethod] = useState<"cash" | "card" | "upi">("cash");
  const [settlingId, setSettlingId] = useState<number | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => { const u = getUser(); if (u) setUser(u); }, []);
  useEffect(() => { if (!user) return; fetchOrders(); fetchSettings(); connectWs(); return () => socketRef.current?.close(); }, [user]);

  const connectWs = () => {
    socketRef.current?.close();
    const ws = new WebSocket(`${WS_BASE}/cashier`);
    socketRef.current = ws;
    ws.onopen = () => setWsConnected(true);
    ws.onmessage = (event) => {
      const d = JSON.parse(event.data);
      if (["order_created", "order_item_updated", "order_updated", "payment_completed"].includes(d.event)) fetchOrders();
    };
    ws.onclose = () => { setWsConnected(false); setTimeout(connectWs, 3000); };
  };

  const fetchOrders = async () => {
    try {
      const res = await fetch(`${API}/orders`);
      if (!res.ok) return;
      const data = await res.json();
      const mapped = data.map((o: any) => ({
        id: o.id, table_label: o.table?.label || "Takeaway", total: o.total, status: o.status,
        order_type: o.order_type, created_at: o.created_at,
        items: o.items.map((i: any) => ({ id: i.id, name: i.menu_item.name, qty: i.qty, price: i.menu_item.price, status: i.item_status })),
      }));
      setOrders(mapped);
      setPaidOrders(mapped.filter((o: Order) => o.status === "paid"));
    } catch {}
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch(`${API}/settings`);
      if (!res.ok) return;
      const d = await res.json();
      const s: Settings = { name: d.name, address: d.address, phone: d.phone, tax_rate: d.tax_rate, currency: d.currency, receipt_footer: d.receipt_footer };
      setSettings(s);
      cacheSettings(s);
    } catch {}
  };

  const handleSettlePayment = async (orderId: number, total: number) => {
    setError(""); setSettlingId(orderId);
    try {
      const res = await fetch(`${API}/orders/${orderId}/payments`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: settleMethod, amount: total }),
      });
      if (res.ok) { fetchOrders(); }
      else { const d = await res.json().catch(() => ({})); setError(d.detail || "Payment failed"); }
    } catch { setError("Network error"); } finally { setSettlingId(null); }
  };

  const pendingOrders = orders.filter(o => o.status !== "paid" && o.status !== "cancelled");
  const totalPending = pendingOrders.reduce((s, o) => s + o.total, 0);

  const METHOD_ICONS: Record<string, React.ReactNode> = {
    cash: <Banknote size={14} />,
    card: <CreditCard size={14} />,
    upi: <DollarSign size={14} />,
  };

  if (!user) return <LoginScreen onLogin={setUser} />;

  return (
    <div className="min-h-screen bg-[#15171B] text-[#EDEAE3]">
      <header className="sticky top-0 z-40 backdrop-blur-md bg-[#15171B]/80 border-b border-[#282C34]">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-tr from-[#C98A2E] to-rose-500 rounded-xl text-white shadow-lg"><DollarSign size={22} /></div>
            <div>
              <h1 className="font-extrabold text-lg tracking-tight">Cashier Station</h1>
              <span className="text-xs font-bold text-[#C98A2E]">{user.username}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => { fetchOrders(); fetchSettings(); }}
              className="p-2 rounded-lg border border-[#282C34] hover:bg-[#1F2229] text-[#8B8F98] transition"><RefreshCw size={16} /></button>
            <button onClick={() => { clearAuth(); setUser(null); }}
              className="p-2 rounded-lg border border-[#282C34] hover:bg-[#1F2229] text-[#8B8F98] transition"><LogOut size={16} /></button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 animate-fade-in">
        {error && (
          <div className="mb-4 p-3 bg-[#D1495B]/10 border border-[#D1495B]/30 rounded-xl text-[#D1495B] text-xs font-semibold flex items-center justify-between animate-slide-up">
            <span>{error}</span>
            <button onClick={() => setError("")} className="ml-2 hover:text-white">&times;</button>
          </div>
        )}

        {/* Tabs + stats */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div className="flex gap-1 bg-[#1F2229] rounded-xl p-1 border border-[#282C34]">
            <button onClick={() => setTab("pending")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition ${tab === "pending" ? "bg-[#C98A2E] text-white shadow" : "text-[#8B8F98] hover:text-[#EDEAE3]"}`}>
              <DollarSign size={14} /> Pending <span className="text-[10px] opacity-70">({pendingOrders.length})</span>
            </button>
            <button onClick={() => setTab("records")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition ${tab === "records" ? "bg-[#C98A2E] text-white shadow" : "text-[#8B8F98] hover:text-[#EDEAE3]"}`}>
              <History size={14} /> Records <span className="text-[10px] opacity-70">({paidOrders.length})</span>
            </button>
          </div>
          {tab === "pending" && pendingOrders.length > 0 && (
            <div className="text-xs text-[#8B8F98] bg-[#1F2229] border border-[#282C34] px-3 py-1.5 rounded-xl">
              Total pending: <span className="font-bold text-[#C98A2E]">{settings.currency}{totalPending.toFixed(2)}</span>
            </div>
          )}
        </div>

        {/* ── Pending Tab ── */}
        {tab === "pending" && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {pendingOrders.map((order, idx) => (
              <div key={order.id}
                className={`rounded-2xl border border-[#282C34] bg-gradient-to-b from-[#1F2229]/60 to-[#1F2229]/30 p-5 shadow-md hover:shadow-xl hover:border-[#282C34] transition-all duration-300 animate-slide-up border-l-4 ${STATUS_BORDER[order.status] || "border-l-[#282C34]"}`}
                style={{ animationDelay: `${idx * 50}ms` }}>
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#C98A2E]/20 to-rose-500/20 border border-[#282C34] flex items-center justify-center">
                      <span className="font-black text-sm text-[#C98A2E]">#{order.id}</span>
                    </div>
                    <div>
                      <h4 className="font-black text-sm">Order #{order.id}</h4>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-[#C98A2E]/10 text-[#C98A2E] border border-[#C98A2E]/20">{order.table_label}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-[#8B8F98]">
                    <Clock size={10} />
                    {new Date(order.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
                <div className="space-y-1.5 border-t border-b border-[#282C34] py-3 mb-3">
                  {order.items.map(item => (
                    <div key={item.id} className="flex justify-between items-start text-xs">
                      <span className="font-semibold text-[#C98A2E]">{item.qty}x <span className="text-[#EDEAE3]">{item.name}</span></span>
                      <span className="text-[10px] uppercase font-bold text-[#8B8F98]">{item.status}</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="text-[10px] text-[#8B8F98] block">Total Due</span>
                    <span className="text-xl font-extrabold text-[#C98A2E]">{settings.currency}{order.total.toFixed(2)}</span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <div className="flex gap-1 items-center">
                      <span className="text-[9px] text-[#8B8F98] font-semibold">Pay via:</span>
                      {(["cash", "card", "upi"] as const).map(m => (
                        <button key={m} onClick={() => setSettleMethod(m)}
                          className={`p-1 rounded text-[10px] font-bold transition border ${settleMethod === m ? "bg-[#C98A2E]/20 border-[#C98A2E]/40 text-[#C98A2E]" : "bg-transparent border-transparent text-[#8B8F98] hover:text-[#EDEAE3]"}`}>
                          {METHOD_ICONS[m]}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-1.5">
                      <button onClick={() => setBillOrder(order)}
                        className="px-3 py-1.5 border border-[#282C34] hover:bg-[#282C34] text-[#8B8F98] rounded-lg text-[10px] font-bold flex items-center gap-1 transition">
                        <Printer size={11} /> Bill
                      </button>
                      <button onClick={() => handleSettlePayment(order.id, order.total)} disabled={settlingId === order.id}
                        className="px-3 py-1.5 bg-[#4CAF6D] hover:bg-[#4CAF6D]/90 disabled:opacity-50 text-white rounded-lg font-bold text-[10px] transition shadow-sm flex items-center gap-1">
                        {settlingId === order.id ? "..." : <><CheckCircle2 size={11} /> Settle</>}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {pendingOrders.length === 0 && (
              <div className="col-span-full py-20 text-center text-[#8B8F98] animate-fade-in">
                <CheckCircle2 size={56} className="mx-auto mb-4 opacity-30" />
                <p className="font-bold text-base">All bills settled</p>
                <p className="text-xs mt-1">Pending orders will appear here</p>
              </div>
            )}
          </div>
        )}

        {/* ── Records Tab ── */}
        {tab === "records" && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {paidOrders.map((order, idx) => {
              const paid = new Date(order.created_at);
              return (
                <div key={order.id}
                  className="rounded-2xl border border-[#282C34] bg-gradient-to-b from-[#1F2229]/60 to-[#1F2229]/30 p-5 shadow-md hover:shadow-xl hover:border-[#282C34] transition-all duration-300 animate-slide-up border-l-4 border-l-[#4CAF6D]"
                  style={{ animationDelay: `${idx * 50}ms` }}>
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-xl bg-[#4CAF6D]/15 border border-[#4CAF6D]/25 flex items-center justify-center">
                        <CheckCircle2 size={16} className="text-[#4CAF6D]" />
                      </div>
                      <div>
                        <h4 className="font-black text-sm">Order #{order.id}</h4>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">{order.table_label}</span>
                      </div>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase border ${STATUS_PAID_BADGE}`}>Paid</span>
                  </div>
                  <div className="text-[10px] text-[#8B8F98] flex items-center gap-1.5 mb-3">
                    <Clock size={10} />
                    {paid.toLocaleDateString()} {paid.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </div>
                  <div className="space-y-1.5 border-t border-b border-[#282C34] py-3 mb-3">
                    {order.items.map(item => (
                      <div key={item.id} className="flex justify-between text-xs">
                        <span className="text-[#EDEAE3]">{item.name} <span className="text-[#8B8F98]">x{item.qty}</span></span>
                        <span className="text-[#C98A2E]">{settings.currency}{(item.price * item.qty).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-[#8B8F98] block">Total Paid</span>
                      <span className="text-xl font-extrabold text-[#4CAF6D]">{settings.currency}{order.total.toFixed(2)}</span>
                    </div>
                    <button onClick={() => setBillOrder(order)}
                      className="px-4 py-2 bg-[#C98A2E] hover:bg-[#C98A2E]/90 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 transition shadow-md">
                      <Printer size={14} /> Re-Print
                    </button>
                  </div>
                </div>
              );
            })}
            {paidOrders.length === 0 && (
              <div className="col-span-full py-20 text-center text-[#8B8F98] animate-fade-in">
                <History size={56} className="mx-auto mb-4 opacity-30" />
                <p className="font-bold text-base">No settled bills yet</p>
                <p className="text-xs mt-1">Completed payments will appear here</p>
              </div>
            )}
          </div>
        )}
      </main>

      {billOrder && <Receipt order={billOrder} settings={settings} onClose={() => setBillOrder(null)} />}
    </div>
  );
}
