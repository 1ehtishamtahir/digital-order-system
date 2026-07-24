from fastapi import WebSocket
from typing import Dict, Set
import json
import logging

logger = logging.getLogger("uvicorn")

class ConnectionManager:
    def __init__(self):
        # Maps a room name (e.g., "station_kitchen", "order_5", "admin", "cashier") to a set of WebSockets
        self.rooms: Dict[str, Set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, room: str):
        await websocket.accept()
        if room not in self.rooms:
            self.rooms[room] = set()
        self.rooms[room].add(websocket)
        logger.info(f"WebSocket client connected to room '{room}'. Active connections in room: {len(self.rooms[room])}")

    def disconnect(self, websocket: WebSocket, room: str):
        if room in self.rooms:
            self.rooms[room].discard(websocket)
            logger.info(f"WebSocket client disconnected from room '{room}'. Remaining: {len(self.rooms[room])}")
            if not self.rooms[room]:
                del self.rooms[room]

    async def broadcast_to_room(self, room: str, message: dict):
        if room in self.rooms:
            payload = json.dumps(message)
            disconnected_sockets = set()
            for connection in list(self.rooms[room]):
                try:
                    await connection.send_text(payload)
                except Exception as e:
                    logger.error(f"Error sending message to socket in room {room}: {e}")
                    disconnected_sockets.add(connection)
            
            for socket in disconnected_sockets:
                self.rooms[room].discard(socket)
            
            if room in self.rooms and not self.rooms[room]:
                del self.rooms[room]

manager = ConnectionManager()
