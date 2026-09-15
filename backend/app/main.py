from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.rate_limit import setup_rate_limiting
from app.api.routes import (
    auth_routes, user_routes, phc_routes, patient_routes, bed_routes, 
    inventory_routes, attendance_routes, district_routes, 
    analytics_routes, translate_routes,
    notification_routes, chat_routes, ml_routes
)
from fastapi.staticfiles import StaticFiles

from app.core.scheduler import start_scheduler, shutdown_scheduler
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    start_scheduler()
    yield
    # Shutdown
    shutdown_scheduler()

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan
)

setup_rate_limiting(app)

# Set up CORS middleware
if settings.cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_origin_regex=".*",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

@app.get("/")
def read_root():
    return {"message": f"Welcome to {settings.PROJECT_NAME}"}

app.include_router(auth_routes.router, prefix=f"{settings.API_V1_STR}/auth", tags=["auth"])
app.include_router(user_routes.router, prefix=f"{settings.API_V1_STR}/users", tags=["users"])
app.include_router(phc_routes.router, prefix=f"{settings.API_V1_STR}/phc", tags=["phc"])
app.include_router(patient_routes.router, prefix=f"{settings.API_V1_STR}/patients", tags=["patients"])
app.include_router(bed_routes.router, prefix=f"{settings.API_V1_STR}/beds", tags=["beds"])
app.include_router(inventory_routes.router, prefix=f"{settings.API_V1_STR}/inventory", tags=["inventory"])
app.include_router(attendance_routes.router, prefix=f"{settings.API_V1_STR}/attendance", tags=["attendance"])
app.include_router(district_routes.router, prefix=f"{settings.API_V1_STR}/district", tags=["district"])
app.include_router(analytics_routes.router, prefix=f"{settings.API_V1_STR}/analytics", tags=["analytics"])
app.include_router(translate_routes.router, prefix=f"{settings.API_V1_STR}/translate", tags=["translate"])
app.include_router(notification_routes.router, prefix=f"{settings.API_V1_STR}/notifications", tags=["notifications"])
app.include_router(chat_routes.router, prefix=f"{settings.API_V1_STR}/chat", tags=["chat"])
app.include_router(ml_routes.router, prefix=f"{settings.API_V1_STR}/ml", tags=["ml"])

# Mount static files for PDF reports
import os
os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")
