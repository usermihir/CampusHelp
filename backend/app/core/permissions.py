from enum import Enum

class Role(str, Enum):
    STUDENT = "STUDENT"
    HALL_ADMIN = "HALL_ADMIN"
    SUPER_ADMIN = "SUPER_ADMIN"
    ELECTRICIAN = "ELECTRICIAN"

# Global permissions mapping
ROLE_PERMISSIONS = {
    Role.STUDENT: [
        "MAINTENANCE_CREATE",
        "MAINTENANCE_VIEW_OWN",
        "LOST_FOUND_VIEW",
        "LOST_FOUND_CREATE",
        "ROOMMATE_VIEW",
        "ROOMMATE_CREATE"
    ],
    Role.HALL_ADMIN: [
        "MAINTENANCE_VIEW_HALL",
        "MAINTENANCE_ASSIGN",
        "MAINTENANCE_RESOLVE"
    ],
    Role.ELECTRICIAN: [
        "MAINTENANCE_VIEW_ASSIGNED",
        "MAINTENANCE_RESOLVE_ELECTRICAL"
    ],
    Role.SUPER_ADMIN: [
        # Has everything implicitly, but let's list some specifics for safety
        "MAINTENANCE_VIEW_ALL",
        "MAINTENANCE_SLA_EDIT",
        "MAINTENANCE_ANALYTICS_VIEW"
    ]
}
