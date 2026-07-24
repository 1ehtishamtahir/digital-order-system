"use client";

import React, { useState, useEffect, useRef } from "react";
import { DollarSign, CheckCircle2, LogOut, RefreshCw, ChefHat } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────
interface OrderItem { id: number; name: string; qty: number; status: string; }
interface Order {
  id: number; table_label: string; total: number; status: string;
  order_type: string; created_at: string; items: OrderItem[];
}
interface StaffUser { username: string; role: string; }

const API = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1";
const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || "ws://127.0.0.1:8000/ws";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("cashier_token");
}
function getUser(): StaffUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("cashier_user");
  return raw ? JSON.parse(raw) : null;
}
function saveAuth(token: string, user: StaffUser) {
  localStorage.setItem("cashier_token", token);
  localStorage.setItem("cashier_user", JSON.stringify(user));
}
function clearAuth() {
  localStorage.removeItem("cashier_token");
  localStorage.removeItem("cashier_user");
}

const STATUS_COLORS: Record<string, string> = {
  placed: "bg-[#4C9BD1]/20 text-[#4C9BD1] border border-[#4C9BD1]/30",
  preparing: "bg-[#D1A63C]/20 text-[#D1A63C] border border-[#D1A63C]/30",
  ready: "bg-[#4CAF6D]/20 text-[#4CAF6D] border border-[#4CAF6D]/30",
  served: "bg-teal-500/20 text-teal-400 border border-teal-500/30",
  paid: "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30",
};

function LoginScreen({ onLogin }: { onLogin: (u: StaffUser) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const form = new URLSearchParams();
      form.append("username", username);
      form.append("password", password);
      const res = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form,
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.detail || "Login failed");
        return;
      }
      const data = await res.json();
      if (data.role !== "cashier") {
        setError("Only cashier staff can access this page");
        return;
      }
      saveAuth(data.access_token, { username: data.username, role: data.role });
      onLogin({ username: data.username, role: data.role });
    } catch { setError("Cannot connect to server"); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-[#15171B] flex items-center justify-center p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm bg-[#1F2229] rounded-2xl border border-[#282C34] p-8 shadow-2xl space-y-6">
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

export default function CashierPage() {
  const [user, setUser] = useState<StaffUser | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [wsConnected, setWsConnected] = useState(false);
  const [error, setError] = useState("");
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const u = getUser();
    if (u) setUser(u);
  }, []);

  useEffect(() => {
    if (!user) return;
    fetchOrders();
    connectWs();
    return () => socketRef.current?.close();
  }, [user]);

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
      setOrders(data.map((o: any) => ({
        id: o.id, table_label: o.table?.label || "Takeaway", total: o.total, status: o.status,
        order_type: o.order_type, created_at: o.created_at,
        items: o.items.map((i: any) => ({ id: i.id, name: i.menu_item.name, qty: i.qty, status: i.item_status })),
      })));
    } catch { /* ignore */ }
  };

  const handleSettlePayment = async (orderId: number, total: number) => {
    setError("");
    try {
      const res = await fetch(`${API}/orders/${orderId}/payments`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: "cash", amount: total }),
      });
      if (res.ok) { fetchOrders(); }
      else { const d = await res.json().catch(() => ({})); setError(d.detail || "Payment failed"); }
    } catch { setError("Network error"); }
  };

  const pendingOrders = orders.filter(o => o.status !== "paid" && o.status !== "cancelled");

  if (!user) return <LoginScreen onLogin={setUser} />;

  return (
    <div className="min-h-screen bg-[#15171B] text-[#EDEAE3]">
      <header className="sticky top-0 z-40 backdrop-blur-md bg-[#15171B]/80 border-b border-[#282C34]">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-tr from-[#C98A2E] to-rose-500 rounded-xl text-white shadow-lg">
              <DollarSign size={22} />
            </div>
            <div>
              <h1 className="font-extrabold text-lg tracking-tight">Cashier Station</h1>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-[#C98A2E]">{user.username}</span>
                <span className={`w-1.5 h-1.5 rounded-full ${wsConnected ? "bg-[#4CAF6D]" : "bg-[#D1495B]"}`} />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={fetchOrders}
              className="p-2 rounded-lg border border-[#282C34] hover:bg-[#1F2229] text-[#8B8F98] transition">
              <RefreshCw size={16} />
            </button>
            <button onClick={() => { clearAuth(); setUser(null); }}
              className="p-2 rounded-lg border border-[#282C34] hover:bg-[#1F2229] text-[#8B8F98] transition">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {error && (
          <div className="mb-4 p-3 bg-[#D1495B]/10 border border-[#D1495B]/30 rounded-xl text-[#D1495B] text-xs font-semibold flex justify-between items-center">
            <span>{error}</span>
            <button onClick={() => setError("")} className="ml-2 hover:text-white">&times;</button>
          </div>
        )}

        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold flex items-center gap-2">
            <DollarSign size={22} className="text-[#4CAF6D]" />
            <span>Bill Settlement Queue</span>
          </h3>
          <span className="text-xs bg-[#1F2229] border border-[#282C34] px-3 py-1 rounded-full font-semibold text-[#8B8F98]">
            {pendingOrders.length} pending
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {pendingOrders.map(order => (
            <div key={order.id} className="rounded-2xl border border-[#282C34] bg-[#1F2229]/40 p-5 flex flex-col justify-between gap-4 hover:border-[#282C34]/70 transition shadow-md">
              <div>
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-black text-lg">Order #{order.id}</h4>
                    <span className="text-xs px-2 py-0.5 rounded bg-[#C98A2E]/10 text-[#C98A2E] font-semibold border border-[#C98A2E]/20">{order.table_label}</span>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${STATUS_COLORS[order.status] || ""}`}>{order.status}</span>
                </div>
                <div className="mt-4 space-y-2 border-t border-b border-[#282C34] py-3">
                  {order.items.map(item => (
                    <div key={item.id} className="flex justify-between items-start text-xs">
                      <span className="font-semibold text-[#C98A2E]">{item.qty}x <span className="text-[#EDEAE3]">{item.name}</span></span>
                      <span className="text-[10px] uppercase font-bold text-[#8B8F98]">{item.status}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex justify-between items-center pt-2">
                <div>
                  <span className="text-[10px] text-[#8B8F98] block">Total Due</span>
                  <span className="text-xl font-extrabold text-[#C98A2E]">${order.total.toFixed(2)}</span>
                </div>
                <button onClick={() => handleSettlePayment(order.id, order.total)}
                  className="px-4 py-2 bg-[#4CAF6D] hover:bg-[#4CAF6D]/90 text-white rounded-xl font-bold shadow-md text-xs transition">
                  Collect & Settle
                </button>
              </div>
            </div>
          ))}
          {pendingOrders.length === 0 && (
            <div className="col-span-full py-16 text-center text-[#8B8F98]">
              <CheckCircle2 size={48} className="mx-auto mb-3 opacity-40" />
              <p className="font-bold text-sm">All bills settled</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
