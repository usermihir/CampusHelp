"""
SLA escalation Celery beat task.
Runs every 30 minutes (configured in celery_app.py beat schedule).
Finds tickets that have breached their SLA deadline and escalates them.
"""
import logging
from datetime import datetime, timezone

from app.tasks.celery_app import celery_app
from app.services.notifications import notify_escalation

logger = logging.getLogger("sla_tasks")


@celery_app.task(name="app.tasks.sla_tasks.escalate_overdue_tickets")
def escalate_overdue_tickets():
    """
    Find all open/in-progress tickets whose sla_deadline has passed and
    increment their escalation_level. Uses a synchronous psycopg2 connection
    (Celery tasks are sync; asyncpg is for FastAPI only).
    """
    import os
    import psycopg2
    from psycopg2.extras import RealDictCursor

    db_url = os.getenv(
        "DATABASE_URL",
        "postgresql://postgres:postgres@localhost:5432/postgres"
    ).replace("postgresql+asyncpg://", "postgresql://")

    now = datetime.now(timezone.utc)
    logger.info("[SLA] Running escalation check at %s", now.isoformat())

    try:
        conn = psycopg2.connect(db_url)
        cur = conn.cursor(cursor_factory=RealDictCursor)

        # ------------------------------------------------------------------
        # Level-0 escalation: first SLA breach
        # ------------------------------------------------------------------
        cur.execute(
            """
            UPDATE complaints
            SET    escalation_level = 1,
                   updated_at = NOW()
            WHERE  status NOT IN ('resolved', 'rejected', 'pending_confirmation')
              AND  sla_deadline < NOW()
              AND  escalation_level = 0
            RETURNING id, hall_id, reporter_id
            """,
        )
        level1_rows = cur.fetchall()
        if level1_rows:
            ticket_ids = [str(r["id"]) for r in level1_rows]
            logger.warning("[SLA] Escalated %d ticket(s) to level 1: %s", len(ticket_ids), ticket_ids)

            # Fetch chief_warden / hall_management user_ids for affected halls
            hall_ids = list({str(r["hall_id"]) for r in level1_rows})
            placeholders = ",".join(["%s"] * len(hall_ids))
            cur.execute(
                f"""
                SELECT user_id FROM user_roles
                WHERE  hall_id = ANY(%s::uuid[])
                  AND  role IN ('chief_warden', 'warden')
                """,
                (hall_ids,),
            )
            authority_ids = [str(row["user_id"]) for row in cur.fetchall()]
            for tid in ticket_ids:
                notify_escalation(authority_ids, tid, escalation_level=1)

        # ------------------------------------------------------------------
        # Level-1 escalation: second SLA breach (24h window after first)
        # ------------------------------------------------------------------
        cur.execute(
            """
            UPDATE complaints
            SET    escalation_level = 2,
                   updated_at = NOW()
            WHERE  status NOT IN ('resolved', 'rejected', 'pending_confirmation')
              AND  sla_deadline < NOW() - INTERVAL '24 hours'
              AND  escalation_level = 1
            RETURNING id, hall_id
            """,
        )
        level2_rows = cur.fetchall()
        if level2_rows:
            ticket_ids = [str(r["id"]) for r in level2_rows]
            logger.warning("[SLA] Escalated %d ticket(s) to level 2 (institute): %s",
                           len(ticket_ids), ticket_ids)

            hall_ids = list({str(r["hall_id"]) for r in level2_rows})
            cur.execute(
                """
                SELECT user_id FROM user_roles
                WHERE  hall_id = ANY(%s::uuid[])
                  AND  role = 'institute_admin'
                """,
                (hall_ids,),
            )
            authority_ids = [str(row["user_id"]) for row in cur.fetchall()]
            for tid in ticket_ids:
                notify_escalation(authority_ids, tid, escalation_level=2)

        conn.commit()

    except Exception as exc:
        logger.exception("[SLA] Escalation task failed: %s", exc)
        raise
    finally:
        try:
            cur.close()
            conn.close()
        except Exception:
            pass

    logger.info("[SLA] Escalation check complete. L1=%d, L2=%d",
                len(level1_rows) if 'level1_rows' in locals() and level1_rows else 0,
                len(level2_rows) if 'level2_rows' in locals() and level2_rows else 0)


@celery_app.task(name="app.tasks.sla_tasks.auto_resolve_unconfirmed_tickets")
def auto_resolve_unconfirmed_tickets():
    """
    Find tickets that have been in 'pending_confirmation' for more than 3 days
    and automatically transition them to 'resolved'.
    """
    import os
    import psycopg2
    from psycopg2.extras import RealDictCursor

    db_url = os.getenv(
        "DATABASE_URL",
        "postgresql://postgres:postgres@localhost:5432/postgres"
    ).replace("postgresql+asyncpg://", "postgresql://")

    now = datetime.now(timezone.utc)
    logger.info("[SLA] Running auto-resolve check at %s", now.isoformat())

    try:
        conn = psycopg2.connect(db_url)
        cur = conn.cursor(cursor_factory=RealDictCursor)

        cur.execute(
            """
            UPDATE complaints
            SET    status = 'resolved',
                   updated_at = NOW(),
                   student_confirmation_note = 'Auto-resolved after 3 days of no student response.'
            WHERE  status = 'pending_confirmation'
              AND  updated_at < NOW() - INTERVAL '3 days'
            RETURNING id
            """
        )
        resolved_rows = cur.fetchall()
        if resolved_rows:
            ticket_ids = [str(r["id"]) for r in resolved_rows]
            logger.warning("[SLA] Auto-resolved %d ticket(s): %s", len(ticket_ids), ticket_ids)
            
            # Insert into complaint_status_history
            values = []
            for tid in ticket_ids:
                values.append(f"('{tid}', 'pending_confirmation', 'resolved', 'Auto-resolved after 3 days of no student response.', NOW())")
            
            if values:
                cur.execute(
                    f"""
                    INSERT INTO complaint_status_history 
                    (complaint_id, from_status, to_status, note, created_at)
                    VALUES {','.join(values)}
                    """
                )
        conn.commit()

    except Exception as exc:
        logger.exception("[SLA] Auto-resolve task failed: %s", exc)
        raise
    finally:
        try:
            cur.close()
            conn.close()
        except Exception:
            pass

    logger.info("[SLA] Auto-resolve check complete. Resolved=%d",
                len(resolved_rows) if 'resolved_rows' in locals() and resolved_rows else 0)
