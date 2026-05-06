# routes/recipe_generate.py
from fastapi import APIRouter, HTTPException
from typing import Any, Dict, List
from datetime import datetime, timezone
from bson import ObjectId

from models.recipe_generate import RecipeGenerateRequest
from models.generate_result import GenerateResultOut
from models.confirm_cooking import ConfirmCookingRequest

from database import ingredient_collection, recipes_collection, generated_recipe_sessions
from services.pantry_service import get_visible_pantry_owner_ids
from services.scale_amount import scale_amount_string
from services.recipe_ranker import compute_score, build_pantry_soonest_expiry_days
from services.spoonacular_client import SpoonacularClient, SpoonacularQuotaExceeded
from services.spoonacular_mapper import spoonacular_to_recipe_out
from services.pantry_match import pantry_check_recipe_with_amounts
from services.inventory_deduct import fefo_deduct_user_stock
from services.gemini_recipe import gemini_generate_recipe



router = APIRouter(prefix="/recipes", tags=["Recipes"])

def recipe_key(recipe: Dict[str, Any]) -> str:
    origin = recipe.get("origin", "db")
    rid = str(recipe.get("id", ""))
    if origin == "spoonacular":
        return f"spoon:{rid}"
    return f"db:{rid}"

@router.post("/confirm")
async def confirm_and_start(payload: ConfirmCookingRequest):
    # validate session id
    try:
        sid = ObjectId(payload.session_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid session_id")

    s = await generated_recipe_sessions.find_one(
        {"_id": sid, "user_id": payload.user_id}  # (still using payload.user_id in your setup)
    )
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")

    if not s.get("current_recipe"):
        raise HTTPException(status_code=400, detail="No current recipe to confirm")

    # prevent double deduction
    if s.get("confirmed") is True:
        return {"ok": True, "message": "Already confirmed"}

    # ✅ FEFO deduction
    recipe = s["current_recipe"]
    recipe_ings = recipe.get("ingredients", []) or []
    owner_ids = payload.pantry_owner_ids or await get_visible_pantry_owner_ids(payload.user_id)

    deduct_result = await fefo_deduct_user_stock(owner_ids, recipe_ings)

    now = datetime.now(timezone.utc)

    # ✅ confirm + store log
    await generated_recipe_sessions.update_one(
        {"_id": s["_id"], "user_id": payload.user_id},
        {"$set": {
            "confirmed": True,
            "confirmed_at": now,
            "updated_at": now,
            "deductions": deduct_result.get("deductions", []),
            "deduction_warnings": deduct_result.get("warnings", []),
            "visible_to_user_ids": owner_ids,   # 👈 ADD THIS
        }},
    )
    # copy session to other pantry owners (B, C...)
    other_users = [uid for uid in owner_ids if uid != payload.user_id]

    # Instead of one doc per user, you can insert one doc for all owners
    shared_doc = {
        "user_id": payload.user_id,   # original creator
        "created_at": s.get("created_at", now),
        "updated_at": now,
        "confirmed": True,
        "confirmed_at": now,
        "current_recipe": s.get("current_recipe"),
        "current_recipe_key": s.get("current_recipe_key"),
        "shown_recipe_keys": s.get("shown_recipe_keys", []),
        "deductions": deduct_result.get("deductions", []),
        "deduction_warnings": deduct_result.get("warnings", []),
        "shared_from_user": payload.user_id,
        "shared_session_id": s["_id"],
        "visible_to_user_ids": owner_ids,  # ✅ make sure it includes all owners
    }

    await generated_recipe_sessions.insert_one(shared_doc)

    return {
        "ok": True,
        "message": "Confirmed. Let’s start cooking!",
        "deduction_warnings": deduct_result.get("warnings", []),
    }

def dump_payload(p):
    # works for pydantic v1 + v2
    return p.model_dump() if hasattr(p, "model_dump") else p.dict()


def _map_diet_to_spoon_tags(d: str) -> List[str]:
    d = (d or "").strip().lower()
    if d in {"non specific", "nonspecific"}:
        return []
    return [d.replace(" ", "-")]


async def _get_pantry_names(owner_ids: List[str]) -> List[str]:
    names: List[str] = []
    cursor = ingredient_collection.find({"user_id": {"$in": owner_ids}})
    async for ing in cursor:
        n = ing.get("name")
        if n:
            names.append(str(n))
    return names


async def _get_pantry_docs(owner_ids: List[str]) -> List[Dict[str, Any]]:
    docs: List[Dict[str, Any]] = []
    cursor = ingredient_collection.find({"user_id": {"$in": owner_ids}})
    async for d in cursor:
        docs.append(d)
    return docs


def _scale_db_recipe(recipe: Dict[str, Any], requested_servings: int) -> Dict[str, Any]:
    rid = str(recipe.get("_id") or recipe.get("id") or "")
    title = recipe.get("title") or "Untitled Recipe"
    description = recipe.get("description") or "A recipe matched to your preferences."

    from_servings = int(recipe.get("servings") or 1)

    ings_out = []
    for ing in recipe.get("ingredients", []) or []:
        name = ing.get("name") or "ingredient"
        amount = ing.get("amount") or ""
        amount = scale_amount_string(amount, from_servings, requested_servings)
        ings_out.append({"name": name, "amount": amount})

    return {
        "id": rid,
        "title": title,
        "description": description,
        "cookingTime": int(recipe.get("cookingTime") or 0),
        "prepTime": int(recipe.get("prepTime") or 0),
        "calories": recipe.get("calories"),
        "ingredients": ings_out,
        "instructions": recipe.get("instructions") or [],
        "cuisine": recipe.get("cuisine") or recipe.get("source"),
        "meal_type": recipe.get("meal_type"),
        "dietary_tags": recipe.get("dietary_tags") or [],
        "origin": recipe.get("source") or "db",
    }




RECYCLE_AFTER_UNIQUE = 8  # after showing 8 unique relevant recipes, allow repeats

async def _get_or_create_session(user_id: str, payload: RecipeGenerateRequest, owner_ids: List[str]) -> Dict[str, Any]:
    now = datetime.now(timezone.utc)

    if payload.session_id:
        try:
            sid = ObjectId(payload.session_id)
        except Exception:
            sid = None
        if sid:
            s = await generated_recipe_sessions.find_one({"_id": sid, "user_id": user_id})
            if s:
                return s
    # create new session
    doc = {
        "user_id": user_id,
        "created_at": now,
        "updated_at": now,
        "visible_to_user_ids": owner_ids,
        "request": dump_payload(payload),
        "shown_recipe_keys": [],
        "current_recipe_key": None,
        "current_recipe": None,
        "confirmed": False,
        "confirmed_at": None,
    }
    ins = await generated_recipe_sessions.insert_one(doc)
    doc["_id"] = ins.inserted_id
    return doc

async def _update_session_current(session: Dict[str, Any], user_id: str, out_recipe: Dict[str, Any]) -> None:
    k = recipe_key(out_recipe)
    await generated_recipe_sessions.update_one(
        {"_id": session["_id"], "user_id": user_id},
        {
            "$set": {
                "updated_at": datetime.now(timezone.utc),
                "current_recipe_key": k,
                "current_recipe": out_recipe,

                # ✅ important: new current recipe is not confirmed yet
                "confirmed": False,
                "confirmed_at": None,
            },
            "$addToSet": {"shown_recipe_keys": k},
        },
    )


@router.post("/generate", response_model=GenerateResultOut)
async def generate_recipe(payload: RecipeGenerateRequest):
    try:
        # 1) pantry owners
        owner_ids = payload.pantry_owner_ids or await get_visible_pantry_owner_ids(payload.user_id)
        pantry_docs = await _get_pantry_docs(owner_ids)
        pantry_names = [d.get("name") for d in pantry_docs if d.get("name")]
        pantry_expiry_days = build_pantry_soonest_expiry_days(pantry_docs)
        cuisine = (payload.cuisine_style or "any cuisine").strip()
        meal_type = (payload.meal_type or "any meal").strip()
        diet = (payload.dietary_option or "non specific").strip()
        main_ing = (payload.main_ingredient or "").strip() or None

        candidates: List[Dict[str, Any]] = []

        session = await _get_or_create_session(payload.user_id, payload, owner_ids)
        shown_keys = set(session.get("shown_recipe_keys") or [])

        # 2) DB candidates
        db_query: Dict[str, Any] = {}

        if cuisine.lower() not in {"any cuisine", "any", "all", ""}:
            db_query["cuisine"] = {"$regex": f"^{cuisine}$", "$options": "i"}

        if meal_type.lower() not in {"any meal", "any", ""}:
            db_query["meal_type"] = {"$regex": f"^{meal_type}$", "$options": "i"}

        if diet.lower() not in {"non specific", "nonspecific", ""}:
            db_query["dietary_tags"] = {"$in": [diet.lower(), diet]}

        if main_ing:
            db_query["ingredients.name"] = {"$regex": main_ing, "$options": "i"}

        async for r in recipes_collection.find(db_query).limit(30):
            candidates.append(_scale_db_recipe(r, payload.servings))

                
        # 3) Spoonacular candidates
        sp = SpoonacularClient()
        try:
            try:
                ids = await sp.search_recipes(
                    cuisine=None if cuisine.lower() in {"any cuisine", "any", "all", ""} else cuisine,
                    meal_type=None if meal_type.lower() in {"any meal", "any", ""} else meal_type,
                    dietary_tags=_map_diet_to_spoon_tags(diet),
                    include_ingredient=main_ing,
                    number=15,
                )
                for rid in ids[:7]:
                    info = await sp.get_recipe_information(rid)
                    r_ui = spoonacular_to_recipe_out(info, payload.servings)
                    r_ui["origin"] = "spoonacular"
                    candidates.append(r_ui)

            except SpoonacularQuotaExceeded:
                # ✅ quota hit: ignore spoonacular and continue with DB
                pass

        finally:
            await sp.close()
            
        # If no candidates at all, fallback to Gemini
        
        if not candidates:
            try:
                gem = await gemini_generate_recipe(
                    pantry_names=pantry_names,
                    cuisine=cuisine,
                    meal_type=meal_type,
                    diet=diet,
                    main_ingredient=main_ing,
                    servings=payload.servings,
                )

                # OPTIONAL: run pantry check so you still can produce shopping list
                is_ok, missing = pantry_check_recipe_with_amounts(gem.get("ingredients", []), pantry_docs)

                k = recipe_key(gem)
                await generated_recipe_sessions.update_one(
                    {"_id": session["_id"], "user_id": payload.user_id},
                    {
                        "$set": {
                            "updated_at": datetime.now(timezone.utc),
                            "current_recipe_key": k,
                            "current_recipe": gem,
                        },
                        "$addToSet": {"shown_recipe_keys": k},
                    },
                )

                return {
                    "status": "generated" if is_ok else "need_to_buy",
                    "session_id": str(session["_id"]),
                    "recipe": gem,
                    "shopping_list": {
                        "message": "You’re missing a few things:" if missing else "You have everything you need!",
                        "missing_ingredients": missing,
                    },
                }

            except Exception as e:
                # Gemini failed -> THEN return placeholder
                return {
                    "status": "need_to_buy",
                    "session_id": str(session["_id"]),
                    "recipe": {
                        "id": "0",
                        "title": "No recipe found",
                        "description": f"Gemini failed: {str(e)}",
                        "cookingTime": 0,
                        "prepTime": 0,
                        "calories": None,
                        "ingredients": [],
                        "instructions": [],
                    },
                    "shopping_list": {
                        "message": "Try changing cuisine/meal type or adding more pantry items.",
                        "missing_ingredients": [],
                    },
                }
                
        filtered = []
        for r in candidates:
            k = recipe_key(r)
            r["_key"] = k
            if k not in shown_keys:
                filtered.append(r)

        # if we ran out of unseen recipes, recycle (after enough uniques)
        use_pool = filtered
        if not use_pool:
            # allow repeats only if user already saw enough uniques
            if len(shown_keys) >= RECYCLE_AFTER_UNIQUE:
                use_pool = candidates  # include old
            else:
                # still try to avoid immediate repeat at least
                use_pool = [r for r in candidates if r["_key"] != session.get("current_recipe_key")] or candidates


        # 4) Pantry check every candidate (with deficits)
        scored: List[Dict[str, Any]] = []
        for r in use_pool:  # ✅ use_pool, NOT candidates
            is_ok, missing = pantry_check_recipe_with_amounts(r.get("ingredients", []), pantry_docs)
            scored.append({
                "recipe": r,
                "is_cookable": is_ok,
                "missing": missing,
                "missing_count": len(missing),
            })
        
        # 5a) Hard prefer non-spoonacular recipes when user asked specific cuisine/meal_type
        want_specific = (
            cuisine.lower() not in {"any cuisine", "any", "all", ""} or
            meal_type.lower() not in {"any meal", "any", ""}
        )

        def _matches_request(r: Dict[str, Any]) -> bool:
            want_c = cuisine.strip().lower()
            want_m = meal_type.strip().lower()

            # If recipe doesn't declare cuisine/meal_type, treat as mismatch when user asked specific
            rc = (r.get("cuisine") or "").strip().lower()
            rm = (r.get("meal_type") or "").strip().lower()

            cuisine_ok = (want_c in {"any cuisine", "any", "all", ""}) or (rc == want_c)
            meal_ok   = (want_m in {"any meal", "any", ""}) or (rm == want_m)
            return cuisine_ok and meal_ok

        if want_specific:
            # 1) Prefer local/DB recipes that match request
            local_match = [
                x for x in scored
                if x["recipe"].get("origin") != "spoonacular" and _matches_request(x["recipe"])
            ]
            if local_match:
                scored = local_match
            else:
                # 2) If no local match, still avoid random spoonacular by requiring it to match request too
                spoon_match = [x for x in scored if _matches_request(x["recipe"])]
                if spoon_match:
                    scored = spoon_match              
                # 5) Prefer cookable recipes
                cookable = [x for x in scored if x["is_cookable"]]
                if cookable:
                    best = max(
                        cookable,
                        key=lambda x: compute_score(
                            x["recipe"],
                            requested_cuisine=cuisine,
                            requested_meal_type=meal_type,
                            diet=diet,
                            main_ingredient=main_ing,
                            pantry_names=pantry_names,
                            pantry_expiry_days=pantry_expiry_days,  # ✅
                        )
                    )
                    out_recipe = best["recipe"]

          
        # 6) No cookable -> choose closest recipe and return it + shopping list
        closest = min(
            scored,
            key=lambda x: (
                x["missing_count"],
                -compute_score(
                    x["recipe"],
                    requested_cuisine=cuisine,
                    requested_meal_type=meal_type,
                    diet=diet,
                    main_ingredient=main_ing,
                    pantry_names=pantry_names,
                     pantry_expiry_days=pantry_expiry_days, 
                ),
            )
        )
        out_recipe = closest["recipe"]
        missing = closest["missing"]


        k = recipe_key(out_recipe)
        await generated_recipe_sessions.update_one(
            {"_id": session["_id"], "user_id": payload.user_id},
            {
                "$set": {
                    "updated_at": datetime.now(timezone.utc),
                    "current_recipe_key": k,
                    "current_recipe": out_recipe,  # preview snapshot
                },
                "$addToSet": {"shown_recipe_keys": k},
            },
        )
        
        print("Calling Gemini...")

        return {
            "status": "need_to_buy",
            "session_id": str(session["_id"]),
            "recipe": out_recipe,
            "shopping_list": {
                "message": "Your ingredients are running low, so I suggest you shop for these:",
                "missing_ingredients": missing,
            },
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))