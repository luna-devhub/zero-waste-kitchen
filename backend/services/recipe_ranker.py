from typing import Dict, Any, List, Optional, Tuple
import re
from datetime import datetime

def main_ingredient_present(recipe: Dict[str, Any], main_ingredient: str) -> bool:
    mi = _norm(main_ingredient)
    if not mi:
        return True

    ing_names = [i.get("name", "") for i in (recipe.get("ingredients", []) or [])]
    hay = " ".join(_norm(x) for x in ing_names)

    # basic contains
    if mi in hay:
        return True

    # small synonym map (optional)
    SYN = {
        "beef": {"beef", "ground beef", "minced beef", "steak"},
        "chicken": {"chicken", "chicken breast", "chicken thigh"},
        "onion": {"onion", "yellow onion", "red onion", "shallot"},
    }
    for alt in SYN.get(mi, set()):
        if _norm(alt) in hay:
            return True

    return False

def _norm(s: str) -> str:
    s = (s or "").strip().lower()
    s = re.sub(r"[^a-z0-9\s]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s

def _parse_date_any(s: str):
    if not s:
        return None
    try:
        return datetime.strptime(s[:10], "%Y-%m-%d").date()
    except Exception:
        return None

def _days_left(expiry_str: str) -> int:
    d = _parse_date_any(expiry_str)
    if not d:
        return 10_000
    return (d - datetime.utcnow().date()).days

def build_pantry_soonest_expiry_days(pantry_docs):
    """
    { norm_name: soonest_days_left }
    """
    m = {}
    for d in pantry_docs:
        n = _norm(d.get("name", ""))
        if not n:
            continue
        dl = _days_left(d.get("expiryDate"))
        if n not in m:
            m[n] = dl
        else:
            m[n] = min(m[n], dl)
    return m

def expiry_urgency_score(recipe: Dict[str, Any], pantry_expiry_days: Dict[str, int]) -> float:
    """
    Higher = better (uses ingredients expiring sooner).
    Uses 1/(days_left+1) so 0-1 days gives a big boost.
    """
    score = 0.0

    for ing in recipe.get("ingredients", []) or []:
        name = _norm(ing.get("name", ""))
        if not name:
            continue

        # best-effort match to pantry ingredient names
        matched = None
        for pk in pantry_expiry_days.keys():
            if pk in name or name in pk:
                matched = pk
                break

        if matched is None:
            continue

        dl = pantry_expiry_days[matched]
        if dl < 0:
            continue  # expired (shouldn't happen if you filter pantry)
        score += 1.0 / (dl + 1.0)

    return score

def pantry_coverage_score(recipe_ingredients: List[str], pantry_names: List[str]) -> float:
    """
    Simple coverage: how many ingredient names are found in pantry tokens.
    """
    pantry = set(_norm(x) for x in pantry_names if x)
    if not recipe_ingredients:
        return 0.0
    hits = 0
    for ing in recipe_ingredients:
        n = _norm(ing)
        # "garlic cloves" should match "garlic"
        if any(p in n or n in p for p in pantry):
            hits += 1
    return hits / max(len(recipe_ingredients), 1)

def compute_score(
    recipe: Dict[str, Any],
    *,
    requested_cuisine: str,
    requested_meal_type: str,
    diet: str,
    main_ingredient: Optional[str],
    pantry_names: List[str],
    pantry_expiry_days: Dict[str, int],   # ✅ new
) -> float:
    score = 0.0

    # pantry coverage
    ing_names = [i.get("name", "") for i in recipe.get("ingredients", [])]
    cov = pantry_coverage_score(ing_names, pantry_names)
    score += cov * 50.0

    # cuisine / meal match
    rc = _norm(requested_cuisine)
    rm = _norm(requested_meal_type)
    cuisine = _norm(recipe.get("cuisine") or recipe.get("source") or "")
    meal = _norm(recipe.get("meal_type") or "")

    if rc not in {"any cuisine", "any", "all", ""}:
        if rc in cuisine or cuisine in rc:
            score += 15.0

    if rm not in {"any meal", "any", ""}:
        if rm == meal:
            score += 10.0

    # main ingredient presence
    if main_ingredient:
        mi = _norm(main_ingredient)
        if any(mi in _norm(x) for x in ing_names):
            score += 15.0
    
    if main_ingredient and not main_ingredient_present(recipe, main_ingredient):
        return -1e9

    # diet preference
    d = _norm(diet)
    tags = set(_norm(t) for t in (recipe.get("dietary_tags") or recipe.get("dietaryTags") or []))
    if d not in {"non specific", "nonspecific", ""}:
        if d in tags:
            score += 10.0

    # ✅ expiry urgency (tune weight)
    urg = expiry_urgency_score(recipe, pantry_expiry_days)  # e.g. 0.. ~3
    score += urg * 20.0  # <-- weight (try 10-30)

    return score

def pick_best(candidates: List[Dict[str, Any]], scores: List[float]) -> Optional[Dict[str, Any]]:
    if not candidates:
        return None
    best_i = max(range(len(candidates)), key=lambda i: scores[i])
    return candidates[best_i]