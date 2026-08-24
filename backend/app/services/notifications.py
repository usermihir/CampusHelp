"""
Mock FCM notification service.
Replace the body of each function with real Firebase Admin SDK calls
once a Firebase project is configured.
"""
import logging

logger = logging.getLogger("notifications")


def notify_duplicate_merged(user_id: str, complaint_id: str) -> None:
    """Tell a student their report matched an existing open ticket."""
    logger.info(
        "[MOCK FCM] notify_duplicate_merged → user=%s, existing_ticket=%s",
        user_id, complaint_id
    )


def notify_ticket_resolved(user_ids: list[str], complaint_id: str) -> None:
    """Broadcast resolution to all reporters/supporters of a general ticket."""
    for uid in user_ids:
        logger.info(
            "[MOCK FCM] notify_ticket_resolved → user=%s, ticket=%s",
            uid, complaint_id
        )


def notify_pending_confirmation(user_id: str, complaint_id: str) -> None:
    """Ask a student to confirm/reject the worker's resolution of a personal ticket."""
    logger.info(
        "[MOCK FCM] notify_pending_confirmation → user=%s, ticket=%s",
        user_id, complaint_id
    )


def notify_escalation(authority_user_ids: list[str], complaint_id: str, escalation_level: int) -> None:
    """Ping higher-authority users when a ticket breaches its SLA deadline."""
    for uid in authority_user_ids:
        logger.info(
            "[MOCK FCM] notify_escalation → user=%s, ticket=%s, level=%d",
            uid, complaint_id, escalation_level
        )
