import os
import uuid
import aiofiles
import logging
from contextlib import asynccontextmanager
from typing import List, Optional
from fastapi import FastAPI, Depends, HTTPException, status, WebSocket, WebSocketDisconnect, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.staticfiles import StaticFiles
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.database import get_db, engine
from app.models import Role, User, Table, Category, MenuItem, Inventory, Order, OrderItem, Payment, Base, BusinessSettings
from app.schemas import (
    UserCreate, UserResponse, Token, TableResponse, TableCreate,
    CategoryResponse, CategoryCreate, MenuItemResponse, MenuItemCreate, MenuItemUpdate,
    OrderResponse, OrderCreate, OrderUpdateStatus, OrderItemUpdateStatus,
    PaymentResponse, PaymentCreate, BusinessSettingsResponse, BusinessSettingsUpdate
)
from app.auth import get_password_hash, verify_password, create_access_token, get_current_user, require_role
from app.ws import manager
import app.services as services

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("digital-order-backend")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize DB tables
    async with engine.begin() as conn:
        # For sqlite, create all tables if they don't exist
        await conn.run_sync(Base.metadata.create_all)
        
    # Seed default data if roles empty
    async with AsyncSession(engine) as session:
        result = await session.execute(select(Role))
        roles = result.scalars().all()
        if not roles:
            logger.info("Seeding initial database content...")
            
            # Roles
            admin_role = Role(name="admin")
            cashier_role = Role(name="cashier")
            kitchen_role = Role(name="kitchen")
            bar_role = Role(name="bar")
            tandoor_role = Role(name="tandoor")
            
            session.add_all([admin_role, cashier_role, kitchen_role, bar_role, tandoor_role])
            await session.flush()
            
            # Users
            admin_user = User(
                username="admin",
                hashed_password=get_password_hash("admin123"),
                name="Admin User",
                role_id=admin_role.id
            )
            cashier_user = User(
                username="cashier",
                hashed_password=get_password_hash("cashier123"),
                name="Cashier User",
                role_id=cashier_role.id
            )
            kitchen_user = User(
                username="kitchen",
                hashed_password=get_password_hash("kitchen123"),
                name="Kitchen Chef",
                role_id=kitchen_role.id
            )
            bar_user = User(
                username="bar",
                hashed_password=get_password_hash("bar123"),
                name="Barman",
                role_id=bar_role.id
            )
            tandoor_user = User(
                username="tandoor",
                hashed_password=get_password_hash("tandoor123"),
                name="Naan Station Chef",
                role_id=tandoor_role.id
            )
            
            session.add_all([admin_user, cashier_user, kitchen_user, bar_user, tandoor_user])
            
            # Tables
            tables = [
                Table(label="Table 1", qr_token="table1-token-xyz1", status="free"),
                Table(label="Table 2", qr_token="table2-token-xyz2", status="free"),
                Table(label="Table 3", qr_token="table3-token-xyz3", status="free"),
                Table(label="Table 4", qr_token="table4-token-xyz4", status="free"),
            ]
            session.add_all(tables)
            await session.flush()
            
            # Categories
            starters_cat = Category(name="Starters", station="kitchen")
            mains_cat = Category(name="Mains", station="kitchen")
            breads_cat = Category(name="Breads & Naan", station="tandoor")
            beverages_cat = Category(name="Beverages", station="bar")
            
            session.add_all([starters_cat, mains_cat, breads_cat, beverages_cat])
            await session.flush()
            
            # Menu Items & Inventory
            items_data = [
                (starters_cat.id, "Chicken Tikka", "Tender chicken marinated in spices and grilled", 12.99, 50),
                (starters_cat.id, "Samosa Chaat", "Crispy samosas topped with chutneys and yogurt", 8.49, 100),
                (mains_cat.id, "Butter Chicken", "Creamy tomato-based curry with tender chicken", 15.99, 40),
                (mains_cat.id, "Paneer Tikka Masala", "Cottage cheese in rich spiced gravy", 14.99, 30),
                (breads_cat.id, "Garlic Naan", "Oven-baked flatbread with garlic butter", 3.49, 200),
                (breads_cat.id, "Tandoori Roti", "Whole wheat bread baked in clay oven", 2.49, 150),
                (beverages_cat.id, "Mango Lassi", "Creamy yogurt drink with ripe mango", 4.99, 60),
                (beverages_cat.id, "Fresh Lime Soda", "Refreshing lime with a hint of salt", 3.99, 80),
                (beverages_cat.id, "Masala Chai", "Spiced tea brewed with cardamom and ginger", 2.99, 120),
            ]
            
            for cat_id, name, desc, price, stock in items_data:
                item = MenuItem(category_id=cat_id, name=name, description=desc, price=price, is_available=True)
                session.add(item)
                await session.flush()
                
                inv = Inventory(menu_item_id=item.id, stock_qty=stock, low_stock_threshold=5)
                session.add(inv)
            
            await session.commit()
            logger.info("Database successfully seeded with default data!")
            
        # Check if settings exist, and seed if not
        result_settings = await session.execute(select(BusinessSettings))
        settings_row = result_settings.scalars().first()
        if not settings_row:
            logger.info("Seeding default business settings...")
            settings = BusinessSettings(
                name="Spicy Tadka",
                logo_url=None,
                address="123 Curry Lane, Gastronomy City",
                phone="+1 (555) 123-4567",
                tax_rate=0.08,
                currency="$",
                receipt_footer="Thank you for dining with us! We hope to see you again."
            )
            session.add(settings)
            await session.commit()
            logger.info("Business settings successfully seeded!")
            
    yield

