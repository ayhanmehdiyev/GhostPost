use simple_core::{compute_commitment, Journal, PrivateInput};
use risc0_zkvm::guest::env;
use k256::ecdsa::{signature::Verifier, Signature, VerifyingKey};

fn main() {
    // first we read the private input from the host into the circuit
    // contains: user object, nonces, server commitment hash, server signature, callback tickets
    let input: PrivateInput = env::read();

    // now we parse the server public key and signature by converting the raw bytes into usuable types
    let vk = VerifyingKey::from_sec1_bytes(&input.server_verifying_key).expect("bad server vk");
    let sig = Signature::from_slice(&input.server_signature).expect("bad sig bytes");

    // next we have to recompute the commitment using the given user obejct and the old nonce
    let recomputed = compute_commitment(&input.user_object, input.old_external_commitment_nonce).expect("hash fail");

    // we have to enforce that recomputed hash matches what the server claims to be the commitment
    // if this works then we can confirm that the user isn't lying about their previous state
    assert_eq!(recomputed, input.committed_object_hash_from_server, "commitment mismatch");

    // we have to verify that the server did in fact sign the original commitment
    // if this works then we can confirm that the commitment was authorized by our trusted server
    assert!(vk.verify(&recomputed, &sig).is_ok(), "server sig invalid");

    // just for safety, let's clone the user object 
    let mut updated = input.user_object.clone();

    // bag logic: we scan the callback tickets against the user's tickets and check for a match
    //            if there is a match, we ban!
    // let's just do a classic nested for loop approach
    for ut in &updated.tickets {
        for cb in &input.callback_tickets {
            if ut == cb {
                updated.is_banned = true; // drop the ban hammer!
                break;
            }
        }
    }

    // next we have to make sure the user is valid and not banned 
    assert!(!updated.is_banned, "BANNED: user ticket was matched in callback list");

    // now we can commit the new user object with the new nonce
    let new_commit = compute_commitment(&updated, input.new_external_commitment_nonce).expect("commit fail");

    // at last, let's public our public inputs 
    let journal = Journal {
        new_commitment: new_commit,
        old_nonce: input.user_object.current_internal_nonce, // included for replay prevention
        new_ticket: input.new_ticket, 
    };
    env::commit(&journal); // output to the host
}  
