"use client";

import React, { useState, useEffect } from "react";
import {
  Settings, Package, Save, Plus, Edit3, X, Image as ImageIcon,
  TrendingUp, Trash2, LogOut, RefreshCw, Upload, Layers, ChefHat, CheckCircle2,
  DollarSign, ShoppingBag, Clock, AlertTriangle
} from "lucide-react";

interface MenuItem {
  id: number; category_id: number; name: string; description?: string | null;
  price: number; is_available: boolean; image_url?: string | null;
  category?: { id: number; name: string; station: string };
  inventory?: { stock_qty: number; low_stock_threshold: number };
}
interface Category { id: number; name: string; station: string; }
interface OrderItem { id: number; name: string; qty: number; station: string; status: string; }
interface Order { id: number; table_label: string; total: number; status: string; items: OrderItem[]; }
interface StaffUser { username: string; role: string; }

const API = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1";
const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || "ws://127.0.0.1:8000/ws";
const UPLOADS_BASE = process.env.NEXT_PUBLIC_UPLOADS_URL || "http://127.0.0.1:8000";

function getToken(): string | null { return typeof window === "undefined" ? null : localStorage.getItem("admin_token"); }
function getUser(): StaffUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("admin_user");
  return raw ? JSON.parse(raw) : null;
}
function saveAuth(t: string, u: StaffUser) { localStorage.setItem("admin_token", t); localStorage.setItem("admin_user", JSON.stringify(u)); }
function clearAuth() { localStorage.removeItem("admin_token"); localStorage.removeItem("admin_user"); }

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
  const [u, setU] = useState(""); const [p, setP] = useState(""); const [err, setErr] = useState(""); const [load, setLoad] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(""); setLoad(true);
    try {
      const form = new URLSearchParams(); form.append("username", u); form.append("password", p);
      const res = await fetch(`${API}/auth/login`, {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form,
      });
      if (!res.ok) { const d = await res.json(); setErr(d.detail || "Login failed"); return; }
      const data = await res.json();
      if (data.role !== "admin") { setErr("Only admin can access this page"); return; }
      saveAuth(data.access_token, { username: data.username, role: data.role });
      onLogin({ username: data.username, role: data.role });
    } catch { setErr("Cannot connect to server"); } finally { setLoad(false); }
  };
  return (
    <div className="min-h-screen bg-bg-page flex items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-bg-surface rounded border border-border p-8 shadow-md space-y-6">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto bg-brand-primary-tint rounded flex items-center justify-center border border-brand-primary/10 mb-3">
            <Settings size={24} className="text-brand-primary" />
          </div>
          <h1 className="font-bold text-lg text-text-primary">Admin Panel</h1>
          <p className="text-xs text-text-secondary mt-1">Admin login required</p>
        </div>
        {err && <div className="p-2.5 bg-status-error/10 border border-status-error/20 rounded text-status-error text-xs font-semibold text-center">{err}</div>}
        <div className="space-y-4">
          <input type="text" placeholder="Username" value={u} onChange={e => setU(e.target.value)}
            className="w-full p-2.5 bg-bg-page border border-border rounded focus:border-brand-primary focus:outline-none text-text-primary text-xs" required />
          <input type="password" placeholder="Password" value={p} onChange={e => setP(e.target.value)}
            className="w-full p-2.5 bg-bg-page border border-border rounded focus:border-brand-primary focus:outline-none text-text-primary text-xs" required />
        </div>
        <button type="submit" disabled={load} className="w-full py-3 bg-brand-primary hover:bg-brand-primary-dark text-white font-bold rounded text-xs font-mono uppercase tracking-wider transition disabled:opacity-50">
          {load ? "Signing in..." : "Sign In"}
        </button>
      </form>
    </div>
  );
}