app = FastAPI(
    title="Digital Order System API",
    version="1.0.0",
    lifespan=lifespan
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static files for uploaded images
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# --- AUTH ENDPOINTS ---
@app.post("/api/v1/auth/login", response_model=Token)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(User).options(selectinload(User.role)).filter(User.username == form_data.username)
    )
    user = result.scalars().first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token = create_access_token(data={"sub": user.username, "role": user.role.name})
    return {"access_token": access_token, "token_type": "bearer", "role": user.role.name, "username": user.username}

@app.get("/api/v1/auth/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    if not current_user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return current_user


# --- TABLES ENDPOINTS ---
@app.get("/api/v1/tables", response_model=List[TableResponse])
async def list_tables(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Table))
    return result.scalars().all()

@app.get("/api/v1/tables/by-token/{token}", response_model=TableResponse)
async def get_table_by_token(token: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Table).filter(Table.qr_token == token))
    table = result.scalars().first()
    if not table:
        raise HTTPException(status_code=404, detail="Invalid QR Token")
    return table

@app.post("/api/v1/tables", response_model=TableResponse, dependencies=[Depends(require_role(["admin"]))])
async def create_table(table_in: TableCreate, db: AsyncSession = Depends(get_db)):
    qr_token = str(uuid.uuid4())
    db_table = Table(label=table_in.label, qr_token=qr_token, status="free")
    db.add(db_table)
    await db.commit()
    return db_table


# --- MENU ENDPOINTS ---
@app.get("/api/v1/menu/categories", response_model=List[CategoryResponse])
async def list_categories(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Category))
    return result.scalars().all()

@app.get("/api/v1/menu/items", response_model=List[MenuItemResponse])
async def list_menu_items(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(MenuItem).options(selectinload(MenuItem.category), selectinload(MenuItem.inventory))
    )
    return result.scalars().all()

@app.post("/api/v1/menu/items", response_model=MenuItemResponse, dependencies=[Depends(require_role(["admin"]))])
async def create_menu_item(item_in: MenuItemCreate, db: AsyncSession = Depends(get_db)):
    db_item = MenuItem(**item_in.model_dump())
    db.add(db_item)
    await db.flush()
    db_inv = Inventory(menu_item_id=db_item.id, stock_qty=50, low_stock_threshold=5)
    db.add(db_inv)
    await db.commit()
    res = await db.execute(
        select(MenuItem).options(selectinload(MenuItem.category), selectinload(MenuItem.inventory)).filter(MenuItem.id == db_item.id)
    )
    return res.scalars().first()

