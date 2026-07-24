"use client";

import React, { useState, useEffect, useRef } from "react";
import { ChefHat, Flame, CheckCircle2, Play, LogOut, RefreshCw, Utensils } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────
interface OrderItem {
  id: number;
  name: string;
  qty: number;
  station: string;
  status: string;
  notes: string | null;
  modifiers: string | null;
}

interface Order {
  id: number;
  table_label: string;
  total: number;
  status: string;
  order_type: string;
  created_at: string;
  items: OrderItem[];
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
        ? { "Content-Type": "application/json" }
        : {}),
    },
  });
}

const itemBadge: Record<string, string> = {
  pending: "bg-gray-500/10 text-gray-400",
  preparing: "bg-[#D1A63C]/10 text-[#D1A63C] animate-pulse",
  ready: "bg-[#4CAF6D]/10 text-[#4CAF6D]",
  served: "bg-teal-500/10 text-teal-400",
};

// ─── Login ───────────────────────────────────────────────────────────────────
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
      if (data.role !== "kitchen") {
        setError("Only kitchen staff can access this page");
        return;
      }
      saveAuth(data.access_token, { username: data.username, role: data.role });
      onLogin({ username: data.username, role: data.role });
    } catch {
      setError("Cannot connect to server");
    } finally {
      setLoading(false);
    }
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
        {error && (
          <div className="p-3 bg-[#D1495B]/10 border border-[#D1495B]/30 rounded-xl text-[#D1495B] text-xs font-semibold text-center">{error}</div>
        )}
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