function Modal({ title, icon, children, onClose }: { title: string; icon: React.ReactNode; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-text-primary/30 backdrop-blur-sm animate-fade-in">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-bg-surface rounded border border-border p-6 shadow-xl animate-slide-up max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-5 pb-3 border-b border-border">
          <div className="flex items-center gap-2">
            {icon}
            <h3 className="font-bold text-sm text-text-primary uppercase tracking-wider">{title}</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded bg-bg-surface-alt border border-border text-text-secondary hover:text-text-primary transition">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function AdminPage() {
  const [user, setUser] = useState<StaffUser | null>(null);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [showCat, setShowCat] = useState(false);
  const [editItem, setEditItem] = useState<MenuItem | null>(null);
  const [uploading, setUploading] = useState(false);

  const [activeTab, setActiveTab] = useState<"menu" | "settings">("menu");

  // Form states
  const [fName, setFName] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [fPrice, setFPrice] = useState(0);
  const [fCat, setFCat] = useState<number | "">("");
  const [fImg, setFImg] = useState("");

  // Category form states
  const [newCatName, setNewCatName] = useState("");
  const [newCatStation, setNewCatStation] = useState("kitchen");

  // Restaurant settings states
  const [sName, setSName] = useState("");
  const [sLogo, setSLogo] = useState("");
  const [sAddr, setSAddr] = useState("");
  const [sPhone, setSPhone] = useState("");
  const [sTax, setSTax] = useState(0);
  const [sCur, setSCur] = useState("$");
  const [sFoot, setSFoot] = useState("");

  useEffect(() => { const u = getUser(); if (u) setUser(u); }, []);
  useEffect(() => { if (user) fetchAll(); }, [user]);

  const fetchAll = async () => {
    try {
      const itemRes = await fetch(`${API}/menu/items`);
      if (itemRes.ok) setItems(await itemRes.json());
      const catRes = await fetch(`${API}/menu/categories`);
      if (catRes.ok) setCategories(await catRes.json());
      const orderRes = await fetch(`${API}/orders`);
      if (orderRes.ok) {
        const data = await orderRes.json();
        setOrders(data.map((o: any) => ({
          id: o.id, table_label: o.table?.label || "Takeaway", total: o.total, status: o.status,
          items: o.items.map((i: any) => ({ id: i.id, name: i.menu_item.name, qty: i.qty, station: i.menu_item.category?.station || "kitchen", status: i.item_status })),
        })));
      }
      const settingsRes = await fetch(`${API}/settings`);
      if (settingsRes.ok) {
        const d = await settingsRes.json();
        setSName(d.name); setSLogo(d.logo_url || ""); setSAddr(d.address || ""); setSPhone(d.phone || ""); setSTax(d.tax_rate); setSCur(d.currency); setSFoot(d.receipt_footer || "");
      }
    } catch {}
  };

  const handleStock = async (itemId: number, newStock: number) => {
    try {
      const res = await authFetch(`${API}/menu/items/${itemId}/stock`, {
        method: "PUT", body: JSON.stringify({ stock_qty: newStock, low_stock_threshold: 5 }),
      });
      if (res.ok) fetchAll();
    } catch {}
  };

  const handleToggleAvail = async (itemId: number, currentlyAvail: boolean) => {
    try {
      const res = await authFetch(`${API}/menu/items/${itemId}/availability`, {
        method: "PUT", body: JSON.stringify({ is_available: !currentlyAvail }),
      });
      if (res.ok) fetchAll();
    } catch {}
  };

  const handleCreateItem = async () => {
    if (!fName || !fCat) { setError("Name and Category are required"); return; }
    const res = await authFetch(`${API}/menu/items`, {
      method: "POST", body: JSON.stringify({ name: fName, description: fDesc, price: fPrice, category_id: fCat, image_url: fImg || null }),
    });
    if (res.ok) { setShowAdd(false); resetForm(); fetchAll(); } else { const d = await res.json().catch(() => ({})); setError(d.detail || "Create failed"); }
  };

  const handleUpdateItem = async () => {
    if (!editItem) return;
    const res = await authFetch(`${API}/menu/items/${editItem.id}`, {
      method: "PUT", body: JSON.stringify({ name: fName, description: fDesc, price: fPrice, category_id: fCat, image_url: fImg || null }),
    });
    if (res.ok) { setEditItem(null); resetForm(); fetchAll(); } else { const d = await res.json().catch(() => ({})); setError(d.detail || "Update failed"); }
  };

  const handleDeleteItem = async (itemId: number) => {
    if (!confirm("Delete this item?")) return;
    const res = await authFetch(`${API}/menu/items/${itemId}`, { method: "DELETE" });
    if (res.ok) fetchAll(); else { const d = await res.json().catch(() => ({})); setError(d.detail || "Delete failed"); }
  };

  const handleSaveSettings = async () => {
    const res = await authFetch(`${API}/settings`, {
      method: "PUT", body: JSON.stringify({ name: sName, logo_url: sLogo || null, address: sAddr || null, phone: sPhone || null, tax_rate: sTax, currency: sCur, receipt_footer: sFoot || null }),
    });
    if (res.ok) fetchAll(); else { const d = await res.json().catch(() => ({})); setError(d.detail || "Failed to save settings"); }
  };

  const handleCreateCategory = async () => {
    if (!newCatName) return;
    const res = await authFetch(`${API}/menu/categories`, {
      method: "POST", body: JSON.stringify({ name: newCatName, station: newCatStation }),
    });
    if (res.ok) { setNewCatName(""); fetchAll(); } else { const d = await res.json().catch(() => ({})); setError(d.detail || "Create failed"); }
  };

  const handleDeleteCategory = async (id: number) => {
    if (!confirm("Delete category? Must have no items.")) return;
    const res = await authFetch(`${API}/menu/categories/${id}`, { method: "DELETE" });
    if (res.ok) fetchAll(); else { const d = await res.json().catch(() => ({})); setError(d.detail || "Delete failed"); }
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData(); fd.append("file", file);
      const res = await authFetch(`${API}/upload`, { method: "POST", body: fd });
      if (res.ok) { const d = await res.json(); setFImg(`${UPLOADS_BASE}${d.url}`); }
    } catch { setError("Upload failed"); } finally { setUploading(false); }
  };

  const openEdit = (item: MenuItem) => {
    setEditItem(item); setFName(item.name); setFDesc(item.description || ""); setFPrice(item.price); setFCat(item.category_id); setFImg(item.image_url || "");
  };
  const resetForm = () => { setFName(""); setFDesc(""); setFPrice(0); setFCat(""); setFImg(""); };

  const totalSales = orders.reduce((s, o) => o.status === "paid" ? s + o.total : s, 0);
  const pendingOrders = orders.filter(o => o.status !== "paid" && o.status !== "cancelled");
  const lowStock = items.filter(i => (i.inventory?.stock_qty ?? 0) <= 5).length;

  if (!user) return <LoginScreen onLogin={setUser} />;

  const getStatusBadgeStyle = (status: string) => {
    switch (status?.toLowerCase()) {
      case "placed":
      case "pending":
        return "bg-bg-surface-alt text-text-secondary border border-border";
      case "preparing":
        return "bg-amber-100 text-amber-800 border border-amber-200";
      case "ready":
      case "served":
      case "paid":
        return "bg-green-100 text-green-800 border border-green-200";
      default:
        return "bg-bg-surface-alt text-text-secondary border border-border";
    }
  };

  return (
    <div className="min-h-screen bg-bg-page text-text-primary font-ui flex">
      
      {/* Sidebar Navigation */}
      <aside className="w-56 bg-bg-surface border-r border-border flex flex-col justify-between select-none">
        <div>
          <div className="p-4 border-b border-border flex items-center gap-2">
            <div className="p-1.5 bg-brand-primary text-white rounded">
              <Settings size={16} />
            </div>
            <div>
              <h2 className="font-bold text-xs uppercase tracking-wider text-text-primary leading-tight">Ops Dashboard</h2>
              <span className="text-[10px] text-text-secondary font-mono">QSR Back-Office</span>
            </div>
          </div>

          <nav className="p-3 space-y-1">
            <div className="px-3 py-2 text-[10px] font-bold text-text-secondary uppercase tracking-widest">Back-Office Nav</div>
            <button 
              onClick={() => setActiveTab("menu")}
              className={`w-full text-left px-3 py-2 rounded text-xs uppercase tracking-wider font-bold transition flex items-center gap-2 ${activeTab === "menu" ? "bg-brand-primary-tint text-brand-primary border-l-2 border-brand-primary" : "text-text-secondary hover:text-text-primary hover:bg-bg-surface-alt"}`}
            >
              <Package size={14} />
              <span>Menu Config</span>
            </button>
            <button 
              onClick={() => setActiveTab("settings")}
              className={`w-full text-left px-3 py-2 rounded text-xs uppercase tracking-wider font-bold transition flex items-center gap-2 ${activeTab === "settings" ? "bg-brand-primary-tint text-brand-primary border-l-2 border-brand-primary" : "text-text-secondary hover:text-text-primary hover:bg-bg-surface-alt"}`}
            >
              <Settings size={14} />
              <span>Global Settings</span>
            </button>
          </nav>
        </div>

        <div className="p-4 border-t border-border flex items-center justify-between">
          <div>
            <span className="text-[10px] text-text-secondary block font-mono">Role: Manager</span>
            <span className="text-xs font-bold text-text-primary font-mono">{user.username}</span>
          </div>
          <button onClick={() => { clearAuth(); setUser(null); }}
            className="p-1.5 rounded border border-border hover:bg-bg-surface-alt text-text-secondary hover:text-text-primary transition">
            <LogOut size={14} />
          </button>
        </div>
      </aside>

      {/* Main Panel */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 bg-bg-surface border-b border-border px-6 flex items-center justify-between">
          <h1 className="font-bold text-sm uppercase tracking-wider text-text-primary">
            {activeTab === "menu" ? "Menu Item Catalogs" : "General Configuration"}
          </h1>
          <button onClick={fetchAll} className="p-2 border border-border hover:bg-bg-surface-alt rounded text-text-secondary transition">
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

          {/* Stat tiles */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-4 rounded border border-border bg-bg-surface">
              <span className="text-[10px] font-bold uppercase text-text-secondary tracking-wider block">Today's Sales</span>
              <span className="text-xl font-mono font-bold mt-1 block text-status-success">{sCur}{totalSales.toFixed(0)}</span>
            </div>
            <div className="p-4 rounded border border-border bg-bg-surface">
              <span className="text-[10px] font-bold uppercase text-text-secondary tracking-wider block">Orders Placed</span>
              <span className="text-xl font-mono font-bold mt-1 block text-text-primary">{orders.length}</span>
            </div>
            <div className="p-4 rounded border border-border bg-bg-surface">
              <span className="text-[10px] font-bold uppercase text-text-secondary tracking-wider block">Unpaid preparing</span>
              <span className="text-xl font-mono font-bold mt-1 block text-status-warning">{pendingOrders.length}</span>
            </div>
            <div className="p-4 rounded border border-border bg-bg-surface">
              <span className="text-[10px] font-bold uppercase text-text-secondary tracking-wider block">Low Stock Warn</span>
              <span className="text-xl font-mono font-bold mt-1 block text-status-error">{lowStock}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Left Content Column */}
            <div className="lg:col-span-2 space-y-6">
              {activeTab === "menu" && (
                <div className="p-6 rounded border border-border bg-bg-surface shadow-sm">
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="font-bold text-xs uppercase tracking-wider text-text-secondary"><Package size={16} className="inline mr-1" /> Menu Index</h3>
                    <div className="flex gap-2">
                      <button onClick={() => setShowCat(true)} className="px-3 py-1.5 border border-border rounded text-xs font-bold text-text-secondary hover:text-text-primary hover:bg-bg-surface-alt flex items-center gap-1 transition"><Layers size={12} /> Categories</button>
                      <button onClick={() => { setShowAdd(true); resetForm(); }} className="px-3 py-1.5 bg-brand-primary hover:bg-brand-primary-dark text-white rounded text-xs font-bold flex items-center gap-1 transition shadow-sm"><Plus size={12} /> Add Item</button>
                    </div>
                  </div>
                  
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs font-mono">
                      <thead>
                        <tr className="border-b border-border bg-bg-surface-alt text-text-secondary uppercase text-[10px] tracking-wider">
                          <th className="p-3 pl-2">Item</th>
                          <th className="p-3">Category</th>
                          <th className="p-3">Price</th>
                          <th className="p-3">Stock</th>
                          <th className="p-3 text-center">Status</th>
                          <th className="p-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {items.map(item => (
                          <tr key={item.id} className="hover:bg-bg-surface-alt/40 transition-colors">
                            <td className="p-3 pl-2">
                              <div className="flex items-center gap-3">
                                {item.image_url ? <img src={item.image_url} alt="" className="w-8 h-8 rounded object-cover border border-border" />
                                  : <div className="w-8 h-8 rounded bg-bg-page border border-border flex items-center justify-center text-text-tertiary"><ImageIcon size={12} /></div>}
                                <div>
                                  <span className="font-bold text-text-primary block font-sans">{item.name}</span>
                                  {item.description && <p className="text-[10px] text-text-secondary truncate max-w-[150px] font-sans">{item.description}</p>}
                                </div>
                              </div>
                            </td>
                            <td className="p-3 text-text-secondary font-sans">{item.category?.name}</td>
                            <td className="p-3 font-bold text-text-primary">{sCur}{item.price.toFixed(2)}</td>
                            <td className="p-3">
                              <div className="flex items-center gap-1 font-sans">
                                <button onClick={() => handleStock(item.id, Math.max(0, (item.inventory?.stock_qty || 0) - 5))}
                                  className="w-5 h-5 rounded bg-bg-page hover:bg-bg-surface-alt font-bold flex items-center justify-center text-[10px] border border-border">-</button>
                                <span className={`font-mono text-xs w-6 text-center ${(item.inventory?.stock_qty ?? 0) <= 5 ? "text-status-error font-bold" : "text-text-secondary"}`}>
                                  {item.inventory?.stock_qty ?? 0}
                                </span>
                                <button onClick={() => handleStock(item.id, (item.inventory?.stock_qty || 0) + 5)}
                                  className="w-5 h-5 rounded bg-bg-page hover:bg-bg-surface-alt font-bold flex items-center justify-center text-[10px] border border-border">+</button>
                              </div>
                            </td>
                            <td className="p-3 text-center font-sans">
                              <button onClick={() => handleToggleAvail(item.id, item.is_available)}
                                className={`text-[9px] font-bold px-2 py-0.5 rounded-full border transition ${item.is_available ? "bg-green-50 text-status-success border-green-100" : "bg-red-50 text-status-error border-red-100"}`}>
                                {item.is_available ? "Active" : "Disabled"}
                              </button>
                            </td>
                            <td className="p-3 text-right">
                              <div className="flex items-center justify-end gap-1 font-sans">
                                <button onClick={() => openEdit(item)} className="p-1.5 rounded hover:bg-bg-surface-alt text-text-secondary hover:text-brand-primary transition"><Edit3 size={12} /></button>
                                <button onClick={() => handleDeleteItem(item.id)} className="p-1.5 rounded hover:bg-bg-surface-alt text-text-secondary hover:text-status-error transition"><Trash2 size={12} /></button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {items.length === 0 && (
                      <div className="py-12 text-center text-text-tertiary">
                        <Package size={32} className="mx-auto mb-2 opacity-30" />
                        <p className="font-bold text-xs uppercase">No items configured</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === "settings" && (
                <div className="p-6 rounded border border-border bg-bg-surface shadow-sm">
                  <h3 className="font-bold text-xs uppercase tracking-wider text-text-secondary mb-5 flex items-center gap-2"><Settings size={16} /> Global settings</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div><label className="block text-[10px] font-bold text-text-secondary uppercase tracking-wider mb-1.5">Restaurant Name</label>
                      <input value={sName} onChange={e => setSName(e.target.value)} className="w-full p-2.5 bg-bg-page border border-border rounded focus:border-brand-primary focus:outline-none text-xs text-text-primary" /></div>
                    <div><label className="block text-[10px] font-bold text-text-secondary uppercase tracking-wider mb-1.5">Logo URL</label>
                      <input value={sLogo} onChange={e => setSLogo(e.target.value)} className="w-full p-2.5 bg-bg-page border border-border rounded focus:border-brand-primary focus:outline-none text-xs text-text-primary" /></div>
                    <div><label className="block text-[10px] font-bold text-text-secondary uppercase tracking-wider mb-1.5">Address</label>
                      <input value={sAddr} onChange={e => setSAddr(e.target.value)} className="w-full p-2.5 bg-bg-page border border-border rounded focus:border-brand-primary focus:outline-none text-xs text-text-primary" /></div>
                    <div><label className="block text-[10px] font-bold text-text-secondary uppercase tracking-wider mb-1.5">Phone</label>
                      <input value={sPhone} onChange={e => setSPhone(e.target.value)} className="w-full p-2.5 bg-bg-page border border-border rounded focus:border-brand-primary focus:outline-none text-xs text-text-primary" /></div>
                    <div><label className="block text-[10px] font-bold text-text-secondary uppercase tracking-wider mb-1.5">Tax Rate (e.g. 0.08)</label>
                      <input type="number" step="0.01" value={sTax} onChange={e => setSTax(parseFloat(e.target.value) || 0)} className="w-full p-2.5 bg-bg-page border border-border rounded focus:border-brand-primary focus:outline-none text-xs text-text-primary font-mono" /></div>
                    <div><label className="block text-[10px] font-bold text-text-secondary uppercase tracking-wider mb-1.5">Currency Symbol</label>
                      <input value={sCur} onChange={e => setSCur(e.target.value)} className="w-full p-2.5 bg-bg-page border border-border rounded focus:border-brand-primary focus:outline-none text-xs text-text-primary font-mono" /></div>
                    <div className="md:col-span-2"><label className="block text-[10px] font-bold text-text-secondary uppercase tracking-wider mb-1.5">Receipt Footer Message</label>
                      <input value={sFoot} onChange={e => setSFoot(e.target.value)} className="w-full p-2.5 bg-bg-page border border-border rounded focus:border-brand-primary focus:outline-none text-xs text-text-primary" /></div>
                  </div>
                  <div className="mt-6 flex justify-end">
                    <button onClick={handleSaveSettings} className="px-5 py-2.5 bg-brand-primary hover:bg-brand-primary-dark text-white font-bold rounded text-xs font-mono uppercase tracking-wider flex items-center gap-1.5 transition shadow-sm"><Save size={14} /> Save settings</button>
                  </div>
                </div>
              )}
            </div>

            {/* Right Side Order Log */}
            <div className="space-y-6">
              <div className="p-5 rounded border border-border bg-bg-surface shadow-sm">
                <h3 className="font-bold text-[10px] uppercase tracking-wider text-text-secondary mb-4 flex items-center gap-2"><Clock size={12} /> Recent order logs</h3>
                <div className="space-y-2.5 max-h-[450px] overflow-y-auto scrollbar-thin pr-1 font-mono text-[11px]">
                  {orders.slice(0, 10).map(o => (
                    <div key={o.id} className="p-3 border border-border bg-bg-page rounded flex justify-between items-center">
                      <div>
                        <span className="font-bold text-text-primary block">Order #{o.id}</span>
                        <span className="text-text-secondary block mt-0.5">{o.table_label} &bull; {o.items.length} items &bull; {sCur}{o.total.toFixed(2)}</span>
                      </div>
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded uppercase ${getStatusBadgeStyle(o.status)}`}>{o.status}</span>
                    </div>
                  ))}
                  {orders.length === 0 && (
                    <div className="py-8 text-center text-text-tertiary">
                      <ShoppingBag size={24} className="mx-auto mb-2 opacity-30" />
                      <p className="text-[10px] uppercase">No logs recorded</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

          </div>
        </main>
      </div>

      {/* ─── Edit Modal ─── */}
      {editItem && (
        <Modal title="Edit Menu Item" icon={<Edit3 size={16} className="text-brand-primary" />} onClose={() => setEditItem(null)}>
          <div className="space-y-4">
            <div><label className="block text-[10px] font-bold text-text-secondary uppercase tracking-wider mb-1.5">Name</label>
              <input value={fName} onChange={e => setFName(e.target.value)} className="w-full p-2.5 bg-bg-page border border-border rounded focus:border-brand-primary focus:outline-none text-xs text-text-primary" /></div>
            <div><label className="block text-[10px] font-bold text-text-secondary uppercase tracking-wider mb-1.5">Description</label>
              <textarea value={fDesc} onChange={e => setFDesc(e.target.value)} rows={2} className="w-full p-2.5 bg-bg-page border border-border rounded focus:border-brand-primary focus:outline-none text-xs text-text-primary resize-none" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-[10px] font-bold text-text-secondary uppercase tracking-wider mb-1.5">Price</label>
                <input type="number" step="0.01" value={fPrice} onChange={e => setFPrice(parseFloat(e.target.value) || 0)} className="w-full p-2.5 bg-bg-page border border-border rounded focus:border-brand-primary focus:outline-none text-xs text-text-primary font-mono" /></div>
              <div><label className="block text-[10px] font-bold text-text-secondary uppercase tracking-wider mb-1.5">Category</label>
                <select value={fCat} onChange={e => setFCat(parseInt(e.target.value))} className="w-full p-2.5 bg-bg-page border border-border rounded focus:border-brand-primary focus:outline-none text-xs text-text-primary">
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select></div>
            </div>
            <div><label className="block text-[10px] font-bold text-text-secondary uppercase tracking-wider mb-1.5">Image</label>
              <div className="flex gap-3 items-start">
                {fImg ? <img src={fImg} alt="" className="w-12 h-12 rounded object-cover border border-border" />
                  : <div className="w-12 h-12 rounded bg-bg-page border border-dashed border-border flex items-center justify-center text-text-tertiary"><ImageIcon size={14} /></div>}
                <div className="flex-1 space-y-2">
                  <input value={fImg} onChange={e => setFImg(e.target.value)} placeholder="Image URL or upload..."
                    className="w-full p-2 bg-bg-page border border-border rounded focus:border-brand-primary focus:outline-none text-[11px] text-text-primary" />
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-bg-page hover:bg-bg-surface-alt border border-border rounded cursor-pointer text-[10px] text-text-secondary transition font-bold uppercase">
                    <Upload size={12} /><span>{uploading ? "Uploading..." : "Upload File"}</span>
                    <input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0])} />
                  </label>
                </div>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border">
            <button onClick={() => setEditItem(null)} className="px-4 py-2 border border-border rounded text-xs font-bold text-text-secondary hover:text-text-primary transition font-mono uppercase">Cancel</button>
            <button onClick={handleUpdateItem} className="px-4 py-2 bg-brand-primary hover:bg-brand-primary-dark text-white rounded text-xs font-bold transition font-mono uppercase">Save</button>
          </div>
        </Modal>
      )}

      {/* ─── Add Modal ─── */}
      {showAdd && (
        <Modal title="New Menu Item" icon={<Plus size={16} className="text-brand-primary" />} onClose={() => setShowAdd(false)}>
          <div className="space-y-4">
            <div><label className="block text-[10px] font-bold text-text-secondary uppercase tracking-wider mb-1.5">Name *</label>
              <input value={fName} onChange={e => setFName(e.target.value)} className="w-full p-2.5 bg-bg-page border border-border rounded focus:border-brand-primary focus:outline-none text-xs text-text-primary" /></div>
            <div><label className="block text-[10px] font-bold text-text-secondary uppercase tracking-wider mb-1.5">Description</label>
              <textarea value={fDesc} onChange={e => setFDesc(e.target.value)} rows={2} className="w-full p-2.5 bg-bg-page border border-border rounded focus:border-brand-primary focus:outline-none text-xs text-text-primary resize-none" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-[10px] font-bold text-text-secondary uppercase tracking-wider mb-1.5">Price *</label>
                <input type="number" step="0.01" value={fPrice || ""} onChange={e => setFPrice(parseFloat(e.target.value) || 0)} className="w-full p-2.5 bg-bg-page border border-border rounded focus:border-brand-primary focus:outline-none text-xs text-text-primary font-mono" /></div>
              <div><label className="block text-[10px] font-bold text-text-secondary uppercase tracking-wider mb-1.5">Category *</label>
                <select value={fCat} onChange={e => setFCat(parseInt(e.target.value))} className="w-full p-2.5 bg-bg-page border border-border rounded focus:border-brand-primary focus:outline-none text-xs text-text-primary">
                  <option value="">Select...</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select></div>
            </div>
            <div><label className="block text-[10px] font-bold text-text-secondary uppercase tracking-wider mb-1.5">Image</label>
              <div className="flex gap-3 items-start">
                {fImg ? <img src={fImg} alt="" className="w-12 h-12 rounded object-cover border border-border" />
                  : <div className="w-12 h-12 rounded bg-bg-page border border-dashed border-border flex items-center justify-center text-text-tertiary"><ImageIcon size={14} /></div>}
                <div className="flex-1 space-y-2">
                  <input value={fImg} onChange={e => setFImg(e.target.value)} placeholder="Image URL or upload..."
                    className="w-full p-2 bg-bg-page border border-border rounded focus:border-brand-primary focus:outline-none text-[11px] text-text-primary" />
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-bg-page hover:bg-bg-surface-alt border border-border rounded cursor-pointer text-[10px] text-text-secondary transition font-bold uppercase">
                    <Upload size={12} /><span>{uploading ? "Uploading..." : "Upload File"}</span>
                    <input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0])} />
                  </label>
                </div>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border">
            <button onClick={() => setShowAdd(false)} className="px-4 py-2 border border-border rounded text-xs font-bold text-text-secondary hover:text-text-primary transition font-mono uppercase">Cancel</button>
            <button onClick={handleCreateItem} className="px-4 py-2 bg-brand-primary hover:bg-brand-primary-dark text-white rounded text-xs font-bold transition font-mono uppercase">Create</button>
          </div>
        </Modal>
      )}

      {/* ─── Category Modal ─── */}
      {showCat && (
        <Modal title="Categories" icon={<Layers size={16} className="text-brand-primary" />} onClose={() => setShowCat(false)}>
          <div className="flex gap-2 mb-5">
            <input value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="Category name"
              className="flex-1 p-2 bg-bg-page border border-border rounded focus:border-brand-primary focus:outline-none text-xs text-text-primary" />
            <select value={newCatStation} onChange={e => setNewCatStation(e.target.value)}
              className="p-2 bg-bg-page border border-border rounded focus:border-brand-primary focus:outline-none text-xs text-text-primary font-mono">
              <option value="kitchen">Kitchen</option>
              <option value="tandoor">Tandoor</option>
              <option value="bar">Bar</option>
            </select>
            <button onClick={handleCreateCategory} className="px-4 py-2 bg-brand-primary hover:bg-brand-primary-dark text-white rounded text-xs font-bold transition font-mono uppercase">Add</button>
          </div>
          <div className="space-y-2 max-h-[300px] overflow-y-auto scrollbar-thin">
            {categories.map(cat => (
              <div key={cat.id} className="flex items-center justify-between p-3 bg-bg-page rounded border border-border hover:border-border/70 transition">
                <div><span className="font-bold text-xs text-text-primary">{cat.name}</span><span className="ml-2 text-[9px] uppercase font-mono font-bold text-text-secondary">({cat.station})</span></div>
                <button onClick={() => handleDeleteCategory(cat.id)} className="p-1.5 rounded hover:bg-bg-surface-alt text-text-secondary hover:text-status-error transition"><Trash2 size={12} /></button>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
