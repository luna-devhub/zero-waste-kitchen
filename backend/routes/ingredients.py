from fastapi import APIRouter, HTTPException, Query
from models.ingredient import IngredientModel
from database import ingredient_collection, history_collection, share_collection, user_collection
from bson import ObjectId
from datetime import datetime, timedelta, date
from typing import List, Optional, Dict, Any
import re
from typing import Optional

router = APIRouter(prefix="/ingredients", tags=["Ingredients"])

DEFAULT_EXPIRY_DAYS = {
    "Meat": 180,
    "Seafood": 160,
    "Cooked Food": 4,
    "Vegetables": 7,
    "Fruits": 7,
    "Dairy": 7,
    "Grains": 365,
    "Beans": 365,
    "Flour": 180,
    "Spices": 730,
    "Canned Goods": 365,
    "Other": 30,
}
DIET_ALIASES = {
    "vegan": "Vegan",
    "vegetarian": "Vegetarian",
    "dairy-free": "Dairy-Free",
    "dairy free": "Dairy-Free",
    "gluten-free": "Gluten-Free",
    "gluten free": "Gluten-Free",
    "low-carb": "Low-Carb",
    "low carb": "Low-Carb",
    "low-calorie": "Low-Calorie",
    "low calorie": "Low-Calorie",
    "non-specific": "Non-Specific",
    "nonspecific": "Non-Specific",
    "sugar-free": "Sugar-Free",
    "sugar free": "Sugar-Free",
}
# Single dietary option -> exclude categories (simple rule)
DIET_EXCLUDE_CATEGORIES = {
    "Vegan": ["Meat", "Dairy", "Seafood"],
    "Dairy-Free": ["Dairy"],
    # rough approximations
    "Gluten-Free": ["Grains"],
    "Low-Calorie": ["Grains"],
    "Sugar-Free":[],
    "Non-Specific": [],
}

def ingredient_helper(ingredient) -> dict:
    return {
        "id": str(ingredient["_id"]),
        "name": ingredient.get("name"),
        "quantity": ingredient.get("quantity"),
        "unit": ingredient.get("unit"),
        "category": ingredient.get("category"),
        "expiryDate": ingredient.get("expiryDate"),
        "expirySource": ingredient.get("expirySource"),
        "notes": ingredient.get("notes"),
        "user_id": ingredient.get("user_id"),
        "pantry_id": ingredient.get("pantry_id"),  # future
    }
def infer_category_from_name(name: str) -> str:
    n = (name or "").lower()


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip().lower())

def _dedupe(seq):
    # keep order, remove dupes
    seen = set()
    out = []
    for x in seq:
        x = _norm(x)
        if not x or x in seen:
            continue
        seen.add(x)
        out.append(x)
    return out

MEAT_KW = _dedupe([
    "chicken", "beef", "pork", "lamb", "duck", "turkey",
    "bacon", "sausage", "ham", "goat",
    "beef intestines", "chicken intestines",
])

SEAFOOD_KW = _dedupe([
    "fish", "salmon", "tuna", "shrimp", "prawn", "crab",
    "lobster", "octopus",
])

DAIRY_KW = _dedupe([
    "milk", "cheese", "yogurt", "butter", "cream",
])

FRUIT_KW = _dedupe([
    "apple", "banana", "lemon", "lime", "orange", "grape",
    "melon", "peach", "pear", "pineapple", "avocado",
    "coconut", "fig", "date", "kiwi", "mango", "papaya",
    "watermelon", "strawberry", "blueberry", "raspberry",
    "blackberry", "pomegranate", "durian", "jackfruit",
    "lychee", "persimmon", "quince", "tangerine",
    "grapefruit", "cranberry", "passionfruit", "starfruit",
    "dragonfruit", "guava", "plum",
    # note: "berry" and "citrus" are broad; keep if you want
    "berry", "citrus",
])

GRAINS_KW = _dedupe([
    "rice", "pasta", "noodle", "flour", "bread", "oat",
    "quinoa", "couscous", "barley", "cornmeal", "tortilla",
    "cracker", "cereal", "bulgur", "farro", "semolina",
    "spaghetti", "macaroni", "vermicelli", "lasagna",
    "fettuccine", "ramen", "soba", "udon",
    # beans/legumes - your app can still keep under Grains for now
    "beans", "lentil", "chickpea", "soybean", "black bean",
    "kidney bean", "pinto bean", "navy bean", "garbanzo bean",
    "split pea", "mung bean", "adzuki bean",
    "cornstarch", "baking powder", "baking soda", "yeast",
])

VEG_KW = _dedupe([
    "tomato", "garlic", "onion", "carrot", "lettuce", "spinach",
    "broccoli", "cucumber", "potato", "sweet potato", "cabbage",
    "zucchini", "mushroom", "bell pepper", "eggplant", "celery",
    "corn", "radish", "asparagus", "cauliflower", "ginger",
    "seaweed", "pumpkin",
    # herbs are tricky — often vegetables in your app
    "parsley", "mint", "cilantro", "basil",
])

