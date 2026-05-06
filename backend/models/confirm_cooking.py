from pydantic import BaseModel
from typing import List, Optional
class ConfirmCookingRequest(BaseModel):
    session_id: str
    user_id: str
    pantry_owner_ids: Optional[List[str]] = None