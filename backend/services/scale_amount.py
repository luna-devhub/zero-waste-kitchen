import re
from typing import Optional

_NUM_RE = re.compile(r"^\s*(\d+(?:\.\d+)?)\s*(.*)$")

def _safe_float(s: str) -> Optional[float]:
    try:
        return float(s)
    except Exception:
        return None

def _pick_first_number(amount: str) -> Optional[float]:
    """
    Attempts to parse leading number from strings like:
      "600 g" -> 600
      "2 tbsp" -> 2
      "2–3 tbsp" -> 2 (keeps it simple)
      "to taste" -> None
    """
    if not amount:
        return None

    a = amount.strip()
    # normalize en-dash/em-dash to '-'
    a = a.replace("–", "-").replace("—", "-")

    # handle ranges "2-3 tbsp": take first number
    if "-" in a:
        first = a.split("-", 1)[0].strip()
        m = _NUM_RE.match(first)
        return _safe_float(m.group(1)) if m else None

    m = _NUM_RE.match(a)
    return _safe_float(m.group(1)) if m else None

def scale_amount_string(amount: str, from_servings: int, to_servings: int) -> str:
    """
    Scales amount strings when possible; otherwise returns original.
    """
    if not amount or from_servings <= 0 or to_servings <= 0:
        return amount

    n = _pick_first_number(amount)
    if n is None:
        return amount  # "to taste", "a pinch", etc.

    ratio = to_servings / from_servings
    scaled = n * ratio

    # Keep the remainder of the string after the first number
    # e.g. "600 g" -> remainder "g"
    # For ranges, we only scale the first number (simple & stable).
    a = amount.strip().replace("–", "-").replace("—", "-")
    if "-" in a:
        # keep original range text (optionally you could scale both ends)
        parts = a.split("-", 1)
        remainder = parts[1].lstrip()
        # remainder like "3 tbsp" -> strip its number, keep unit
        m = _NUM_RE.match(remainder)
        unit = (m.group(2) if m else remainder).strip()
        return f"{scaled:.2f}".rstrip("0").rstrip(".") + f"-{parts[1].strip()}"  # minimal change
    else:
        m = _NUM_RE.match(a)
        remainder = (m.group(2) if m else "").strip()
        num_txt = f"{scaled:.2f}".rstrip("0").rstrip(".")
        return f"{num_txt} {remainder}".strip()