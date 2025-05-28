import hashlib

# just hash plaintext using SHA256
# literally does not get simpler than this
# note: we are not using a salt and using a fast hash 
# im assuming this is alright considering im allowed to run the zkproofs in DEV MODE
def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()
