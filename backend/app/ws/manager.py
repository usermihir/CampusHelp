"""
ws/manager.py — In-memory WebSocket connection manager.

Maps channel_id → list of active WebSocket connections.
Single-process only (fine for development and single-worker production).
"""
import logging
from typing import Dict, List
from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self):
        # { channel_id: [WebSocket, ...] }
        self._connections: Dict[int, List[WebSocket]] = {}

    async def connect(self, channel_id: int, websocket: WebSocket):
        await websocket.accept()
        self._connections.setdefault(channel_id, []).append(websocket)
        logger.info(f"WS connected: channel={channel_id} total={len(self._connections[channel_id])}")

    def disconnect(self, channel_id: int, websocket: WebSocket):
        conns = self._connections.get(channel_id, [])
        if websocket in conns:
            conns.remove(websocket)
        if not conns:
            self._connections.pop(channel_id, None)
        logger.info(f"WS disconnected: channel={channel_id}")

    async def broadcast(self, channel_id: int, message: dict):
        """Send a JSON message to all connected clients in a channel."""
        conns = list(self._connections.get(channel_id, []))
        dead = []
        for ws in conns:
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(channel_id, ws)

    def connection_count(self, channel_id: int) -> int:
        return len(self._connections.get(channel_id, []))


# Global singleton — imported by channel_ws.py and main.py
manager = ConnectionManager()
