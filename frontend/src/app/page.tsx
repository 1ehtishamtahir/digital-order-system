"use client";

import React, { useState, useEffect, useRef } from "react";
import { 
  ShoppingBag, Trash2, Clock, CheckCircle2, AlertTriangle, 
  MapPin, Coffee, Utensils, Moon, Sun, Globe, User, Phone,
  CreditCard, DollarSign, ChevronRight, Check, X, ShieldAlert,
  ChefHat, Beer, Flame, RefreshCw
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
  
  // Dark mode
  const [darkMode, setDarkMode] = useState(true);
  const socketRef = useRef<WebSocket | null>(null);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1";
  const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || "ws://127.0.0.1:8000/ws";

  useEffect(() => {
    // Check URL parameters for table token
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

  // Web socket connection for order tracking
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
    console.log(`Connecting to WebSocket: ${wsUrl}`);
    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
      console.log("WebSocket connected");
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      console.log("Received WebSocket event:", data);
      
      // Update order status or order item status
      if (data.event === "order_updated" && data.order_id === orderId) {
        setActiveOrder(prev => prev ? { ...prev, status: data.status } : null);
      } else if (data.event === "order_item_updated" && data.order_id === orderId) {
        // Fetch fresh order details from REST to get full state
        fetchOrderDetails(orderId);
      } else if (data.event === "payment_completed" && data.order_id === orderId) {
        setActiveOrder(prev => prev ? { ...prev, status: data.status } : null);
      }
    };

    ws.onclose = () => {
      setWsConnected(false);
      console.log("WebSocket disconnected. Reconnecting in 3s...");
      setTimeout(() => {
        if (activeOrder) connectWebSocket(orderId);
      }, 3000);
    };
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch(`${API_BASE}/settings`);
      if (res.ok) {
        const data = await res.json();
        setBusinessSettings(data);
      }
    } catch (err) {
      console.error("Error fetching settings", err);
    }
  };

  const fetchTables = async () => {
    try {
      const res = await fetch(`${API_BASE}/tables`);
      if (res.ok) {
        const data = await res.json();
        setTables(data);
      }
    } catch (err) {
      console.error("Error fetching tables", err);
    }
  };

  const fetchMenu = async () => {
    try {
      const catRes = await fetch(`${API_BASE}/menu/categories`);
      const itemRes = await fetch(`${API_BASE}/menu/items`);
      if (catRes.ok && itemRes.ok) {
        const cats = await catRes.json();
        const items = await itemRes.json();
        setCategories(cats);
        setMenuItems(items);
      }
    } catch (err) {
      console.error("Error fetching menu", err);
    }
  };

  const fetchOrderDetails = async (orderId: number) => {
    try {
      const res = await fetch(`${API_BASE}/orders/${orderId}`);
      if (res.ok) {
        const data = await res.json();
        setActiveOrder(data);
      }
    } catch (err) {
      console.error("Error fetching order details", err);
    }
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
    } catch (err) {
      console.error("Error resolving table token", err);
    }
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

  const getCurrency = () => businessSettings?.currency || "$";
  const getTaxRate = () => businessSettings?.tax_rate || 0.0;

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    
    const orderItems = cart.map(item => ({
      menu_item_id: item.menuItem.id,
      qty: item.qty,
      modifiers: item.modifiers || null,
      notes: item.notes || null
    }));

    // Calculate total including tax rate
    const subtotal = getCartTotal();
    const tax = subtotal * getTaxRate();
    const finalTotal = subtotal + tax;

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
      
      // If paying online, process simulated payment
      if (paymentMethod === "online") {
        await fetch(`${API_BASE}/orders/${orderData.id}/payments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ method: "online", amount: orderData.total })
        });
      }

      // Refresh items
      fetchMenu();

      // Set order and move to tracking
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case "placed": return "bg-blue-500/20 text-blue-400 border border-blue-500/30";
      case "preparing": return "bg-amber-500/20 text-amber-400 border border-amber-500/30";
      case "ready": return "bg-green-500/20 text-green-400 border border-green-500/30";
      case "served": return "bg-teal-500/20 text-teal-400 border border-teal-500/30";
      case "paid": return "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30";
      default: return "bg-gray-500/20 text-gray-400 border border-gray-500/30";
    }
  };

  const getItemStatusColor = (status: string) => {
    switch (status) {
      case "pending": return "text-gray-400 bg-gray-500/10";
      case "preparing": return "text-amber-400 bg-amber-500/10 animate-pulse";
      case "ready": return "text-green-400 bg-green-500/10";
      case "served": return "text-teal-400 bg-teal-500/10";
      default: return "text-gray-400 bg-gray-500/10";
    }
  };

  const getStationIcon = (station: string) => {
    switch (station) {
      case "kitchen": return <Flame size={16} className="text-amber-500" />;
      case "bar": return <Beer size={16} className="text-blue-500" />;
      case "tandoor": return <ChefHat size={16} className="text-orange-500" />;
      default: return <Utensils size={16} className="text-gray-500" />;
    }
  };

  const getProgressPercentage = (status: string) => {
    switch (status) {
      case "placed": return 20;
      case "preparing": return 50;
      case "ready": return 75;
      case "served": return 90;
      case "paid": return 100;
      default: return 0;
    }
  };

  return (
    <div className={`min-h-screen transition-colors duration-300 animate-fade-in ${darkMode ? "bg-slate-950 text-slate-100" : "bg-slate-50 text-slate-800"}`}>
      
      {/* Header bar */}

      <header className={`sticky top-0 z-40 backdrop-blur-md border-b transition-colors ${darkMode ? "bg-slate-950/80 border-slate-800" : "bg-white/80 border-slate-200"}`}>
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {businessSettings?.logo_url ? (
              <img src={businessSettings.logo_url} alt="Logo" className="w-10 h-10 object-cover rounded-xl shadow-lg border border-slate-700" />
            ) : (
              <div className="p-2 bg-gradient-to-tr from-amber-500 to-rose-500 rounded-xl text-white shadow-lg">
                <Utensils size={24} />
              </div>
            )}
            <div>
              <h1 className="font-bold text-lg tracking-tight bg-gradient-to-r from-amber-500 to-rose-500 bg-clip-text text-transparent">
                {businessSettings?.name || "Digital Order System"}
              </h1>
              {selectedTable && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-500/20 text-amber-500 border border-amber-500/30">
                  {selectedTable.label}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Dark mode toggle */}
            <button 
              onClick={() => setDarkMode(!darkMode)}
              className={`p-2 rounded-lg border transition-all ${darkMode ? "border-slate-800 hover:bg-slate-900" : "border-slate-200 hover:bg-slate-100"}`}
            >
              {darkMode ? <Sun size={18} className="text-amber-500" /> : <Moon size={18} className="text-slate-500" />}
            </button>

            {activeStep === "menu" && (
              <button 
                onClick={() => setIsCartOpen(true)}
                className="relative px-4 py-2 bg-gradient-to-r from-amber-500 to-rose-500 hover:opacity-90 text-white rounded-lg font-semibold flex items-center gap-2 shadow-lg transition-transform hover:scale-105 active:scale-95"
              >
                <ShoppingBag size={18} />
                <span>Cart ({cart.length})</span>
                {cart.length > 0 && (
                  <span className="absolute -top-2 -right-2 w-5 h-5 bg-rose-600 rounded-full flex items-center justify-center text-xs font-bold shadow-md border border-white">
                    {cart.reduce((sum, item) => sum + item.qty, 0)}
                  </span>
                )}
              </button>
            )}

            {activeStep === "tracking" && (
              <button 
                onClick={() => setActiveStep("menu")}
                className={`px-4 py-2 rounded-lg font-semibold border transition-all ${darkMode ? "border-slate-800 hover:bg-slate-900 text-slate-300" : "border-slate-200 hover:bg-slate-100 text-slate-600"}`}
              >
                Browse Menu
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-6xl mx-auto px-4 py-6">

        {/* STEP 1: WELCOME SCREEN */}
        {activeStep === "welcome" && (
          <div className="max-w-md mx-auto my-12 text-center p-8 rounded-2xl border bg-gradient-to-b from-slate-900/40 to-slate-900/10 backdrop-blur border-slate-800/80 shadow-2xl animate-slide-up">
            <h2 className="text-3xl font-extrabold mb-2 tracking-tight">Welcome to {businessSettings?.name || "DineIn"}!</h2>
            {businessSettings?.address && <p className="text-xs text-slate-400 mb-2">{businessSettings.address}</p>}
            <p className="text-slate-400 mb-8 text-sm">Scan the QR code on your table to view our menu and order instantly, or select your table below to preview.</p>

            <div className="text-left space-y-6">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Select Your Table</label>
                <select 
                  onChange={(e) => handleSelectTableManual(e.target.value)}
                  className="w-full p-3 bg-slate-900 border border-slate-800 rounded-xl focus:border-amber-500 focus:outline-none text-slate-200 font-medium"
                >
                  <option value="">-- Click to Select Table --</option>
                  {tables.map(t => (
                    <option key={t.id} value={t.id}>{t.label} ({t.status === "occupied" ? "Occupied" : "Free"})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Select Dining Preference</label>
                <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={() => setOrderType("dine-in")}
                    className={`p-4 rounded-xl border flex flex-col items-center justify-center gap-2 transition-all ${orderType === "dine-in" ? "border-amber-500 bg-amber-500/10 text-amber-500 font-semibold" : "border-slate-800 bg-slate-900/50 hover:bg-slate-900"}`}
                  >
                    <Utensils size={24} />
                    <span>Dine-in</span>
                  </button>
                  <button 
                    onClick={() => setOrderType("takeaway")}
                    className={`p-4 rounded-xl border flex flex-col items-center justify-center gap-2 transition-all ${orderType === "takeaway" ? "border-amber-500 bg-amber-500/10 text-amber-500 font-semibold" : "border-slate-800 bg-slate-900/50 hover:bg-slate-900"}`}
                  >
                    <ShoppingBag size={24} />
                    <span>Takeaway</span>
                  </button>
                </div>
              </div>

              <div className="pt-2">
                <button 
                  onClick={() => setActiveStep("menu")}
                  disabled={orderType === "dine-in" && !selectedTable}
                  className="w-full py-4 bg-gradient-to-r from-amber-500 to-rose-500 disabled:from-slate-800 disabled:to-slate-800 text-white rounded-xl font-bold shadow-lg hover:opacity-95 transition-opacity disabled:cursor-not-allowed"
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
            <div className={`p-4 rounded-2xl border flex items-center justify-between ${darkMode ? "bg-slate-900/40 border-slate-800" : "bg-white border-slate-200"}`}>
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-500">
                  {orderType === "dine-in" ? <Utensils size={20} /> : <ShoppingBag size={20} />}
                </div>
                <div>
                  <h3 className="font-semibold text-sm">
                    {orderType === "dine-in" ? `Dining at ${selectedTable?.label || "Table"}` : "Takeaway Order"}
                  </h3>
                  <p className="text-xs text-slate-400">Add items to your cart, customize modifers, and place your order live.</p>
                </div>
              </div>
              <button 
                onClick={() => setActiveStep("welcome")}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-800 hover:bg-slate-900 text-slate-400 transition"
              >
                Change
              </button>
            </div>

            {/* Categories filter */}
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
              <button 
                onClick={() => setSelectedCategory("All")}
                className={`px-4 py-2.5 rounded-xl text-sm font-semibold border whitespace-nowrap transition-all ${selectedCategory === "All" ? "border-amber-500 bg-amber-500/10 text-amber-500" : "border-slate-800 bg-slate-900/50 text-slate-400 hover:bg-slate-900"}`}
              >
                All Items
              </button>
              {categories.map(cat => (
                <button 
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.name)}
                  className={`px-4 py-2.5 rounded-xl text-sm font-semibold border whitespace-nowrap transition-all ${selectedCategory === cat.name ? "border-amber-500 bg-amber-500/10 text-amber-500" : "border-slate-800 bg-slate-900/50 text-slate-400 hover:bg-slate-900"}`}
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
                    className={`group rounded-2xl border transition-all duration-300 hover:shadow-xl hover:scale-[1.02] hover:-translate-y-0.5 ${darkMode ? "bg-slate-900/40 border-slate-800 hover:border-slate-700" : "bg-white border-slate-200"}`}
                  >
                    <div className="p-5 flex flex-col justify-between h-full gap-4">
                      <div className="flex justify-between items-start gap-4">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                              {item.category?.name}
                            </span>
                            {item.category?.station && (
                              <span className="flex items-center gap-1 text-[10px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                                {getStationIcon(item.category.station)}
                                <span className="capitalize">{item.category.station}</span>
                              </span>
                            )}
                          </div>
                          <h3 className="font-bold text-lg leading-snug group-hover:text-amber-500 transition-colors">{item.name}</h3>
                          <div className="mt-1 flex items-center gap-2">
                            <span className="text-xl font-extrabold text-amber-500">{getCurrency()}{item.price.toFixed(2)}</span>
                            {item.inventory && (
                              <span className={`text-xs px-2 py-0.5 rounded ${item.inventory.stock_qty <= 5 ? "bg-red-500/10 text-red-400 border border-red-500/20" : "bg-slate-800 text-slate-400"}`}>
                                Stock: {item.inventory.stock_qty}
                              </span>
                            )}
                          </div>
                        </div>
                        {item.image_url ? (
                          <img 
                            src={item.image_url} 
                            alt={item.name} 
                            className="w-20 h-20 object-cover rounded-xl shadow-md"
                          />
                        ) : (
                          <div className="w-20 h-20 bg-slate-800/50 rounded-xl border border-slate-800/80 flex items-center justify-center text-slate-600">
                            <Coffee size={32} />
                          </div>
                        )}
                      </div>

                      <div>
                        {item.is_available ? (
                          <button 
                            onClick={() => setSelectedItemForModal(item)}
                            className="w-full py-2.5 bg-slate-800 hover:bg-amber-500 hover:text-slate-950 font-bold rounded-xl text-sm transition-all shadow-sm flex items-center justify-center gap-2"
                          >
                            <span>Add to Cart</span>
                            <ChevronRight size={16} />
                          </button>
                        ) : (
                          <div className="w-full py-2.5 bg-red-500/10 border border-red-500/20 text-red-500 font-bold rounded-xl text-center text-xs flex items-center justify-center gap-1">
                            <AlertTriangle size={14} />
                            <span>Out of Stock</span>
                          </div>
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
          <div className="max-w-2xl mx-auto space-y-6">
            
            {/* Header / Info box */}
            <div className={`p-6 rounded-2xl border text-center animate-slide-up ${darkMode ? "bg-slate-900/40 border-slate-800" : "bg-white border-slate-200"}`}>
              <div className="flex justify-center mb-3">
                <div className="p-3 bg-green-500/10 text-green-500 rounded-full animate-bounce">
                  <CheckCircle2 size={36} />
                </div>
              </div>
              <h2 className="text-2xl font-bold tracking-tight">Order Placed Successfully!</h2>
              <p className="text-sm text-slate-400 mt-1">Thank you! Your order is being processed dynamically.</p>
              
              <div className="mt-4 inline-flex items-center gap-2 bg-slate-800/60 border border-slate-800 px-4 py-1.5 rounded-full text-xs font-semibold">
                <span className={`w-2 h-2 rounded-full ${wsConnected ? "bg-green-500" : "bg-red-500 animate-ping"}`} />
                <span>Live Feed: {wsConnected ? "Connected" : "Reconnecting"}</span>
              </div>
            </div>

            {/* Realtime progress tracker */}
            <div className={`p-6 rounded-2xl border ${darkMode ? "bg-slate-900/40 border-slate-800" : "bg-white border-slate-200"}`}>
              <div className="flex justify-between items-center mb-4">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Order ID: #{activeOrder.id}</span>
                <span className={`text-xs font-bold uppercase px-3 py-1 rounded-full ${getStatusColor(activeOrder.status)}`}>
                  {activeOrder.status}
                </span>
              </div>

              {/* Progress bar */}
              <div className="relative w-full h-2 bg-slate-800 rounded-full mb-8 overflow-hidden">
                <div 
                  className="absolute h-full bg-gradient-to-r from-amber-500 to-rose-500 transition-all duration-500"
                  style={{ width: `${getProgressPercentage(activeOrder.status)}%` }}
                />
              </div>

              {/* Status checklist */}
              <div className="relative pl-6 border-l border-slate-800 space-y-6">
                {[
                  { key: "placed", title: "Order Placed", desc: "Sent to preparation station" },
                  { key: "preparing", title: "Preparing", desc: "Chef is preparing your food" },
                  { key: "ready", title: "Ready for Pickup", desc: "Collect from station or server bringing it" },
                  { key: "served", title: "Served", desc: "Food delivered to your table" },
                  { key: "paid", title: "Paid", desc: "Transaction completed, thank you!" }
                ].map((step, idx) => {
                  const statuses = ["placed", "preparing", "ready", "served", "paid"];
                  const activeIdx = statuses.indexOf(activeOrder.status);
                  const stepIdx = statuses.indexOf(step.key);
                  const isCompleted = stepIdx <= activeIdx;
                  const isActive = step.key === activeOrder.status;

                  return (
                    <div key={step.key} className="relative">
                      {/* Circle icon */}
                      <span className={`absolute -left-10 top-0.5 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all border ${isCompleted ? "bg-gradient-to-tr from-amber-500 to-rose-500 text-white border-transparent" : "bg-slate-950 text-slate-500 border-slate-800"}`}>
                        {isCompleted ? <Check size={14} /> : idx + 1}
                      </span>
                      <div className="pl-2">
                        <h4 className={`font-semibold text-sm ${isActive ? "text-amber-500 font-bold" : isCompleted ? "text-slate-200" : "text-slate-500"}`}>
                          {step.title}
                        </h4>
                        <p className="text-xs text-slate-400">{step.desc}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Order Items & preparation statuses */}
            <div className={`p-6 rounded-2xl border ${darkMode ? "bg-slate-900/40 border-slate-800" : "bg-white border-slate-200"}`}>
              <h3 className="font-bold text-sm uppercase tracking-wider text-slate-400 mb-4">Item Status Breakdown</h3>
              <div className="divide-y divide-slate-800">
                {activeOrder.items.map((item) => (
                  <div key={item.id} className="py-3.5 flex justify-between items-center gap-4">
                    <div className="flex items-start gap-3">
                      <span className="font-bold text-amber-500 text-sm">{item.qty}x</span>
                      <div>
                        <h4 className="font-semibold text-sm">{item.menu_item.name}</h4>
                        <span className="flex items-center gap-1 text-[10px] text-slate-400 uppercase tracking-wide mt-0.5">
                          {getStationIcon(item.menu_item.category?.station || "")}
                          <span>{item.menu_item.category?.station} Station</span>
                        </span>
                        {item.notes && <p className="text-xs text-slate-500 mt-1 italic">Note: "{item.notes}"</p>}
                      </div>
                    </div>
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded uppercase tracking-wider ${getItemStatusColor(item.item_status)}`}>
                      {item.item_status}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-6 pt-4 border-t border-slate-800 flex justify-between items-center">
                <span className="text-slate-400 text-sm font-semibold">Total Amount</span>
                <span className="text-2xl font-extrabold text-amber-500">{getCurrency()}{activeOrder.total.toFixed(2)}</span>
              </div>
              {businessSettings?.receipt_footer && (
                <p className="text-center text-xs text-slate-500 mt-4 border-t border-slate-800 pt-3 italic">
                  "{businessSettings.receipt_footer}"
                </p>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              {activeOrder.status !== "paid" && (
                <button 
                  onClick={async () => {
                    const confirmPayment = window.confirm("Do you want to simulate paying bill at counter?");
                    if (confirmPayment) {
                      await fetch(`${API_BASE}/orders/${activeOrder.id}/payments`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ method: "cash", amount: activeOrder.total })
                      });
                      fetchOrderDetails(activeOrder.id);
                    }
                  }}
                  className="flex-1 py-4 bg-indigo-650 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg transition flex items-center justify-center gap-2"
                >
                  <DollarSign size={18} />
                  <span>Simulate Bill Settlement</span>
                </button>
              )}
            </div>

          </div>
        )}

      </main>

      {/* Cart Drawer Modal */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div 
            onClick={() => setIsCartOpen(false)}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          
          {/* Content */}
          <div className={`relative w-full max-w-md h-full flex flex-col shadow-2xl border-l transition-transform animate-slide-up ${darkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}>
            
            <div className="p-4 border-b border-slate-800 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <ShoppingBag size={20} className="text-amber-500" />
                <h3 className="font-extrabold text-lg">Your Cart</h3>
              </div>
              <button 
                onClick={() => setIsCartOpen(false)}
                className="p-1 rounded bg-slate-800 text-slate-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            {/* Cart Items List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {cart.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-2">
                  <ShoppingBag size={48} />
                  <p className="font-semibold text-sm">Your cart is empty</p>
                  <p className="text-xs text-slate-400">Add delicious items to place order</p>
                </div>
              ) : (
                cart.map((item, index) => (
                  <div key={index} className="p-3.5 rounded-xl border border-slate-800 bg-slate-950/40 flex justify-between items-start gap-4">
                    <div className="flex-1">
                      <h4 className="font-semibold text-sm">{item.menuItem.name}</h4>
                      <p className="text-amber-500 font-extrabold text-sm mt-0.5">{getCurrency()}{(item.menuItem.price * item.qty).toFixed(2)}</p>
                      {item.modifiers && <p className="text-xs text-slate-400 mt-1">Options: {item.modifiers}</p>}
                      {item.notes && <p className="text-xs text-slate-500 mt-0.5 italic">Note: "{item.notes}"</p>}
                    </div>

                    <div className="flex flex-col items-end gap-3">
                      <button 
                        onClick={() => removeFromCart(index)}
                        className="text-slate-500 hover:text-red-500"
                      >
                        <Trash2 size={16} />
                      </button>
                      <div className="flex items-center gap-2 bg-slate-800 rounded-lg p-1">
                        <button 
                          onClick={() => updateCartQty(index, item.qty - 1)}
                          className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-white font-bold"
                        >
                          -
                        </button>
                        <span className="text-xs font-bold w-4 text-center">{item.qty}</span>
                        <button 
                          onClick={() => updateCartQty(index, item.qty + 1)}
                          className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-white font-bold"
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
              <div className="p-4 border-t border-slate-800 bg-slate-950/60 space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-sm font-medium">Subtotal</span>
                  <span className="text-xl font-black text-slate-200">{getCurrency()}{getCartTotal().toFixed(2)}</span>
                </div>
                {getTaxRate() > 0 && (
                  <div className="flex justify-between items-center text-xs text-slate-400">
                    <span>Tax ({(getTaxRate() * 100).toFixed(0)}%)</span>
                    <span>{getCurrency()}{(getCartTotal() * getTaxRate()).toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center border-t border-slate-800 pt-2">
                  <span className="text-slate-300 font-bold text-sm">Grand Total</span>
                  <span className="text-2xl font-black text-amber-500">
                    {getCurrency()}{(getCartTotal() + getCartTotal() * getTaxRate()).toFixed(2)}
                  </span>
                </div>
                <button 
                  onClick={() => setIsCheckoutOpen(true)}
                  className="w-full py-4 bg-gradient-to-r from-amber-500 to-rose-500 text-white rounded-xl font-bold shadow-lg hover:opacity-95 transition"
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
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setIsCheckoutOpen(false)} />
          
          <div className={`relative w-full max-w-md rounded-2xl border p-6 shadow-2xl transition-colors animate-slide-up ${darkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}>
            <h3 className="text-xl font-extrabold mb-4 tracking-tight">Checkout Order</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Customer Details (Optional)</label>
                <div className="space-y-2">
                  <div className="relative">
                    <User size={16} className="absolute left-3 top-3.5 text-slate-500" />
                    <input 
                      type="text" 
                      placeholder="Your Name"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className="w-full p-3 pl-10 bg-slate-950 border border-slate-800 rounded-xl focus:border-amber-500 focus:outline-none text-slate-200 font-medium"
                    />
                  </div>
                  <div className="relative">
                    <Phone size={16} className="absolute left-3 top-3.5 text-slate-500" />
                    <input 
                      type="text" 
                      placeholder="Phone Number"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      className="w-full p-3 pl-10 bg-slate-950 border border-slate-800 rounded-xl focus:border-amber-500 focus:outline-none text-slate-200 font-medium"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Payment Method</label>
                <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={() => setPaymentMethod("online")}
                    className={`p-4 rounded-xl border flex flex-col items-center justify-center gap-2 transition-all ${paymentMethod === "online" ? "border-amber-500 bg-amber-500/10 text-amber-500 font-semibold" : "border-slate-800 bg-slate-950/50 hover:bg-slate-900"}`}
                  >
                    <CreditCard size={20} />
                    <span>Pay Online</span>
                  </button>
                  <button 
                    onClick={() => setPaymentMethod("counter")}
                    className={`p-4 rounded-xl border flex flex-col items-center justify-center gap-2 transition-all ${paymentMethod === "counter" ? "border-amber-500 bg-amber-500/10 text-amber-500 font-semibold" : "border-slate-800 bg-slate-950/50 hover:bg-slate-900"}`}
                  >
                    <DollarSign size={20} />
                    <span>Pay at Counter</span>
                  </button>
                </div>
                <p className="text-[10px] text-slate-500 mt-2">
                  {paymentMethod === "online" 
                    ? "Simulates successful online checkout gateway instantly." 
                    : "Cashier will collect payment and settle order on billing dashboard."}
                </p>
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-between items-center">
                <div>
                  <span className="text-xs text-slate-400 block font-medium">Grand Total</span>
                  <span className="text-xl font-black text-amber-500">
                    {getCurrency()}{(getCartTotal() + getCartTotal() * getTaxRate()).toFixed(2)}
                  </span>
                </div>

                <div className="flex gap-2">
                  <button 
                    onClick={() => setIsCheckoutOpen(false)}
                    className="px-4 py-2.5 rounded-lg border border-slate-800 hover:bg-slate-800 font-semibold text-sm"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleCheckout}
                    className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-rose-500 text-white rounded-lg font-bold shadow-lg text-sm hover:opacity-90 transition"
                  >
                    Place Order
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
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setSelectedItemForModal(null)} />
          
          <div className={`relative w-full max-w-md rounded-2xl border p-6 shadow-2xl transition-colors animate-slide-up ${darkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}>
            <div className="flex justify-between items-start gap-4 mb-4">
              <div>
                <span className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                  {selectedItemForModal.category?.name}
                </span>
                <h3 className="text-xl font-bold mt-1">{selectedItemForModal.name}</h3>
                <span className="text-lg font-extrabold text-amber-500 block mt-1">{getCurrency()}{selectedItemForModal.price.toFixed(2)}</span>
              </div>
              <button 
                onClick={() => setSelectedItemForModal(null)}
                className="p-1 rounded bg-slate-800 text-slate-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Optional Modifiers */}
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Options / Size</label>
                <input 
                  type="text" 
                  placeholder="e.g. Extra Spicy, Medium Size, No Onions"
                  value={modalModifiers}
                  onChange={(e) => setModalModifiers(e.target.value)}
                  className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl focus:border-amber-500 focus:outline-none text-slate-200 font-medium"
                />
              </div>

              {/* Special Instructions */}
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Special Instructions</label>
                <textarea 
                  placeholder="Tell our chefs details about allergies or preparation preferences..."
                  value={modalNotes}
                  onChange={(e) => setModalNotes(e.target.value)}
                  rows={2}
                  className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl focus:border-amber-500 focus:outline-none text-slate-200 font-medium resize-none"
                />
              </div>

              {/* Quantity Selector & Confirm button */}
              <div className="pt-4 border-t border-slate-800 flex justify-between items-center">
                <div className="flex items-center gap-3 bg-slate-800 rounded-xl p-1.5">
                  <button 
                    onClick={() => setModalQty(q => Math.max(1, q - 1))}
                    className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-white font-extrabold text-lg"
                  >
                    -
                  </button>
                  <span className="font-extrabold w-6 text-center">{modalQty}</span>
                  <button 
                    onClick={() => setModalQty(q => q + 1)}
                    className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-white font-extrabold text-lg"
                  >
                    +
                  </button>
                </div>

                <button 
                  onClick={addToCart}
                  className="px-6 py-3 bg-gradient-to-r from-amber-500 to-rose-500 text-white rounded-xl font-bold shadow-lg hover:opacity-95 transition"
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
