# routers/generated_recipes.py
from fastapi import APIRouter, HTTPException
from typing import Any, Dict, List, Optional
from bson import ObjectId

from database import generated_recipe_sessions

router = APIRouter(prefix="/generated-recipes", tags=["Generated Recipes"])


def _json_safe(x):
    if isinstance(x, ObjectId):
        return str(x)
    if isinstance(x, list):
        return [_json_safe(i) for i in x]
    if isinstance(x, dict):
        return {k: _json_safe(v) for k, v in x.items()}
    return x

def _to_str_id(doc: Dict[str, Any]) -> Dict[str, Any]:
    doc = _json_safe(doc)  # ✅ convert nested ObjectIds too
    doc["session_id"] = doc.get("_id")
    return doc

@router.get("", response_model=List[Dict[str, Any]])
async def list_generated_recipes(
    user_id: str,
    only_confirmed: bool = True,
    only_cookable: bool = False,
    limit: int = 30,
):
    """
    Returns user's generated recipe sessions.

    By default, shows only recipes the user CONFIRMED (pressed "Confirm and start cooking").
    - only_confirmed=True  -> confirmed sessions only
    - only_confirmed=False -> includes unconfirmed previews too (if you want a debug/admin view)
    - only_cookable=True   -> only sessions where pantry_check.is_cookable == True
    """
    q: Dict[str, Any] = {"$or": [
        {"user_id": user_id},
        {"visible_to_user_ids": user_id},
    ]}


    if only_confirmed:
        q["confirmed"] = True

    if only_cookable:
        q["pantry_check.is_cookable"] = True

    docs: List[Dict[str, Any]] = []
    cursor = (
        generated_recipe_sessions.find(q)
        .sort("created_at", -1)
        .limit(min(limit, 100))
    )

    async for d in cursor:
        docs.append(_to_str_id(d))

    return docs

@router.get("/confirmed", response_model=List[Dict[str, Any]])
async def list_user_confirmed_recipes(
    user_id: str,
    only_cookable: bool = False,
    limit: int = 30,
):
    """
    User-facing endpoint: show ONLY recipes this user has confirmed.
    Optional:
      - only_cookable=True -> only sessions where pantry_check.is_cookable == True
    """
    q = {"$or": [
  {"user_id": user_id},
  {"visible_to_user_ids": user_id},      # or {"pantry_owner_ids_used": user_id}
]}

    if only_cookable:
        q["pantry_check.is_cookable"] = True

    docs: List[Dict[str, Any]] = []
    cursor = (
        generated_recipe_sessions.find(q)
        .sort("created_at", -1)
        .limit(min(limit, 100))
    )

    async for d in cursor:
        docs.append(_to_str_id(d))

    return docs

@router.get("/{session_id}", response_model=Dict[str, Any])
async def get_generated_recipe(session_id: str, user_id: str):
    """
    Fetch a single generated recipe session by id.
    (This is the same as the session_id returned from /recipes/generate)
    """
    try:
        doc = await generated_recipe_sessions.find_one(
            {"_id": ObjectId(session_id), "$or": [
  {"user_id": user_id},
  {"visible_to_user_ids": user_id},
]}
        )
    except Exception:
        doc = None

    if not doc:
        raise HTTPException(status_code=404, detail="Not found")

    return _to_str_id(doc)

