from fastapi import APIRouter, Query
from typing import Optional
from database import history_collection
from models.history import HistoryModel
from datetime import datetime

router = APIRouter(prefix="/history", tags=["History"])


def history_helper(entry) -> dict:
    return {
        "id": str(entry["_id"]),
        "user_id": entry["user_id"],
        "ingredientName": entry["ingredientName"],
        "action": entry["action"],
        "quantity": entry.get("quantity"),
        "unit": entry.get("unit"),
        "details": entry.get("details"),
        "timestamp": entry["timestamp"].isoformat() if entry.get("timestamp") else None,
    }

@router.get("/user/{user_id}")
async def get_user_history(user_id: str):
    history = []
    async for entry in history_collection.find({"user_id": user_id}).sort("timestamp", -1):
        history.append(history_helper(entry))
    return history


@router.post("/")
async def create_history(entry: HistoryModel):
    if not entry.timestamp:
        entry.timestamp = datetime.utcnow()

    new_entry = await history_collection.insert_one(entry.dict())
    created = await history_collection.find_one({"_id": new_entry.inserted_id})
    return history_helper(created)