@app.put("/api/v1/menu/items/{item_id}/availability", response_model=MenuItemResponse, dependencies=[Depends(require_role(["admin", "kitchen", "bar", "tandoor"]))])
async def toggle_item_availability(item_id: int, is_available: bool, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(MenuItem).filter(MenuItem.id == item_id))
    item = result.scalars().first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    item.is_available = is_available
    await db.commit()
    
    # Broadcast change
    payload = {
        "event": "menu_item_availability_changed",
        "item_id": item.id,
        "is_available": item.is_available
    }
    await manager.broadcast_to_room("admin", payload)
    
    res = await db.execute(
        select(MenuItem).options(selectinload(MenuItem.category), selectinload(MenuItem.inventory)).filter(MenuItem.id == item_id)
    )
    return res.scalars().first()

@app.put("/api/v1/menu/items/{item_id}/stock", response_model=MenuItemResponse, dependencies=[Depends(require_role(["admin", "kitchen", "bar", "tandoor"]))])
async def update_item_stock(item_id: int, stock_qty: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Inventory).filter(Inventory.menu_item_id == item_id))
    inv = result.scalars().first()
    if not inv:
        inv = Inventory(menu_item_id=item_id, stock_qty=stock_qty)
        db.add(inv)
    else:
        inv.stock_qty = stock_qty
        
    # Check if stock makes item available
    res_item = await db.execute(select(MenuItem).filter(MenuItem.id == item_id))
    item = res_item.scalars().first()
    if item and stock_qty > 0:
        item.is_available = True

    await db.commit()
    
    # Broadcast change
    payload = {
        "event": "menu_item_stock_changed",
        "item_id": item_id,
        "stock_qty": stock_qty
    }
    await manager.broadcast_to_room("admin", payload)
    
    res = await db.execute(
        select(MenuItem).options(selectinload(MenuItem.category), selectinload(MenuItem.inventory)).filter(MenuItem.id == item_id)
    )
    return res.scalars().first()

# --- MENU ITEM UPDATE & DELETE ---
@app.put("/api/v1/menu/items/{item_id}", response_model=MenuItemResponse, dependencies=[Depends(require_role(["admin"]))])
async def update_menu_item(item_id: int, item_in: MenuItemUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(MenuItem).options(selectinload(MenuItem.category), selectinload(MenuItem.inventory)).filter(MenuItem.id == item_id)
    )
    item = result.scalars().first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    update_data = item_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(item, field, value)
    
    await db.commit()
    
    res = await db.execute(
        select(MenuItem).options(selectinload(MenuItem.category), selectinload(MenuItem.inventory)).filter(MenuItem.id == item_id)
    )
    return res.scalars().first()

@app.delete("/api/v1/menu/items/{item_id}", status_code=204, dependencies=[Depends(require_role(["admin"]))])
async def delete_menu_item(item_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(MenuItem).filter(MenuItem.id == item_id))
    item = result.scalars().first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    await db.delete(item)
    await db.commit()

# --- CATEGORY MANAGEMENT ---
@app.post("/api/v1/menu/categories", response_model=CategoryResponse, dependencies=[Depends(require_role(["admin"]))])
async def create_category(cat_in: CategoryCreate, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(Category).filter(Category.name == cat_in.name))
    if existing.scalars().first():
        raise HTTPException(status_code=400, detail="Category already exists")
    db_cat = Category(name=cat_in.name, station=cat_in.station)
    db.add(db_cat)
    await db.commit()
    return db_cat

@app.delete("/api/v1/menu/categories/{category_id}", status_code=204, dependencies=[Depends(require_role(["admin"]))])
async def delete_category(category_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Category).options(selectinload(Category.menu_items)).filter(Category.id == category_id)
    )
    cat = result.scalars().first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    if cat.menu_items:
        raise HTTPException(status_code=400, detail="Cannot delete category with existing menu items. Remove items first.")
    await db.delete(cat)
    await db.commit()

# --- FILE UPLOAD ---
@app.post("/api/v1/upload")
async def upload_image(file: UploadFile = File(...)):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image files are allowed")
    
    ext = os.path.splitext(file.filename)[1] if file.filename else ".png"
    filename = f"{uuid.uuid4()}{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)
    
    async with aiofiles.open(filepath, "wb") as f:
        content = await file.read()
        await f.write(content)
    
    # Return URL relative to server base
    url = f"/uploads/{filename}"
    return {"url": url, "filename": filename}