SPICES_KW = _dedupe([
    # spices
    "salt", "pepper", "cumin", "turmeric", "paprika",
    "chili powder", "chili flakes",
    "oregano", "thyme", "rosemary", "cinnamon", "nutmeg",
    "clove", "bay leaf", "saffron", "cardamom",
    "coriander seed", "mustard seed",
    "curry powder", "garam masala", "five spice",
    "herbs de provence", "italian seasoning", "old bay seasoning",
    "za'atar", "sumac", "ras el hanout", "advieh", "shichimi togarashi",
    # sauces / condiments / oils (you still put them under Spices)
    "miso", "soy sauce", "fish sauce", "vinegar", "olive oil", "sesame oil",
    "vegetable oil", "canola oil", "sunflower oil", "avocado oil", "coconut oil",
    "balsamic vinegar", "apple cider vinegar", "red wine vinegar", "white wine vinegar",
    "rice vinegar", "malt vinegar", "sherry vinegar",
    "tahini", "hummus", "bbq sauce", "hot sauce", "mustard", "ketchup", "mayonnaise",
    "salsa", "marinara sauce", "pesto", "teriyaki sauce", "hoisin sauce", "sriracha",
    "tomato sauce", "alfredo sauce", "gravy", "curry sauce",
    "broth", "stock", "dressing", "vinaigrette", "sauce", "dip", "spread", "oil",
])

def resolve_category_only_if_other(
    name: str,
    category: Optional[str],
    quantity: Optional[float] = None,
    unit: Optional[str] = None,
) -> str:
    """
    ✅ Only auto-classify if category is missing OR exactly 'Other'.
    Otherwise return user's chosen category.
    """
    cat = (category or "").strip()
    if cat and cat.lower() != "other":
        return cat or "Other"

    n = _norm(name)
    u = _norm(unit or "")
    q = float(quantity or 0.0)

    # --- chili/chilli special rule ---
    if "chili" in n or "chilli" in n:
        # small qty => spices, else vegetable
        if u in {"tsp", "tbsp"}:
            return "Spices"
        if u == "g" and 0 < q <= 20:
            return "Spices"
        return "Vegetables"

    # Priority order (avoid herb conflicts)
    if any(k in n for k in MEAT_KW):
        return "Meat"
    if any(k in n for k in SEAFOOD_KW):
        return "Seafood"
    if any(k in n for k in DAIRY_KW):
        return "Dairy"
    if any(k in n for k in GRAINS_KW):
        return "Grains"
    if any(k in n for k in FRUIT_KW):
        return "Fruits"
    if any(k in n for k in VEG_KW):
        return "Vegetables"
    if any(k in n for k in SPICES_KW):
        return "Spices"

    return "Other"
def _parse_expiry_date(s: Optional[str]) -> Optional[date]:
    """
    Accept 'YYYY-MM-DD' and ISO strings; uses first 10 chars.
    Returns date or None.
    """
    if not s:
        return None
    try:
        return datetime.strptime(str(s)[:10], "%Y-%m-%d").date()
    except Exception:
        return None

async def _get_username(user_id: str) -> Optional[str]:
    try:
        u = await user_collection.find_one({"_id": ObjectId(user_id)})
        return u.get("username") if u else None
    except Exception:
        return None

async def _can_view_owner(viewer_id: str, owner_id: str) -> bool:
    # can always view own
    if viewer_id == owner_id:
        return True

    viewer_username = await _get_username(viewer_id)
    if not viewer_username:
        return False

    # owner shared with viewer (accepted) => allow
    share = await share_collection.find_one(
        {
            "from_user_id": owner_id,
            "to_username": viewer_username,
            "status": "accepted",
        }
    )
    return share is not None

