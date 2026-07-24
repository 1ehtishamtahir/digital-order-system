"use client";

import React, { useState, useEffect } from "react";
import {
  Settings, Package, Save, Plus, Edit3, X, Image as ImageIcon,
  TrendingUp, Trash2, LogOut, RefreshCw, Upload, Layers, ChefHat, CheckCircle2
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────
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

const STATUS_COLORS: Record<string, string> = {
  placed: "bg-[#4C9BD1]/20 text-[#4C9BD1]", preparing: "bg-[#D1A63C]/20 text-[#D1A63C]",
  ready: "bg-[#4CAF6D]/20 text-[#4CAF6D]", paid: "bg-indigo-500/20 text-indigo-400",
};

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
    <div className="min-h-screen bg-[#15171B] flex items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-[#1F2229] rounded-2xl border border-[#282C34] p-8 shadow-2xl space-y-6">
        <div className="text-center">
          <div className="w-14 h-14 mx-auto bg-gradient-to-tr from-[#C98A2E] to-rose-500 rounded-2xl flex items-center justify-center shadow-lg mb-4">
            <Settings size={26} className="text-white" />
          </div>
          <h1 className="text-xl font-bold text-[#EDEAE3]">Admin Panel</h1>
          <p className="text-sm text-[#8B8F98] mt-1">Admin login required</p>
        </div>
        {err && <div className="p-3 bg-[#D1495B]/10 border border-[#D1495B]/30 rounded-xl text-[#D1495B] text-xs font-semibold text-center">{err}</div>}
        <div className="space-y-4">
          <input type="text" placeholder="Username" value={u} onChange={e => setU(e.target.value)}
            className="w-full p-3 bg-[#15171B] border border-[#282C34] rounded-xl focus:border-[#C98A2E] focus:outline-none text-[#EDEAE3] text-sm" required />
          <input type="password" placeholder="Password" value={p} onChange={e => setP(e.target.value)}
            className="w-full p-3 bg-[#15171B] border border-[#282C34] rounded-xl focus:border-[#C98A2E] focus:outline-none text-[#EDEAE3] text-sm" required />
        </div>
        <button type="submit" disabled={load} className="w-full py-3 bg-[#C98A2E] hover:bg-[#C98A2E]/90 text-white font-bold rounded-xl text-sm transition disabled:opacity-50">
          {load ? "Signing in..." : "Sign In"}
        </button>
      </form>
    </div>
  );
}

