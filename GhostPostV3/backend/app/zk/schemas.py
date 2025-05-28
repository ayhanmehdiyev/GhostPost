from sqlalchemy import Table, Column, Integer, String
from app.core.database import metadata

# ------------------------
# Commitments Table
# ------------------------
# in here we store our zk-proven commitments from clients (also prevents replay attacks)
# each row is a finalized update (state transition)
commitments = Table(
    "commitments", metadata,
    Column("id", Integer, primary_key=True, index=True), 
    Column("commitment_hash", String, unique=True, index=True), # new commitment hash
    Column("nonce", String), # old nonce (replay-protection)
    Column("new_ticket", String), # ticket published in this proof 
    Column("created_at", String), # timestamp for auditing 
)

# ------------------------
# Callbacks Table
# ------------------------
# this is our public bulletin board of actions, each action is tied to a specific ticket (post)
# the guest will request these and scan through them to determine if any pending callbacks match the user's object
callbacks = Table(
    "callbacks", metadata,
    Column("id", Integer, primary_key=True, index=True),
    Column("ticket", String, index=True), # ticket of the post this callback is calling for
    Column("action", String, default="ban"), # type of action, so i made this a string to describe the exact action, for now it's only banning but in the future we can easily upgrade this 
    Column("created_at", String), # timestamp for auditing
)