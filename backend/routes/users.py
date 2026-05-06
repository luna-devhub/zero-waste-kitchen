# backend/routes/users.py
from fastapi import APIRouter, HTTPException
from database import user_collection
from bson import ObjectId
import logging

router = APIRouter(prefix="/users", tags=["Users"])
logger = logging.getLogger(__name__)

@router.get("/{username}")
async def get_user_by_username(username: str):
    """Get user details by username"""
    try:
        # Find user by username (case insensitive)
        user = await user_collection.find_one({"username": {"$regex": f"^{username}$", "$options": "i"}})
        
        if not user:
            logger.error(f"User not found with username: {username}")
            raise HTTPException(status_code=404, detail=f"User '{username}' not found")
        
        return {
            "id": str(user["_id"]),
            "username": user["username"],
            "email": user["email"]
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching user by username {username}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/id/{user_id}")
async def get_user_by_id(user_id: str):
    """Get user details by ID"""
    try:
        if not ObjectId.is_valid(user_id):
            raise HTTPException(status_code=400, detail="Invalid user ID format")
            
        user = await user_collection.find_one({"_id": ObjectId(user_id)})
        
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
            
        return {
            "id": str(user["_id"]),
            "username": user["username"],
            "email": user["email"]
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching user by ID {user_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))