# --- ORDERS ENDPOINTS ---
@app.post("/api/v1/orders", response_model=OrderResponse)
async def place_order(order_in: OrderCreate, db: AsyncSession = Depends(get_db)):
    return await services.create_order(db, order_in)

@app.get("/api/v1/orders", response_model=List[OrderResponse])
async def list_orders(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Order)
        .options(
            selectinload(Order.table),
            selectinload(Order.items).selectinload(OrderItem.menu_item).selectinload(MenuItem.category),
            selectinload(Order.items).selectinload(OrderItem.menu_item).selectinload(MenuItem.inventory),
            selectinload(Order.payments)
        )
        .order_by(Order.created_at.desc())
    )
    return result.scalars().all()

@app.get("/api/v1/orders/{order_id}", response_model=OrderResponse)
async def get_order(order_id: int, db: AsyncSession = Depends(get_db)):
    return await services.get_order_details(db, order_id)

@app.put("/api/v1/orders/{order_id}/status", response_model=OrderResponse, dependencies=[Depends(require_role(["admin", "cashier", "kitchen", "bar", "tandoor"]))])
async def update_order_status(order_id: int, status_in: OrderUpdateStatus, db: AsyncSession = Depends(get_db)):
    return await services.update_order_status(db, order_id, status_in)

@app.put("/api/v1/orders/items/{item_id}/status", response_model=OrderResponse, dependencies=[Depends(require_role(["admin", "kitchen", "bar", "tandoor"]))])
async def update_order_item_status(item_id: int, status_in: OrderItemUpdateStatus, db: AsyncSession = Depends(get_db)):
    return await services.update_order_item_status(db, item_id, status_in)


# --- PAYMENTS ENDPOINTS ---
@app.post("/api/v1/orders/{order_id}/payments", response_model=PaymentResponse)
async def create_payment(order_id: int, payment_in: PaymentCreate, db: AsyncSession = Depends(get_db)):
    return await services.process_payment(db, order_id, payment_in.method, payment_in.amount)


# --- WEBSOCKET ENDPOINT ---
@app.websocket("/ws/{room}")
async def websocket_endpoint(websocket: WebSocket, room: str):
    await manager.connect(websocket, room)
    try:
        while True:
            # We just keep the connection alive and listen for any heartbeat or clients messages
            data = await websocket.receive_text()
            # Optionally log or parse client commands here if needed
    except WebSocketDisconnect:
        manager.disconnect(websocket, room)

# --- BUSINESS SETTINGS ENDPOINTS ---
@app.get("/api/v1/settings", response_model=BusinessSettingsResponse)
async def get_settings(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(BusinessSettings))
    settings = result.scalars().first()
    if not settings:
        raise HTTPException(status_code=404, detail="Settings not found")
    return settings

@app.put("/api/v1/settings", response_model=BusinessSettingsResponse, dependencies=[Depends(require_role(["admin"]))])
async def update_settings(settings_in: BusinessSettingsUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(BusinessSettings))
    settings = result.scalars().first()
    if not settings:
        settings = BusinessSettings()
        db.add(settings)
    
    settings.name = settings_in.name
    settings.logo_url = settings_in.logo_url
    settings.address = settings_in.address
    settings.phone = settings_in.phone
    settings.tax_rate = settings_in.tax_rate
    settings.currency = settings_in.currency
    settings.receipt_footer = settings_in.receipt_footer
    
    await db.commit()
    
    # Broadcast settings update to active clients
    payload = {
        "event": "settings_updated",
        "settings": {
            "name": settings.name,
            "logo_url": settings.logo_url,
            "address": settings.address,
            "phone": settings.phone,
            "tax_rate": settings.tax_rate,
            "currency": settings.currency,
            "receipt_footer": settings.receipt_footer
        }
    }
    await manager.broadcast_to_room("admin", payload)
    await manager.broadcast_to_room("cashier", payload)
    
    return settings

