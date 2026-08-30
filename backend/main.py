from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.api import lost_found
from app.api import auth
from app.api import roommate
from app.api import buildings
from app.api import users
from app.api.complaints import router as complaints_router, admin_router as maintenance_admin_router
from app.api.societies import router as societies_router
from app.ws.channel_ws import ws_router

from app.core.config import settings

if settings.APP_ENV == "production" and settings.OTP_MODE == "development":
    raise RuntimeError("Development OTP mode cannot be enabled when APP_ENV=production.")

app = FastAPI(title="CampusHelp API")

# Setup Rate Limiting
app.state.limiter = auth.limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# Setup CORS for the frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(lost_found.router, prefix="/api", tags=["lost-found"])
app.include_router(users.router, prefix="/api/users", tags=["users"])
app.include_router(roommate.router, prefix="/api/roommate", tags=["roommate"])
app.include_router(buildings.router, prefix="/api/buildings", tags=["buildings"])
app.include_router(auth.router)
app.include_router(complaints_router, prefix="/api")
app.include_router(maintenance_admin_router, prefix="/api")
app.include_router(societies_router)
app.include_router(ws_router)

@app.get("/health")
def health_check():
    return {"status": "ok"}
