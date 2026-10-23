import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.seed import seed_defaults
import app.models
from app.core.audit import ActorMiddleware   # journal des actions (TASK-049) : les evenements s'inscrivent a l'import
from app.api.v1.endpoints import auth, companies, contacts, ref_data, logs, search, catalogue, invoices, payments, tickets, maintenance, equipment, telephony, purchase_orders, admin, portal, ecom, settings as settings_router, employees, tasks, tracking, devis, appointments, google_oauth, server as server_router, knowledge_graph, mailboxes as mailboxes_router, mail as mail_router, migration as migration_router, zeko as zeko_router, sales_reps as sales_reps_router, former_infos as former_infos_router
from app.api.v1.endpoints import sipv_events
from app.api.v1.endpoints import recurring_billing
from app.api.v1.endpoints import backup as backup_router
from app.api.v1.endpoints import bank
from app.api.v1.endpoints import taxes
from app.api.v1.endpoints import purchases
from app.api.v1.endpoints import barter
from app.api.v1.endpoints import journal
from app.services.imap_poller import run_poller
from app.services.reminder_poller import run_reminder_poller
from app.services.backup_poller import run_backup_poller
from app.services.cdr_report_poller import run_cdr_report_poller
from app.services.recurring_poller import run_recurring_poller
from app.services.bank_ai_poller import run_bank_ai_poller
from app.services.receipt_poller import run_receipt_poller
from app.services.interac_poller import run_interac_poller
from app.services.mail_sync import run_mail_sync
from app.core.background_leader import run_as_leader
from app.services.ticket_presence import run_presence_watcher
from app.core.zeko_payments import run_poller as run_zeko_payments


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with AsyncSessionLocal() as db:
        await seed_defaults(db)
    from app.core import clock
    await clock.load()                      # fuseau horaire de l'entreprise avant tout poller
    clock_task = asyncio.create_task(clock.run_refresher())   # etat local : dans chaque processus
    # Taches de fond : un seul des deux services (8010 / 8011) les fait tourner -- voir background_leader
    leader_task = asyncio.create_task(run_as_leader([
        run_poller, run_reminder_poller, run_backup_poller, run_cdr_report_poller, run_recurring_poller,
        run_bank_ai_poller, run_receipt_poller, run_interac_poller, run_mail_sync, run_presence_watcher, run_zeko_payments,
    ]))
    try:
        yield
    finally:
        clock_task.cancel()
        leader_task.cancel()
        for t in (clock_task, leader_task):
            try:
                await t
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
app.add_middleware(ActorMiddleware)


app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(companies.router, prefix="/api/v1/companies", tags=["companies"])
app.include_router(contacts.router, prefix="/api/v1/contacts", tags=["contacts"])
app.include_router(ref_data.router, prefix="/api/v1/ref", tags=["ref"])
app.include_router(logs.router, prefix="/api/v1/entities", tags=["logs"])
app.include_router(journal.router, prefix="/api/v1/journal", tags=["journal"])
app.include_router(search.router, prefix="/api/v1/search", tags=["search"])
app.include_router(catalogue.router, prefix="/api/v1/catalogue", tags=["catalogue"])
app.include_router(invoices.router, prefix="/api/v1/invoices", tags=["invoices"])
app.include_router(recurring_billing.router, prefix="/api/v1", tags=["recurring-billing"])
app.include_router(payments.router, prefix="/api/v1/payments", tags=["payments"])
app.include_router(tickets.router, prefix="/api/v1/tickets", tags=["tickets"])
app.include_router(zeko_router.router, prefix="/api/v1/zeko", tags=["zeko"])
app.include_router(maintenance.router, prefix="/api/v1/maintenance", tags=["maintenance"])
app.include_router(equipment.router, prefix="/api/v1/equipment", tags=["equipment"])
app.include_router(telephony.router, prefix="/api/v1/telephony", tags=["telephony"])
app.include_router(purchase_orders.router, prefix="/api/v1/purchase-orders", tags=["purchase-orders"])
app.include_router(admin.router, prefix="/api/v1/admin", tags=["admin"])
app.include_router(portal.router, prefix="/api/v1/portal", tags=["portal"])
app.include_router(ecom.router, prefix="/api/v1/ecom", tags=["ecom"])
app.include_router(settings_router.router, prefix="/api/v1/settings", tags=["settings"])
app.include_router(mailboxes_router.router, prefix="/api/v1/mailboxes", tags=["mailboxes"])
app.include_router(mail_router.router, prefix="/api/v1/mail", tags=["mail"])
app.include_router(employees.router, prefix="/api/v1/employees", tags=["employees"])
app.include_router(sales_reps_router.router, prefix="/api/v1/sales-reps", tags=["sales-reps"])
app.include_router(former_infos_router.router, prefix="/api/v1/former-infos", tags=["former-infos"])
app.include_router(tasks.router, prefix="/api/v1/tasks", tags=["tasks"])
app.include_router(sipv_events.router, prefix="/api/v1/sipv", tags=["sipv"])
app.include_router(tracking.router, prefix="/api/v1/track", tags=["tracking"])
app.include_router(devis.router, prefix="/api/v1/devis", tags=["devis"])
app.include_router(appointments.router, prefix="/api/v1/rdv", tags=["rdv"])
app.include_router(google_oauth.router, prefix="/api/v1/google-calendar", tags=["google-calendar"])
app.include_router(server_router.router, prefix="/api/v1/server", tags=["server"])
app.include_router(migration_router.router, prefix="/api/v1/migration", tags=["migration"])   # TASK-051
app.include_router(backup_router.router, prefix="/api/v1/backup", tags=["backup"])
app.include_router(knowledge_graph.router, prefix="/api/v1/knowledge-graph", tags=["knowledge-graph"])
app.include_router(bank.router, prefix="/api/v1/bank", tags=["bank"])
app.include_router(taxes.router, prefix="/api/v1/taxes", tags=["taxes"])
app.include_router(purchases.router, prefix="/api/v1/purchases", tags=["purchases"])
app.include_router(barter.router, prefix="/api/v1/barter", tags=["barter"])
app.mount("/uploads", StaticFiles(directory="/home/simpleip/erpcrm/backend/uploads"), name="uploads")
# Meme dossier sous /api (2026-10-09) : passe par le meme chemin que l'API (portail.simpleip.tel -> /api), donc les photos
# du catalogue et des installations s'affichent aussi hors du bureau (avant : adresse interne 192.168.1.9 seulement).
app.mount("/api/uploads", StaticFiles(directory="/home/simpleip/erpcrm/backend/uploads"), name="api_uploads")


@app.get("/api/health")
async def health():
    return {"status": "ok", "project": "Simple IP ERPCRM", "env": settings.ENVIRONMENT}
