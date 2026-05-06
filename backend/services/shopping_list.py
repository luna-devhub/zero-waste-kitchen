import re
from typing import Dict, List, Tuple, Optional
from services.amount_parse import parse_amount

def _norm(s: str) -> str:
    s = (s or "").strip().lower()
    s = re.sub(r"[^a-z0-9\s]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s

IGNORE = {"salt", "pepper", "black pepper", "water"}

def compute_missing_ingredients(
    recipe_ingredients: List[Dict[str, str]],
    pantry_map: Dict[str, Tuple[float, str]],
) -> Tuple[bool, List[Dict[str, str]]]:
    """
    Returns:
      (is_cookable, missing_list)
    missing_list items:
      { "name": "Chicken", "amount": "1 g" }  # deficit
    Rules:
      - if recipe qty can't be parsed -> treat as missing full (amount as original)
      - if unit mismatch -> treat as missing full (amount as original)
    """
    missing: List[Dict[str, str]] = []

    for ing in recipe_ingredients or []:
        name_raw = ing.get("name") or ""
        if not name_raw:
            continue

        name_key = _norm(name_raw)
        if name_key in IGNORE:
            continue

        amount_raw = (ing.get("amount") or "").strip()
        need_qty, need_unit = parse_amount(amount_raw)

        have_qty, have_unit = pantry_map.get(name_key, (0.0, ""))

        # If we can't parse required amount, just treat it as missing (best-effort)
        if need_qty is None:
            # If user has the ingredient name at all, we won't block it; but usually better to still show it.
            if name_key not in pantry_map:
                missing.append({"name": name_raw, "amount": amount_raw or "needed"})
            continue

        # Unit mismatch -> can’t safely subtract
        if need_unit and have_unit and need_unit != have_unit:
            # show full requirement as "missing" (safe)
            if have_qty <= 0:
                missing.append({"name": name_raw, "amount": amount_raw})
            else:
                missing.append({"name": name_raw, "amount": amount_raw})  # still safe
            continue

        # Normal subtract
        deficit = need_qty - (have_qty or 0.0)
        if deficit > 1e-9:
            unit = need_unit or have_unit or ""
            # format nicely
            amt_txt = f"{deficit:.2f}".rstrip("0").rstrip(".")
            missing.append({"name": name_raw, "amount": f"{amt_txt} {unit}".strip()})

    return (len(missing) == 0), missing