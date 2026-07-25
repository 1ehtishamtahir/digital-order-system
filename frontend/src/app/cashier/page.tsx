"use client";

import React, { useState, useEffect, useRef } from "react";
import { DollarSign, CheckCircle2, LogOut, RefreshCw, Printer, History, Clock, CreditCard, Banknote, ShoppingBag } from "lucide-react";

interface OrderItem { id: number; name: string; qty: number; price: number; status: string; station?: string; }
interface Order {
  id: number; table_label: string; total: number; status: string;
  order_type: string; created_at: string; items: OrderItem[];
}
interface StaffUser { username: string; role: string; }
interface Settings { name: string; address: string | null; phone: string | null; tax_rate: number; currency: string; receipt_footer: string | null; }

const API = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1";
const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || "ws://127.0.0.1:8000/ws";

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
    <div className="min-h-screen bg-bg-page flex items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-bg-surface rounded border border-border p-8 shadow-md space-y-6">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto bg-brand-primary-tint rounded flex items-center justify-center border border-brand-primary/10 mb-3">
            <DollarSign size={24} className="text-brand-primary" />
          </div>
          <h1 className="font-bold text-lg text-text-primary">Cashier Station</h1>
          <p className="text-xs text-text-secondary mt-1">Staff login required</p>
        </div>
        {error && <div className="p-2.5 bg-status-error/10 border border-status-error/20 rounded text-status-error text-xs font-semibold text-center">{error}</div>}
        <div className="space-y-4">
          <input type="text" placeholder="Username" value={username} onChange={e => setUsername(e.target.value)}
            className="w-full p-2.5 bg-bg-page border border-border rounded focus:border-brand-primary focus:outline-none text-text-primary text-xs" required />
          <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)}
            className="w-full p-2.5 bg-bg-page border border-border rounded focus:border-brand-primary focus:outline-none text-text-primary text-xs" required />
        </div>
        <button type="submit" disabled={loading}
          className="w-full py-3 bg-brand-primary hover:bg-brand-primary-dark text-white font-bold rounded text-xs font-mono uppercase tracking-wider transition disabled:opacity-50">
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </form>
    </div>
  );
}

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in bg-text-primary/30 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-bg-surface rounded border border-border p-6 shadow-xl max-h-[90vh] overflow-y-auto animate-slide-up">
        <div className="text-center mb-4 border-b border-border pb-4">
          <h2 className="font-bold text-text-primary">{settings.name}</h2>
          {settings.address && <p className="text-xs text-text-secondary">{settings.address}</p>}
          {settings.phone && <p className="text-xs text-text-secondary">{settings.phone}</p>}
        </div>
        <div className="flex justify-between text-xs text-text-secondary mb-2">
          <span className="font-mono font-bold text-text-primary">Bill #{order.id}</span>
          <span className="font-mono">{order.table_label}</span>
        </div>
        <div className="text-[10px] font-mono text-text-secondary mb-4 flex justify-between">
          <span>{dateStr}</span>
          <span>{timeStr}</span>
        </div>
        <div className="border-t border-b border-border py-2.5 space-y-1.5">
          <div className="flex justify-between text-[10px] text-text-secondary font-mono font-bold uppercase tracking-wider pb-1">
            <span>Item</span>
            <span>Amount</span>
          </div>
          {order.items.map(item => (
            <div key={item.id} className="flex justify-between text-xs font-mono">
              <span className="text-text-primary">{item.name} <span className="text-text-secondary">x{item.qty}</span></span>
              <span className="text-text-primary font-semibold">{cur}{(item.price * item.qty).toFixed(2)}</span>
            </div>
          ))}
        </div>
        <div className="space-y-1 mt-3 text-xs font-mono">
          <div className="flex justify-between"><span className="text-text-secondary">Subtotal</span><span className="text-text-primary">{cur}{subtotal.toFixed(2)}</span></div>
          {taxRate > 0 && <div className="flex justify-between"><span className="text-text-secondary">Tax ({(taxRate*100).toFixed(0)}%)</span><span className="text-text-primary">{cur}{tax.toFixed(2)}</span></div>}
          <div className="flex justify-between text-sm font-bold text-brand-primary border-t border-border pt-2 mt-2">
            <span>Total</span><span>{cur}{grandTotal.toFixed(2)}</span>
          </div>
        </div>
        <div className="text-center text-[10px] text-text-secondary mt-4 border-t border-border pt-3 font-mono">
          {settings.receipt_footer && <p className="italic mb-2">"{settings.receipt_footer}"</p>}
          <p className="font-bold text-brand-primary">Thank You!</p>
        </div>
        <div className="flex gap-3 mt-4">
          <button onClick={handlePrint} className="flex-1 py-3 bg-brand-primary hover:bg-brand-primary-dark text-white rounded font-bold text-xs flex items-center justify-center gap-2 transition font-mono uppercase">
            <Printer size={14} /> Print Bill
          </button>
          <button onClick={onClose} className="px-4 py-3 border border-border rounded text-xs font-bold text-text-secondary hover:text-text-primary transition font-mono uppercase">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

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
        items: o.items.map((i: any) => ({ 
          id: i.id, name: i.menu_item.name, qty: i.qty, price: i.menu_item.price, status: i.item_status,
          station: i.menu_item.category?.station || "kitchen"
        })),
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
  const todayRevenue = paidOrders.reduce((s, o) => s + o.total, 0);

  const METHOD_ICONS: Record<string, React.ReactNode> = {
    cash: <Banknote size={14} />,
    card: <CreditCard size={14} />,
    upi: <DollarSign size={14} />,
  };

  if (!user) return <LoginScreen onLogin={setUser} />;

  const getStatusStyle = (status: string) => {
    switch (status?.toLowerCase()) {
      case "placed":
      case "pending":
        return "bg-bg-surface-alt text-text-secondary border border-border";
      case "preparing":
        return "bg-amber-100 text-amber-800 border border-amber-200";
      case "ready":
      case "served":
        return "bg-green-100 text-green-800 border border-green-200";
      default:
        return "bg-bg-surface-alt text-text-secondary border border-border";
    }
  };

  return (
    <div className="min-h-screen bg-bg-page text-text-primary font-ui flex">
      
      {/* Sidebar Shell */}
      <aside className="w-56 bg-bg-surface border-r border-border flex flex-col justify-between select-none">
        <div>
          <div className="p-4 border-b border-border flex items-center gap-2">
            <div className="p-1.5 bg-brand-primary text-white rounded">
              <DollarSign size={16} />
            </div>
            <div>
              <h2 className="font-bold text-xs uppercase tracking-wider text-text-primary leading-tight">Ops Dashboard</h2>
              <span className="text-[10px] text-text-secondary font-mono">QSR Back-Office</span>
            </div>
          </div>

          <nav className="p-3 space-y-1">
            <div className="px-3 py-2 text-[10px] font-bold text-text-secondary uppercase tracking-widest">Active role</div>
            <div className="px-3 py-2 bg-brand-primary-tint text-brand-primary border-l-2 border-brand-primary rounded-r text-xs uppercase tracking-wider font-bold flex items-center gap-2">
              <DollarSign size={14} />
              <span>Cashier HUD</span>
            </div>
          </nav>
        </div>

        <div className="p-4 border-t border-border flex items-center justify-between">
          <div>
            <span className="text-[10px] text-text-secondary block font-mono">Cashier</span>
            <span className="text-xs font-bold text-text-primary font-mono">{user.username}</span>
          </div>
          <button onClick={() => { clearAuth(); setUser(null); }}
            className="p-1.5 rounded border border-border hover:bg-bg-surface-alt text-text-secondary hover:text-text-primary transition">
            <LogOut size={14} />
          </button>
        </div>
      </aside>

      {/* Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* Top Bar */}
        <header className="h-14 bg-bg-surface border-b border-border px-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="font-bold text-sm uppercase tracking-wider text-text-primary">
              Cashier Queue Panel
            </h1>
            <div className="h-4 w-[1px] bg-border" />
            <div className="text-xs">
              <span className="text-text-secondary">Revenue: </span>
              <span className="font-mono font-bold text-status-success">{settings.currency}{todayRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => { fetchOrders(); fetchSettings(); }}
              className="p-2 border border-border hover:bg-bg-surface-alt rounded text-text-secondary hover:text-text-primary transition">
              <RefreshCw size={14} />
            </button>
          </div>
        </header>

        <main className="p-6 overflow-y-auto flex-1 max-w-7xl w-full mx-auto space-y-6 animate-fade-in">
          {error && (
            <div className="p-3 bg-status-error/10 border border-status-error/20 rounded text-status-error text-xs font-semibold flex items-center justify-between animate-slide-up">
              <span>{error}</span>
              <button onClick={() => setError("")} className="ml-2 hover:text-white">&times;</button>
            </div>
          )}

          {/* Navigation Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-1 bg-bg-surface rounded p-1 border border-border">
              <button onClick={() => setTab("pending")}
                className={`px-4 py-2 rounded text-xs font-bold transition font-mono uppercase ${tab === "pending" ? "bg-brand-primary text-white" : "text-text-secondary hover:text-text-primary"}`}>
                Pending ({pendingOrders.length})
              </button>
              <button onClick={() => setTab("records")}
                className={`px-4 py-2 rounded text-xs font-bold transition font-mono uppercase ${tab === "records" ? "bg-brand-primary text-white" : "text-text-secondary hover:text-text-primary"}`}>
                Records ({paidOrders.length})
              </button>
            </div>
            {tab === "pending" && pendingOrders.length > 0 && (
              <div className="text-xs font-mono text-text-secondary bg-bg-surface border border-border px-3 py-1.5 rounded">
                Unsettled balance: <span className="font-bold text-brand-primary">{settings.currency}{totalPending.toFixed(2)}</span>
              </div>
            )}
          </div>

          {/* ── Pending Tab (QSR Table) ── */}
          {tab === "pending" && (
            <div className="border border-border rounded overflow-hidden bg-bg-surface shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-border bg-bg-surface-alt text-text-secondary uppercase font-mono text-[10px] tracking-wider">
                      <th className="p-4 font-semibold">Order</th>
                      <th className="p-4 font-semibold">Table</th>
                      <th className="p-4 font-semibold">Items</th>
                      <th className="p-4 font-semibold text-right">Total</th>
                      <th className="p-4 font-semibold text-center">Status</th>
                      <th className="p-4 font-semibold text-center">Payment Settle Control</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border font-mono">
                    {pendingOrders.map(order => (
                      <tr key={order.id} className="hover:bg-bg-surface-alt/40 transition">
                        <td className="p-4 font-bold text-text-primary">#{order.id}</td>
                        <td className="p-4 text-text-secondary">{order.table_label}</td>
                        <td className="p-4 text-text-secondary font-sans">
                          {order.items.map(i => `${i.qty}x ${i.name}`).join(", ")}
                        </td>
                        <td className="p-4 text-right font-bold text-text-primary">{settings.currency}{order.total.toFixed(2)}</td>
                        <td className="p-4 text-center">
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded uppercase ${getStatusStyle(order.status)}`}>
                            {order.status}
                          </span>
                        </td>
                        <td className="p-4">
                          <div className="flex items-center justify-center gap-2 max-w-sm mx-auto">
                            {/* Segmented Settle Control */}
                            <div className="flex bg-bg-page border border-border rounded p-0.5 font-sans">
                              {["cash", "card", "upi"].map((m) => (
                                <button
                                  key={m}
                                  type="button"
                                  onClick={() => setSettleMethod(m as any)}
                                  className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase transition flex items-center gap-1 ${settleMethod === m ? "bg-brand-primary text-white" : "text-text-secondary hover:text-text-primary"}`}
                                >
                                  {m}
                                </button>
                              ))}
                            </div>
                            <button 
                              onClick={() => handleSettlePayment(order.id, order.total)} 
                              disabled={settlingId === order.id}
                              className="px-4 py-1.5 bg-brand-primary text-white rounded font-bold text-[10px] uppercase font-sans tracking-wide hover:bg-brand-primary-dark transition disabled:opacity-50"
                            >
                              Settle
                            </button>
                            <button onClick={() => setBillOrder(order)}
                              className="p-1.5 border border-border rounded bg-bg-surface hover:bg-bg-surface-alt transition text-text-secondary hover:text-text-primary">
                              <Printer size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {pendingOrders.length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-text-tertiary font-sans">No pending billing records found</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Records Tab (QSR Table) ── */}
          {tab === "records" && (
            <div className="border border-border rounded overflow-hidden bg-bg-surface shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs font-mono">
                  <thead>
                    <tr className="border-b border-border bg-bg-surface-alt text-text-secondary uppercase text-[10px] tracking-wider">
                      <th className="p-4 font-semibold">Order</th>
                      <th className="p-4 font-semibold">Table</th>
                      <th className="p-4 font-semibold">Time</th>
                      <th className="p-4 font-semibold text-right">Amount</th>
                      <th className="p-4 font-semibold text-center">Receipt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {paidOrders.map(order => (
                      <tr key={order.id} className="hover:bg-bg-surface-alt/40 transition">
                        <td className="p-4 font-bold text-text-primary">Order #{order.id}</td>
                        <td className="p-4 text-text-secondary">{order.table_label}</td>
                        <td className="p-4 text-text-secondary">{new Date(order.created_at).toLocaleString()}</td>
                        <td className="p-4 text-right font-bold text-status-success">{settings.currency}{order.total.toFixed(2)}</td>
                        <td className="p-4 text-center">
                          <button onClick={() => setBillOrder(order)}
                            className="p-2 border border-border rounded hover:bg-bg-surface-alt text-text-secondary hover:text-text-primary transition">
                            <Printer size={12} />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {paidOrders.length === 0 && (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-text-tertiary font-sans">No settled orders found</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>

      {billOrder && (
        <Receipt order={billOrder} settings={settings} onClose={() => setBillOrder(null)} />
      )}
    </div>
  );
}
