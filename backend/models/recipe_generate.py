#models/recipe_generate.py
from pydantic import BaseModel, Field
from typing import List, Optional, Literal

DietOption = Literal[
    "non specific",
    "vegan",
    "gluten free",
    "low calorie",
    "dairy free",
    "sugar free",
]

MealType = Literal[
    "breakfast",
    "lunch",
    "dinner",
    "salad",
    "dessert",
    "any meal",
]

class RecipeGenerateRequest(BaseModel):
    user_id: str = Field(..., description="Requesting user id")
    cuisine_style: str = Field("any cuisine", description="e.g. Myanmar, Korean, European, any cuisine")
    meal_type: MealType = "any meal"
    dietary_option: DietOption = "non specific"
    servings: int = Field(1, ge=1, le=10)
    main_ingredient: Optional[str] = Field(None, description="Optional single main ingredient")
    # owners to include for pantry coverage; if None -> auto: user + accepted share partners
    pantry_owner_ids: Optional[List[str]] = None
    session_id: Optional[str] = None

class RecipeIngredientOut(BaseModel):
    name: str
    amount: str  # keep as display string (like your mockRecipe)

class RecipeOut(BaseModel):
    id: str
    title: str
    description: str
    cookingTime: int
    prepTime: int
    calories: Optional[int] = None
    ingredients: List[RecipeIngredientOut]
    instructions: List[str]