use serde::{Deserialize, Serialize};
use k256::sha2::{Sha256, Digest};

// commitment = Hash (zk-object || randomness)
// note that our object which we're hashing must implement Serialize (we have to turn it into bytes)
// also this randomness is just a nonce
// this will return a 32-byte array (the raw hash) on success
pub fn compute_commitment<T: Serialize>(object_to_commit: &T, external_commitment_randomness: u128) -> Result<[u8; 32], String> {
    // first, we have to serialize our object 
    let serialized_object = bincode::serialize(object_to_commit).map_err(|e| format!("serialization error: {}", e))?;   
    // now, we have to build up our hashing transcript
    let mut hasher = Sha256::new();
    hasher.update(&serialized_object);
    hasher.update(&external_commitment_randomness.to_le_bytes());
    // lastly, just finalize our hash and return it 
    let result = hasher.finalize(); 
    Ok(<[u8; 32]>::try_from(result.as_slice()).expect("SHA256 should be 32 bytes"))
}


// private user identity (zk-object) that lives on the client 
// just use the same fields as noted in the given spec
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserObject {
    pub is_banned: bool,
    pub tickets: Vec<u128>,
    pub current_internal_nonce: u128,
}


// everything in here, excpect for what we reveal in the journal, is a secret
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrivateInput {
    // our current user object
    pub user_object: UserObject,
    // old nonce in old commitment 
    pub old_external_commitment_nonce: u128,
    // new nonce for new commitment 
    pub new_external_commitment_nonce: u128,
    // this is committed hash that the server claims is ours
    pub committed_object_hash_from_server: [u8; 32],
    // server's ECDSA signature over the commitment and its public key
    pub server_signature: Vec<u8>,      
    pub server_verifying_key: Vec<u8>,
    // new callback ticket we will reveal 
    pub new_ticket: u128,
    // current list of callbacks fetched from the server’s callback bulletin board
    pub callback_tickets: Vec<u128>,
}


// these are public outputs from our circuit
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Journal {
    // "...the user reveals to the server: The new ticket; The new commitment; The old nonce"
    pub new_commitment: [u8; 32],
    pub old_nonce: u128,
    pub new_ticket: u128,
}