@router.get("/user/{user_id}")
async def get_user_ingredients(user_id: str):
    """Get ingredients for a specific user"""
    try:
        ingredients = []
        async for ingredient in ingredient_collection.find({"user_id": user_id}):
            ingredients.append(ingredient_helper(ingredient))
        return ingredients
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/near-expiry")
async def get_near_expiry_ingredients(
    viewer_id: str = Query(..., description="The user who is requesting the data"),
    owner_ids: str = Query(..., description="Comma-separated user_ids whose ingredients to include"),
    diet: Optional[str] = Query(None, description="Single diet option (Vegan, Vegetarian, etc.)"),
    limit: int = Query(8, ge=1, le=50),
    include_no_expiry: bool = Query(True, description="Whether to include items without expiry (they appear last)"),
):
    """
    Shared-pantry without pantry_id:
    - viewer_id asks to view ingredients belonging to owner_ids (comma list)
    - permission enforced via share_collection accepted shares
    - returns <=limit items sorted by nearest expiry (FEFO), diet-filtered
    - expired items are excluded
    """
    try:
        owners = [x.strip() for x in (owner_ids or "").split(",") if x.strip()]
        if not owners:
            raise HTTPException(status_code=400, detail="owner_ids is required")

        allowed: List[str] = []
        for oid in owners:
            if await _can_view_owner(viewer_id, oid):
                allowed.append(oid)

        if not allowed:
            raise HTTPException(status_code=403, detail="No access to requested pantry owners")

        diet_raw = (diet or "").strip()
        diet_norm = DIET_ALIASES.get(diet_raw.lower(), diet_raw)
        exclude = DIET_EXCLUDE_CATEGORIES.get(diet_norm, [])

        # base query: owner filter + diet category filter
        base_query: Dict[str, Any] = {"user_id": {"$in": allowed}}
        if exclude:
            base_query["category"] = {"$nin": exclude}

        today = datetime.utcnow().date()

        # We want FEFO:
        # 1) items with expiryDate >= today sorted asc
        # 2) then items without expiryDate (optional), after those
        # Mongo can sort only the "has expiry" set cleanly.
        # We'll fetch missing-expiry separately and append if needed.

        # 1) expiring items (non-expired)
        exp_query = dict(base_query)
        # Keep only docs with parseable expiry by checking field exists and is a string.
        # (We still guard in Python if some are malformed.)
        exp_query["expiryDate"] = {"$exists": True, "$ne": None}

        exp_docs: List[Dict[str, Any]] = []
        async for ing in ingredient_collection.find(exp_query):
            exp = _parse_expiry_date(ing.get("expiryDate"))
            if not exp:
                continue
            if exp < today:
                continue
            exp_docs.append(ing)

        exp_docs.sort(key=lambda d: _parse_expiry_date(d.get("expiryDate")) or date.max)

        out: List[Dict[str, Any]] = exp_docs[:limit]

        # 2) optionally append no-expiry docs (last)
        if include_no_expiry and len(out) < limit:
            no_exp_query = dict(base_query)
            no_exp_query["$or"] = [{"expiryDate": {"$exists": False}}, {"expiryDate": None}]

            async for ing in ingredient_collection.find(no_exp_query):
                out.append(ing)
                if len(out) >= limit:
                    break

        return [ingredient_helper(x) for x in out]

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/")
async def create_ingredient(ingredient: IngredientModel):
    ingredient_dict = ingredient.dict()

    ingredient_dict["category"] = resolve_category_only_if_other(
        name=ingredient_dict.get("name", ""),
        category=ingredient_dict.get("category"),
        quantity=ingredient_dict.get("quantity"),
        unit=ingredient_dict.get("unit"),
    )

    ingredient_dict["categorySource"] = "auto" if (ingredient.category in [None, "", "Other"]) else "user"

    today = datetime.utcnow().date()
    ingredient_dict["addedDate"] = today.strftime("%Y-%m-%d")

    # estimate expiry if missing
    if not ingredient.expiryDate:
        category = ingredient.category
        days = DEFAULT_EXPIRY_DAYS.get(category, 30)
        estimated_expiry = today + timedelta(days=days)
        ingredient_dict["expiryDate"] = estimated_expiry.strftime("%Y-%m-%d")
        ingredient_dict["expirySource"] = "estimated"
    else:
        ingredient_dict["expirySource"] = "user"

    new_ingredient = await ingredient_collection.insert_one(ingredient_dict)
    created = await ingredient_collection.find_one({"_id": new_ingredient.inserted_id})

    await history_collection.insert_one(
        {
            "user_id": ingredient.user_id,
            "ingredientName": ingredient.name,
            "action": "added",
            "quantity": ingredient.quantity,
            "unit": ingredient.unit,
            "timestamp": datetime.utcnow(),
        }
    )

    return ingredient_helper(created)

@router.put("/{id}")
async def update_ingredient(id: str, ingredient: IngredientModel):
    await ingredient_collection.update_one(
        {"_id": ObjectId(id)},
        {"$set": ingredient.dict()},
    )

    updated = await ingredient_collection.find_one({"_id": ObjectId(id)})

    await history_collection.insert_one(
        {
            "user_id": ingredient.user_id,
            "ingredientName": ingredient.name,
            "action": "updated",
            "quantity": ingredient.quantity,
            "unit": ingredient.unit,
            "timestamp": datetime.utcnow(),
        }
    )

    return ingredient_helper(updated)

@router.delete("/{id}")
async def delete_ingredient(id: str):
    existing = await ingredient_collection.find_one({"_id": ObjectId(id)})
    await ingredient_collection.delete_one({"_id": ObjectId(id)})

    if existing:
        await history_collection.insert_one(
            {
                "user_id": existing.get("user_id"),
                "ingredientName": existing.get("name"),
                "action": "deleted",
                "details": "Ingredient removed",
                "timestamp": datetime.utcnow(),
            }
        )

    return {"message": "Deleted successfully"}