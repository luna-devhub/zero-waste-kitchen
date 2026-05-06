# services/spoonacular_client.py
import os
import httpx
from typing import List, Optional, Dict, Any
from dotenv import load_dotenv

load_dotenv()

SPOONACULAR_API_KEY = os.getenv("SPOONACULAR_API_KEY")
BASE_URL = "https://api.spoonacular.com"

class SpoonacularError(Exception):
    pass

class SpoonacularQuotaExceeded(SpoonacularError):
    pass

class SpoonacularRateLimited(SpoonacularError):
    pass

def _map_diet_and_intolerances(dietary_tags: Optional[List[str]]) -> Dict[str, str]:
    """
    Frontend tags might be:
      ["Vegan","Gluten-Free","Dairy-Free",...]
    Backend internal might be:
      ["vegan","glutenFree","dairyFree",...]
    Spoonacular complexSearch supports 'diet' (single) and 'intolerances' (comma-separated).
    """
    if not dietary_tags:
        return {}

    # normalize
    tags = [str(t).strip().lower().replace("_", "-") for t in dietary_tags]

    # map common UI labels
    ui_map = {
        "non-specific": "non-specific",
        "vegan": "vegan",
        "gluten-free": "gluten-free",
        "dairy-free": "dairy-free",
        "low-calorie": "low-calorie",
        "sugar-free": "sugar-free"
    }
    tags = [ui_map.get(t, t) for t in tags]

    diet: Optional[str] = None
    intolerances: List[str] = []

    # diet param (single)
    if "vegan" in tags:
        diet = "vegan"
    elif "vegetarian" in tags:
        diet = "vegetarian"
    elif "low-carb" in tags:
        # Spoonacular has "ketogenic" as a diet; low-carb isn't a direct diet string.
        # We'll approximate with ketogenic to better match the intent.
        diet = "ketogenic"

    # intolerances
    if "gluten-free" in tags:
        intolerances.append("gluten")
    if "dairy-free" in tags:
        intolerances.append("dairy")

    out: Dict[str, str] = {}
    if diet:
        out["diet"] = diet
    if intolerances:
        out["intolerances"] = ",".join(sorted(set(intolerances)))
    return out


class SpoonacularClient:
    def __init__(self):
        if not SPOONACULAR_API_KEY:
            raise RuntimeError("SPOONACULAR_API_KEY is not set in environment variables")
        self._client = httpx.AsyncClient(timeout=20)

    async def close(self):
        await self._client.aclose()

    async def get_recipe_information(
        self,
        recipe_id: int,
        include_nutrition: bool = True,
    ) -> Dict[str, Any]:
        """
        Fetch full recipe info from Spoonacular:
        GET /recipes/{id}/information
        """
        return await self._get(
            f"/recipes/{recipe_id}/information",
            {"includeNutrition": str(include_nutrition).lower()},
        )
        
    async def get_analyzed_instructions(self, recipe_id: int) -> List[Dict[str, Any]]:
        """
        GET /recipes/{id}/analyzedInstructions
        """
        data = await self._get(f"/recipes/{recipe_id}/analyzedInstructions", {})
        return data if isinstance(data, list) else []
        
    async def search_recipes(
        self,
        cuisine: Optional[str] = None,
        dietary_tags: Optional[List[str]] = None,
        meal_type: Optional[str] = None,
        include_ingredient: Optional[str] = None,
        number: int = 20,
    ) -> List[int]:
        params: Dict[str, Any] = {"number": number}

        if cuisine and cuisine.lower() not in ["any", "all", ""]:
            params["cuisine"] = cuisine

        if meal_type and meal_type.lower() not in ["any meal", "any", ""]:
            params["type"] = meal_type

        params.update(_map_diet_and_intolerances(dietary_tags))

        if include_ingredient:
            params["includeIngredients"] = include_ingredient

        data = await self._get("/recipes/complexSearch", params)
        return [r["id"] for r in data.get("results", []) if "id" in r]

    async def _get(self, endpoint: str, params: Dict[str, Any]) -> Dict[str, Any]:
        params["apiKey"] = SPOONACULAR_API_KEY
        resp = await self._client.get(f"{BASE_URL}{endpoint}", params=params)

        if resp.status_code == 402:
            # points/quota exceeded
            raise SpoonacularQuotaExceeded(resp.text)

        if resp.status_code == 429:
            raise SpoonacularRateLimited(resp.text)

        if resp.status_code != 200:
            raise SpoonacularError(f"{resp.status_code}: {resp.text}")

        return resp.json()