from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime

# Token Schemas
class Token(BaseModel):
    access_token: str
    token_type: str
    role: str
    username: str

class TokenData(BaseModel):
    username: Optional[str] = None
    role: Optional[str] = None

# Role Schemas
class RoleBase(BaseModel):
    name: str

class RoleResponse(RoleBase):
    id: int
    class Config:
        from_attributes = True

# User Schemas
class UserCreate(BaseModel):
    username: str
    password: str
    name: str
    phone: Optional[str] = None
    role_id: int

class UserLogin(BaseModel):
    username: str
    password: str

class UserResponse(BaseModel):
    id: int
    username: str
    name: str
    phone: Optional[str] = None
    role: RoleResponse
    created_at: datetime
    class Config:
        from_attributes = True

# Table Schemas
class TableCreate(BaseModel):
    label: str

class TableResponse(BaseModel):
    id: int
    label: str
    qr_token: str
    status: str
    class Config:
        from_attributes = True

# Category Schemas
class CategoryCreate(BaseModel):
    name: str
    station: str  # kitchen, bar, tandoor

class CategoryResponse(CategoryCreate):
    id: int
    class Config:
        from_attributes = True

# Inventory Schemas
class InventoryBase(BaseModel):
    stock_qty: int
    low_stock_threshold: int

class InventoryResponse(InventoryBase):
    id: int
    menu_item_id: int
    class Config:
        from_attributes = True

# MenuItem Schemas
class MenuItemCreate(BaseModel):
    category_id: int
    name: str
    description: Optional[str] = None
    price: float
    is_available: bool = True
    image_url: Optional[str] = None

class MenuItemUpdate(BaseModel):
    category_id: Optional[int] = None
    name: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    is_available: Optional[bool] = None
    image_url: Optional[str] = None

class MenuItemResponse(MenuItemCreate):
    id: int
    description: Optional[str] = None
    category: Optional[CategoryResponse] = None
    inventory: Optional[InventoryResponse] = None
    class Config:
        from_attributes = True

# OrderItem Schemas
class OrderItemCreate(BaseModel):
    menu_item_id: int
    qty: int = 1
    modifiers: Optional[str] = None
    notes: Optional[str] = None

class OrderItemUpdateStatus(BaseModel):
    item_status: str  # pending, preparing, ready, served

class OrderItemResponse(BaseModel):
    id: int
    order_id: int
    menu_item_id: int
    menu_item: MenuItemResponse
    qty: int
    modifiers: Optional[str] = None
    notes: Optional[str] = None
    item_status: str
    class Config:
        from_attributes = True

# Payment Schemas
class PaymentCreate(BaseModel):
    method: str  # online, cash, card
    amount: float

class PaymentResponse(BaseModel):
    id: int
    order_id: int
    method: str
    amount: float
    status: str
    transaction_ref: Optional[str] = None
    created_at: datetime
    class Config:
        from_attributes = True

# Order Schemas
class OrderCreate(BaseModel):
    table_id: Optional[int] = None
    order_type: str = "dine-in"  # dine-in, takeaway
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    items: List[OrderItemCreate]

class OrderUpdateStatus(BaseModel):
    status: str  # placed, preparing, ready, served, paid, cancelled

class OrderResponse(BaseModel):
    id: int
    table_id: Optional[int] = None
    table: Optional[TableResponse] = None
    status: str
    order_type: str
    total: float
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    created_at: datetime
    items: List[OrderItemResponse] = []
    payments: List[PaymentResponse] = []
    class Config:
        from_attributes = True

# Business Settings Schemas
class BusinessSettingsUpdate(BaseModel):
    name: str
    logo_url: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    tax_rate: float
    currency: str
    receipt_footer: Optional[str] = None

class BusinessSettingsResponse(BusinessSettingsUpdate):
    id: int
    updated_at: datetime
    class Config:
        from_attributes = True

