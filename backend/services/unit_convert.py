# services/unit_convert.py
from __future__ import annotations
from typing import Optional, Tuple
import re

WEIGHT_TO_G = {
    "g": 1.0,
    "kg": 1000.0,
    "oz": 28.3495,
    "lb": 453.592,
}

VOLUME_TO_ML = {
    "ml": 1.0,
    "l": 1000.0,
    "tbsp": 15.0,
    "tsp": 5.0,
    "cups": 240.0,  # approximation
}

COUNT_UNITS = {"pcs"}


def norm_unit(u: str) -> str:
    u = (u or "").strip().lower()
    aliases = {
        "pc": "pcs",
        "piece": "pcs",
        "pieces": "pcs",
        "cup": "cups",
        "tablespoon": "tbsp",
        "tablespoons": "tbsp",
        "teaspoon": "tsp",
        "teaspoons": "tsp",
        "pound": "lb",
        "pounds": "lb",
        "ounce": "oz",
        "ounces": "oz",
        "cloves": "clove",
        "stalks": "stalk",
    }
    return aliases.get(u, u)


def to_base(amount: float, unit: str) -> Tuple[int, str]:
    """
    Convert to base unit and return INTEGER base amount (DP-friendly to avoid float drift).
    - weight -> grams (int)
    - volume -> ml (int)
    - count -> pcs (int)
    """
    u = norm_unit(unit)
    if u in WEIGHT_TO_G:
        return int(round(amount * WEIGHT_TO_G[u])), "g"
    if u in VOLUME_TO_ML:
        return int(round(amount * VOLUME_TO_ML[u])), "ml"
    if u in COUNT_UNITS:
        return int(round(amount)), "pcs"
    raise ValueError(f"Unsupported unit: {unit}")


NON_NUMERIC_PAT = re.compile(r"(to taste|as needed|pinch|some|optional|few|handful|for garnish|to serve)", re.I)


def is_non_numeric(amount_text: str) -> bool:
    return bool(NON_NUMERIC_PAT.search(amount_text or ""))


def default_non_numeric_deduction(name: str) -> Optional[Tuple[int, str]]:
    """
    Return a small default base deduction for "to taste" items.
    Values are INTEGERS in base units.
    """
    n = (name or "").lower()

    # spices/seasonings
    if "salt" in n:
        return (2, "g")
    if "pepper" in n:
        return (1, "g")
    if any(x in n for x in ["chili", "chilli", "paprika", "cumin", "turmeric", "coriander", "curry powder"]):
        return (1, "g")
    if any(x in n for x in ["basil", "cilantro", "parsley", "mint", "coriander leaves"]):
        return (5, "g")

    # sauces/oil
    if any(x in n for x in ["soy sauce", "fish sauce", "vinegar", "lemon", "lime"]):
        return (10, "ml")
    if "oil" in n:
        return (5, "ml")

    return None  # unknown -> don't deduct

# add near bottom of unit_convert.py
APPROX = {
    # unit -> (base_amount_per_unit, base_unit)
    # these are generic defaults; better is ingredient-specific
    "clove": (5, "g"),
    "stalk": (20, "g"),
    "handful": (20, "g"),
    "large": (180, "g"),
    "medium": (150, "g"),
    "small": (100, "g"),
}

def to_base_with_approx(amount: float, unit: str, ingredient_name: str = "") -> Tuple[int, str]:
    try:
        return to_base(amount, unit)
    except ValueError:
        u = norm_unit(unit)
        if u in APPROX:
            per, base_u = APPROX[u]
            return int(round(amount * per)), base_u
        raise