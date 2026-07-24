"use client";

import React, { useState, useEffect, useRef } from "react";
import { ChefHat, Flame, CheckCircle2, Play, LogOut, RefreshCw, Clock, AlertTriangle } from "lucide-react";

interface OrderItem {
  id: number; name: string; qty: number; station: string; status: string;
  notes: string | null; modifiers: string | null;
}
interface Order {
  id: number; table_label: string; total: number; status: string;
  order_type: string; created_at: string; items: OrderItem[];
}
interface StaffUser { username: string; role: string; }

const API = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1";
const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || "ws://127.0.0.1:8000/ws";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("kitchen_token");
}
function getUser(): StaffUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("kitchen_user");
  return raw ? JSON.parse(raw) : null;
}
function saveAuth(token: string, user: StaffUser) {
  localStorage.setItem("kitchen_token", token);
  localStorage.setItem("kitchen_user", JSON.stringify(user));
}
function clearAuth() {
  localStorage.removeItem("kitchen_token");
  localStorage.removeItem("kitchen_user");
}

async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getToken();
  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token}`,
      ...((options.method === "POST" || options.method === "PUT") && !(options.body instanceof FormData)
        ? { "Content-Type": "application/json" } : {}),
    },
  });
}

const STATION_COLORS: Record<string, string> = {
  kitchen: "bg-amber-500/15 text-amber-400 border-amber-500/25",
  bar: "bg-blue-500/15 text-blue-400 border-blue-500/25",
  tandoor: "bg-orange-500/15 text-orange-400 border-orange-500/25",
};
const STATUS_BADGE: Record<string, string> = {
  pending: "bg-gray-500/15 text-gray-400 border-gray-500/20",
  preparing: "bg-[#D1A63C]/15 text-[#D1A63C] border-[#D1A63C]/25 animate-pulse-soft",
  ready: "bg-[#4CAF6D]/15 text-[#4CAF6D] border-[#4CAF6D]/25",
  served: "bg-teal-500/15 text-teal-400 border-teal-500/25",
};
const STATUS_ORDER: Record<string, string> = {
  placed: "border-l-[#4C9BD1]",
  preparing: "border-l-[#D1A63C]",
  ready: "border-l-[#4CAF6D]",
  served: "border-l-teal-500",
  paid: "border-l-indigo-500",
};

function LoginScreen({ onLogin }: { onLogin: (u: StaffUser) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(""); setLoading(true);
    try {
      const form = new URLSearchParams(); form.append("username", username); form.append("password", password);
      const res = await fetch(`${API}/auth/login`, {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form,
      });
      if (!res.ok) { const d = await res.json(); setError(d.detail || "Login failed"); return; }
      const data = await res.json();
      if (data.role !== "kitchen") { setError("Only kitchen staff can access this page"); return; }
      saveAuth(data.access_token, { username: data.username, role: data.role });
      onLogin({ username: data.username, role: data.role });
    } catch { setError("Cannot connect to server"); } finally { setLoading(false); }
  };
  return (
    <div className="min-h-screen bg-[#15171B] flex items-center justify-center p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm bg-[#1F2229] rounded-2xl border border-[#282C34] p-8 shadow-2xl space-y-6">
        <div className="text-center">
          <div className="w-14 h-14 mx-auto bg-gradient-to-tr from-[#C98A2E] to-rose-500 rounded-2xl flex items-center justify-center shadow-lg mb-4">
            <ChefHat size={26} className="text-white" />
          </div>
          <h1 className="text-xl font-bold text-[#EDEAE3]">Kitchen Station</h1>
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

export default function KitchenPage() {
  const [user, setUser] = useState<StaffUser | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [wsConnected, setWsConnected] = useState(false);
  const [error, setError] = useState("");
  const socketRef = useRef<WebSocket | null>(null);
  const [loading, setLoading] = useState<number | null>(null);

  useEffect(() => { const u = getUser(); if (u) setUser(u); }, []);
  useEffect(() => { if (!user) return; fetchOrders(); connectWs(); return () => socketRef.current?.close(); }, [user]);

  const connectWs = () => {
    socketRef.current?.close();
    const ws = new WebSocket(`${WS_BASE}/station_kitchen`);
    socketRef.current = ws;
    ws.onopen = () => setWsConnected(true);
    ws.onmessage = (event) => {
      const d = JSON.parse(event.data);
      if (d.event === "order_created") setOrders(prev => [d.order, ...prev]);
      else if (["order_item_updated", "order_updated"].includes(d.event)) fetchOrders();
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
        items: o.items.map((i: any) => ({
          id: i.id, name: i.menu_item.name, qty: i.qty,
          station: i.menu_item.category?.station || "kitchen",
          status: i.item_status, notes: i.notes, modifiers: i.modifiers,
        })),
      })));
    } catch { /* ignore */ }
  };

  const handleItemStatus = async (itemId: number, status: string) => {
    setError(""); setLoading(itemId);
    try {
      const res = await authFetch(`${API}/orders/items/${itemId}/status`, {
        method: "PUT", body: JSON.stringify({ item_status: status }),
      });
      if (res.ok) { await fetchOrders(); }
      else { const d = await res.json().catch(() => ({})); setError(d.detail || `Failed to update (${res.status})`); }
    } catch { setError("Network error"); } finally { setLoading(null); }
  };

  const kitchenOrders = orders.filter(o =>
    o.status !== "paid" && o.status !== "cancelled" &&
    o.items.some(i => i.status !== "served")
  );

  const totalItems = kitchenOrders.reduce((s, o) => s + o.items.filter(i => i.status !== "served").length, 0);
  const prepItems = kitchenOrders.reduce((s, o) => s + o.items.filter(i => i.status === "preparing").length, 0);

  if (!user) return <LoginScreen onLogin={setUser} />;

  return (
    <div className="min-h-screen bg-[#15171B] text-[#EDEAE3]">
      <header className="sticky top-0 z-40 backdrop-blur-md bg-[#15171B]/80 border-b border-[#282C34]">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-tr from-[#C98A2E] to-rose-500 rounded-xl text-white shadow-lg"><Flame size={22} /></div>
            <div>
              <h1 className="font-extrabold text-lg tracking-tight">Kitchen Station</h1>
              <span className="text-xs font-bold text-[#C98A2E]">{user.username}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={fetchOrders}
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

        {/* Stats bar */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="p-3 rounded-xl border border-[#282C34] bg-[#1F2229]/40">
            <span className="text-[10px] font-semibold uppercase text-[#8B8F98] tracking-wider">Pending Items</span>
            <span className="text-2xl font-black mt-1 block text-[#4C9BD1]">{totalItems - prepItems}</span>
          </div>
          <div className="p-3 rounded-xl border border-[#282C34] bg-[#1F2229]/40">
            <span className="text-[10px] font-semibold uppercase text-[#8B8F98] tracking-wider">In Progress</span>
            <span className="text-2xl font-black mt-1 block text-[#D1A63C]">{prepItems}</span>
          </div>
          <div className="p-3 rounded-xl border border-[#282C34] bg-[#1F2229]/40">
            <span className="text-[10px] font-semibold uppercase text-[#8B8F98] tracking-wider">Active Orders</span>
            <span className="text-2xl font-black mt-1 block text-[#C98A2E]">{kitchenOrders.length}</span>
          </div>
        </div>

        {kitchenOrders.length === 0 && (
          <div className="py-20 text-center text-[#8B8F98] animate-fade-in">
            <CheckCircle2 size={56} className="mx-auto mb-4 opacity-30" />
            <p className="font-bold text-base">Kitchen queue is clear</p>
            <p className="text-xs mt-1 text-[#8B8F98]">New orders will appear here in real time</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {kitchenOrders.map((order, idx) => {
            const activeItems = order.items.filter(i => i.status !== "served");
            if (activeItems.length === 0) return null;
            return (
              <div key={order.id}
                className={`rounded-2xl border border-[#282C34] bg-gradient-to-b from-[#1F2229]/60 to-[#1F2229]/30 p-5 shadow-md hover:shadow-xl hover:border-[#282C34] transition-all duration-300 animate-slide-up border-l-4 ${STATUS_ORDER[order.status] || "border-l-[#282C34]"}`}
                style={{ animationDelay: `${idx * 50}ms` }}>
                {/* Order header */}
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#C98A2E]/20 to-rose-500/20 border border-[#282C34] flex items-center justify-center">
                      <span className="font-black text-sm text-[#C98A2E]">#{order.id}</span>
                    </div>
                    <div>
                      <h4 className="font-black text-sm">Order #{order.id}</h4>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-[#C98A2E]/10 text-[#C98A2E] border border-[#C98A2E]/20">
                        {order.table_label}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-[#8B8F98]">
                    <Clock size={10} />
                    {new Date(order.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>

                {/* Items */}
                <div className="space-y-2.5">
                  {activeItems.map(item => (
                    <div key={item.id} className="p-3 rounded-xl bg-[#15171B]/60 border border-[#282C34]/60 hover:border-[#282C34] transition">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-extrabold text-[#C98A2E] text-sm">{item.qty}x</span>
                            <span className="font-bold text-sm truncate">{item.name}</span>
                            <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border ${STATION_COLORS[item.station] || "bg-gray-500/15 text-gray-400 border-gray-500/20"}`}>
                              {item.station}
                            </span>
                          </div>
                          {item.modifiers && <p className="text-xs text-[#C98A2E]/80 font-semibold mt-1">[{item.modifiers}]</p>}
                          {item.notes && <p className="text-xs text-[#8B8F98] italic mt-0.5 flex items-center gap-1"><AlertTriangle size={10} />"{item.notes}"</p>}
                        </div>
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded uppercase border ${STATUS_BADGE[item.status] || "bg-gray-500/15 text-gray-400 border-gray-500/20"}`}>
                          {item.status}
                        </span>
                      </div>
                      <div className="flex justify-end gap-1.5">
                        {item.status === "pending" && (
                          <button onClick={() => handleItemStatus(item.id, "preparing")} disabled={loading === item.id}
                            className="px-3 py-1.5 bg-[#D1A63C] hover:bg-[#D1A63C]/90 disabled:opacity-50 text-white font-bold rounded-lg text-[10px] flex items-center gap-1 transition shadow-sm">
                            <Play size={11} /> {loading === item.id ? "..." : "Start Prep"}
                          </button>
                        )}
                        {item.status === "preparing" && (
                          <button onClick={() => handleItemStatus(item.id, "ready")} disabled={loading === item.id}
                            className="px-3 py-1.5 bg-[#4CAF6D] hover:bg-[#4CAF6D]/90 disabled:opacity-50 text-white font-bold rounded-lg text-[10px] flex items-center gap-1 transition shadow-sm">
                            <CheckCircle2 size={11} /> {loading === item.id ? "..." : "Mark Ready"}
                          </button>
                        )}
                        {item.status === "ready" && (
                          <button onClick={() => handleItemStatus(item.id, "served")} disabled={loading === item.id}
                            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold rounded-lg text-[10px] flex items-center gap-1 transition shadow-sm">
                            <CheckCircle2 size={11} /> {loading === item.id ? "..." : "Serve"}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
