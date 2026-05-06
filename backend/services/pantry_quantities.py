import re
from typing import Dict, Tuple

def _norm(s: str) -> str:
    s = (s or "").strip().lower()
    s = re.sub(r"[^a-z0-9\s]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s

def build_pantry_map(pantry_docs) -> Dict[str, Tuple[float, str]]:
    """
    Returns: { normalized_name: (total_quantity, unit) }
    If multiple entries have different units, we keep the latest unit and sum quantities only when units match.
    """
    out: Dict[str, Tuple[float, str]] = {}
    for d in pantry_docs:
        name = _norm(d.get("name", ""))
        if not name:
            continue
        qty = float(d.get("quantity") or 0)
        unit = (d.get("unit") or "").strip().lower()

        if name not in out:
            out[name] = (qty, unit)
        else:
            prev_qty, prev_unit = out[name]
            if prev_unit == unit:
                out[name] = (prev_qty + qty, unit)
            else:
                # unit mismatch -> keep bigger qty as best-effort
                out[name] = (max(prev_qty, qty), unit or prev_unit)
    return out