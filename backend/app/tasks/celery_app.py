from celery import Celery
from celery.schedules import crontab

celery_app = Celery(
    "campushelp_tasks",
    broker="redis://localhost:6379/0",
    backend="redis://localhost:6379/0"
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Asia/Kolkata",
    enable_utc=True,
)

# Autodiscover tasks from all task modules
celery_app.autodiscover_tasks([
    "app.tasks.matching_tasks",
    "app.tasks.sla_tasks",
])

# Beat schedule: SLA escalation runs every 30 minutes
celery_app.conf.beat_schedule = {
    "escalate-overdue-tickets-every-30min": {
        "task": "app.tasks.sla_tasks.escalate_overdue_tickets",
        "schedule": crontab(minute="*/30"),
    },
    "auto-resolve-unconfirmed-daily": {
        "task": "app.tasks.sla_tasks.auto_resolve_unconfirmed_tickets",
        "schedule": crontab(minute="0", hour="0"),  # Runs every midnight
    },
}
