import pandas as pd
import json
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv

load_dotenv()

MONGO_DETAILS = os.getenv("MONGO_DETAILS")

client = AsyncIOMotorClient(MONGO_DETAILS)
database = client["mydatabase"]
recipes_collection = database["recipes"]

CSV_PATH = "myanmar_recipes_seed.csv"

async def import_csv():
    df = pd.read_csv(CSV_PATH)

    docs = []
    for _, row in df.iterrows():
        docs.append({
            "source": "myanmar",
            "title": row["title"],
            "cuisine": row["cuisine"],
            "meal_type": row["meal_type"],
            "servings": int(row["servings"]),
            "prepTime": int(row["prepTime"]),
            "cookingTime": int(row["cookingTime"]),
            "difficulty": row["difficulty"],
            "calories": None if str(row["calories"]) == "nan" or row["calories"] == "" else int(row["calories"]),
            "image": row.get("image", ""),
            "description": row.get("description", ""),
            "dietary_tags": json.loads(row["dietary_tags"]),
            "ingredients": json.loads(row["ingredients"]),
            "instructions": json.loads(row["instructions"]),
        })

    if docs:
        await recipes_collection.insert_many(docs)
        print("Inserted:", len(docs))
    else:
        print("No recipes found.")

if __name__ == "__main__":
    asyncio.run(import_csv())