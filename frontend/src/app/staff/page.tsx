"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  ChefHat, Beer, Flame, DollarSign, Settings, Lock,
  Sun, RefreshCw, Layers, CheckCircle2, Play,
  Trash2, Save, Plus, Edit3, X, Image as ImageIcon,
  TrendingUp, ShoppingBag, Utensils, Globe, Phone, MapPin,
  Package, AlertTriangle, LogOut, Upload
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────
interface MenuItem {
  id: number;
  category_id: number;
  name: string;
  description?: string | null;
  price: number;
  is_available: boolean;
  image_url?: string | null;
  category?: { id: number; name: string; station: string };
  inventory?: { stock_qty: number; low_stock_threshold: number };
}

interface Category {
  id: number;
  name: string;
  station: string;
}

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

interface BusinessSettings {
  name: string;
  logo_url: string | null;
  address: string | null;
  phone: string | null;
  tax_rate: number;
  currency: string;
  receipt_footer: string | null;
}

interface StaffUser {
  username: string;
  role: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const API = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1";
const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || "ws://127.0.0.1:8000/ws";
const UPLOADS_BASE = process.env.NEXT_PUBLIC_UPLOADS_URL || "http://127.0.0.1:8000";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("staff_token");
}

function getUser(): StaffUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("staff_user");
  return raw ? JSON.parse(raw) : null;
}

function saveAuth(token: string, user: StaffUser) {
  localStorage.setItem("staff_token", token);
  localStorage.setItem("staff_user", JSON.stringify(user));
}

