from typing import Any, Dict, List, Optional
from services.scale_amount import scale_amount_string
import re
import html

_TAG_RE = re.compile(r"<[^>]+>")

def strip_html(text: str) -> str:
    if not text:
        return ""
    # convert &amp; etc, then remove tags, then normalize whitespace
    text = html.unescape(text)
    text = _TAG_RE.sub("", text)
    return " ".join(text.split()).strip()

def _pick_meal_type(dish_types: List[str]) -> Optional[str]:
    """
    Spoonacular dishTypes can be like: ["breakfast", "salad", "drink", "lunch"]
    Map to your app's expected values.
    """
    if not dish_types:
        return None
    dset = {str(x).strip().lower() for x in dish_types if x}

    # Priority order (adjust if you want)
    for k in ["breakfast", "lunch", "dinner", "dessert", "salad"]:
        if k in dset:
            return k
    return None

def spoonacular_to_recipe_out(info: Dict[str, Any], requested_servings: int) -> Dict[str, Any]:
    rid = str(info.get("id", ""))
    title = info.get("title") or "Untitled Recipe"
    raw_summary = info.get("summary") or ""
    description = strip_html(raw_summary) or info.get("sourceUrl") or "Recipe from Spoonacular."

    from_servings = int(info.get("servings") or 1)
    if requested_servings is None or requested_servings <= 0:
        requested_servings = from_servings

    cooking_time = int(info.get("readyInMinutes") or 0)
    prep_time = int(info.get("preparationMinutes") or 0)

    # calories (optional; Spoonacular sometimes includes nutrition)
    calories: Optional[int] = None
    nutrition = info.get("nutrition") or {}
    if isinstance(nutrition, dict):
        nutrients = nutrition.get("nutrients") or []
        for n in nutrients:
            if (n.get("name") or "").lower() == "calories":
                try:
                    calories = int(float(n.get("amount")))
                except Exception:
                    calories = None
                break

    # cuisine + meal type
    cuisines = info.get("cuisines") or []
    cuisine = cuisines[0] if cuisines else None

    dish_types = info.get("dishTypes") or []
    meal_type = _pick_meal_type(dish_types)

    # dietary tags
    dietary_tags: List[str] = []
    diets = info.get("diets") or []
    if isinstance(diets, list):
        dietary_tags.extend([str(x).strip().lower() for x in diets if x])

    # also add some boolean flags Spoonacular provides
    for flag, tag in [
        ("vegetarian", "vegetarian"),
        ("vegan", "vegan"),
        ("glutenFree", "gluten free"),
        ("dairyFree", "dairy free"),
    ]:
        if info.get(flag) is True and tag not in dietary_tags:
            dietary_tags.append(tag)

    # ingredients
    ings_out: List[Dict[str, str]] = []
    for ing in info.get("extendedIngredients", []) or []:
        name = ing.get("name") or ing.get("originalName") or "ingredient"

        # Spoonacular gives amount + unit
        amt = ing.get("amount")
        unit = ing.get("unit") or ""

        # Build "X unit" then scale your display string
        if amt is None:
            amount_str = ing.get("original") or ""
        else:
            # Make a consistent amount string for your scaler
            raw = f"{amt} {unit}".strip()
            amount_str = scale_amount_string(raw, from_servings, requested_servings)

        ings_out.append({"name": str(name), "amount": amount_str})

    # instructions: prefer analyzedInstructions steps
    instructions: List[str] = []
    analyzed = info.get("analyzedInstructions") or []
    if analyzed and isinstance(analyzed, list) and analyzed[0].get("steps"):
        for step in analyzed[0]["steps"]:
            txt = (step.get("step") or "").strip()
            if txt:
                instructions.append(txt)
    else:
        # fallback to plain instructions string
        raw_ins = strip_html((info.get("instructions") or "").strip())
        if raw_ins:
            parts = [p.strip() for p in raw_ins.split(".") if p.strip()]
            instructions.extend([p + "." for p in parts])
            
    return {
        "id": rid,
        "title": title,
        "description": description,
        "cookingTime": cooking_time,
        "prepTime": prep_time,
        "calories": calories,
        "ingredients": ings_out,
        "instructions": instructions,
        "cuisine": cuisine,              # ✅ needed for request matching
        "meal_type": meal_type,          # ✅ needed for request matching
        "dietary_tags": dietary_tags,    # ✅ useful for filtering/ranking
        # "origin": "spoonacular"         # you already set this outside
    }
    """
    Maps Spoonacular /recipes/{id}/information to your UI shape.
    """
    rid = str(info.get("id", ""))
    title = info.get("title") or "Untitled Recipe"
    servings = int(info.get("servings") or 1)

    prep = int(info.get("preparationMinutes") or 0)
    cook = int(info.get("cookingMinutes") or 0)
    if prep == 0 and info.get("readyInMinutes"):
        # readyInMinutes includes total time; split naive
        total = int(info["readyInMinutes"])
        cook = max(cook, total)
        prep = max(prep, 0)

    calories: Optional[int] = None
    nutrition = info.get("nutrition") or {}
    for n in nutrition.get("nutrients", []) or []:
        if (n.get("name") or "").lower() == "calories":
            try:
                calories = int(round(float(n.get("amount", 0))))
            except Exception:
                calories = None

    # ingredients: use measures.metric if present; fallback to original
    ings_out: List[Dict[str, str]] = []
    for ing in info.get("extendedIngredients", []) or []:
        name = ing.get("name") or ing.get("originalName") or "ingredient"
        metric = (((ing.get("measures") or {}).get("metric")) or {})
        amt = metric.get("amount")
        unit = metric.get("unitShort") or metric.get("unitLong") or ""
        if amt is not None:
            amount_str = f"{amt} {unit}".strip()
        else:
            amount_str = ing.get("original") or ""

        amount_str = scale_amount_string(amount_str, servings, requested_servings)
        ings_out.append({"name": name, "amount": amount_str})

    # instructions: Spoonacular gives html in summary; better use analyzedInstructions if present
    steps: List[str] = []
    analyzed = info.get("analyzedInstructions") or []
    if analyzed and isinstance(analyzed, list) and analyzed[0].get("steps"):
        for s in analyzed[0]["steps"]:
            st = s.get("step")
            if st:
                steps.append(st)
    else:
        # fallback to "instructions" text (may contain markup)
        raw = info.get("instructions") or ""
        if raw:
            steps = [raw]

    description = (info.get("summary") or "").strip()
    if not description:
        description = "A recipe matched to your preferences."

    return {
        "id": rid,
        "title": title,
        "description": description,
        "cookingTime": cook,
        "prepTime": prep,
        "calories": calories,
        "ingredients": ings_out,
        "instructions": steps,
    }