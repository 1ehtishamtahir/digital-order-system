import datetime
from typing import List, Optional
from sqlalchemy import String, Integer, Float, Boolean, DateTime, ForeignKey, Table as SqlTable
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

class Base(DeclarativeBase):
    pass

class Role(Base):
    __tablename__ = "roles"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)

    users: Mapped[List["User"]] = relationship("User", back_populates="role")

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    phone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    role_id: Mapped[int] = mapped_column(ForeignKey("roles.id"), nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, default=datetime.datetime.utcnow)

    role: Mapped["Role"] = relationship("Role", back_populates="users")

class Table(Base):
    __tablename__ = "tables"

    id: Mapped[int] = mapped_column(primary_key=True)
    label: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    qr_token: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="free")  # free, occupied

    orders: Mapped[List["Order"]] = relationship("Order", back_populates="table")

class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    station: Mapped[str] = mapped_column(String(50), nullable=False)  # kitchen, bar, tandoor

    menu_items: Mapped[List["MenuItem"]] = relationship("MenuItem", back_populates="category")

class MenuItem(Base):
    __tablename__ = "menu_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    price: Mapped[float] = mapped_column(Float, nullable=False)
    is_available: Mapped[bool] = mapped_column(Boolean, default=True)
    image_url: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    category: Mapped["Category"] = relationship("Category", back_populates="menu_items")
    order_items: Mapped[List["OrderItem"]] = relationship("OrderItem", back_populates="menu_item")
    inventory: Mapped[Optional["Inventory"]] = relationship("Inventory", back_populates="menu_item", uselist=False)

class Order(Base):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(primary_key=True)
    table_id: Mapped[Optional[int]] = mapped_column(ForeignKey("tables.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="placed")  # placed, preparing, ready, served, paid, cancelled
    order_type: Mapped[str] = mapped_column(String(50), default="dine-in")  # dine-in, takeaway
    total: Mapped[float] = mapped_column(Float, default=0.0)
    customer_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    customer_phone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, default=datetime.datetime.utcnow)

    table: Mapped[Optional["Table"]] = relationship("Table", back_populates="orders")
    items: Mapped[List["OrderItem"]] = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")
    payments: Mapped[List["Payment"]] = relationship("Payment", back_populates="order")

class OrderItem(Base):
    __tablename__ = "order_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), nullable=False)
    menu_item_id: Mapped[int] = mapped_column(ForeignKey("menu_items.id"), nullable=False)
    qty: Mapped[int] = mapped_column(Integer, default=1)
    modifiers: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)  # JSON or simple text
    notes: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    item_status: Mapped[str] = mapped_column(String(50), default="pending")  # pending, preparing, ready, served

    order: Mapped["Order"] = relationship("Order", back_populates="items")
    menu_item: Mapped["MenuItem"] = relationship("MenuItem", back_populates="order_items")

class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), nullable=False)
    method: Mapped[str] = mapped_column(String(50))  # online, cash, card
    amount: Mapped[float] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(50), default="pending")  # pending, completed, failed
    transaction_ref: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, default=datetime.datetime.utcnow)

    order: Mapped["Order"] = relationship("Order", back_populates="payments")

class Inventory(Base):
    __tablename__ = "inventory"

    id: Mapped[int] = mapped_column(primary_key=True)
    menu_item_id: Mapped[int] = mapped_column(ForeignKey("menu_items.id"), unique=True, nullable=False)
    stock_qty: Mapped[int] = mapped_column(Integer, default=0)
    low_stock_threshold: Mapped[int] = mapped_column(Integer, default=5)

    menu_item: Mapped["MenuItem"] = relationship("MenuItem", back_populates="inventory")

class BusinessSettings(Base):
    __tablename__ = "business_settings"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), default="Digital Diner")
    logo_url: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    address: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    tax_rate: Mapped[float] = mapped_column(Float, default=0.0)  # e.g., 0.08 for 8%
    currency: Mapped[str] = mapped_column(String(10), default="$")
    receipt_footer: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