function clearAuth() {
  localStorage.removeItem("staff_token");
  localStorage.removeItem("staff_user");
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

const API_STATIONS = ["kitchen", "tandoor", "bar"] as const;
type Station = typeof API_STATIONS[number];

const STATUS_COLORS: Record<string, string> = {
  placed: "bg-[#4C9BD1]/20 text-[#4C9BD1] border border-[#4C9BD1]/30",
  preparing: "bg-[#D1A63C]/20 text-[#D1A63C] border border-[#D1A63C]/30",
  ready: "bg-[#4CAF6D]/20 text-[#4CAF6D] border border-[#4CAF6D]/30",
  served: "bg-teal-500/20 text-teal-400 border border-teal-500/30",
  paid: "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30",
};

const ITEM_STATUS_COLORS: Record<string, string> = {
  pending: "bg-gray-500/10 text-gray-400",
  preparing: "bg-[#D1A63C]/10 text-[#D1A63C] animate-pulse",
  ready: "bg-[#4CAF6D]/10 text-[#4CAF6D]",
  served: "bg-teal-500/10 text-teal-400",
};

function stationIcon(station: string, size = 18) {
  switch (station) {
    case "kitchen": return <Flame size={size} className="text-amber-500" />;
    case "bar": return <Beer size={size} className="text-blue-500" />;
    case "tandoor": return <ChefHat size={size} className="text-orange-500" />;
    default: return <Utensils size={size} className="text-gray-500" />;
  }
}

function itemStatusClasses(s: string) { return ITEM_STATUS_COLORS[s] || "bg-gray-500/10 text-gray-400"; }
function statusClasses(s: string) { return STATUS_COLORS[s] || "bg-gray-500/20 text-gray-400 border border-gray-500/30"; }

// ─── Login Screen ────────────────────────────────────────────────────────────
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
      const user: StaffUser = { username: data.username, role: data.role };
      saveAuth(data.access_token, user);
      onLogin(user);
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
            <Lock size={26} className="text-white" />
          </div>
          <h1 className="text-xl font-bold text-[#EDEAE3]">Staff Access</h1>
          <p className="text-sm text-[#8B8F98] mt-1">Sign in to manage orders & menu</p>
        </div>
        {error && (
          <div className="p-3 bg-[#D1495B]/10 border border-[#D1495B]/30 rounded-xl text-[#D1495B] text-xs font-semibold text-center">
            {error}
          </div>
        )}
        <div className="space-y-4">
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            className="w-full p-3 bg-[#15171B] border border-[#282C34] rounded-xl focus:border-[#C98A2E] focus:outline-none text-[#EDEAE3] text-sm"
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full p-3 bg-[#15171B] border border-[#282C34] rounded-xl focus:border-[#C98A2E] focus:outline-none text-[#EDEAE3] text-sm"
            required
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 bg-[#C98A2E] hover:bg-[#C98A2E]/90 text-white font-bold rounded-xl text-sm transition disabled:opacity-50"
        >
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </form>
    </div>
  );
}

// ─── Main Staff Dashboard ────────────────────────────────────────────────────
export default function StaffDashboardPage() {
  const [user, setUser] = useState<StaffUser | null>(null);
  const [role, setRole] = useState<"kitchen" | "tandoor" | "bar" | "cashier" | "admin">("kitchen");
  const [orders, setOrders] = useState<Order[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [wsConnected, setWsConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);

  // Settings
  const [settingsName, setSettingsName] = useState("");
  const [settingsLogo, setSettingsLogo] = useState("");
  const [settingsAddress, setSettingsAddress] = useState("");
  const [settingsPhone, setSettingsPhone] = useState("");
  const [settingsTax, setSettingsTax] = useState(0.0);
  const [settingsCurrency, setSettingsCurrency] = useState("$");
  const [settingsFooter, setSettingsFooter] = useState("");

  // New / Edit product modal
  const [editItem, setEditItem] = useState<MenuItem | null>(null);
  const [showAddItem, setShowAddItem] = useState(false);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formPrice, setFormPrice] = useState(0);
  const [formCategory, setFormCategory] = useState<number | "">("");
  const [formImage, setFormImage] = useState("");
  const [uploading, setUploading] = useState(false);

  // Category management
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatStation, setNewCatStation] = useState("kitchen");

  const isAdmin = user?.role === "admin";

  // Auth gate
  useEffect(() => {
    const u = getUser();
    if (u) setUser(u);
  }, []);

  const handleLogin = useCallback((u: StaffUser) => {
    setUser(u);
  }, []);

  const handleLogout = useCallback(() => {
    clearAuth();
    setUser(null);
  }, []);

  // Data fetching
  useEffect(() => {
    if (!user) return;
    fetchOrders();
    fetchMenuItems();
    fetchCategories();
    fetchBusinessSettings();
  }, [user]);

  // WebSocket
  useEffect(() => {
    if (!user) return;
    connectRoleWebSocket();
    return () => { socketRef.current?.close(); };
  }, [role, user]);

  const connectRoleWebSocket = () => {
    socketRef.current?.close();
    const room = role === "admin" ? "admin" : role === "cashier" ? "cashier" : `station_${role}`;
    const ws = new WebSocket(`${WS_BASE}/${room}`);
    socketRef.current = ws;
    ws.onopen = () => setWsConnected(true);
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.event === "order_created") setOrders(prev => [data.order, ...prev]);
      else if (["order_item_updated", "order_updated", "payment_completed"].includes(data.event)) fetchOrders();
      else if (["menu_item_availability_changed", "menu_item_stock_changed"].includes(data.event)) fetchMenuItems();
      else if (data.event === "settings_updated") {
        const s = data.settings;
        setSettingsName(s.name);
        setSettingsLogo(s.logo_url || "");
        setSettingsAddress(s.address || "");
        setSettingsPhone(s.phone || "");
        setSettingsTax(s.tax_rate);
        setSettingsCurrency(s.currency);
        setSettingsFooter(s.receipt_footer || "");
      }
    };
    ws.onclose = () => {
      setWsConnected(false);
      setTimeout(connectRoleWebSocket, 3000);
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

  const fetchMenuItems = async () => {
    try {
      const res = await fetch(`${API}/menu/items`);
      if (res.ok) setMenuItems(await res.json());
    } catch { /* ignore */ }
  };

  const fetchCategories = async () => {
    try {
      const res = await fetch(`${API}/menu/categories`);
      if (res.ok) setCategories(await res.json());
    } catch { /* ignore */ }
  };

  const fetchBusinessSettings = async () => {
    try {
      const res = await fetch(`${API}/settings`);
      if (!res.ok) return;
      const d = await res.json();
      setSettingsName(d.name);
      setSettingsLogo(d.logo_url || "");
      setSettingsAddress(d.address || "");
      setSettingsPhone(d.phone || "");
      setSettingsTax(d.tax_rate);
      setSettingsCurrency(d.currency);
      setSettingsFooter(d.receipt_footer || "");
    } catch { /* ignore */ }
  };

  // ─── Admin Actions ─────────────────────────────────────────────────────────
  const handleUpdateItem = async () => {
    if (!editItem) return;
    try {
      const body: Record<string, any> = {};
      if (formName) body.name = formName;
      if (formDesc !== undefined) body.description = formDesc;
      if (formPrice > 0) body.price = formPrice;
      if (formCategory !== "") body.category_id = formCategory;
      if (formImage) body.image_url = formImage;
      const res = await authFetch(`${API}/menu/items/${editItem.id}`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setEditItem(null);
        resetForm();
        fetchMenuItems();
      }
    } catch { /* ignore */ }
  };

  const handleCreateItem = async () => {
    try {
      const res = await authFetch(`${API}/menu/items`, {
        method: "POST",
        body: JSON.stringify({
          name: formName,
          description: formDesc || null,
          price: formPrice,
          category_id: formCategory || 1,
          image_url: formImage || null,
        }),
      });
      if (res.ok) {
        setShowAddItem(false);
        resetForm();
        fetchMenuItems();
      }
    } catch { /* ignore */ }
  };

  const handleDeleteItem = async (id: number) => {
    if (!confirm("Delete this menu item?")) return;
    try {
      const res = await authFetch(`${API}/menu/items/${id}`, { method: "DELETE" });
      if (res.ok) fetchMenuItems();
    } catch { /* ignore */ }
  };

  const handleCreateCategory = async () => {
    if (!newCatName) return;
    try {
      const res = await authFetch(`${API}/menu/categories`, {
        method: "POST",
        body: JSON.stringify({ name: newCatName, station: newCatStation }),
      });
      if (res.ok) {
        setNewCatName("");
        fetchCategories();
      }
    } catch { /* ignore */ }
  };

  const handleDeleteCategory = async (id: number) => {
    if (!confirm("Delete this category? Must have no items.")) return;
    try {
      const res = await authFetch(`${API}/menu/categories/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json();
        alert(d.detail || "Cannot delete");
        return;
      }
      fetchCategories();
    } catch { /* ignore */ }
  };

  const handleImageUpload = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await authFetch(`${API}/upload`, { method: "POST", body: fd });
      if (res.ok) {
        const d = await res.json();
        setFormImage(`${UPLOADS_BASE}${d.url}`);
      }
    } catch { /* ignore */ }
    setUploading(false);
  };

  const handleSaveSettings = async () => {
    try {
      const res = await authFetch(`${API}/settings`, {
        method: "PUT",
        body: JSON.stringify({
          name: settingsName,
          logo_url: settingsLogo || null,
          address: settingsAddress || null,
          phone: settingsPhone || null,
          tax_rate: settingsTax,
          currency: settingsCurrency,
          receipt_footer: settingsFooter || null,
        }),
      });
      if (res.ok) fetchBusinessSettings();
    } catch { /* ignore */ }
  };

  const handleToggleAvailability = async (id: number, current: boolean) => {
    try {
      await authFetch(`${API}/menu/items/${id}/availability?is_available=${!current}`, { method: "PUT" });
      fetchMenuItems();
    } catch { /* ignore */ }
  };

  const handleUpdateStock = async (id: number, qty: number) => {
    try {
      await authFetch(`${API}/menu/items/${id}/stock?stock_qty=${qty}`, { method: "PUT" });
      fetchMenuItems();
    } catch { /* ignore */ }
  };

  const handleItemStatus = async (itemId: number, status: string) => {
    try {
      const res = await authFetch(`${API}/orders/items/${itemId}/status`, {
        method: "PUT",
        body: JSON.stringify({ item_status: status }),
      });
      if (res.ok) fetchOrders();
    } catch { /* ignore */ }
  };

  const handleSettlePayment = async (orderId: number, total: number) => {
    try {
      const res = await fetch(`${API}/orders/${orderId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: "cash", amount: total }),
      });
      if (res.ok) fetchOrders();
    } catch { /* ignore */ }
  };

  const openEditModal = (item: MenuItem) => {
    setEditItem(item);
    setFormName(item.name);
    setFormDesc(item.description || "");
    setFormPrice(item.price);
    setFormCategory(item.category_id);
    setFormImage(item.image_url || "");
  };

  const resetForm = () => {
    setFormName("");
    setFormDesc("");
    setFormPrice(0);
    setFormCategory("");
    setFormImage("");
  };

  // ─── Derived data ──────────────────────────────────────────────────────────
  const stationOrders = () => {
    if (role === "admin") return orders;
    if (role === "cashier") return orders.filter(o => o.status !== "paid" && o.status !== "cancelled");
    return orders.filter(o =>
      o.status !== "paid" && o.status !== "cancelled" &&
      o.items.some(i => i.station === role && i.status !== "served")
    );
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  if (!user) return <LoginScreen onLogin={handleLogin} />;

  const modalOverlay = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => { setEditItem(null); setShowAddItem(false); }} />
    </div>
  );

  return (
    <div className="min-h-screen bg-[#15171B] text-[#EDEAE3]">

      {/* ═══ Header ═══ */}
      <header className="sticky top-0 z-40 backdrop-blur-md bg-[#15171B]/80 border-b border-[#282C34]">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-tr from-[#C98A2E] to-rose-500 rounded-xl text-white shadow-lg">
              <ChefHat size={22} />
            </div>
            <div>
              <h1 className="font-extrabold text-lg tracking-tight">{settingsName || "Digital Diner"} Workspace</h1>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-[#C98A2E] capitalize">{user.username} &middot; {user.role}</span>
                <span className={`w-1.5 h-1.5 rounded-full ${wsConnected ? "bg-[#4CAF6D]" : "bg-[#D1495B] animate-ping"}`} />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden lg:flex bg-[#1F2229] border border-[#282C34] p-1 rounded-xl">
              {[
                { id: "kitchen", label: "Kitchen", icon: <Flame size={14} /> },
                { id: "tandoor", label: "Naan", icon: <ChefHat size={14} /> },
                { id: "bar", label: "Bar", icon: <Beer size={14} /> },
                { id: "cashier", label: "Cashier", icon: <DollarSign size={14} /> },
                ...(isAdmin ? [{ id: "admin", label: "Admin", icon: <Settings size={14} /> }] : []),
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setRole(tab.id as any)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                    role === tab.id
                      ? "bg-gradient-to-r from-[#C98A2E] to-rose-500 text-white shadow-md"
                      : "text-[#8B8F98] hover:text-[#EDEAE3]"
                  }`}
                >
                  {tab.icon}<span>{tab.label}</span>
                </button>
              ))}
            </div>
            <select
              value={role}
              onChange={e => setRole(e.target.value as any)}
              className="lg:hidden p-2.5 bg-[#1F2229] border border-[#282C34] rounded-xl text-xs font-bold text-[#EDEAE3]"
            >
              {[
                "kitchen", "tandoor", "bar", "cashier",
                ...(isAdmin ? ["admin"] : []),
              ].map(r => <option key={r} value={r}>{r === "tandoor" ? "Naan" : r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
            </select>
            <button onClick={() => { fetchOrders(); fetchMenuItems(); fetchCategories(); fetchBusinessSettings(); }}
              className="p-2 rounded-lg border border-[#282C34] hover:bg-[#1F2229] text-[#8B8F98] transition">
              <RefreshCw size={16} />
            </button>
            <button onClick={handleLogout}
              className="p-2 rounded-lg border border-[#282C34] hover:bg-[#1F2229] text-[#8B8F98] transition">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      {/* ═══ Workspace ═══ */}
      <main className="max-w-7xl mx-auto px-4 py-6">

        {/* ─── ADMIN ─── */}
        {role === "admin" && (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* Menu Items */}
            <div className="xl:col-span-2 space-y-6">
              <div className="p-6 rounded-2xl border border-[#282C34] bg-[#1F2229]/40">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-extrabold text-lg flex items-center gap-2">
                    <Package size={20} className="text-[#C98A2E]" />
                    <span>Menu Items</span>
                  </h3>
                  <div className="flex gap-2">
                    <button onClick={() => setShowCategoryManager(true)}
                      className="px-3 py-2 border border-[#282C34] rounded-xl text-xs font-bold text-[#8B8F98] hover:text-[#EDEAE3] transition flex items-center gap-1">
                      <Layers size={14} /> Categories
                    </button>
                    <button onClick={() => { setShowAddItem(true); resetForm(); }}
                      className="px-3 py-2 bg-[#C98A2E] text-white rounded-xl text-xs font-bold hover:bg-[#C98A2E]/90 transition flex items-center gap-1">
                      <Plus size={14} /> Add Item
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto scrollbar-thin">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-[#282C34] text-xs font-semibold text-[#8B8F98] uppercase tracking-wider">
                        <th className="pb-3 pl-2">Item</th>
                        <th className="pb-3">Category</th>
                        <th className="pb-3">Price</th>
                        <th className="pb-3">Stock</th>
                        <th className="pb-3 text-center">Status</th>
                        <th className="pb-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#282C34]">
                      {menuItems.map(item => (
                        <tr key={item.id} className="text-sm hover:bg-[#282C34]/30 transition">
                          <td className="py-3 pl-2">
                            <div className="flex items-center gap-3">
                              {item.image_url ? (
                                <img src={item.image_url} alt="" className="w-10 h-10 rounded-lg object-cover border border-[#282C34]" />
                              ) : (
                                <div className="w-10 h-10 rounded-lg bg-[#282C34] flex items-center justify-center text-[#8B8F98]">
                                  <ImageIcon size={16} />
                                </div>
                              )}
                              <div>
                                <span className="font-semibold">{item.name}</span>
                                {item.description && <p className="text-xs text-[#8B8F98] truncate max-w-[200px]">{item.description}</p>}
                              </div>
                            </div>
                          </td>
                          <td className="py-3 text-xs text-[#8B8F98]">{item.category?.name}</td>
                          <td className="py-3 font-bold text-[#C98A2E]">{settingsCurrency}{item.price.toFixed(2)}</td>
                          <td className="py-3">
                            <div className="flex items-center gap-1.5">
                              <button onClick={() => handleUpdateStock(item.id, Math.max(0, (item.inventory?.stock_qty || 0) - 5))}
                                className="w-5 h-5 rounded bg-[#282C34] hover:bg-[#282C34]/70 font-bold flex items-center justify-center text-[10px]">-</button>
                              <span className="font-mono text-xs w-7 text-center">{item.inventory?.stock_qty ?? 0}</span>
                              <button onClick={() => handleUpdateStock(item.id, (item.inventory?.stock_qty || 0) + 5)}
                                className="w-5 h-5 rounded bg-[#282C34] hover:bg-[#282C34]/70 font-bold flex items-center justify-center text-[10px]">+</button>
                            </div>
                          </td>
                          <td className="py-3 text-center">
                            <button onClick={() => handleToggleAvailability(item.id, item.is_available)}
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                item.is_available
                                  ? "bg-[#4CAF6D]/10 border-[#4CAF6D]/20 text-[#4CAF6D]"
                                  : "bg-[#D1495B]/10 border-[#D1495B]/20 text-[#D1495B]"
                              }`}>
                              {item.is_available ? "Active" : "Disabled"}
                            </button>
                          </td>
                          <td className="py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={() => openEditModal(item)}
                                className="p-1.5 rounded hover:bg-[#282C34] text-[#8B8F98] hover:text-[#C98A2E] transition">
                                <Edit3 size={14} />
                              </button>
                              <button onClick={() => handleDeleteItem(item.id)}
                                className="p-1.5 rounded hover:bg-[#282C34] text-[#8B8F98] hover:text-[#D1495B] transition">
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Business Settings */}
              <div className="p-6 rounded-2xl border border-[#282C34] bg-[#1F2229]/40">
                <h3 className="font-extrabold text-lg mb-4 flex items-center gap-2">
                  <Settings size={20} className="text-[#C98A2E]" />
                  <span>Restaurant Settings</span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-[#8B8F98] uppercase tracking-wider mb-2">Name</label>
                    <input type="text" value={settingsName} onChange={e => setSettingsName(e.target.value)}
                      className="w-full p-3 bg-[#15171B] border border-[#282C34] rounded-xl focus:border-[#C98A2E] focus:outline-none text-[#EDEAE3] text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#8B8F98] uppercase tracking-wider mb-2">Logo URL</label>
                    <input type="text" value={settingsLogo} onChange={e => setSettingsLogo(e.target.value)}
                      className="w-full p-3 bg-[#15171B] border border-[#282C34] rounded-xl focus:border-[#C98A2E] focus:outline-none text-[#EDEAE3] text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#8B8F98] uppercase tracking-wider mb-2">Address</label>
                    <input type="text" value={settingsAddress} onChange={e => setSettingsAddress(e.target.value)}
                      className="w-full p-3 bg-[#15171B] border border-[#282C34] rounded-xl focus:border-[#C98A2E] focus:outline-none text-[#EDEAE3] text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#8B8F98] uppercase tracking-wider mb-2">Phone</label>
                    <input type="text" value={settingsPhone} onChange={e => setSettingsPhone(e.target.value)}
                      className="w-full p-3 bg-[#15171B] border border-[#282C34] rounded-xl focus:border-[#C98A2E] focus:outline-none text-[#EDEAE3] text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#8B8F98] uppercase tracking-wider mb-2">Tax Rate</label>
                    <input type="number" step="0.01" value={settingsTax} onChange={e => setSettingsTax(parseFloat(e.target.value) || 0)}
                      className="w-full p-3 bg-[#15171B] border border-[#282C34] rounded-xl focus:border-[#C98A2E] focus:outline-none text-[#EDEAE3] text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#8B8F98] uppercase tracking-wider mb-2">Currency</label>
                    <input type="text" value={settingsCurrency} onChange={e => setSettingsCurrency(e.target.value)}
                      className="w-full p-3 bg-[#15171B] border border-[#282C34] rounded-xl focus:border-[#C98A2E] focus:outline-none text-[#EDEAE3] text-sm" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-[#8B8F98] uppercase tracking-wider mb-2">Receipt Footer</label>
                    <input type="text" value={settingsFooter} onChange={e => setSettingsFooter(e.target.value)}
                      className="w-full p-3 bg-[#15171B] border border-[#282C34] rounded-xl focus:border-[#C98A2E] focus:outline-none text-[#EDEAE3] text-sm" />
                  </div>
                </div>
                <div className="mt-6 flex justify-end">
                  <button onClick={handleSaveSettings}
                    className="px-5 py-3 bg-[#C98A2E] hover:bg-[#C98A2E]/90 text-white font-bold rounded-xl text-sm flex items-center gap-2 shadow-lg transition">
                    <Save size={16} /> Save Settings
                  </button>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="space-y-6">
              <div className="p-6 rounded-2xl border border-[#282C34] bg-[#1F2229]/40">
                <h3 className="font-extrabold text-lg mb-4 flex items-center gap-2">
                  <TrendingUp size={20} className="text-[#C98A2E]" />
                  <span>Analytics</span>
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl border border-[#282C34] bg-[#15171B]/40">
                    <span className="text-[#8B8F98] text-xs font-semibold uppercase">Orders</span>
                    <span className="text-3xl font-black mt-1 block">{orders.length}</span>
                  </div>
                  <div className="p-4 rounded-xl border border-[#282C34] bg-[#15171B]/40">
                    <span className="text-[#8B8F98] text-xs font-semibold uppercase">Sales</span>
                    <span className="text-3xl font-black mt-1 block text-[#C98A2E]">
                      {settingsCurrency}{orders.reduce((s, o) => o.status === "paid" ? s + o.total : s, 0).toFixed(0)}
                    </span>
                  </div>
                  <div className="p-4 rounded-xl border border-[#282C34] bg-[#15171B]/40">
                    <span className="text-[#8B8F98] text-xs font-semibold uppercase">Pending</span>
                    <span className="text-3xl font-black mt-1 block text-[#4C9BD1]">
                      {orders.filter(o => o.status !== "paid" && o.status !== "cancelled").length}
                    </span>
                  </div>
                  <div className="p-4 rounded-xl border border-[#282C34] bg-[#15171B]/40">
                    <span className="text-[#8B8F98] text-xs font-semibold uppercase">Active Tables</span>
                    <span className="text-3xl font-black mt-1 block text-[#D1495B]">
                      {new Set(orders.filter(o => o.status !== "paid" && o.status !== "cancelled").map(o => o.table_label)).size}
                    </span>
                  </div>
                </div>
              </div>
              <div className="p-6 rounded-2xl border border-[#282C34] bg-[#1F2229]/40">
                <h3 className="font-extrabold text-sm uppercase tracking-wider text-[#8B8F98] mb-4">Operations Log</h3>
                <div className="space-y-3 max-h-[300px] overflow-y-auto scrollbar-thin pr-2">
                  {orders.slice(0, 10).map(o => (
                    <div key={o.id} className="p-3 border border-[#282C34] rounded-xl flex justify-between items-center text-xs">
                      <div>
                        <span className="font-bold">Order #{o.id}</span>
                        <span className="text-[#8B8F98] block mt-0.5">{o.table_label} &bull; {o.items.length} items</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded font-bold uppercase ${statusClasses(o.status)}`}>
                        {o.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── CASHIER ─── */}
        {role === "cashier" && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <DollarSign size={22} className="text-[#4CAF6D]" />
                <span>Billing Queue</span>
              </h3>
              <span className="text-xs bg-[#1F2229] border border-[#282C34] px-3 py-1 rounded-full font-semibold text-[#8B8F98]">
                {stationOrders().length} pending
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {stationOrders().map(order => (
                <div key={order.id} className="rounded-2xl border border-[#282C34] bg-[#1F2229]/40 p-5 flex flex-col justify-between gap-4 hover:border-[#282C34]/70 transition shadow-md">
                  <div>
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-black text-lg">Order #{order.id}</h4>
                        <span className="text-xs px-2 py-0.5 rounded bg-[#C98A2E]/10 text-[#C98A2E] font-semibold border border-[#C98A2E]/20">{order.table_label}</span>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${statusClasses(order.status)}`}>{order.status}</span>
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
                      <span className="text-xl font-extrabold text-[#C98A2E]">{settingsCurrency}{order.total.toFixed(2)}</span>
                    </div>
                    <button onClick={() => handleSettlePayment(order.id, order.total)}
                      className="px-4 py-2 bg-[#4CAF6D] hover:bg-[#4CAF6D]/90 text-white rounded-xl font-bold shadow-md text-xs transition">
                      Collect & Settle
                    </button>
                  </div>
                </div>
              ))}
              {stationOrders().length === 0 && (
                <div className="col-span-full py-16 text-center text-[#8B8F98]">
                  <CheckCircle2 size={48} className="mx-auto mb-3 opacity-40" />
                  <p className="font-bold text-sm">All bills settled</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── KITCHEN / NAAN / BAR ─── */}
        {(role === "kitchen" || role === "bar" || role === "tandoor") && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-bold flex items-center gap-2">
                {stationIcon(role)}
                <span className="capitalize">{role === "tandoor" ? "Naan Station" : role} Display</span>
              </h3>
              <span className="text-xs bg-[#1F2229] border border-[#282C34] px-3 py-1 rounded-full font-semibold text-[#8B8F98]">
                {stationOrders().length} orders
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {stationOrders().map(order => {
                const stationItems = order.items.filter(i => i.station === role && i.status !== "served");
                if (stationItems.length === 0) return null;
                return (
                  <div key={order.id} className="rounded-2xl border border-[#282C34] bg-[#1F2229]/40 p-5 flex flex-col justify-between gap-4 hover:border-[#282C34]/70 transition shadow-md">
                    <div>
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-black text-lg">Order #{order.id}</h4>
                          <span className="text-xs px-2.5 py-0.5 rounded bg-[#C98A2E]/10 text-[#C98A2E] font-semibold border border-[#C98A2E]/20">{order.table_label}</span>
                        </div>
                        <span className="text-xs text-[#8B8F98] font-medium">
                          {new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div className="mt-4 divide-y divide-[#282C34]">
                        {stationItems.map(item => (
                          <div key={item.id} className="py-3 flex flex-col gap-2">
                            <div className="flex justify-between items-start">
                              <div className="flex items-start gap-2">
                                <span className="font-extrabold text-[#C98A2E] text-sm">{item.qty}x</span>
                                <div>
                                  <h5 className="font-bold text-sm leading-tight">{item.name}</h5>
                                  {item.modifiers && <p className="text-xs text-[#C98A2E] font-semibold mt-0.5">[{item.modifiers}]</p>}
                                  {item.notes && <p className="text-xs text-[#8B8F98] italic mt-0.5">"{item.notes}"</p>}
                                </div>
                              </div>
                              <span className={`text-[9px] font-bold px-2 py-0.5 rounded uppercase ${itemStatusClasses(item.status)}`}>
                                {item.status}
                              </span>
                            </div>
                            <div className="flex gap-2 justify-end pt-1">
                              {item.status === "pending" && (
                                <button onClick={() => handleItemStatus(item.id, "preparing")}
                                  className="px-3 py-1 bg-[#D1A63C] hover:bg-[#D1A63C]/90 text-white font-bold rounded-lg text-[10px] flex items-center gap-1 shadow-sm transition">
                                  <Play size={10} /> Prepare
                                </button>
                              )}
                              {item.status === "preparing" && (
                                <button onClick={() => handleItemStatus(item.id, "ready")}
                                  className="px-3 py-1 bg-[#4CAF6D] hover:bg-[#4CAF6D]/90 text-white font-bold rounded-lg text-[10px] flex items-center gap-1 shadow-sm transition">
                                  <CheckCircle2 size={10} /> Ready
                                </button>
                              )}
                              {item.status === "ready" && (
                                <button onClick={() => handleItemStatus(item.id, "served")}
                                  className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg text-[10px] flex items-center gap-1 shadow-sm transition">
                                  <CheckCircle2 size={10} /> Serve
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
              {stationOrders().length === 0 && (
                <div className="col-span-full py-16 text-center text-[#8B8F98]">
                  <CheckCircle2 size={48} className="mx-auto mb-3 opacity-40" />
                  <p className="font-bold text-sm">Station queue clear</p>
                </div>
              )}
            </div>
          </div>
        )}

      </main>

      {/* ═══ Edit Item Modal ═══ */}
      {editItem && (
        <>
          {modalOverlay}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div className="relative w-full max-w-lg bg-[#1F2229] rounded-2xl border border-[#282C34] p-6 shadow-2xl pointer-events-auto">
              <div className="flex justify-between items-center mb-5">
                <h3 className="font-extrabold text-lg flex items-center gap-2">
                  <Edit3 size={18} className="text-[#C98A2E]" />
                  Edit Item
                </h3>
                <button onClick={() => setEditItem(null)} className="p-1 rounded hover:bg-[#282C34] text-[#8B8F98]"><X size={18} /></button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-[#8B8F98] uppercase mb-1.5">Name</label>
                  <input value={formName} onChange={e => setFormName(e.target.value)}
                    className="w-full p-3 bg-[#15171B] border border-[#282C34] rounded-xl focus:border-[#C98A2E] focus:outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#8B8F98] uppercase mb-1.5">Description</label>
                  <textarea value={formDesc} onChange={e => setFormDesc(e.target.value)} rows={2}
                    className="w-full p-3 bg-[#15171B] border border-[#282C34] rounded-xl focus:border-[#C98A2E] focus:outline-none text-sm resize-none" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-[#8B8F98] uppercase mb-1.5">Price</label>
                    <input type="number" step="0.01" value={formPrice} onChange={e => setFormPrice(parseFloat(e.target.value) || 0)}
                      className="w-full p-3 bg-[#15171B] border border-[#282C34] rounded-xl focus:border-[#C98A2E] focus:outline-none text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#8B8F98] uppercase mb-1.5">Category</label>
                    <select value={formCategory} onChange={e => setFormCategory(parseInt(e.target.value))}
                      className="w-full p-3 bg-[#15171B] border border-[#282C34] rounded-xl focus:border-[#C98A2E] focus:outline-none text-sm">
                      {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#8B8F98] uppercase mb-1.5">Image</label>
                  <div className="flex gap-3 items-start">
                    {formImage ? (
                      <img src={formImage} alt="" className="w-16 h-16 rounded-xl object-cover border border-[#282C34]" />
                    ) : (
                      <div className="w-16 h-16 rounded-xl bg-[#15171B] border border-dashed border-[#282C34] flex items-center justify-center text-[#8B8F98]">
                        <ImageIcon size={20} />
                      </div>
                    )}
                    <div className="flex-1 space-y-2">
                      <input type="text" value={formImage} onChange={e => setFormImage(e.target.value)}
                        placeholder="Image URL or upload..."
                        className="w-full p-2.5 bg-[#15171B] border border-[#282C34] rounded-xl focus:border-[#C98A2E] focus:outline-none text-xs" />
                      <label className="flex items-center gap-2 px-3 py-2 bg-[#282C34] hover:bg-[#282C34]/70 rounded-xl cursor-pointer text-xs text-[#8B8F98] transition">
                        <Upload size={14} />
                        {uploading ? "Uploading..." : "Upload file"}
                        <input type="file" accept="image/*" className="hidden" disabled={uploading}
                          onChange={e => e.target.files?.[0] && handleImageUpload(e.target.files[0])} />
                      </label>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-[#282C34]">
                <button onClick={() => setEditItem(null)}
                  className="px-4 py-2 border border-[#282C34] rounded-xl text-xs font-bold text-[#8B8F98] hover:text-[#EDEAE3] transition">Cancel</button>
                <button onClick={handleUpdateItem}
                  className="px-5 py-2 bg-[#C98A2E] hover:bg-[#C98A2E]/90 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5">
                  <Save size={14} /> Save
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ═══ Add Item Modal ═══ */}
      {showAddItem && (
        <>
          {modalOverlay}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div className="relative w-full max-w-lg bg-[#1F2229] rounded-2xl border border-[#282C34] p-6 shadow-2xl pointer-events-auto">
              <div className="flex justify-between items-center mb-5">
                <h3 className="font-extrabold text-lg flex items-center gap-2">
                  <Plus size={18} className="text-[#C98A2E]" />
                  New Menu Item
                </h3>
                <button onClick={() => setShowAddItem(false)} className="p-1 rounded hover:bg-[#282C34] text-[#8B8F98]"><X size={18} /></button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-[#8B8F98] uppercase mb-1.5">Name *</label>
                  <input value={formName} onChange={e => setFormName(e.target.value)}
                    className="w-full p-3 bg-[#15171B] border border-[#282C34] rounded-xl focus:border-[#C98A2E] focus:outline-none text-sm" required />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#8B8F98] uppercase mb-1.5">Description</label>
                  <textarea value={formDesc} onChange={e => setFormDesc(e.target.value)} rows={2}
                    className="w-full p-3 bg-[#15171B] border border-[#282C34] rounded-xl focus:border-[#C98A2E] focus:outline-none text-sm resize-none" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-[#8B8F98] uppercase mb-1.5">Price *</label>
                    <input type="number" step="0.01" value={formPrice || ""} onChange={e => setFormPrice(parseFloat(e.target.value) || 0)}
                      className="w-full p-3 bg-[#15171B] border border-[#282C34] rounded-xl focus:border-[#C98A2E] focus:outline-none text-sm" required />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#8B8F98] uppercase mb-1.5">Category *</label>
                    <select value={formCategory} onChange={e => setFormCategory(parseInt(e.target.value))}
                      className="w-full p-3 bg-[#15171B] border border-[#282C34] rounded-xl focus:border-[#C98A2E] focus:outline-none text-sm">
                      <option value="">Select...</option>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#8B8F98] uppercase mb-1.5">Image</label>
                  <div className="flex gap-3 items-start">
                    {formImage ? (
                      <img src={formImage} alt="" className="w-16 h-16 rounded-xl object-cover border border-[#282C34]" />
                    ) : (
                      <div className="w-16 h-16 rounded-xl bg-[#15171B] border border-dashed border-[#282C34] flex items-center justify-center text-[#8B8F98]">
                        <ImageIcon size={20} />
                      </div>
                    )}
                    <div className="flex-1 space-y-2">
                      <input type="text" value={formImage} onChange={e => setFormImage(e.target.value)}
                        placeholder="Image URL or upload..."
                        className="w-full p-2.5 bg-[#15171B] border border-[#282C34] rounded-xl focus:border-[#C98A2E] focus:outline-none text-xs" />
                      <label className="flex items-center gap-2 px-3 py-2 bg-[#282C34] hover:bg-[#282C34]/70 rounded-xl cursor-pointer text-xs text-[#8B8F98] transition">
                        <Upload size={14} />
                        {uploading ? "Uploading..." : "Upload file"}
                        <input type="file" accept="image/*" className="hidden" disabled={uploading}
                          onChange={e => e.target.files?.[0] && handleImageUpload(e.target.files[0])} />
                      </label>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-[#282C34]">
                <button onClick={() => setShowAddItem(false)}
                  className="px-4 py-2 border border-[#282C34] rounded-xl text-xs font-bold text-[#8B8F98] hover:text-[#EDEAE3] transition">Cancel</button>
                <button onClick={handleCreateItem}
                  className="px-5 py-2 bg-[#C98A2E] hover:bg-[#C98A2E]/90 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5">
                  <Plus size={14} /> Create
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ═══ Category Manager Modal ═══ */}
      {showCategoryManager && (
        <>
          {modalOverlay}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div className="relative w-full max-w-md bg-[#1F2229] rounded-2xl border border-[#282C34] p-6 shadow-2xl pointer-events-auto">
              <div className="flex justify-between items-center mb-5">
                <h3 className="font-extrabold text-lg flex items-center gap-2">
                  <Layers size={18} className="text-[#C98A2E]" />
                  Categories
                </h3>
                <button onClick={() => setShowCategoryManager(false)} className="p-1 rounded hover:bg-[#282C34] text-[#8B8F98]"><X size={18} /></button>
              </div>

              {/* Add new category */}
              <div className="flex gap-2 mb-5">
                <input value={newCatName} onChange={e => setNewCatName(e.target.value)}
                  placeholder="Category name"
                  className="flex-1 p-2.5 bg-[#15171B] border border-[#282C34] rounded-xl focus:border-[#C98A2E] focus:outline-none text-sm" />
                <select value={newCatStation} onChange={e => setNewCatStation(e.target.value)}
                  className="p-2.5 bg-[#15171B] border border-[#282C34] rounded-xl focus:border-[#C98A2E] focus:outline-none text-sm">
                  <option value="kitchen">Kitchen</option>
                  <option value="tandoor">Naan</option>
                  <option value="bar">Bar</option>
                </select>
                <button onClick={handleCreateCategory}
                  className="px-3 py-2 bg-[#C98A2E] hover:bg-[#C98A2E]/90 text-white rounded-xl text-xs font-bold transition flex items-center gap-1">
                  <Plus size={14} /> Add
                </button>
              </div>

              {/* Category list */}
              <div className="space-y-2 max-h-[300px] overflow-y-auto scrollbar-thin">
                {categories.map(cat => (
                  <div key={cat.id} className="flex items-center justify-between p-3 bg-[#15171B] rounded-xl border border-[#282C34]">
                    <div>
                      <span className="font-semibold text-sm">{cat.name}</span>
                      <span className="ml-2 text-[10px] uppercase text-[#8B8F98]">({cat.station})</span>
                    </div>
                    <button onClick={() => handleDeleteCategory(cat.id)}
                      className="p-1.5 rounded hover:bg-[#282C34] text-[#8B8F98] hover:text-[#D1495B] transition">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

    </div>
  );
}
