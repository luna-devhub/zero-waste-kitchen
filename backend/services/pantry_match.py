#services/pantry_match.py
import re
from typing import List, Dict, Any, Tuple, Set, Optional
from services.name_normalize import name_matches, normalize_name
from services.convert_smart import to_base_smart

def _norm(s: str) -> str:
    s = (s or "").strip().lower()
    s = re.sub(r"[^a-z0-9\s]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


DEFAULT_IGNORE = {
    "salt", "pepper", "black pepper", "water",
}


# ----------------------------
# amount parsing (best-effort)
# ----------------------------
_DASH = str.maketrans({"–": "-", "—": "-"})

def _parse_amount(amount: str) -> Tuple[Optional[float], str]:
    """
    Parses leading quantity + unit.
    Examples:
      "200ml" -> (200, "ml")
      "200 ml" -> (200, "ml")
      "2 g" -> (2, "g")
      "2-3 tbsp" -> (2, "tbsp")   (takes first)
      "to taste" -> (None, "")
    """
    s = (amount or "").strip().lower().translate(_DASH)
    if not s:
        return None, ""

    # range -> take first number
    if "-" in s:
        s = s.split("-", 1)[0].strip()

    # match number + optional unit letters
    m = re.match(r"^\s*(\d+(?:\.\d+)?)\s*([a-zA-Z]+)?", s)
    if not m:
        return None, ""
    qty = float(m.group(1))
    unit = (m.group(2) or "").strip().lower()
    return qty, unit



def _format_amount(qty: float, unit: str) -> str:
    unit = (unit or "").strip()
    if unit in {"pc", "pcs", "piece", "pieces"}:
        return f"{int(round(qty))} pcs"
    if qty < 10:
        return f"{round(qty, 1)} {unit}".strip()
    return f"{int(round(qty))} {unit}".strip()


# ----------------------------
# OLD function (keep it)
# ----------------------------
def pantry_check_recipe(
    recipe_ingredients: List[Dict[str, str]],
    pantry_names: List[str],
    ignore: Set[str] = DEFAULT_IGNORE,
) -> Tuple[bool, List[str]]:
    """
    Returns (is_cookable, missing_names).
    Match is name-based best-effort.
    """
    pantry = set(_norm(x) for x in pantry_names if x)
    missing: List[str] = []

    for ing in recipe_ingredients or []:
        name_raw = ing.get("name", "")
        name = _norm(name_raw)

        if not name:
            continue
        if name in ignore:
            continue

        ok = any((p in name) or (name in p) for p in pantry)
        if not ok:
            missing.append(name_raw)

    return (len(missing) == 0), missing


# ----------------------------
# NEW function: deficits
# ----------------------------
def pantry_check_recipe_with_amounts(
    recipe_ingredients: List[Dict[str, str]],
    pantry_docs: List[Dict[str, Any]],
    ignore: Set[str] = DEFAULT_IGNORE,
) -> Tuple[bool, List[Dict[str, str]]]:
    """
    Returns (is_cookable, missing_list) where missing_list items are deficits:
      { "name": "Chicken", "amount": "150 g" }

    Uses:
      - name_matches() for fuzzy ingredient matching
      - to_base_smart() for unit conversion (incl approx + powder rules)
    """

    # --- safer amount parse (handles commas + ranges, keeps your interface) ---
    _dash = str.maketrans({"–": "-", "—": "-"})
    punct = " ,.;:()[]{}"

    def parse_amount2(amount: str) -> Tuple[Optional[float], str]:
        s = (amount or "").strip().lower().translate(_dash)
        if not s:
            return None, ""
        s = s.split(",", 1)[0].strip()  # drop ", sliced"

        # range like "2-3 tbsp": take MAX for safety
        m_range = re.match(r"^\s*(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*(.*)$", s)
        if m_range:
            lo = float(m_range.group(1))
            hi = float(m_range.group(2))
            qty = max(lo, hi)
            rest = (m_range.group(3) or "").strip()
        else:
            m = re.match(r"^\s*(\d+(?:\.\d+)?)\s*([a-zA-Z].*)?$", s)
            if not m:
                return None, ""
            qty = float(m.group(1))
            rest = (m.group(2) or "").strip()

        unit = rest.split()[0].strip(punct) if rest else ""
        if not unit:
            unit = "pcs"
        return qty, unit

    def fmt_base_amount(qty_base: int, base_unit: str) -> str:
        if base_unit == "pcs":
            return f"{qty_base} pcs"
        return f"{qty_base} {base_unit}"

    # --- Build pantry availability in BASE units grouped by ingredient key ---
    # We'll build a list of entries (name, base_qty, base_unit) from pantry docs,
    # then match each recipe ingredient against these entries using name_matches.
    pantry_entries: List[Dict[str, Any]] = []

    for d in pantry_docs or []:
        pname_raw = d.get("name", "") or ""
        if not pname_raw:
            continue

        qty = d.get("quantity", None)
        unit = (d.get("unit") or "").strip().lower()
        cat = (d.get("category") or "").strip()

        if not isinstance(qty, (int, float)):
            continue
        if not unit:
            continue

        base = to_base_smart(float(qty), unit, pname_raw, cat)
        if not base:
            # can't convert this pantry item -> ignore it for numeric matching
            continue

        base_qty, base_unit = base
        pantry_entries.append({
            "name_raw": pname_raw,
            "name_norm": normalize_name(pname_raw),
            "base_qty": int(base_qty),
            "base_unit": base_unit,
            "category": cat,
        })

    missing: List[Dict[str, str]] = []

    for ing in recipe_ingredients or []:
        name_raw = ing.get("name", "") or ""
        amount_raw = (ing.get("amount", "") or "").strip()

        name_key = normalize_name(name_raw)
        if not name_key:
            continue
        if name_key in ignore:
            continue

        # find all matching pantry entries for this recipe ingredient
        matches = [p for p in pantry_entries if name_matches(name_raw, p["name_raw"])]

        # If ingredient not in pantry at all -> missing full amount (best-effort)
        if not matches:
            qty, unit = parse_amount2(amount_raw)
            if qty is None:
                # Non-numeric: if it's "to taste" we can ignore, else show as needed
                if amount_raw:
                    missing.append({"name": name_raw, "amount": amount_raw})
                else:
                    missing.append({"name": name_raw, "amount": "needed"})
                continue

            # convert need to base (smart)
            # convert need to base (smart) - no pantry category available here
            need_base = to_base_smart(qty, unit, name_raw, "")
            if need_base:
                nb, bu = need_base
                missing.append({"name": name_raw, "amount": fmt_base_amount(nb, bu)})
            else:
                # fallback to original display
                missing.append({"name": name_raw, "amount": amount_raw or f"{qty} {unit}".strip()})
            continue

        # parse needed amount
        qty, unit = parse_amount2(amount_raw)

        # If recipe doesn't provide numeric amount -> treat as cookable if present
        if qty is None:
            continue

        cat_hint = (matches[0].get("category") or "") if matches else ""
        need_base = to_base_smart(qty, unit, name_raw, cat_hint)
        if not need_base:
            # Can't convert recipe amount -> safest: ask to buy it (keeps your old behavior)
            missing.append({"name": name_raw, "amount": amount_raw or "needed"})
            continue

        need_qty_base, need_unit_base = need_base

        # sum available in the SAME base unit across all matched pantry entries
        have_qty_base = sum(
            p["base_qty"] for p in matches if p["base_unit"] == need_unit_base
        )

        deficit = int(need_qty_base - have_qty_base)
        if deficit > 0:
            missing.append({"name": name_raw, "amount": fmt_base_amount(deficit, need_unit_base)})

    return (len(missing) == 0), missing