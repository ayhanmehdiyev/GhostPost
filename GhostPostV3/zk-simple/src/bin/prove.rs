use std::{error::Error, fs, path::PathBuf};
use clap::Parser;
use k256::ecdsa::{signature::Signer, SigningKey, VerifyingKey};
use rand_core::OsRng;
use risc0_zkvm::{default_prover, ExecutorEnv};
use serde::{Deserialize, Serialize};
use simple_core::{compute_commitment, PrivateInput, UserObject};
use simple_methods::SIMPLE_ELF;

// JSON payload coming from the server to the prover
#[derive(Debug, Deserialize)]
struct ProofRequest {
    callback_tickets: Vec<String>, // list of callback tickets as strings
    existing_tickets: Vec<String>, // list of user's current tickets as strings
    is_banned: bool, // self explanatory lol
    old_nonce: String, // old nonce used for previous commitment
}

// command-line interface arguments needed to run the prover
#[derive(Parser, Debug)]
struct Args {
    // output file for the receipt, as seen from homework 3
    #[clap(short = 'r', long, default_value = "./receipt.bin")]
    receipt: PathBuf,
    // this is the input path for the JSON with the ProofRequest, which we send from the client
    #[clap(long)]
    proof_input: PathBuf,
}

// our main function 
fn main() -> Result<(), Box<dyn Error>> {
    // as seen from homework 3, just sets up logging
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::filter::EnvFilter::from_default_env())
        .init();
    
    // parse our command line arguments
    let args = Args::parse();
    // read the JSON and deserialize into a ProofRequest struct (the one we defined above)
    let req: ProofRequest = serde_json::from_slice(&fs::read(&args.proof_input)?)?;

    // convert each string ticket into a u128 
    // note: we use a filtermap to skip invalid strings to prvent crashing
    let mut tickets: Vec<u128> = req.existing_tickets.iter().filter_map(|s| s.parse::<u128>().ok()).collect();
    // if user has no tickets, we generate two dummy tickets just to simulate activity 
    // i did this at the very start, now im not sure if this is still needed, but im too scared to remove them just in case
    if tickets.is_empty() {
        tickets = vec![rand::random(), rand::random()];
    }
    // we also mint a new ticket and add to the end of our list
    let new_ticket: u128 = rand::random();
    tickets.push(new_ticket);

    // using the same exact method, we convert the callback string tickets into a u128
    let cb_tickets: Vec<u128> = req.callback_tickets.iter().filter_map(|s| s.parse::<u128>().ok()).collect();

    // now we want to build out current user object which gets committed and proven
    let user_object = UserObject {
        is_banned: req.is_banned,
        tickets: tickets.clone(),
        current_internal_nonce: rand::random(),
    };

    // generate a fresh ECDSA keypair just for this session 
    // i think to make it more real we would normally reuse this
    // but i realized that after finishing and i'm not sure if this project calls 
    // for that level of realism, especially since we're allowed to run things in DEV mode
    let sign_key = SigningKey::random(&mut OsRng);
    let verify_key = VerifyingKey::from(&sign_key);

    // parse the old nonce supplied by the backend so we can recompute the exact same commitment the server signed
    let old_nonce: u128 = req.old_nonce.parse().map_err(|_| "Invalid old_nonce (not a number)")?;
    let new_nonce: u128 = rand::random(); // generate a new random nonce for the next commitment

    // compute the commitment and sign it to create the proof of authentication, basically what the guest verifies internally
    let commitment = compute_commitment(&user_object, old_nonce).expect("commitment failure");
    let sig: k256::ecdsa::Signature = sign_key.sign(&commitment); 

    // pack everything that the guest needs to verify our authenticity and update our state into the PrivateInput
    let input = PrivateInput {
        user_object: user_object.clone(),
        old_external_commitment_nonce: old_nonce,
        new_external_commitment_nonce: new_nonce,
        committed_object_hash_from_server: commitment,
        server_signature: sig.to_vec(),
        server_verifying_key: verify_key.to_sec1_bytes().to_vec(),
        new_ticket,
        callback_tickets: cb_tickets.clone(),
    };

    // now the guest has to run our zk circuit over the input
    let env = ExecutorEnv::builder().write(&input)?.build()?;
    // then we can serialize the proof receipt to the disk
    let receipt = default_prover().prove(env, SIMPLE_ELF)?.receipt;
    fs::write(&args.receipt, bincode::serialize(&receipt)?)?;
    
    // now we want to create a JSON file for the frontend which will contain the updated list of tickets as strings
    #[derive(Serialize)]
    struct Out { 
        tickets: Vec<String> 
    }
    let out = Out { tickets: tickets.iter().map(|t| t.to_string()).collect() };
    fs::write("tickets.json", serde_json::to_vec(&out)?)?;
    println!("Proof generated successfully!"); // little success message, yay!
    Ok(())
}
