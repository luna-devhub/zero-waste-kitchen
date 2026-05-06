# services/inventory_deduct.py
from __future__ import annotations
from datetime import datetime

from typing import Any, Dict, List, Optional, Tuple
from datetime import datetime, timezone
import re

from database import ingredient_collection, history_collection
from services.unit_convert import norm_unit, to_base, is_non_numeric, default_non_numeric_deduction
from services.name_normalize import name_matches, normalize_name
from services.convert_smart import to_base_smart

_NUM_UNIT_RE = re.compile(r"^\s*(?P<num>\d+(?:\.\d+)?)\s*(?P<unit>[a-zA-Z]+)?\s*$")

def _norm_name(name: str) -> str:
    return (name or "").strip().lower()

def parse_amount_to_base(ingredient_name: str, amount_text: str) -> Optional[Tuple[int, str]]:
    """
    Smart parse:
      - strips ", sliced" etc
      - handles ranges "2–3 tbsp" (takes max)
      - supports approx units via to_base_smart (clove/stalk/large, powders, etc.)
    """
    t = (amount_text or "").strip().lower()
    if not t:
        return None

    # drop trailing notes
    t = t.split(",", 1)[0].strip()

    # handle non numeric: "to taste", etc.
    if is_non_numeric(t):
        return default_non_numeric_deduction(ingredient_name)

    # normalize servings
    t = t.replace("servings", "pcs").replace("serving", "pcs")

    # handle ranges: take max for safety
    t = t.translate(str.maketrans({"–": "-", "—": "-"}))
    m_range = re.match(r"^\s*(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*(.*)$", t)
    if m_range:
        qty = float(m_range.group(2))  # max side
        rest = (m_range.group(3) or "").strip()
        unit = rest.split()[0] if rest else ""
        base = to_base_smart(qty, unit, ingredient_name, "")
        return base

    # normal "1.5 cloves", "600 g", etc.
    m = re.match(r"^\s*(\d+(?:\.\d+)?)\s*([a-zA-Z]+)?", t)
    if not m:
        return None

    qty = float(m.group(1))
    unit = (m.group(2) or "").strip().lower()

    base = to_base_smart(qty, unit, ingredient_name, "")
    return base

