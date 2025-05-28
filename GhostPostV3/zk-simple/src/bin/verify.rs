use std::{error::Error, fs, path::PathBuf};
use clap::Parser;
use simple_core::Journal;
use simple_methods::SIMPLE_ID;
use risc0_zkvm::Receipt;
use serde_json;
use serde::Serialize;

// this is a serializable mirror of Journal, converting u128s to strings for JSON
#[derive(Serialize)]
struct JournalOut {
    new_commitment: [u8; 32], // byte array representing the new commitment hash
    old_nonce: String, // previous nonce as decimal string 
    new_ticket: String, // newly issued ticket as decimal string
}

// identical to the prove.rs file:
// these are just the arguments from the command line interface 
#[derive(Parser, Debug)]
#[clap(author, version, about, long_about = None)]
struct Args {
    // path to the receipt file, as seen from homework 3
    #[clap(short = 'r', long, value_parser, default_value = "./receipt.bin", value_hint = clap::ValueHint::FilePath)]
    receipt: PathBuf,
}

// our main function 
fn main() -> Result<(), Box<dyn Error>> {
    // as seen from homework 3, just sets up logging
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::filter::EnvFilter::from_default_env())
        .init();

    // parse our command line arguments
    let args = Args::parse();

    // read the binary receipt file from disk and then deserialize those bytes into a Receipt struct
    let receipt: Receipt = bincode::deserialize(&fs::read(&args.receipt)?)?;
    // now we verify our proof against the compiled guest's ID, this'll check the integrity and validity of our ZKP
    receipt.verify(SIMPLE_ID)?;

    // decode the journal, which is basically our public outputs, from the verified receipt
    let journal: Journal = receipt.journal.decode()?;

    // map the numeric fields into our JSON-friendly struct
    let out = JournalOut {
        new_commitment: journal.new_commitment,
        old_nonce: journal.old_nonce.to_string(),
        new_ticket: journal.new_ticket.to_string(),
    };
    
    // serialize JournalOut into a compact JSON string 
    let json_output = serde_json::to_string(&out)?;
    println!("Proof verified successfully!"); // little success message, yay!
    println!("{}", json_output); // also print the JSON version of our journal
    
    Ok(())
}
