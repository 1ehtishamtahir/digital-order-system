"use client";

import React, { useState, useEffect, useRef } from "react";
import { ChefHat, Flame, CheckCircle2, Play, LogOut, RefreshCw, Clock, AlertTriangle, Beer } from "lucide-react";

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
      if (!["kitchen", "bar", "tandoor"].includes(data.role)) { 
        setError("Only station staff (kitchen, bar, tandoor) can access this page"); 
        return; 
      }
      saveAuth(data.access_token, { username: data.username, role: data.role });
      onLogin({ username: data.username, role: data.role });
    } catch { setError("Cannot connect to server"); } finally { setLoading(false); }
  };
  
  return (
    <div className="min-h-screen bg-bg-page flex items-center justify-center p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm bg-bg-surface rounded border border-border p-8 shadow-md space-y-6">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto bg-brand-primary-tint rounded flex items-center justify-center border border-brand-primary/10 mb-3">
            <ChefHat size={24} className="text-brand-primary" />
          </div>
          <h1 className="font-bold text-lg text-text-primary">Ops Station HUD</h1>
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
    const stationName = user?.role || "kitchen";
    const ws = new WebSocket(`${WS_BASE}/station_${stationName}`);
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

  const activeStation = user?.role || "kitchen";

  const stationOrders = orders.filter(o =>
    o.status !== "paid" && o.status !== "cancelled" &&
    o.items.some(i => i.station === activeStation && i.status !== "served")
  );

  const totalItems = stationOrders.reduce((s, o) => s + o.items.filter(i => i.station === activeStation && i.status !== "served").length, 0);
  const prepItems = stationOrders.reduce((s, o) => s + o.items.filter(i => i.station === activeStation && i.status === "preparing").length, 0);

  if (!user) return <LoginScreen onLogin={setUser} />;

  // Plain status badges (solid background and dark text)
  const getBadgeStyle = (status: string) => {
    switch (status?.toLowerCase()) {
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
              <ChefHat size={16} />
            </div>
            <div>
              <h2 className="font-bold text-xs uppercase tracking-wider text-text-primary leading-tight">Ops Dashboard</h2>
              <span className="text-[10px] text-text-secondary font-mono">QSR Back-Office</span>
            </div>
          </div>

          <nav className="p-3 space-y-1">
            <div className="px-3 py-2 text-[10px] font-bold text-text-secondary uppercase tracking-widest">Active role</div>
            <div className="px-3 py-2 bg-brand-primary-tint text-brand-primary border-l-2 border-brand-primary rounded-r text-xs uppercase tracking-wider font-bold flex items-center gap-2">
              <Flame size={14} />
              <span>{activeStation} HUD</span>
            </div>
          </nav>
        </div>

        <div className="p-4 border-t border-border flex items-center justify-between">
          <div>
            <span className="text-[10px] text-text-secondary block font-mono">Operator</span>
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
          <div className="flex items-center gap-3">
            <h1 className="font-bold text-sm uppercase tracking-wider text-text-primary">
              {activeStation} order board
            </h1>
            <span className="text-xs text-text-tertiary">|</span>
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${wsConnected ? "bg-status-success" : "bg-status-error"}`} />
              <span className="text-[10px] font-mono uppercase tracking-wider text-text-secondary">
                {wsConnected ? "live connected" : "reconnecting"}
              </span>
            </div>
          </div>
          <button onClick={fetchOrders}
            className="p-2 border border-border hover:bg-bg-surface-alt rounded text-text-secondary hover:text-text-primary transition">
            <RefreshCw size={14} />
          </button>
        </header>

        <main className="p-6 overflow-y-auto flex-1 max-w-7xl w-full mx-auto space-y-6 animate-fade-in">
          {error && (
            <div className="p-3 bg-status-error/10 border border-status-error/20 rounded text-status-error text-xs font-semibold flex items-center justify-between animate-slide-up">
              <span>{error}</span>
              <button onClick={() => setError("")} className="ml-2 hover:text-white">&times;</button>
            </div>
          )}

          {/* KDS Stats overview */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded border border-border bg-bg-surface">
              <span className="text-[10px] font-bold uppercase text-text-secondary tracking-wider block">Queued items</span>
              <span className="text-lg font-mono font-bold mt-0.5 block text-text-primary">{totalItems - prepItems}</span>
            </div>
            <div className="p-3 rounded border border-border bg-bg-surface">
              <span className="text-[10px] font-bold uppercase text-text-secondary tracking-wider block">In Progress</span>
              <span className="text-lg font-mono font-bold mt-0.5 block text-status-warning">{prepItems}</span>
            </div>
            <div className="p-3 rounded border border-border bg-bg-surface">
              <span className="text-[10px] font-bold uppercase text-text-secondary tracking-wider block">Tickets Active</span>
              <span className="text-lg font-mono font-bold mt-0.5 block text-brand-primary">{stationOrders.length}</span>
            </div>
          </div>

          {stationOrders.length === 0 && (
            <div className="py-20 text-center text-text-tertiary">
              <CheckCircle2 size={36} className="mx-auto mb-3 text-status-success opacity-80" />
              <p className="font-bold text-xs uppercase tracking-wider text-text-primary">Kitchen queue is clear</p>
              <p className="text-xs mt-1 text-text-secondary">New orders will appear here automatically.</p>
            </div>
          )}

          {/* Tickets Column */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {stationOrders.map((order) => {
              const stationItems = order.items.filter(i => i.station === activeStation && i.status !== "served");
              if (stationItems.length === 0) return null;
              
              return (
                <div key={order.id}
                  className="rounded border border-border bg-bg-surface p-4 flex flex-col justify-between gap-4 shadow-sm"
                >
                  <div>
                    {/* Header */}
                    <div className="flex justify-between items-start pb-2.5 border-b border-border/80 mb-3">
                      <div>
                        <h4 className="font-mono font-bold text-xs text-text-primary">Order #{order.id}</h4>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-bg-page border border-border text-text-secondary mt-1 inline-block">
                          {order.table_label}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-[10px] font-mono text-text-secondary">
                        <Clock size={10} />
                        <span>{new Date(order.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      </div>
                    </div>

                    {/* Items */}
                    <div className="space-y-3">
                      {stationItems.map(item => (
                        <div key={item.id} className="p-3 bg-bg-page border border-border rounded flex flex-col gap-2.5">
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="flex items-baseline gap-1.5">
                                <span className="font-mono font-bold text-xs text-brand-primary">{item.qty}x</span>
                                <span className="font-bold text-xs text-text-primary">{item.name}</span>
                              </div>
                              {item.modifiers && <p className="text-[10px] text-text-secondary mt-0.5">[{item.modifiers}]</p>}
                              {item.notes && <p className="text-[10px] text-status-error italic mt-0.5">"{item.notes}"</p>}
                            </div>
                            <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded uppercase ${getBadgeStyle(item.status)}`}>
                              {item.status}
                            </span>
                          </div>
                          
                          {/* Large Touch Targets for Kitchen Staff (56px) */}
                          <div className="flex">
                            {item.status === "pending" && (
                              <button 
                                onClick={() => handleItemStatus(item.id, "preparing")} 
                                disabled={loading === item.id}
                                className="h-14 w-full bg-brand-primary hover:bg-brand-primary-dark disabled:bg-border text-white font-bold rounded text-xs font-mono uppercase flex items-center justify-center gap-1.5 transition"
                              >
                                <Play size={12} /> 
                                <span>{loading === item.id ? "..." : "Start Cooking"}</span>
                              </button>
                            )}
                            {item.status === "preparing" && (
                              <button 
                                onClick={() => handleItemStatus(item.id, "ready")} 
                                disabled={loading === item.id}
                                className="h-14 w-full bg-status-success hover:opacity-90 disabled:bg-border text-white font-bold rounded text-xs font-mono uppercase flex items-center justify-center gap-1.5 transition"
                              >
                                <CheckCircle2 size={12} /> 
                                <span>{loading === item.id ? "..." : "Mark Ready"}</span>
                              </button>
                            )}
                            {item.status === "ready" && (
                              <button 
                                onClick={() => handleItemStatus(item.id, "served")} 
                                disabled={loading === item.id}
                                className="h-14 w-full bg-status-neutral hover:opacity-90 disabled:bg-border text-white font-bold rounded text-xs font-mono uppercase flex items-center justify-center gap-1.5 transition"
                              >
                                <CheckCircle2 size={12} /> 
                                <span>{loading === item.id ? "..." : "Mark Served"}</span>
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                </div>
              );
            })}
          </div>
        </main>
      </div>
    </div>
  );
}
