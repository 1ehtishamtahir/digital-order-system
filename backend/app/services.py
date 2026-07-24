import json
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from fastapi import HTTPException, status
from app.models import Order, OrderItem, MenuItem, Inventory, Table, Payment
from app.schemas import OrderCreate, OrderUpdateStatus, OrderItemUpdateStatus
from app.ws import manager

async def get_order_details(db: AsyncSession, order_id: int) -> Order:
    result = await db.execute(
        select(Order)
        .options(
            selectinload(Order.table),
            selectinload(Order.items).selectinload(OrderItem.menu_item).selectinload(MenuItem.category),
            selectinload(Order.payments)
        )
        .filter(Order.id == order_id)
    )
    order = result.scalars().first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order

async def create_order(db: AsyncSession, order_in: OrderCreate) -> Order:
    # Validate table if dine-in
    table = None
    if order_in.table_id:
        result = await db.execute(select(Table).filter(Table.id == order_in.table_id))
        table = result.scalars().first()
        if not table:
            raise HTTPException(status_code=404, detail="Table not found")
        table.status = "occupied"

    total = 0.0
    order_items = []
    stations_to_notify = set()

    for item_in in order_in.items:
        # Load menu item, its category and inventory
        res = await db.execute(
            select(MenuItem)
            .options(selectinload(MenuItem.category), selectinload(MenuItem.inventory))
            .filter(MenuItem.id == item_in.menu_item_id)
        )
        menu_item = res.scalars().first()
        if not menu_item:
            raise HTTPException(status_code=404, detail=f"Menu item {item_in.menu_item_id} not found")
        
        if not menu_item.is_available:
            raise HTTPException(status_code=400, detail=f"Menu item '{menu_item.name}' is currently unavailable")

        # Check inventory if present
        if menu_item.inventory:
            inv = menu_item.inventory
            if inv.stock_qty < item_in.qty:
                raise HTTPException(
                    status_code=400,
                    detail=f"Not enough stock for '{menu_item.name}'. Available: {inv.stock_qty}"
                )
            # Decrement stock
            inv.stock_qty -= item_in.qty
            if inv.stock_qty <= 0:
                menu_item.is_available = False

        total += menu_item.price * item_in.qty
        stations_to_notify.add(menu_item.category.station)

        order_item = OrderItem(
            menu_item_id=menu_item.id,
            qty=item_in.qty,
            modifiers=item_in.modifiers,
            notes=item_in.notes,
            item_status="pending"
        )
        order_items.append(order_item)

    new_order = Order(
        table_id=order_in.table_id,
        order_type=order_in.order_type,
        customer_name=order_in.customer_name,
        customer_phone=order_in.customer_phone,
        total=total,
        status="placed",
        items=order_items
    )

    db.add(new_order)
    await db.flush() # Populate id

    # Refresh table status if modified
    if table:
        db.add(table)

    await db.commit()

    # Get fully loaded order for ws broadcast
    full_order = await get_order_details(db, new_order.id)
    
    # Broadcast to websocket rooms
    order_data = {
        "event": "order_created",
        "order": {
            "id": full_order.id,
            "table_label": full_order.table.label if full_order.table else "Takeaway",
            "total": full_order.total,
            "status": full_order.status,
            "order_type": full_order.order_type,
            "created_at": full_order.created_at.isoformat(),
            "items": [
                {
                    "id": item.id,
                    "name": item.menu_item.name,
                    "qty": item.qty,
                    "station": item.menu_item.category.station,
                    "status": item.item_status,
                    "notes": item.notes,
                    "modifiers": item.modifiers
                } for item in full_order.items
            ]
        }
    }

    # Broadcast to admin, cashier, and relevant preparation stations
    await manager.broadcast_to_room("admin", order_data)
    await manager.broadcast_to_room("cashier", order_data)
    for station in stations_to_notify:
        await manager.broadcast_to_room(f"station_{station}", order_data)

    return full_order

async def update_order_item_status(db: AsyncSession, order_item_id: int, status_in: OrderItemUpdateStatus) -> Order:
    # Find order item
    result = await db.execute(
        select(OrderItem)
        .filter(OrderItem.id == order_item_id)
    )
    order_item = result.scalars().first()
    if not order_item:
        raise HTTPException(status_code=404, detail="Order item not found")

    order_item.item_status = status_in.item_status
    await db.commit()

    # Load order details
    order = await get_order_details(db, order_item.order_id)
    
    # If all items are ready, update the main order status to 'ready'
    # If any item is preparing, set main order status to 'preparing' (unless already ready/served/etc)
    all_ready = all(item.item_status in ["ready", "served"] for item in order.items)
    any_preparing = any(item.item_status == "preparing" for item in order.items)

    if all_ready and order.status == "preparing":
        order.status = "ready"
    elif any_preparing and order.status == "placed":
        order.status = "preparing"
        
    await db.commit()
    
    # Reload to reflect any status change
    order = await get_order_details(db, order.id)

    # Broadcast updates
    payload = {
        "event": "order_item_updated",
        "order_id": order.id,
        "item_id": order_item.id,
        "item_status": order_item.item_status,
        "order_status": order.status
    }
    
    # Broadcast to admin, cashier, customer, and stations
    await manager.broadcast_to_room("admin", payload)
    await manager.broadcast_to_room("cashier", payload)
    await manager.broadcast_to_room(f"order_{order.id}", payload)
    
    # Broadcast to preparation stations
    stations = {item.menu_item.category.station for item in order.items}
    for station in stations:
        await manager.broadcast_to_room(f"station_{station}", payload)

    return order

async def update_order_status(db: AsyncSession, order_id: int, status_in: OrderUpdateStatus) -> Order:
    order = await get_order_details(db, order_id)
    order.status = status_in.status
    
    # If status is served or paid, update table occupancy if dine-in
    if order.status == "paid" and order.table:
        # Check if there are other unpaid orders for this table
        # If none, free the table
        res = await db.execute(
            select(Order)
            .filter(Order.table_id == order.table_id, Order.status != "paid", Order.status != "cancelled")
        )
        other_orders = res.scalars().all()
        if not other_orders:
            order.table.status = "free"

    await db.commit()
    order = await get_order_details(db, order_id)

    payload = {
        "event": "order_updated",
        "order_id": order.id,
        "status": order.status,
        "table_status": order.table.status if order.table else None
    }

    await manager.broadcast_to_room("admin", payload)
    await manager.broadcast_to_room("cashier", payload)
    await manager.broadcast_to_room(f"order_{order.id}", payload)
    
    stations = {item.menu_item.category.station for item in order.items}
    for station in stations:
        await manager.broadcast_to_room(f"station_{station}", payload)

    return order

async def process_payment(db: AsyncSession, order_id: int, method: str, amount: float) -> Payment:
    order = await get_order_details(db, order_id)
    
    payment = Payment(
        order_id=order_id,
        method=method,
        amount=amount,
        status="completed",
        transaction_ref=f"TXN-{order_id}-{int(amount)}"
    )
    db.add(payment)
    
    order.status = "paid"
    if order.table:
        order.table.status = "free"
        
    await db.commit()

    # Broadcast
    payload = {
        "event": "payment_completed",
        "order_id": order.id,
        "status": "paid",
        "table_status": order.table.status if order.table else None
    }
    
    await manager.broadcast_to_room("admin", payload)
    await manager.broadcast_to_room("cashier", payload)
    await manager.broadcast_to_room(f"order_{order.id}", payload)

    return payment
