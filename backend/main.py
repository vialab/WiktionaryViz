from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api_routes import phonology, word_data, descendants
from constants import load_index

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)

app.include_router(phonology.router)
app.include_router(word_data.router)
app.include_router(descendants.router)

@app.on_event("startup")
async def startup_event():
    load_index()

@app.get("/")
async def root():
    return {"message": "FastAPI JSONL Backend is running"}
