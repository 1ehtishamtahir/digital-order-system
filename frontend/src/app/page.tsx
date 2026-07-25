"use client";

import React, { useState, useEffect, useRef } from "react";
import { 
  ShoppingBag, Trash2, Clock, CheckCircle2, AlertTriangle, 
  Coffee, Utensils, Moon, Sun, User, Phone,
  CreditCard, DollarSign, ChevronRight, X, ChefHat, Beer, Flame, RefreshCw
} from "lucide-react";

interface MenuItem {
  id: number;
  category_id: number;
  name: string;
  price: number;
  is_available: boolean;
  image_url: string | null;
  category?: {
    id: number;
    name: string;
    station: string;
  };
  inventory?: {
    stock_qty: number;
  };
}

interface CartItem {
  menuItem: MenuItem;
  qty: number;
  modifiers: string;
  notes: string;
}

interface OrderItemResponse {
  id: number;
  menu_item: MenuItem;
  qty: number;
  modifiers: string | null;
  notes: string | null;
  item_status: string;
}

interface OrderResponse {
  id: number;
  table_id: number | null;
  table?: {
    label: string;
  };
  status: string;
  order_type: string;
  total: number;
  customer_name: string | null;
  customer_phone: string | null;
  created_at: string;
  items: OrderItemResponse[];
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

export default function CustomerOrderingPage() {
  const [activeStep, setActiveStep] = useState<"welcome" | "menu" | "tracking">("welcome");
  const [tableToken, setTableToken] = useState<string>("");
  const [tables, setTables] = useState<any[]>([]);
  const [selectedTable, setSelectedTable] = useState<any>(null);
  const [orderType, setOrderType] = useState<"dine-in" | "takeaway">("dine-in");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  
  // Business Settings
  const [businessSettings, setBusinessSettings] = useState<BusinessSettings | null>(null);
  
  // Menu data
  const [categories, setCategories] = useState<any[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  
  // Cart
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedItemForModal, setSelectedItemForModal] = useState<MenuItem | null>(null);
  const [modalQty, setModalQty] = useState(1);
  const [modalModifiers, setModalModifiers] = useState("");
  const [modalNotes, setModalNotes] = useState("");
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"online" | "counter">("online");
  
  // Order tracking
  const [activeOrder, setActiveOrder] = useState<OrderResponse | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1";
  const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || "ws://127.0.0.1:8000/ws";

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("table");
    if (token) {
      setTableToken(token);
      resolveTableToken(token);
    }
    
    fetchTables();
    fetchMenu();
    fetchSettings();
  }, []);

  useEffect(() => {
    if (activeOrder) {
      connectWebSocket(activeOrder.id);
    }
    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, [activeOrder?.id]);

  const connectWebSocket = (orderId: number) => {
    if (socketRef.current) {
      socketRef.current.close();
    }

    const wsUrl = `${WS_BASE}/order_${orderId}`;
    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.event === "order_updated" && data.order_id === orderId) {
        setActiveOrder(prev => prev ? { ...prev, status: data.status } : null);
      } else if (data.event === "order_item_updated" && data.order_id === orderId) {
        fetchOrderDetails(orderId);
      } else if (data.event === "payment_completed" && data.order_id === orderId) {
        setActiveOrder(prev => prev ? { ...prev, status: data.status } : null);
      }
    };

    ws.onclose = () => {
      setWsConnected(false);
      setTimeout(() => {
        if (activeOrder) connectWebSocket(orderId);
      }, 3000);
    };
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch(`${API_BASE}/settings`);
      if (res.ok) {
        setBusinessSettings(await res.json());
      }
    } catch {}
  };

  const fetchTables = async () => {
    try {
      const res = await fetch(`${API_BASE}/tables`);
      if (res.ok) {
        setTables(await res.json());
      }
    } catch {}
  };

  const fetchMenu = async () => {
    try {
      const catRes = await fetch(`${API_BASE}/menu/categories`);
      const itemRes = await fetch(`${API_BASE}/menu/items`);
      if (catRes.ok && itemRes.ok) {
        setCategories(await catRes.json());
        setMenuItems(await itemRes.json());
      }
    } catch {}
  };

  const fetchOrderDetails = async (orderId: number) => {
    try {
      const res = await fetch(`${API_BASE}/orders/${orderId}`);
      if (res.ok) {
        setActiveOrder(await res.json());
      }
    } catch {}
  };

  const resolveTableToken = async (token: string) => {
    try {
      const res = await fetch(`${API_BASE}/tables/by-token/${token}`);
      if (res.ok) {
        const table = await res.json();
        setSelectedTable(table);
        setOrderType("dine-in");
        setActiveStep("menu");
      }
    } catch {}
  };

  const handleSelectTableManual = (tableIdStr: string) => {
    const table = tables.find(t => t.id === parseInt(tableIdStr));
    if (table) {
      setSelectedTable(table);
      setTableToken(table.qr_token);
      setOrderType("dine-in");
    } else {
      setSelectedTable(null);
      setTableToken("");
    }
  };

  const addToCart = () => {
    if (!selectedItemForModal) return;
    
    const existingIndex = cart.findIndex(
      item => item.menuItem.id === selectedItemForModal.id && 
              item.modifiers === modalModifiers && 
              item.notes === modalNotes
    );

    if (existingIndex > -1) {
      const newCart = [...cart];
      newCart[existingIndex].qty += modalQty;
      setCart(newCart);
    } else {
      setCart([...cart, { 
        menuItem: selectedItemForModal, 
        qty: modalQty, 
        modifiers: modalModifiers, 
        notes: modalNotes 
      }]);
    }
    
    setSelectedItemForModal(null);
    setModalQty(1);
    setModalModifiers("");
    setModalNotes("");
  };

  const removeFromCart = (index: number) => {
    const newCart = [...cart];
    newCart.splice(index, 1);
    setCart(newCart);
  };

  const updateCartQty = (index: number, newQty: number) => {
    if (newQty <= 0) {
      removeFromCart(index);
      return;
    }
    const newCart = [...cart];
    newCart[index].qty = newQty;
    setCart(newCart);
  };

  const getCartTotal = () => {
    return cart.reduce((sum, item) => sum + item.menuItem.price * item.qty, 0);
  };

  const getCurrency = () => businessSettings?.currency || "Rs";
  const getTaxRate = () => businessSettings?.tax_rate || 0.0;

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    
    const orderItems = cart.map(item => ({
      menu_item_id: item.menuItem.id,
      qty: item.qty,
      modifiers: item.modifiers || null,
      notes: item.notes || null
    }));

    const orderPayload = {
      table_id: orderType === "dine-in" && selectedTable ? selectedTable.id : null,
      order_type: orderType,
      customer_name: customerName || "Guest",
      customer_phone: customerPhone || null,
      items: orderItems
    };

    try {
      const res = await fetch(`${API_BASE}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderPayload)
      });

      if (!res.ok) {
        const errorData = await res.json();
        alert(`Checkout failed: ${errorData.detail}`);
        return;
      }

      const orderData = await res.json();
      
      if (paymentMethod === "online") {
        await fetch(`${API_BASE}/orders/${orderData.id}/payments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ method: "online", amount: orderData.total })
        });
      }

      fetchMenu();
      setActiveOrder(orderData);
      setCart([]);
      setIsCheckoutOpen(false);
      setIsCartOpen(false);
      setActiveStep("tracking");
    } catch (err) {
      console.error("Checkout error", err);
      alert("An error occurred during checkout.");
    }
  };

  // Plain status badges (solid background and dark text)
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
    <div className="min-h-screen bg-bg-page text-text-primary font-ui flex flex-col">
      
      {/* Header bar */}
      <header className="sticky top-0 z-40 bg-bg-surface border-b border-border">
        <div className="max-w-6xl mx-auto px-4 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {businessSettings?.logo_url ? (
              <img src={businessSettings.logo_url} alt="Logo" className="w-8 h-8 object-cover rounded border border-border" />
            ) : (
              <div className="p-2 bg-brand-primary-tint rounded text-brand-primary border border-brand-primary/10">
                <Utensils size={18} />
              </div>
            )}
            <div>
              <h1 className="font-bold text-base leading-none tracking-tight text-text-primary">
                {businessSettings?.name || "QSR Menu Portal"}
              </h1>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[11px] font-medium text-text-secondary">
                  {selectedTable ? selectedTable.label : "Self-Service Ordering"}
                </span>
                <span className="text-[10px] text-text-tertiary">|</span>
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${wsConnected || activeStep !== "tracking" ? "bg-status-success" : "bg-status-error"}`} />
                  <span className="text-[10px] font-mono uppercase tracking-wider text-text-secondary">
                    {wsConnected || activeStep !== "tracking" ? "online" : "offline"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {activeStep === "menu" && (
              <button 
                onClick={() => setIsCartOpen(true)}
                className="relative px-4 py-2 bg-brand-primary hover:bg-brand-primary-dark text-white rounded font-bold flex items-center gap-2 transition text-xs uppercase"
              >
                <ShoppingBag size={14} />
                <span>Cart</span>
                {cart.length > 0 && (
                  <span className="bg-white text-brand-primary text-[10px] font-bold px-1.5 py-0.5 rounded ml-1">
                    {cart.reduce((sum, item) => sum + item.qty, 0)}
                  </span>
                )}
              </button>
            )}

            {activeStep === "tracking" && (
              <button 
                onClick={() => setActiveStep("menu")}
                className="px-4 py-2 rounded font-bold border border-border bg-bg-surface text-text-secondary hover:text-text-primary transition text-xs uppercase"
              >
                Browse Menu
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-6xl mx-auto px-4 py-6 flex-1 w-full animate-fade-in">

        {/* STEP 1: WELCOME SCREEN */}
        {activeStep === "welcome" && (
          <div className="max-w-md mx-auto my-12 p-8 rounded border bg-bg-surface border-border shadow-md">
            <div className="text-center mb-6">
              <h2 className="font-bold text-xl text-text-primary">
                Welcome to {businessSettings?.name || "QSR Ordering"}
              </h2>
              {businessSettings?.address && <p className="text-xs text-text-secondary mt-1">{businessSettings.address}</p>}
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-[11px] font-bold text-text-secondary uppercase tracking-wider mb-2">Select Your Table</label>
                <select 
                  onChange={(e) => handleSelectTableManual(e.target.value)}
                  className="w-full p-2.5 bg-bg-page border border-border rounded focus:border-brand-primary focus:outline-none text-text-primary font-medium text-xs"
                >
                  <option value="">-- Click to Select Table --</option>
                  {tables.map(t => (
                    <option key={t.id} value={t.id}>{t.label} ({t.status === "occupied" ? "Occupied" : "Free"})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-text-secondary uppercase tracking-wider mb-2">Dining Preference</label>
                <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={() => setOrderType("dine-in")}
                    className={`p-4 rounded border flex flex-col items-center justify-center gap-2 transition ${orderType === "dine-in" ? "border-brand-primary bg-brand-primary-tint text-brand-primary font-semibold" : "border-border bg-bg-page text-text-secondary hover:bg-bg-surface-alt"}`}
                  >
                    <Utensils size={20} />
                    <span className="text-xs">Dine-in</span>
                  </button>
                  <button 
                    onClick={() => setOrderType("takeaway")}
                    className={`p-4 rounded border flex flex-col items-center justify-center gap-2 transition ${orderType === "takeaway" ? "border-brand-primary bg-brand-primary-tint text-brand-primary font-semibold" : "border-border bg-bg-page text-text-secondary hover:bg-bg-surface-alt"}`}
                  >
                    <ShoppingBag size={20} />
                    <span className="text-xs">Takeaway</span>
                  </button>
                </div>
              </div>

              <div className="pt-2">
                <button 
                  onClick={() => setActiveStep("menu")}
                  disabled={orderType === "dine-in" && !selectedTable}
                  className="w-full py-3.5 bg-brand-primary hover:bg-brand-primary-dark disabled:bg-border disabled:text-text-tertiary text-white rounded font-bold shadow transition disabled:cursor-not-allowed text-xs uppercase tracking-wider"
                >
                  Browse Menu & Place Order
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: MENU & CART */}
        {activeStep === "menu" && (
          <div className="space-y-6">
            
            {/* Dine-in vs Takeaway info strip */}
            <div className="p-4 rounded border bg-bg-surface border-border flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded bg-brand-primary-tint text-brand-primary">
                  {orderType === "dine-in" ? <Utensils size={16} /> : <ShoppingBag size={16} />}
                </div>
                <div>
                  <h3 className="font-bold text-xs text-text-primary">
                    {orderType === "dine-in" ? `Dine-in table: ${selectedTable?.label || "Table"}` : "Takeaway Order"}
                  </h3>
                  <p className="text-[11px] text-text-secondary">Select your favorite items below and place order instantly.</p>
                </div>
              </div>
              <button 
                onClick={() => setActiveStep("welcome")}
                className="text-[11px] font-bold px-2.5 py-1.5 rounded border border-border hover:bg-bg-surface-alt text-text-secondary transition"
              >
                Change Table
              </button>
            </div>

            {/* Categories filter */}
            <div className="sticky top-[60px] z-30 bg-bg-page/95 backdrop-blur-sm py-3 border-b border-border flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
              <button 
                onClick={() => setSelectedCategory("All")}
                className={`px-4 py-2 rounded text-xs font-bold whitespace-nowrap transition border ${
                  selectedCategory === "All" 
                    ? "border-brand-primary bg-brand-primary text-white" 
                    : "border-border bg-bg-surface text-text-secondary hover:bg-bg-surface-alt"
                }`}
              >
                All Items
              </button>
              {categories.map(cat => (
                <button 
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.name)}
                  className={`px-4 py-2 rounded text-xs font-bold whitespace-nowrap transition border ${
                    selectedCategory === cat.name 
                      ? "border-brand-primary bg-brand-primary text-white" 
                      : "border-border bg-bg-surface text-text-secondary hover:bg-bg-surface-alt"
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>

            {/* Menu Items Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {menuItems
                .filter(item => selectedCategory === "All" || item.category?.name === selectedCategory)
                .map(item => (
                  <div 
                    key={item.id}
                    className="group rounded border bg-bg-surface border-border overflow-hidden flex flex-col justify-between h-full transition hover:shadow"
                  >
                    {item.image_url ? (
                      <img 
                        src={item.image_url} 
                        alt={item.name} 
                        className="w-full h-40 object-cover border-b border-border"
                      />
                    ) : (
                      <div className="w-full h-40 bg-bg-surface-alt border-b border-border flex items-center justify-center text-text-tertiary">
                        <Coffee size={32} />
                      </div>
                    )}
                    <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-bold tracking-wider uppercase text-text-secondary">
                            {item.category?.name}
                          </span>
                          {item.category?.station && (
                            <span className="text-[9px] font-mono text-text-secondary bg-bg-surface-alt px-1.5 py-0.5 rounded border border-border uppercase">
                              {item.category.station}
                            </span>
                          )}
                        </div>
                        <h3 className="font-bold text-sm text-text-primary">{item.name}</h3>
                      </div>

                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/50">
                        <span className="text-sm font-mono font-bold text-text-primary">{getCurrency()}{item.price.toFixed(2)}</span>
                        {item.is_available ? (
                          <button 
                            onClick={() => setSelectedItemForModal(item)}
                            className="px-3.5 py-1.5 bg-brand-primary hover:bg-brand-primary-dark text-white font-bold rounded text-xs transition shadow-sm"
                          >
                            + Add
                          </button>
                        ) : (
                          <span className="text-[10px] text-status-error font-semibold uppercase">Out of Stock</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
            </div>

          </div>
        )}

        {/* STEP 3: LIVE TRACKING */}
        {activeStep === "tracking" && activeOrder && (
          <div className="max-w-xl mx-auto space-y-6">
            
            {/* Header / Info box */}
            <div className="p-6 rounded border text-center bg-bg-surface border-border shadow-sm">
              <div className="flex justify-center mb-3">
                <div className="p-2.5 bg-green-50 text-status-success rounded-full border border-green-100">
                  <CheckCircle2 size={28} />
                </div>
              </div>
              <h2 className="font-bold text-lg text-text-primary">Order Submitted Successfully</h2>
              <p className="text-xs text-text-secondary mt-1">Order details have been routed to station kitchen displays.</p>
              
              <div className="mt-4 inline-flex items-center gap-2 bg-bg-page border border-border px-3 py-1 rounded text-xs">
                <span className={`w-2 h-2 rounded-full ${wsConnected ? "bg-status-success" : "bg-status-error"}`} />
                <span className="font-mono text-[10px] text-text-secondary uppercase">
                  WS: {wsConnected ? "Connected (Live updates)" : "Connecting..."}
                </span>
              </div>
            </div>

            {/* Order Items Breakdown */}
            <div className="p-6 rounded border bg-bg-surface border-border shadow-sm">
              <div className="flex justify-between items-center mb-4 pb-2 border-b border-border">
                <h3 className="font-bold text-xs uppercase tracking-wider text-text-secondary">Summary</h3>
                <span className="font-mono font-bold text-xs text-text-primary">
                  Order ID: #{activeOrder.id}
                </span>
              </div>

              <div className="divide-y divide-border">
                {activeOrder.items.map((item) => (
                  <div key={item.id} className="py-3 flex justify-between items-center gap-4">
                    <div className="flex items-start gap-3">
                      <span className="font-mono font-bold text-xs text-text-primary">{item.qty}x</span>
                      <div>
                        <h4 className="font-bold text-xs text-text-primary">{item.menu_item.name}</h4>
                        <span className="text-[9px] text-text-secondary font-mono uppercase">
                          {item.menu_item.category?.station}
                        </span>
                        {item.notes && <p className="text-[10px] text-text-secondary mt-0.5 italic">"{item.notes}"</p>}
                      </div>
                    </div>
                    <span 
                      className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded uppercase ${getStatusBadgeStyle(item.item_status)}`}
                    >
                      {item.item_status}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-6 pt-4 border-t border-border flex justify-between items-center font-mono">
                <span className="text-text-secondary text-xs">Grand Total</span>
                <span className="text-lg font-bold text-brand-primary">{getCurrency()}{activeOrder.total.toFixed(2)}</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              {activeOrder.status !== "paid" && (
                <button 
                  onClick={async () => {
                    const confirmPayment = window.confirm("Settle this order at counter?");
                    if (confirmPayment) {
                      await fetch(`${API_BASE}/orders/${activeOrder.id}/payments`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ method: "cash", amount: activeOrder.total })
                      });
                      fetchOrderDetails(activeOrder.id);
                    }
                  }}
                  className="flex-1 py-3 bg-bg-surface border border-border hover:bg-bg-surface-alt text-text-primary font-bold rounded transition text-xs font-mono uppercase"
                >
                  Simulate Cash Settle
                </button>
              )}
            </div>

          </div>
        )}

      </main>

      {/* Cart Drawer Modal */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div 
            onClick={() => setIsCartOpen(false)}
            className="absolute inset-0 bg-text-primary/30"
          />
          
          <div className="relative w-full max-w-md h-full flex flex-col shadow-xl border-l border-border bg-bg-surface animate-slide-up">
            
            <div className="p-4 border-b border-border flex justify-between items-center">
              <div className="flex items-center gap-2">
                <ShoppingBag size={18} className="text-brand-primary" />
                <h3 className="font-bold text-sm text-text-primary uppercase">Your Basket</h3>
              </div>
              <button 
                onClick={() => setIsCartOpen(false)}
                className="p-1 rounded bg-bg-surface-alt text-text-secondary hover:text-text-primary border border-border"
              >
                <X size={16} />
              </button>
            </div>

            {/* Cart Items List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {cart.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-text-tertiary gap-2">
                  <ShoppingBag size={32} />
                  <p className="font-bold text-xs uppercase">Your cart is empty</p>
                </div>
              ) : (
                cart.map((item, index) => (
                  <div key={index} className="p-3.5 rounded border border-border bg-bg-page flex justify-between items-start gap-4">
                    <div className="flex-1">
                      <h4 className="font-bold text-xs text-text-primary">{item.menuItem.name}</h4>
                      <p className="text-brand-primary font-mono font-bold text-xs mt-0.5">{getCurrency()}{(item.menuItem.price * item.qty).toFixed(2)}</p>
                      {item.modifiers && <p className="text-[10px] text-text-secondary mt-1">Options: {item.modifiers}</p>}
                      {item.notes && <p className="text-[10px] text-text-tertiary mt-0.5 italic">Note: "{item.notes}"</p>}
                    </div>

                    <div className="flex flex-col items-end gap-3">
                      <button 
                        onClick={() => removeFromCart(index)}
                        className="text-text-tertiary hover:text-status-error transition"
                      >
                        <Trash2 size={14} />
                      </button>
                      <div className="flex items-center gap-2 bg-bg-surface rounded p-1 border border-border">
                        <button 
                          onClick={() => updateCartQty(index, item.qty - 1)}
                          className="w-5 h-5 flex items-center justify-center text-text-secondary hover:text-text-primary font-bold text-sm"
                        >
                          -
                        </button>
                        <span className="text-xs font-mono font-bold w-4 text-center">{item.qty}</span>
                        <button 
                          onClick={() => updateCartQty(index, item.qty + 1)}
                          className="w-5 h-5 flex items-center justify-center text-text-secondary hover:text-text-primary font-bold text-sm"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Total & Checkout */}
            {cart.length > 0 && (
              <div className="p-4 border-t border-border bg-bg-surface-alt space-y-4">
                <div className="flex justify-between items-center text-xs font-mono">
                  <span className="text-text-secondary">Subtotal</span>
                  <span className="text-text-primary font-bold">{getCurrency()}{getCartTotal().toFixed(2)}</span>
                </div>
                {getTaxRate() > 0 && (
                  <div className="flex justify-between items-center text-[10px] text-text-secondary font-mono">
                    <span>Tax ({(getTaxRate() * 100).toFixed(0)}%)</span>
                    <span>{getCurrency()}{(getCartTotal() * getTaxRate()).toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center border-t border-border pt-2 font-mono">
                  <span className="text-text-primary font-bold text-xs">Total</span>
                  <span className="text-base font-bold text-brand-primary">
                    {getCurrency()}{(getCartTotal() + getCartTotal() * getTaxRate()).toFixed(2)}
                  </span>
                </div>
                <button 
                  onClick={() => setIsCheckoutOpen(true)}
                  className="w-full py-3.5 bg-brand-primary hover:bg-brand-primary-dark text-white rounded font-bold shadow text-xs uppercase tracking-wider"
                >
                  Proceed to Checkout
                </button>
              </div>
            )}

          </div>
        </div>
      )}

      {/* Checkout Modal Dialog */}
      {isCheckoutOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-text-primary/30" onClick={() => setIsCheckoutOpen(false)} />
          
          <div className="relative w-full max-w-md rounded border p-6 shadow-xl bg-bg-surface border-border animate-slide-up">
            <h3 className="font-bold text-sm uppercase tracking-wider text-text-primary mb-4">Checkout Details</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-text-secondary uppercase tracking-wider mb-2">Customer Details (Optional)</label>
                <div className="space-y-2">
                  <input 
                    type="text" 
                    placeholder="Your Name"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full p-2.5 bg-bg-page border border-border rounded focus:border-brand-primary focus:outline-none text-xs text-text-primary"
                  />
                  <input 
                    type="text" 
                    placeholder="Phone Number"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className="w-full p-2.5 bg-bg-page border border-border rounded focus:border-brand-primary focus:outline-none text-xs text-text-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-text-secondary uppercase tracking-wider mb-2">Payment Method</label>
                <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={() => setPaymentMethod("online")}
                    className={`p-3 rounded border flex flex-col items-center justify-center gap-1 transition ${paymentMethod === "online" ? "border-brand-primary bg-brand-primary-tint text-brand-primary font-bold" : "border-border bg-bg-page text-text-secondary hover:bg-bg-surface-alt"}`}
                  >
                    <CreditCard size={18} />
                    <span className="text-xs uppercase">Pay Online</span>
                  </button>
                  <button 
                    onClick={() => setPaymentMethod("counter")}
                    className={`p-3 rounded border flex flex-col items-center justify-center gap-1 transition ${paymentMethod === "counter" ? "border-brand-primary bg-brand-primary-tint text-brand-primary font-bold" : "border-border bg-bg-page text-text-secondary hover:bg-bg-surface-alt"}`}
                  >
                    <DollarSign size={18} />
                    <span className="text-xs uppercase">Pay at Counter</span>
                  </button>
                </div>
              </div>

              <div className="pt-4 border-t border-border flex justify-between items-center">
                <div className="font-mono">
                  <span className="text-[10px] text-text-secondary block">Grand Total</span>
                  <span className="text-sm font-bold text-brand-primary">
                    {getCurrency()}{(getCartTotal() + getCartTotal() * getTaxRate()).toFixed(2)}
                  </span>
                </div>

                <div className="flex gap-2">
                  <button 
                    onClick={() => setIsCheckoutOpen(false)}
                    className="px-3.5 py-2 rounded border border-border hover:bg-bg-surface-alt text-text-secondary text-xs font-bold uppercase"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleCheckout}
                    className="px-4 py-2 bg-brand-primary hover:bg-brand-primary-dark text-white rounded font-bold text-xs uppercase"
                  >
                    Order
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Item Detail / Modifier Selection Modal */}
      {selectedItemForModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-text-primary/30" onClick={() => setSelectedItemForModal(null)} />
          
          <div className="relative w-full max-w-md rounded border p-6 shadow-xl bg-bg-surface border-border animate-slide-up">
            <div className="flex justify-between items-start gap-4 mb-4">
              <div>
                <span className="text-[10px] font-bold tracking-wider uppercase text-text-secondary block">
                  {selectedItemForModal.category?.name}
                </span>
                <h3 className="text-sm font-bold text-text-primary mt-0.5">{selectedItemForModal.name}</h3>
                <span className="text-sm font-mono font-bold text-brand-primary mt-1 block">{getCurrency()}{selectedItemForModal.price.toFixed(2)}</span>
              </div>
              <button 
                onClick={() => setSelectedItemForModal(null)}
                className="p-1 rounded bg-bg-surface-alt text-text-secondary hover:text-text-primary border border-border"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-text-secondary uppercase tracking-wider mb-2">Options / Size</label>
                <input 
                  type="text" 
                  placeholder="e.g. Extra Spicy, Medium Size, No Onions"
                  value={modalModifiers}
                  onChange={(e) => setModalModifiers(e.target.value)}
                  className="w-full p-2.5 bg-bg-page border border-border rounded focus:border-brand-primary focus:outline-none text-xs text-text-primary"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-text-secondary uppercase tracking-wider mb-2">Special Instructions</label>
                <textarea 
                  placeholder="Tell our chefs details about allergies or preparation preferences..."
                  value={modalNotes}
                  onChange={(e) => setModalNotes(e.target.value)}
                  rows={2}
                  className="w-full p-2.5 bg-bg-page border border-border rounded focus:border-brand-primary focus:outline-none text-xs text-text-primary resize-none"
                />
              </div>

              <div className="pt-4 border-t border-border flex justify-between items-center">
                <div className="flex items-center gap-3 bg-bg-page border border-border rounded p-1">
                  <button 
                    onClick={() => setModalQty(q => Math.max(1, q - 1))}
                    className="w-6 h-6 flex items-center justify-center text-text-secondary hover:text-text-primary font-bold"
                  >
                    -
                  </button>
                  <span className="font-mono font-bold w-4 text-center text-xs">{modalQty}</span>
                  <button 
                    onClick={() => setModalQty(q => q + 1)}
                    className="w-6 h-6 flex items-center justify-center text-text-secondary hover:text-text-primary font-bold"
                  >
                    +
                  </button>
                </div>

                <button 
                  onClick={addToCart}
                  className="px-4 py-2.5 bg-brand-primary hover:bg-brand-primary-dark text-white rounded font-bold text-xs uppercase"
                >
                  Add - {getCurrency()}{(selectedItemForModal.price * modalQty).toFixed(2)}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
