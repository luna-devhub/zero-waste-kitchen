from pydantic import BaseModel
from typing import List, Optional, Literal
from models.recipe_generate import RecipeOut

class MissingIngredientOut(BaseModel):
    name: str
    amount: str

class ShoppingListOut(BaseModel):
    message: str
    missing_ingredients: List[MissingIngredientOut]

class GenerateResultOut(BaseModel):
    status: Literal["recipe", "need_to_buy"]
    session_id: str
    recipe: RecipeOut
    shopping_list: Optional[ShoppingListOut] = None