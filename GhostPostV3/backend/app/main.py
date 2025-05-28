from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.database import engine, metadata
from app.forum.routes import router as forum_router
from app.zk.routes    import router as zk_router
import os
from pathlib import Path

# create all database tables on startup
# this runs once when the application starts and it makes sure that there are no missing tables 
metadata.create_all(bind=engine)

# initialize our FastAPI application, with the title of our Docs and the version (3.0.0 bc we're on V3)
app = FastAPI(title="GhostPostV3 backend", version="3.0.0")

# the way i organized my code was by splitting everything zk from the basic forum functionality
# so i have a directory for my forum which includes defining the routes for the API and the schemas for the tables 
# and then i have another separate directory for my zk API routes and schemas for the bulletin boards
# so here we split our logical endpoint groups into two separate modules 
app.include_router(forum_router)
app.include_router(zk_router)

# i was getting errored out until i added this, i think it's a security thing
# hopefully this works on other setups too
# it basically allows the my React frontend (running on localhost:5173) to call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# this is the root endpoint, sort of just acts as a welcome message 
@app.get("/")
def root():
    return {"message": "GhostPostV3 backend is running! :D"}


# this is an endpoint to delete the database, useful for testing!
@app.post("/reset-testing")
def reset_testing():
    db_path = "./app.db"
    if os.path.exists(db_path):
        os.remove(db_path)
    # re-create all tables from metadata
    metadata.create_all(bind=engine)
    # touch this file so uvicorn --reload sees a change and restarts
    Path(__file__).touch()
    return {"message": "Database reset complete (reload triggered)!"}