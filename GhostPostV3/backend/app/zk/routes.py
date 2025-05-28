from fastapi import APIRouter, Body, HTTPException, UploadFile, File
from pathlib import Path
from sqlalchemy import select
from app.core.database import engine
from . import schemas
import subprocess, shutil, os, json
from datetime import datetime

router = APIRouter()            

# ------------------------------------------------------------------------
# ZK endpoints: retrieve callback tickets and proof verification
# ------------------------------------------------------------------------

# GET /all-callbacks: return the list of all callback tickets stored in DB
@router.get("/all-callbacks")
async def get_all_callbacks():
    # query the 'callbacks' table for all ticket values
    with engine.begin() as conn:
        cb_rows = conn.execute(select(schemas.callbacks.c.ticket)).fetchall()
    # convert each ticket to string and return as list
    return [str(r.ticket) for r in cb_rows]

# POST /submit-proof: verify a ZK receipt and store new commitment
@router.post("/submit-proof")
async def submit_proof(receipt: UploadFile = File(...)):
    tmp_dir = Path("tmp_submit")
    tmp_dir.mkdir(exist_ok=True) # create temporary folder for handling receipt
    try:
        # save uploaded receipt to a temporary path
        receipt_path = tmp_dir / receipt.filename
        data = await receipt.read()
        receipt_path.write_bytes(data)
        print(f"Saved receipt to {receipt_path}")

        # run the verifier 
        result = subprocess.run(
            ["../zk-simple/target/release/verify", "--receipt", str(receipt_path)],
            capture_output=True,
            text=True,
            timeout=60,
            env={**os.environ, "RISC0_DEV_MODE": "1"} # confirmed through piazza post that DEV MODE is allowed
        )

        # if verifier failed, raise HTTP 400 error
        if result.returncode != 0:
            print("Verifier failed with code", result.returncode)
            raise HTTPException(status_code=400, detail="Proof verification failed")

        # parse the circuit's journal from the last non-empty stdout line
        journal_json = [l for l in result.stdout.splitlines() if l][-1]
        journal = json.loads(journal_json)

        # convert bytes to hex string for storage
        new_commitment = "".join(f"{b:02x}" for b in journal["new_commitment"])
        old_nonce = str(journal["old_nonce"])
        new_ticket = str(journal["new_ticket"])

        # insert new commitment into DB, this naturally guards against replay attacks
        with engine.begin() as conn:
            existing = conn.scalar(
                select(schemas.commitments.c.id)
                .where(schemas.commitments.c.nonce == old_nonce)
            )
            if existing:
                # nonce reuse detected—reject
                raise HTTPException(status_code=400, detail="Old nonce already used")
            # insert the new record into 'commitments' table
            conn.execute(schemas.commitments.insert().values(
                    commitment_hash=new_commitment,
                    nonce=old_nonce,
                    new_ticket=new_ticket,
                    created_at=str(datetime.utcnow())
            ))

        # return the public outputs needed by the client to update its ZK state
        return {
            "message": "Proof verified & stored.",
            "new_ticket": new_ticket,
            "commitment": new_commitment,
            "old_nonce": old_nonce
        }
    except HTTPException:
        # pass through HTTP errors directly
        raise
    except Exception as e:
        # log and return unexpected errors as JSON
        print("/submit-proof exception:", e)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        # clean up temporary files
        if tmp_dir.exists():
            shutil.rmtree(tmp_dir)