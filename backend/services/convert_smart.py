# services/convert_smart.py
import math
from typing import Optional, Tuple
from services.unit_convert import norm_unit, to_base_with_approx
from services.name_normalize import normalize_name

POWDER_WORDS = {
    "flour", "powder", "turmeric", "paprika", "cumin", "spice",
    "chickpea", "rice flour",
    # ✅ add salt
    "salt", "sea salt", "kosher salt", "table salt"
}

# rough but consistent spoon->grams for powders/spices
POWDER_SPOON_G = {"tsp": 3, "tbsp": 9, "cup": 120, "cups": 120}

# tiny measures for spices/salt
SPICE_TINY_G = {
    "pinch": 1,
    "dash": 1,
    "sprinkle": 1,
}

# liquids (approx spoon/cup -> ml)
LIQUID_WORDS = {
    "sauce", "soy sauce", "fish sauce", "oyster sauce",
    "milk", "water", "broth", "stock", "vinegar", "oil",
    "lemon juice", "lime juice"
}
LIQUID_SPOON_ML = {"tsp": 5, "tbsp": 15, "cup": 240, "cups": 240}

# produce cups -> grams (optional)
VEG_CUP_G = 120  # 1 cup chopped veg ~120g (rough)

def to_base_smart(
    amount: float,
    unit: str,
    ingredient_name: str,
    pantry_category: str = ""
) -> Optional[Tuple[int, str]]:
    """
    Convert recipe amount to a base unit used by FEFO:
      - g for weights
      - ml for volumes
      - pcs for countables
    Handles tricky cases: pinch/dash, salt/spices, "serving(s)" for liquids, etc.
    """
    u = norm_unit(unit)
    n = normalize_name(ingredient_name)
    cat = (pantry_category or "").strip().lower()

    if not u:
        u = "pcs"

    looks_powder = any(w in n for w in POWDER_WORDS) or cat in {"spices", "baking"}
    looks_liquid = any(w in n for w in LIQUID_WORDS) or cat in {"liquid", "sauces", "condiments"}

    # ✅ 1) pinch/dash/sprinkle for spices/salt -> grams (ceil so 0.25 pinch still deducts 1g)
    if looks_powder and u in SPICE_TINY_G:
        return int(math.ceil(amount * SPICE_TINY_G[u])), "g"

    # ✅ 2) powder/spice spoons/cups -> grams
    if looks_powder and u in POWDER_SPOON_G:
        return int(round(amount * POWDER_SPOON_G[u])), "g"

    # ✅ 3) liquids spoons/cups -> ml
    if looks_liquid and u in LIQUID_SPOON_ML:
        return int(round(amount * LIQUID_SPOON_ML[u])), "ml"

    # ✅ 4) "serving(s)" handling (prevents sauce becoming pcs)
    if u in {"serving", "servings"}:
        if looks_liquid:
            # pick a consistent "serving" size for liquids
            return int(round(amount * 15)), "ml"   # 1 serving ≈ 15ml
        return int(round(amount)), "pcs"

    # ✅ 5) produce cups -> grams
    if cat in {"vegetables", "fruits"} and u in {"cup", "cups"}:
        return int(round(amount * VEG_CUP_G)), "g"

    # ✅ fallback: normal/approx conversion (g/ml/pcs + approx units you already support)
    try:
        return to_base_with_approx(amount, u, ingredient_name)
    except Exception:
        return None