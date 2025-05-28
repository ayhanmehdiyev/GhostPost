from fastapi import APIRouter, Body, HTTPException
from sqlalchemy import select
from app.core.database import engine
from app.core.security import hash_password
from .schemas import users, posts
from datetime import datetime
from app.zk import schemas as zk_schemas

router = APIRouter(prefix="/forum")

# --------------------------------------------------
# Forum endpoints: register, login, post, fetch feed, delete (with callback)
# --------------------------------------------------

# --------------------------------------------------
# register a new user
# --------------------------------------------------
@router.post("/register")
def register(data: dict = Body(...)):
    # get the username and password
    username = data.get("username")
    password = data.get("password")

    # make sure both the username and password exist
    if not username or not password:
        raise HTTPException(400, "Username and Password Required")

    with engine.begin() as conn:
        # do not allow duplicate usernames
        if conn.scalar(select(users.c.id).where(users.c.username == username)):
            raise HTTPException(400, "Username Already Exists")
        
        # insert our new user into our table in the DB
        conn.execute(users.insert().values(
                username=username,
                password_hash=hash_password(password)
        ))
    return {"message": "Registered Successfully"} # success message, yay!


# --------------------------------------------------
# log in an existing user
# --------------------------------------------------
@router.post("/login")
def login(data: dict = Body(...)):
    # get the username and password
    username = data.get("username")
    password = data.get("password")

    # make sure both the username and password exist
    if not username or not password:
        raise HTTPException(400, "Username and Password Required")

    with engine.begin() as conn:
        # try to retrieve the user from the table in the DB
        row = conn.execute(select(users).where(users.c.username == username)).fetchone()

        # validate credentials, as in make sure they exist 
        if not row or hash_password(password) != row.password_hash:
            raise HTTPException(401, "Invalid Credentials")

    return {"message": "Login Success"} # success message, yay!


# --------------------------------------------------
# create a forum post (requires a ZK ticket)
# --------------------------------------------------
@router.post("/post")
def create_post(data: dict = Body(...)):
    # get the content of the post and the ZK ticket (random tag) associated
    content = data.get("content")
    ticket  = data.get("ticket")         

    # make sure both exist
    if not content or ticket is None:
        raise HTTPException(400, "Content and Ticket Required")

    with engine.begin() as conn:
        # insert the post into the table in the DB
        conn.execute(posts.insert().values(
                content = content,
                timestamp = datetime.utcnow(),
                ticket = ticket
        ))

    return {"message": "Post Created"} # success message, yay!


# --------------------------------------------------
# fetch all posts 
# --------------------------------------------------
@router.get("/posts")
def get_posts():
    # pretty straightforward, just get all the posts and return them in a nicely formatted object
    with engine.begin() as conn:
        rows = conn.execute(select(posts).order_by(posts.c.timestamp.desc())).fetchall()

    return [
        {
            "id": r.id,
            "content": r.content,
            "timestamp": r.timestamp,
            "ticket": r.ticket         
        }
        for r in rows
    ]


# --------------------------------------------------
# delete a post + register a callback to ban the ticket
# --------------------------------------------------
@router.delete("/post/{post_id}")
def delete_post(post_id: int, data: dict = Body(...)):
    # get the ticket (random tag) of the post
    ticket = data.get("ticket")

    # make sure it does exist and isn't empty
    if not ticket:
        raise HTTPException(400, "Ticket Required")

    with engine.begin() as conn:
        # delete the post from the forum
        conn.execute(posts.delete().where(posts.c.id == post_id))

        # insert a callback into the bulletin board 
        conn.execute(zk_schemas.callbacks.insert().values(
                ticket = ticket,
                action = "ban",
                created_at = str(datetime.utcnow())
        ))

    return {"message": "Post deleted & callback recorded."} # success message, yay!