export default function AdminPage() {
  const [user, setUser] = useState<StaffUser | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState("");

  // Settings
  const [sName, setSName] = useState(""); const [sLogo, setSLogo] = useState(""); const [sAddr, setSAddr] = useState("");
  const [sPhone, setSPhone] = useState(""); const [sTax, setSTax] = useState(0); const [sCur, setSCur] = useState("$"); const [sFoot, setSFoot] = useState("");

  // Modals
  const [editItem, setEditItem] = useState<MenuItem | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showCat, setShowCat] = useState(false);
  const [newCatName, setNewCatName] = useState(""); const [newCatStation, setNewCatStation] = useState("kitchen");
  const [fName, setFName] = useState(""); const [fDesc, setFDesc] = useState(""); const [fPrice, setFPrice] = useState(0);
  const [fCat, setFCat] = useState<number | "">(""); const [fImg, setFImg] = useState(""); const [uploading, setUploading] = useState(false);

  useEffect(() => { const u = getUser(); if (u) setUser(u); }, []);
  useEffect(() => { if (!user) return; fetchAll(); }, [user]);

  const fetchAll = async () => {
    try {
      const [oRes, iRes, cRes, sRes] = await Promise.all([
        fetch(`${API}/orders`), fetch(`${API}/menu/items`), fetch(`${API}/menu/categories`), fetch(`${API}/settings`),
      ]);
      if (oRes.ok) {
        const d = await oRes.json();
        setOrders(d.map((o: any) => ({
          id: o.id, table_label: o.table?.label || "Takeaway", total: o.total, status: o.status,
          items: o.items.map((i: any) => ({ id: i.id, name: i.menu_item.name, qty: i.qty, station: i.menu_item.category?.station || "", status: i.item_status })),
        })));
      }
      if (iRes.ok) setItems(await iRes.json());
      if (cRes.ok) setCategories(await cRes.json());
      if (sRes.ok) {
        const d = await sRes.json();
        setSName(d.name); setSLogo(d.logo_url || ""); setSAddr(d.address || ""); setSPhone(d.phone || "");
        setSTax(d.tax_rate); setSCur(d.currency); setSFoot(d.receipt_footer || "");
      }
    } catch { /* ignore */ }
  };

  // CRUD
  const handleUpdateItem = async () => {
    if (!editItem) return;
    try {
      const body: Record<string, any> = {};
      if (fName) body.name = fName; if (fDesc !== undefined) body.description = fDesc;
      if (fPrice > 0) body.price = fPrice; if (fCat !== "") body.category_id = fCat;
      if (fImg) body.image_url = fImg;
      const res = await authFetch(`${API}/menu/items/${editItem.id}`, { method: "PUT", body: JSON.stringify(body) });
      if (res.ok) { setEditItem(null); resetForm(); fetchAll(); }
      else { const d = await res.json().catch(() => ({})); setError(d.detail || "Update failed"); }
    } catch { setError("Network error"); }
  };

  const handleCreateItem = async () => {
    try {
      const res = await authFetch(`${API}/menu/items`, {
        method: "POST", body: JSON.stringify({ name: fName, description: fDesc || null, price: fPrice, category_id: fCat || 1, image_url: fImg || null }),
      });
      if (res.ok) { setShowAdd(false); resetForm(); fetchAll(); }
      else { const d = await res.json().catch(() => ({})); setError(d.detail || "Create failed"); }
    } catch { setError("Network error"); }
  };

  const handleDeleteItem = async (id: number) => {
    if (!confirm("Delete this item?")) return;
    const res = await authFetch(`${API}/menu/items/${id}`, { method: "DELETE" });
    if (res.ok) fetchAll(); else setError("Delete failed");
  };

  const handleToggleAvail = async (id: number, cur: boolean) => {
    await authFetch(`${API}/menu/items/${id}/availability?is_available=${!cur}`, { method: "PUT" });
    fetchAll();
  };

  const handleStock = async (id: number, qty: number) => {
    await authFetch(`${API}/menu/items/${id}/stock?stock_qty=${qty}`, { method: "PUT" });
    fetchAll();
  };

  const handleSaveSettings = async () => {
    const res = await authFetch(`${API}/settings`, {
      method: "PUT", body: JSON.stringify({ name: sName, logo_url: sLogo || null, address: sAddr || null, phone: sPhone || null, tax_rate: sTax, currency: sCur, receipt_footer: sFoot || null }),
    });
    if (res.ok) fetchAll(); else setError("Save failed");
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

  if (!user) return <LoginScreen onLogin={setUser} />;

  const overlay = <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => { setEditItem(null); setShowAdd(false); setShowCat(false); }} />
  </div>;

  return (
    <div className="min-h-screen bg-[#15171B] text-[#EDEAE3]">
      <header className="sticky top-0 z-40 backdrop-blur-md bg-[#15171B]/80 border-b border-[#282C34]">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-tr from-[#C98A2E] to-rose-500 rounded-xl text-white shadow-lg"><Settings size={22} /></div>
            <div>
              <h1 className="font-extrabold text-lg tracking-tight">Admin Panel</h1>
              <span className="text-xs font-bold text-[#C98A2E]">{user.username}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={fetchAll} className="p-2 rounded-lg border border-[#282C34] hover:bg-[#1F2229] text-[#8B8F98] transition"><RefreshCw size={16} /></button>
            <button onClick={() => { clearAuth(); setUser(null); }} className="p-2 rounded-lg border border-[#282C34] hover:bg-[#1F2229] text-[#8B8F98] transition"><LogOut size={16} /></button>
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

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

          {/* ─── Left: Menu + Settings ─── */}
          <div className="xl:col-span-2 space-y-6">

            {/* Menu Items */}
            <div className="p-6 rounded-2xl border border-[#282C34] bg-[#1F2229]/40">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-extrabold text-lg flex items-center gap-2"><Package size={20} className="text-[#C98A2E]" /> Menu Items</h3>
                <div className="flex gap-2">
                  <button onClick={() => setShowCat(true)} className="px-3 py-2 border border-[#282C34] rounded-xl text-xs font-bold text-[#8B8F98] hover:text-[#EDEAE3] flex items-center gap-1"><Layers size={14} /> Categories</button>
                  <button onClick={() => { setShowAdd(true); resetForm(); }} className="px-3 py-2 bg-[#C98A2E] text-white rounded-xl text-xs font-bold hover:bg-[#C98A2E]/90 flex items-center gap-1"><Plus size={14} /> Add Item</button>
                </div>
              </div>
              <div className="overflow-x-auto scrollbar-thin">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#282C34] text-xs font-semibold text-[#8B8F98] uppercase tracking-wider">
                      <th className="pb-3 pl-2">Item</th><th className="pb-3">Category</th><th className="pb-3">Price</th>
                      <th className="pb-3">Stock</th><th className="pb-3 text-center">Status</th><th className="pb-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#282C34]">
                    {items.map(item => (
                      <tr key={item.id} className="text-sm hover:bg-[#282C34]/30 transition">
                        <td className="py-3 pl-2">
                          <div className="flex items-center gap-3">
                            {item.image_url ? <img src={item.image_url} alt="" className="w-10 h-10 rounded-lg object-cover border border-[#282C34]" />
                              : <div className="w-10 h-10 rounded-lg bg-[#282C34] flex items-center justify-center text-[#8B8F98]"><ImageIcon size={16} /></div>}
                            <div><span className="font-semibold">{item.name}</span>{item.description && <p className="text-xs text-[#8B8F98] truncate max-w-[200px]">{item.description}</p>}</div>
                          </div>
                        </td>
                        <td className="py-3 text-xs text-[#8B8F98]">{item.category?.name}</td>
                        <td className="py-3 font-bold text-[#C98A2E]">{sCur}{item.price.toFixed(2)}</td>
                        <td className="py-3">
                          <div className="flex items-center gap-1.5">
                            <button onClick={() => handleStock(item.id, Math.max(0, (item.inventory?.stock_qty || 0) - 5))}
                              className="w-5 h-5 rounded bg-[#282C34] hover:bg-[#282C34]/70 font-bold flex items-center justify-center text-[10px]">-</button>
                            <span className="font-mono text-xs w-7 text-center">{item.inventory?.stock_qty ?? 0}</span>
                            <button onClick={() => handleStock(item.id, (item.inventory?.stock_qty || 0) + 5)}
                              className="w-5 h-5 rounded bg-[#282C34] hover:bg-[#282C34]/70 font-bold flex items-center justify-center text-[10px]">+</button>
                          </div>
                        </td>
                        <td className="py-3 text-center">
                          <button onClick={() => handleToggleAvail(item.id, item.is_available)}
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${item.is_available ? "bg-[#4CAF6D]/10 border-[#4CAF6D]/20 text-[#4CAF6D]" : "bg-[#D1495B]/10 border-[#D1495B]/20 text-[#D1495B]"}`}>
                            {item.is_available ? "Active" : "Disabled"}
                          </button>
                        </td>
                        <td className="py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => openEdit(item)} className="p-1.5 rounded hover:bg-[#282C34] text-[#8B8F98] hover:text-[#C98A2E]"><Edit3 size={14} /></button>
                            <button onClick={() => handleDeleteItem(item.id)} className="p-1.5 rounded hover:bg-[#282C34] text-[#8B8F98] hover:text-[#D1495B]"><Trash2 size={14} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Settings */}
            <div className="p-6 rounded-2xl border border-[#282C34] bg-[#1F2229]/40">
              <h3 className="font-extrabold text-lg mb-4 flex items-center gap-2"><Settings size={20} className="text-[#C98A2E]" /> Restaurant Settings</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label className="block text-xs font-bold text-[#8B8F98] uppercase mb-1.5">Name</label>
                  <input value={sName} onChange={e => setSName(e.target.value)} className="w-full p-3 bg-[#15171B] border border-[#282C34] rounded-xl focus:border-[#C98A2E] focus:outline-none text-sm" /></div>
                <div><label className="block text-xs font-bold text-[#8B8F98] uppercase mb-1.5">Logo URL</label>
                  <input value={sLogo} onChange={e => setSLogo(e.target.value)} className="w-full p-3 bg-[#15171B] border border-[#282C34] rounded-xl focus:border-[#C98A2E] focus:outline-none text-sm" /></div>
                <div><label className="block text-xs font-bold text-[#8B8F98] uppercase mb-1.5">Address</label>
                  <input value={sAddr} onChange={e => setSAddr(e.target.value)} className="w-full p-3 bg-[#15171B] border border-[#282C34] rounded-xl focus:border-[#C98A2E] focus:outline-none text-sm" /></div>
                <div><label className="block text-xs font-bold text-[#8B8F98] uppercase mb-1.5">Phone</label>
                  <input value={sPhone} onChange={e => setSPhone(e.target.value)} className="w-full p-3 bg-[#15171B] border border-[#282C34] rounded-xl focus:border-[#C98A2E] focus:outline-none text-sm" /></div>
                <div><label className="block text-xs font-bold text-[#8B8F98] uppercase mb-1.5">Tax Rate</label>
                  <input type="number" step="0.01" value={sTax} onChange={e => setSTax(parseFloat(e.target.value) || 0)} className="w-full p-3 bg-[#15171B] border border-[#282C34] rounded-xl focus:border-[#C98A2E] focus:outline-none text-sm" /></div>
                <div><label className="block text-xs font-bold text-[#8B8F98] uppercase mb-1.5">Currency</label>
                  <input value={sCur} onChange={e => setSCur(e.target.value)} className="w-full p-3 bg-[#15171B] border border-[#282C34] rounded-xl focus:border-[#C98A2E] focus:outline-none text-sm" /></div>
                <div className="md:col-span-2"><label className="block text-xs font-bold text-[#8B8F98] uppercase mb-1.5">Receipt Footer</label>
                  <input value={sFoot} onChange={e => setSFoot(e.target.value)} className="w-full p-3 bg-[#15171B] border border-[#282C34] rounded-xl focus:border-[#C98A2E] focus:outline-none text-sm" /></div>
              </div>
              <div className="mt-6 flex justify-end">
                <button onClick={handleSaveSettings} className="px-5 py-3 bg-[#C98A2E] hover:bg-[#C98A2E]/90 text-white font-bold rounded-xl text-sm flex items-center gap-2 shadow-lg"><Save size={16} /> Save Settings</button>
              </div>
            </div>
          </div>

          {/* ─── Right: Stats + Log ─── */}
          <div className="space-y-6">
            <div className="p-6 rounded-2xl border border-[#282C34] bg-[#1F2229]/40">
              <h3 className="font-extrabold text-lg mb-4 flex items-center gap-2"><TrendingUp size={20} className="text-[#C98A2E]" /> Analytics</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-[#282C34] bg-[#15171B]/40">
                  <span className="text-[#8B8F98] text-xs font-semibold uppercase">Orders</span>
                  <span className="text-3xl font-black mt-1 block">{orders.length}</span>
                </div>
                <div className="p-4 rounded-xl border border-[#282C34] bg-[#15171B]/40">
                  <span className="text-[#8B8F98] text-xs font-semibold uppercase">Sales</span>
                  <span className="text-3xl font-black mt-1 block text-[#C98A2E]">{sCur}{totalSales.toFixed(0)}</span>
                </div>
                <div className="p-4 rounded-xl border border-[#282C34] bg-[#15171B]/40">
                  <span className="text-[#8B8F98] text-xs font-semibold uppercase">Pending</span>
                  <span className="text-3xl font-black mt-1 block text-[#4C9BD1]">{pendingOrders.length}</span>
                </div>
                <div className="p-4 rounded-xl border border-[#282C34] bg-[#15171B]/40">
                  <span className="text-[#8B8F98] text-xs font-semibold uppercase">Items</span>
                  <span className="text-3xl font-black mt-1 block text-[#D1495B]">{items.length}</span>
                </div>
              </div>
            </div>
            <div className="p-6 rounded-2xl border border-[#282C34] bg-[#1F2229]/40">
              <h3 className="font-extrabold text-sm uppercase tracking-wider text-[#8B8F98] mb-4">Recent Orders</h3>
              <div className="space-y-3 max-h-[300px] overflow-y-auto scrollbar-thin pr-2">
                {orders.slice(0, 10).map(o => (
                  <div key={o.id} className="p-3 border border-[#282C34] rounded-xl flex justify-between items-center text-xs">
                    <div><span className="font-bold">Order #{o.id}</span><span className="text-[#8B8F98] block mt-0.5">{o.table_label} &bull; {o.items.length} items</span></div>
                    <span className={`px-2 py-0.5 rounded font-bold uppercase ${STATUS_COLORS[o.status] || ""}`}>{o.status}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* ─── Edit Modal ─── */}
      {editItem && <>
        {overlay}
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
          <div className="relative w-full max-w-lg bg-[#1F2229] rounded-2xl border border-[#282C34] p-6 shadow-2xl pointer-events-auto">
            <div className="flex justify-between items-center mb-5">
              <h3 className="font-extrabold text-lg flex items-center gap-2"><Edit3 size={18} className="text-[#C98A2E]" /> Edit Item</h3>
              <button onClick={() => setEditItem(null)} className="p-1 rounded hover:bg-[#282C34] text-[#8B8F98]"><X size={18} /></button>
            </div>
            <div className="space-y-4">
              <div><label className="block text-xs font-bold text-[#8B8F98] uppercase mb-1.5">Name</label>
                <input value={fName} onChange={e => setFName(e.target.value)} className="w-full p-3 bg-[#15171B] border border-[#282C34] rounded-xl focus:border-[#C98A2E] focus:outline-none text-sm" /></div>
              <div><label className="block text-xs font-bold text-[#8B8F98] uppercase mb-1.5">Description</label>
                <textarea value={fDesc} onChange={e => setFDesc(e.target.value)} rows={2} className="w-full p-3 bg-[#15171B] border border-[#282C34] rounded-xl focus:border-[#C98A2E] focus:outline-none text-sm resize-none" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs font-bold text-[#8B8F98] uppercase mb-1.5">Price</label>
                  <input type="number" step="0.01" value={fPrice} onChange={e => setFPrice(parseFloat(e.target.value) || 0)} className="w-full p-3 bg-[#15171B] border border-[#282C34] rounded-xl focus:border-[#C98A2E] focus:outline-none text-sm" /></div>
                <div><label className="block text-xs font-bold text-[#8B8F98] uppercase mb-1.5">Category</label>
                  <select value={fCat} onChange={e => setFCat(parseInt(e.target.value))} className="w-full p-3 bg-[#15171B] border border-[#282C34] rounded-xl focus:border-[#C98A2E] focus:outline-none text-sm">
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select></div>
              </div>
              <div><label className="block text-xs font-bold text-[#8B8F98] uppercase mb-1.5">Image</label>
                <div className="flex gap-3 items-start">
                  {fImg ? <img src={fImg} alt="" className="w-16 h-16 rounded-xl object-cover border border-[#282C34]" />
                    : <div className="w-16 h-16 rounded-xl bg-[#15171B] border border-dashed border-[#282C34] flex items-center justify-center text-[#8B8F98]"><ImageIcon size={20} /></div>}
                  <div className="flex-1 space-y-2">
                    <input value={fImg} onChange={e => setFImg(e.target.value)} placeholder="Image URL or upload..."
                      className="w-full p-2.5 bg-[#15171B] border border-[#282C34] rounded-xl focus:border-[#C98A2E] focus:outline-none text-xs" />
                    <label className="flex items-center gap-2 px-3 py-2 bg-[#282C34] hover:bg-[#282C34]/70 rounded-xl cursor-pointer text-xs text-[#8B8F98]">
                      <Upload size={14} />{uploading ? "Uploading..." : "Upload file"}
                      <input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0])} />
                    </label>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-[#282C34]">
              <button onClick={() => setEditItem(null)} className="px-4 py-2 border border-[#282C34] rounded-xl text-xs font-bold text-[#8B8F98] hover:text-[#EDEAE3]">Cancel</button>
              <button onClick={handleUpdateItem} className="px-5 py-2 bg-[#C98A2E] hover:bg-[#C98A2E]/90 text-white rounded-xl text-xs font-bold flex items-center gap-1.5"><Save size={14} /> Save</button>
            </div>
          </div>
        </div>
      </>}

      {/* ─── Add Modal ─── */}
      {showAdd && <>
        {overlay}
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
          <div className="relative w-full max-w-lg bg-[#1F2229] rounded-2xl border border-[#282C34] p-6 shadow-2xl pointer-events-auto">
            <div className="flex justify-between items-center mb-5">
              <h3 className="font-extrabold text-lg flex items-center gap-2"><Plus size={18} className="text-[#C98A2E]" /> New Menu Item</h3>
              <button onClick={() => setShowAdd(false)} className="p-1 rounded hover:bg-[#282C34] text-[#8B8F98]"><X size={18} /></button>
            </div>
            <div className="space-y-4">
              <div><label className="block text-xs font-bold text-[#8B8F98] uppercase mb-1.5">Name *</label>
                <input value={fName} onChange={e => setFName(e.target.value)} className="w-full p-3 bg-[#15171B] border border-[#282C34] rounded-xl focus:border-[#C98A2E] focus:outline-none text-sm" /></div>
              <div><label className="block text-xs font-bold text-[#8B8F98] uppercase mb-1.5">Description</label>
                <textarea value={fDesc} onChange={e => setFDesc(e.target.value)} rows={2} className="w-full p-3 bg-[#15171B] border border-[#282C34] rounded-xl focus:border-[#C98A2E] focus:outline-none text-sm resize-none" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs font-bold text-[#8B8F98] uppercase mb-1.5">Price *</label>
                  <input type="number" step="0.01" value={fPrice || ""} onChange={e => setFPrice(parseFloat(e.target.value) || 0)} className="w-full p-3 bg-[#15171B] border border-[#282C34] rounded-xl focus:border-[#C98A2E] focus:outline-none text-sm" /></div>
                <div><label className="block text-xs font-bold text-[#8B8F98] uppercase mb-1.5">Category *</label>
                  <select value={fCat} onChange={e => setFCat(parseInt(e.target.value))} className="w-full p-3 bg-[#15171B] border border-[#282C34] rounded-xl focus:border-[#C98A2E] focus:outline-none text-sm">
                    <option value="">Select...</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select></div>
              </div>
              <div><label className="block text-xs font-bold text-[#8B8F98] uppercase mb-1.5">Image</label>
                <div className="flex gap-3 items-start">
                  {fImg ? <img src={fImg} alt="" className="w-16 h-16 rounded-xl object-cover border border-[#282C34]" />
                    : <div className="w-16 h-16 rounded-xl bg-[#15171B] border border-dashed border-[#282C34] flex items-center justify-center text-[#8B8F98]"><ImageIcon size={20} /></div>}
                  <div className="flex-1 space-y-2">
                    <input value={fImg} onChange={e => setFImg(e.target.value)} placeholder="Image URL or upload..."
                      className="w-full p-2.5 bg-[#15171B] border border-[#282C34] rounded-xl focus:border-[#C98A2E] focus:outline-none text-xs" />
                    <label className="flex items-center gap-2 px-3 py-2 bg-[#282C34] hover:bg-[#282C34]/70 rounded-xl cursor-pointer text-xs text-[#8B8F98]">
                      <Upload size={14} />{uploading ? "Uploading..." : "Upload file"}
                      <input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0])} />
                    </label>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-[#282C34]">
              <button onClick={() => setShowAdd(false)} className="px-4 py-2 border border-[#282C34] rounded-xl text-xs font-bold text-[#8B8F98] hover:text-[#EDEAE3]">Cancel</button>
              <button onClick={handleCreateItem} className="px-5 py-2 bg-[#C98A2E] hover:bg-[#C98A2E]/90 text-white rounded-xl text-xs font-bold flex items-center gap-1.5"><Plus size={14} /> Create</button>
            </div>
          </div>
        </div>
      </>}

      {/* ─── Category Modal ─── */}
      {showCat && <>
        {overlay}
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
          <div className="relative w-full max-w-md bg-[#1F2229] rounded-2xl border border-[#282C34] p-6 shadow-2xl pointer-events-auto">
            <div className="flex justify-between items-center mb-5">
              <h3 className="font-extrabold text-lg flex items-center gap-2"><Layers size={18} className="text-[#C98A2E]" /> Categories</h3>
              <button onClick={() => setShowCat(false)} className="p-1 rounded hover:bg-[#282C34] text-[#8B8F98]"><X size={18} /></button>
            </div>
            <div className="flex gap-2 mb-5">
              <input value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="Category name"
                className="flex-1 p-2.5 bg-[#15171B] border border-[#282C34] rounded-xl focus:border-[#C98A2E] focus:outline-none text-sm" />
              <select value={newCatStation} onChange={e => setNewCatStation(e.target.value)}
                className="p-2.5 bg-[#15171B] border border-[#282C34] rounded-xl focus:border-[#C98A2E] focus:outline-none text-sm">
                <option value="kitchen">Kitchen</option><option value="tandoor">Naan</option><option value="bar">Bar</option>
              </select>
              <button onClick={handleCreateCategory} className="px-3 py-2 bg-[#C98A2E] hover:bg-[#C98A2E]/90 text-white rounded-xl text-xs font-bold flex items-center gap-1"><Plus size={14} /> Add</button>
            </div>
            <div className="space-y-2 max-h-[300px] overflow-y-auto scrollbar-thin">
              {categories.map(cat => (
                <div key={cat.id} className="flex items-center justify-between p-3 bg-[#15171B] rounded-xl border border-[#282C34]">
                  <div><span className="font-semibold text-sm">{cat.name}</span><span className="ml-2 text-[10px] uppercase text-[#8B8F98]">({cat.station})</span></div>
                  <button onClick={() => handleDeleteCategory(cat.id)} className="p-1.5 rounded hover:bg-[#282C34] text-[#8B8F98] hover:text-[#D1495B]"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </>}
    </div>
  );
}
