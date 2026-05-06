import os, json, re
from typing import Any, Dict, List, Optional

from google import genai

def _extract_json(text: str) -> Dict[str, Any]:
    text = (text or "").strip()

    # remove markdown blocks Gemini sometimes adds
    text = text.replace("```json", "").replace("```", "").strip()

    # try to isolate JSON body
    i, j = text.find("{"), text.rfind("}")
    if i == -1 or j == -1 or j <= i:
        raise ValueError("Gemini did not return JSON")

    text = text[i:j+1]

    # remove trailing commas (very common Gemini issue)
    text = re.sub(r",\s*}", "}", text)
    text = re.sub(r",\s*]", "]", text)

    return json.loads(text)


async def gemini_generate_recipe(
    pantry_names: List[str],
    cuisine: str,
    meal_type: str,
    diet: str,
    main_ingredient: Optional[str],
    servings: int,
) -> Dict[str, Any]:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY not set")

    client = genai.Client(api_key=api_key)

    prompt = {
        "task": "Generate ONE recipe JSON for a cooking app.",
        "cuisine": cuisine,
        "meal_type": meal_type,
        "diet": diet,
        "main_ingredient": main_ingredient,
        "servings": servings,
        "pantry": pantry_names[:200],
        "output_rules": [
            "Return ONLY valid JSON.",
            "Use g/ml/pcs in ingredient amounts whenever possible."
        ],
        "schema": {
            "id": "string",
            "title": "string",
            "description": "string",
            "cookingTime": "int",
            "prepTime": "int",
            "calories": "int or null",
            "ingredients": [{"name": "string", "amount": "string"}],
            "instructions": ["string"],
            "cuisine": "string",
            "meal_type": "string",
            "dietary_tags": ["string"]
        }
    }

    resp = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=json.dumps(prompt),
        config={
            "response_mime_type": "application/json"
        }
    )

    data = _extract_json(resp.text)

    data["origin"] = "gemini"
    data.setdefault("id", "gemini-0")

    return data