async def fefo_deduct_user_stock(user_ids: List[str], recipe_ingredients: List[Dict[str, Any]]) -> Dict[str, Any]:
    now = datetime.now(timezone.utc)
    deductions: List[Dict[str, Any]] = []
    warnings: List[str] = []

    # Pull all lots once in FEFO order
    all_lots: List[Dict[str, Any]] = []
    cursor_all = ingredient_collection.find({"user_id": {"$in": user_ids}}).sort(
        [("expiryDate", 1), ("addedDate", 1), ("_id", 1)]
    )
    async for lot in cursor_all:
        all_lots.append(lot)

    for ing in recipe_ingredients or []:
        ing_name = (ing.get("name") or "").strip()
        amt_text = (ing.get("amount") or "").strip()
        if not ing_name:
            continue

        # Match lots for this ingredient (fuzzy)
        req = normalize_name(ing_name)

        exact = []
        partial = []

        for lot in all_lots:
            lot_name = lot.get("name", "") or ""
            lot_norm = normalize_name(lot_name)

            if lot_norm == req:
                exact.append(lot)
            elif name_matches(ing_name, lot_name):
                partial.append(lot)


        def safe_date(v):
            if isinstance(v, datetime):
                return v
            if isinstance(v, str):
                try:
                    return datetime.fromisoformat(v)
                except:
                    return datetime.max
            return datetime.max

        matched_lots = sorted(
            exact + partial,
            key=lambda x: (
                safe_date(x.get("expiryDate")),
                safe_date(x.get("addedDate")),
                str(x.get("_id"))
            )
        )

        # Parse qty+unit from recipe amount (reuse your smart parser but add category hint)
        # We’ll use your parse_amount_to_base but with category hint:
        need: Optional[Tuple[int, str]] = None

        # --- inline parse (same behavior as your parse_amount_to_base, but with cat hint) ---
        t = (amt_text or "").strip().lower()
        if t:
            t = t.split(",", 1)[0].strip()
            t = t.replace("servings", "pcs").replace("serving", "pcs")
            t = t.translate(str.maketrans({"–": "-", "—": "-"}))

            if is_non_numeric(t):
                need = default_non_numeric_deduction(ing_name)
            else:
                m_range = re.match(r"^\s*(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*(.*)$", t)
                if m_range:
                    qty = float(m_range.group(2))  # max side
                    rest = (m_range.group(3) or "").strip()
                    unit = rest.split()[0] if rest else ""
                else:
                    m = re.match(r"^\s*(\d+(?:\.\d+)?)\s*([a-zA-Z]+)?", t)
                    if m:
                        qty = float(m.group(1))
                        unit = (m.group(2) or "").strip().lower()
                    else:
                        qty = None
                        unit = ""

                if qty is not None:
                    cat_hint = (matched_lots[0].get("category") or "") if matched_lots else ""
                    need = to_base_smart(qty, unit, ing_name, cat_hint)

        if not need:
            warnings.append(f"Skipped '{ing_name}' (amount='{amt_text}') — unsupported unit")
            continue

        need_base, need_unit = need
        if need_base <= 0:
            continue

        remaining = int(need_base)
        lots_used: List[Dict[str, Any]] = []

        # ✅ Iterate matched_lots ONCE (cursor bug fixed)
        for lot in matched_lots:
            if remaining <= 0:
                break

            lot_qty = lot.get("quantity")
            lot_unit = (lot.get("unit") or "").strip().lower()
            lot_cat = (lot.get("category") or "").strip()

            if not isinstance(lot_qty, (int, float)) or not lot_unit:
                continue

            lot_base_t = to_base_smart(float(lot_qty), lot_unit, lot.get("name", ""), lot_cat)
            if not lot_base_t:
                continue

            lot_base, lot_base_unit = lot_base_t
            if lot_base_unit != need_unit:
                continue

            use = min(remaining, lot_base)
            if use <= 0:
                continue

            new_lot_base = lot_base - use

            # Reverse base -> original lot unit
            u = norm_unit(lot_unit)
            new_qty: Optional[float] = None

            if need_unit == "g":
                from services.unit_convert import WEIGHT_TO_G
                if u in WEIGHT_TO_G and WEIGHT_TO_G[u]:
                    new_qty = new_lot_base / WEIGHT_TO_G[u]
            elif need_unit == "ml":
                from services.unit_convert import VOLUME_TO_ML
                if u in VOLUME_TO_ML and VOLUME_TO_ML[u]:
                    new_qty = new_lot_base / VOLUME_TO_ML[u]
            elif need_unit == "pcs":
                new_qty = float(new_lot_base)

            update_doc: Dict[str, Any] = {
                "updated_at": now,
                "quantity_base": int(new_lot_base),
                "unit_base": need_unit,
            }
            if new_qty is not None:
                update_doc["quantity"] = max(0.0, float(new_qty))

            await ingredient_collection.update_one(
                {"_id": lot["_id"]},
                {"$set": update_doc},
            )

            # Log history entry
            await history_collection.insert_one({
                "user_id": user_ids,
                "ingredientName": lot.get("name"),
                "action": "used",
                "quantity": float(use),
                "unit": need_unit,
                "details": f"Used for recipe: {ing_name}",
                "timestamp": now
            })

            lots_used.append({
                "lot_id": str(lot["_id"]),
                "expiryDate": lot.get("expiryDate"),
                "used_base": int(use),
                "base_unit": need_unit,
            })

            remaining -= use

        if remaining > 0:
            warnings.append(
                f"Insufficient '{ing_name}': need {need_base}{need_unit}, short {remaining}{need_unit}"
            )

        deductions.append({
            "ingredient": ing_name,
            "requested_amount_text": amt_text,
            "requested_base": int(need_base),
            "base_unit": need_unit,
            "lots": lots_used,
            "short_base": int(remaining),
        })

    return {"deductions": deductions, "warnings": warnings}