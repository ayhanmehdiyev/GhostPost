from sqlalchemy import create_engine, MetaData
from sqlalchemy.orm import registry

# this is the path to our SQLite database file (relative path: ./app.db)
DATABASE_URL = "sqlite:///./app.db"   

# now we just create a simple SQLAlchemy engine connected to the DB, the flag i added
# is actually required for SQLite when using it with FastAPI
engine = create_engine(
    DATABASE_URL, 
    connect_args = {"check_same_thread": False}
)

# now we want to create a single registry object to track our table mapping 
mapper_registry = registry()
# and then we have to extract the unified metadata object from the registry (which is used when defining/creating our tables)
metadata = mapper_registry.metadata