// ─── Kitchen Dashboard ───────────────────────────────────────────────────────
export default function KitchenPage() {
  const [user, setUser] = useState<StaffUser | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [wsConnected, setWsConnected] = useState(false);
  const [error, setError] = useState("");
  const socketRef = useRef<WebSocket | null>(null);
  const [loading, setLoading] = useState<number | null>(null); // item id being acted on

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
    const ws = new WebSocket(`${WS_BASE}/station_kitchen`);
    socketRef.current = ws;
    ws.onopen = () => setWsConnected(true);
    ws.onmessage = (event) => {
      const d = JSON.parse(event.data);
      if (d.event === "order_created") setOrders(prev => [d.order, ...prev]);
      else if (["order_item_updated", "order_updated"].includes(d.event)) fetchOrders();
    };
    ws.onclose = () => {
      setWsConnected(false);
      setTimeout(connectWs, 3000);
    };
  };

  const fetchOrders = async () => {
    try {
      const res = await fetch(`${API}/orders`);
      if (!res.ok) return;
      const data = await res.json();
      setOrders(data.map((o: any) => ({
        id: o.id,
        table_label: o.table?.label || "Takeaway",
        total: o.total,
        status: o.status,
        order_type: o.order_type,
        created_at: o.created_at,
        items: o.items.map((i: any) => ({
          id: i.id,
          name: i.menu_item.name,
          qty: i.qty,
          station: i.menu_item.category?.station || "kitchen",
          status: i.item_status,
          notes: i.notes,
          modifiers: i.modifiers,
        })),
      })));
    } catch { /* ignore */ }
  };

  const handleItemStatus = async (itemId: number, status: string) => {
    setError("");
    setLoading(itemId);
    try {
      const res = await authFetch(`${API}/orders/items/${itemId}/status`, {
        method: "PUT",
        body: JSON.stringify({ item_status: status }),
      });
      if (res.ok) {
        await fetchOrders();
      } else {
        const d = await res.json().catch(() => ({}));
        setError(d.detail || `Failed to update item (${res.status})`);
      }
    } catch (err) {
      setError("Network error — check backend connection");
    } finally {
      setLoading(null);
    }
  };

  const kitchenOrders = orders.filter(o =>
    o.status !== "paid" && o.status !== "cancelled" &&
    o.items.some(i => i.station === "kitchen" && i.status !== "served")
  );

  if (!user) return <LoginScreen onLogin={setUser} />;

  return (
    <div className="min-h-screen bg-[#15171B] text-[#EDEAE3]">
      <header className="sticky top-0 z-40 backdrop-blur-md bg-[#15171B]/80 border-b border-[#282C34]">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-tr from-[#C98A2E] to-rose-500 rounded-xl text-white shadow-lg">
              <Flame size={22} />
            </div>
            <div>
              <h1 className="font-extrabold text-lg tracking-tight">Kitchen Station</h1>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-[#C98A2E]">{user.username}</span>
                <span className={`w-1.5 h-1.5 rounded-full ${wsConnected ? "bg-[#4CAF6D]" : "bg-[#D1495B]"}`} />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => { fetchOrders(); }}
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
          <div className="mb-4 p-3 bg-[#D1495B]/10 border border-[#D1495B]/30 rounded-xl text-[#D1495B] text-xs font-semibold flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError("")} className="ml-2 hover:text-white">&times;</button>
          </div>
        )}

        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold flex items-center gap-2">
            <Flame size={22} className="text-[#C98A2E]" />
            <span>Orders to Prepare</span>
          </h3>
          <span className="text-xs bg-[#1F2229] border border-[#282C34] px-3 py-1 rounded-full font-semibold text-[#8B8F98]">
            {kitchenOrders.reduce((s, o) => s + o.items.filter(i => i.station === "kitchen" && i.status !== "served").length, 0)} items
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {kitchenOrders.map(order => {
            const kitItems = order.items.filter(i => i.station === "kitchen" && i.status !== "served");
            if (kitItems.length === 0) return null;
            return (
              <div key={order.id} className="rounded-2xl border border-[#282C34] bg-[#1F2229]/40 p-5 hover:border-[#282C34]/70 transition shadow-md">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h4 className="font-black text-lg">Order #{order.id}</h4>
                    <span className="text-xs px-2.5 py-0.5 rounded bg-[#C98A2E]/10 text-[#C98A2E] font-semibold border border-[#C98A2E]/20">
                      {order.table_label}
                    </span>
                  </div>
                  <span className="text-xs text-[#8B8F98]">
                    {new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div className="divide-y divide-[#282C34]">
                  {kitItems.map(item => (
                    <div key={item.id} className="py-3">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <span className="font-extrabold text-[#C98A2E]">{item.qty}x</span>
                          <span className="ml-1.5 font-bold">{item.name}</span>
                          {item.modifiers && <p className="text-xs text-[#C98A2E] font-semibold mt-0.5">[{item.modifiers}]</p>}
                          {item.notes && <p className="text-xs text-[#8B8F98] italic mt-0.5">"{item.notes}"</p>}
                        </div>
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded uppercase ${itemBadge[item.status] || "bg-gray-500/10 text-gray-400"}`}>
                          {item.status}
                        </span>
                      </div>
                      <div className="flex justify-end">
                        {item.status === "pending" && (
                          <button onClick={() => handleItemStatus(item.id, "preparing")} disabled={loading === item.id}
                            className="px-3 py-1.5 bg-[#D1A63C] hover:bg-[#D1A63C]/90 disabled:opacity-50 text-white font-bold rounded-lg text-xs flex items-center gap-1 transition">
                            <Play size={12} /> {loading === item.id ? "..." : "Prepare"}
                          </button>
                        )}
                        {item.status === "preparing" && (
                          <button onClick={() => handleItemStatus(item.id, "ready")} disabled={loading === item.id}
                            className="px-3 py-1.5 bg-[#4CAF6D] hover:bg-[#4CAF6D]/90 disabled:opacity-50 text-white font-bold rounded-lg text-xs flex items-center gap-1 transition">
                            <CheckCircle2 size={12} /> {loading === item.id ? "..." : "Mark Ready"}
                          </button>
                        )}
                        {item.status === "ready" && (
                          <button onClick={() => handleItemStatus(item.id, "served")} disabled={loading === item.id}
                            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold rounded-lg text-xs flex items-center gap-1 transition">
                            <CheckCircle2 size={12} /> {loading === item.id ? "..." : "Serve"}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {kitchenOrders.length === 0 && (
            <div className="col-span-full py-16 text-center text-[#8B8F98]">
              <CheckCircle2 size={48} className="mx-auto mb-3 opacity-40" />
              <p className="font-bold text-sm">Kitchen queue is clear</p>
              <p className="text-xs mt-1">New orders will appear here in real time</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
