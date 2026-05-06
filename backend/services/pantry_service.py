from typing import List, Set
from bson import ObjectId
from database import share_collection, user_collection

async def _get_username(user_id: str) -> str | None:
    try:
        u = await user_collection.find_one({"_id": ObjectId(user_id)})
        return u.get("username") if u else None
    except Exception:
        return None

async def get_visible_pantry_owner_ids(viewer_id: str) -> List[str]:
    """
    Returns [viewer_id] + owners who shared with viewer (accepted).
    'from_user_id' is the owner who shared with viewer username.
    """
    owners: Set[str] = {viewer_id}
    viewer_username = await _get_username(viewer_id)
    if not viewer_username:
        return list(owners)

    cursor = share_collection.find(
        {"to_username": viewer_username, "status": "accepted", "permission": {"$in": ["view", "edit"]}}
    )
    async for s in cursor:
        from_owner = s.get("from_user_id")
        if from_owner:
            owners.add(from_owner)
    return list(owners)