import re
from typing import Optional, Tuple

RANGE_FIX = str.maketrans({"–": "-", "—": "-"})
PUNCT_TRIM = " ,.;:()[]{}"

def parse_amount(amount_str: str) -> Tuple[Optional[float], str]:
    """
    Best-effort:
      "2 g" -> (2, "g")
      "200ml" -> (200, "ml")
      "2–3 tbsp" -> (3, "tbsp")       (takes max; safer)
      "0.25 large, sliced" -> (0.25, "large")
      "to taste" -> (None, "")
    """
    s = (amount_str or "").strip().lower().translate(RANGE_FIX)
    if not s:
        return None, ""

    # drop trailing notes: ", sliced", ", bruised", etc.
    s = s.split(",", 1)[0].strip()

    # handle ranges: take max value (safer for stock check)
    # examples: "2-3 tbsp", "1 - 2 tsp"
    m_range = re.match(r"^\s*(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*(.*)$", s)
    if m_range:
        lo = float(m_range.group(1))
        hi = float(m_range.group(2))
        rest = (m_range.group(3) or "").strip()
        qty = max(lo, hi)
    else:
        # match leading number + rest
        m = re.match(r"^\s*(\d+(?:\.\d+)?)\s*([a-zA-Z].*)?$", s)
        if not m:
            return None, ""
        qty = float(m.group(1))
        rest = (m.group(2) or "").strip()

    # unit is first token of rest, stripped of punctuation
    unit = rest.split()[0].strip(PUNCT_TRIM) if rest else ""
    return qty, unit