from sqlalchemy import Table, Column, Integer, String, Text, DateTime
from datetime import datetime
from app.core.database import metadata   

# ------------------------
# Users Table
# ------------------------
# stores our forum user credentials 
users = Table(
    "users", metadata,
    Column("id", Integer, primary_key=True),
    Column("username", String, unique=True, index=True), # unique username
    Column("password_hash", String), # hashed password 
)

# ------------------------
# Posts Table
# ------------------------
# stores all forum posts 
posts = Table(
    "posts", metadata,
    Column("id", Integer, primary_key=True),
    Column("content", Text), # the actual text content of the post 
    Column("timestamp", DateTime, default=datetime.utcnow), # timestamp of when it was posted
    Column("ticket", String, nullable=True), # ZK ticket used to authorize the post and use for callbacks later
)