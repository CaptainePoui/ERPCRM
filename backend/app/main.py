import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.seed import seed_defaults
import app.models
from app.api.v1.endpoints import auth, companies, contacts, ref_data, logs, search, catalogue, invoices, payments, tickets, maintenance, equipment, telephony, purchase_orders, admin, portal, ecom, settings as settings_router, employees, tasks
from app.api.v1.endpoints import sipv_events
from app.services.imap_poller import run_poller


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with AsyncSessionLocal() as db:
        await seed_defaults(db)
    poller_task = asyncio.create_task(run_poller())
    try:
        yield
    finally:
        poller_task.cancel()
        try:
            await poller_task
        except asyncio.CancelledError:
            pass


app = FastAPI(
    title="Simple IP ERPCRM",
    version="0.1.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3010", f"http://{settings.ERPCRM_HOST}:3010"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(companies.router, prefix="/api/v1/companies", tags=["companies"])
app.include_router(contacts.router, prefix="/api/v1/contacts", tags=["contacts"])
app.include_router(ref_data.router, prefix="/api/v1/ref", tags=["ref"])
app.include_router(logs.router, prefix="/api/v1/entities", tags=["logs"])
app.include_router(search.router, prefix="/api/v1/search", tags=["search"])
app.include_router(catalogue.router, prefix="/api/v1/catalogue", tags=["catalogue"])
app.include_router(invoices.router, prefix="/api/v1/invoices", tags=["invoices"])
app.include_router(payments.router, prefix="/api/v1/payments", tags=["payments"])
app.include_router(tickets.router, prefix="/api/v1/tickets", tags=["tickets"])
app.include_router(maintenance.router, prefix="/api/v1/maintenance", tags=["maintenance"])
app.include_router(equipment.router, prefix="/api/v1/equipment", tags=["equipment"])
app.include_router(telephony.router, prefix="/api/v1/telephony", tags=["telephony"])
app.include_router(purchase_orders.router, prefix="/api/v1/purchase-orders", tags=["purchase-orders"])
app.include_router(admin.router, prefix="/api/v1/admin", tags=["admin"])
app.include_router(portal.router, prefix="/api/v1/portal", tags=["portal"])
app.include_router(ecom.router, prefix="/api/v1/ecom", tags=["ecom"])
app.include_router(settings_router.router, prefix="/api/v1/settings", tags=["settings"])
app.include_router(employees.router, prefix="/api/v1/employees", tags=["employees"])
app.include_router(tasks.router, prefix="/api/v1/tasks", tags=["tasks"])
app.include_router(sipv_events.router, prefix="/api/v1/sipv", tags=["sipv"])
app.mount("/uploads", StaticFiles(directory="/home/simpleip/erpcrm/backend/uploads"), name="uploads")


@app.get("/api/health")
async def health():
    return {"status": "ok", "project": "Simple IP ERPCRM", "env": settings.ENVIRONMENT}
