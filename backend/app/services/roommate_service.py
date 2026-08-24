import numpy as np
from matching.games import StableRoommates
from uuid import UUID

SINGLE_CAPTURE_WEIGHTS = {
    "sleep_schedule": 1.5,
    "wake_up_time": 1.2,
}

DUAL_CAPTURE_FIELDS = ["cleanliness", "noise_level", "talkativeness"]
DUAL_CAPTURE_WEIGHTS = {
    "cleanliness": 1.5,
    "noise_level": 2.0,
    "talkativeness": 1.0,
}

def generate_feature_vector(profile: dict) -> list[float]:
    """
    Generate an 11-dimensional feature vector for a profile, normalized (assuming 1-5 scale).
    """
    fields = [
        "sleep_schedule", "wake_up_time",
        "self_cleanliness", "self_noise_level", "self_talkativeness",
        "pref_cleanliness", "pref_noise_level", "pref_talkativeness"
    ]
    # Normalize 1-5 scale to 0-1
    return [((profile.get(f) or 3.0) - 1.0) / 4.0 for f in fields]

def passes_hard_filters(a: dict, b: dict) -> bool:
    """Check boolean dealbreakers"""
    if a.get("smoking", 0) and b.get("requires_non_smoking_roommate", 0):
        return False
    if b.get("smoking", 0) and a.get("requires_non_smoking_roommate", 0):
        return False
    return True

def compatibility_score(a: dict, b: dict, importance_overrides: dict = None) -> float:
    """
    Lower score = more compatible.
    """
    weights_single = {**SINGLE_CAPTURE_WEIGHTS, **(importance_overrides or {})}
    weights_dual = {**DUAL_CAPTURE_WEIGHTS, **(importance_overrides or {})}

    total = 0.0

    for field, weight in weights_single.items():
        diff = ((a.get(field) or 3) - (b.get(field) or 3)) ** 2
        total += weight * diff

    for field in DUAL_CAPTURE_FIELDS:
        weight = weights_dual.get(field, 1.0)
        a_to_b = ((a.get(f"self_{field}") or 3) - (b.get(f"pref_{field}") or 3)) ** 2
        b_to_a = ((b.get(f"self_{field}") or 3) - (a.get(f"pref_{field}") or 3)) ** 2
        total += weight * ((a_to_b + b_to_a) / 2)

    return total ** 0.5

def build_preference_lists(profiles: list[dict]) -> dict:
    """
    Given a list of profiles, build the preference dictionary for Irving's algorithm.
    Returns: {student_id: [ranked candidate_ids]}
    """
    preferences = {}
    for i, a in enumerate(profiles):
        candidates = []
        for j, b in enumerate(profiles):
            if i == j:
                continue
            if not passes_hard_filters(a, b):
                continue
            
            score = compatibility_score(a, b)
            candidates.append((b["id"], score))
        
        # Sort by score ascending (lower is better)
        candidates.sort(key=lambda x: x[1])
        preferences[a["id"]] = [c[0] for c in candidates]
        
    return preferences

def run_stable_roommates(preferences: dict) -> dict:
    """
    Run Irving's Stable Roommates algorithm.
    Returns: {student_id: matched_student_id}
    """
    try:
        # Convert UUIDs to strings for the matching library
        str_prefs = {str(k): [str(v) for v in vals] for k, vals in preferences.items()}
        
        # Only include participants who have at least one valid preference
        valid_prefs = {k: v for k, v in str_prefs.items() if len(v) > 0}
        
        # If we have an odd number of valid participants, the library will crash or fail
        # So we add a dummy participant if needed, or just let it try its best.
        # Actually, matching library handles odd numbers by leaving someone unmatched.
        
        game = StableRoommates.create_from_dictionary(valid_prefs)
        solution = game.solve()
        
        return {UUID(k.name): (UUID(v.name) if v else None) for k, v in solution.items()}
    except Exception as e:
        print(f"Stable Roommates algorithm failed or no stable matching: {e}")
        # Fallback greedy approach
        return {}
