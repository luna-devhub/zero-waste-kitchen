# backend/main.py
from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI
from routes.signup import router as signup_router
from routes.ingredients import router as ingredient_router
from routes.history import router as history_router
from routes.share import router as share_router
from routes.forgot_password import router as forgot_password_router

# ADD THIS IMPORT
from routes.users import router as users_router
from routes.recipe_generate import router as recipe_generate_router
from routes.generated_recipes import router as generated_router
app = FastAPI()

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8080", "http://localhost:5173"],  # Add both frontend URLs
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include your routers
app.include_router(signup_router)
app.include_router(ingredient_router)
app.include_router(history_router)
app.include_router(share_router)
app.include_router(forgot_password_router, prefix="/auth", tags=["auth"])
# ADD THIS LINE
app.include_router(users_router)

app.include_router(recipe_generate_router)
app.include_router(generated_router)
# Optional: Add a root endpoint to test if API is running
@app.get("/")
async def root():
    return {"message": "Zero-Waste Kitchen API is running"}

# Optional: Add a health check endpoint
@app.get("/health")
async def health_check():
    return {"status": "healthy"}

from fastapi.middleware.cors import CORSMiddleware

