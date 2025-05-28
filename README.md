# GhostPost 

GhostPost is a pseudonymous forum that demonstrates the zk-Promises protocol in action—combining anonymous posting with cryptographic accountability via zero-knowledge proofs.

This guide is for reviewers or developers who are running GhostPost locally from a `.zip` project archive. It assumes a UNIX-like environment (Linux/macOS).

---

## Prerequisites

Ensure the following tools are installed **before** running GhostPost.

### System Requirements

- Unix/macOS terminal (Bash/Zsh)
- Admin privileges (for installing packages)

### Core Dependencies

#### 1. **Rust**
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

#### 2. **Risc0**
```bash
curl -L https://risczero.com/install | bash
rzup install
rzup install cargo-risczero 1.2.4
rzup default r0vm 1.2.4
```

#### 3. **Python**
```bash
sudo apt install python3 python3-venv python3-pip  
```

#### 4. **Node.js + npm**
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

#### 5. **SQLite3**
```bash
sudo apt install sqlite3 libsqlite3-dev
```

---

## Package Installation

Once dependencies are installed, install project-specific packages.

### Backend (Python)
From the root directory:
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### Frontend (React)
From the root directory:
```bash
cd frontend
npm install
```

## Setup

### zk-Proof System (Risc0)
From the root directory:
```bash
cd zk-simple
cargo clean
cargo build --release
```
Note: Confirm that `zk-simple/target/release/prove` and `zk-simple/target/release/verify` both exist!

### Backend Setup
From the root directory:
```bash
cd backend
source venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend Setup
In a separate command interface (bash), run this (as in, make sure the backend is still running when you run this):
```bash
cd frontend
npm run dev
```
This should run the front end on port 5173.

### Testing
Go to `http://localhost:5173/` to test the app.

Note: At the bottom left, you can click on the reset button to delete the database and start over

Note for Note: You may have to click it once or twice and then refresh the page
