import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from ..slashid import initialize_slashid
from .admin import admin_router
from .pages import pages_router
from .users import users_router


logger = logging.getLogger(__name__)

app = FastAPI(title="Suborg Demo - Backend API")

app.on_event("startup")(initialize_slashid)

origins = ["http://localhost:5173"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(users_router)
app.include_router(admin_router)
app.include_router(pages_router)
app.mount("/", StaticFiles(directory="frontend/dist", html=True), name="frontend")
