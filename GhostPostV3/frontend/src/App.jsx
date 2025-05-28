import { useEffect, useRef, useState } from "react";

// first let's define some constants for the rest of the App
const API = "http://localhost:8000"; // this is our backend API base URL
const keyFor = (u) => `gpv3_zk_state_${u}`; // this is our LocalStorage key namespace
const toast = (msg) => alert(msg); // since we use a lot of alerts, let's make a simple wrapper

// this is a one-time injection to insert the key-frames for our animated background gradient
const sheet=document.styleSheets[0];
sheet.insertRule(`@keyframes bgShift{0%{filter:hue-rotate(0deg);}100%{filter:hue-rotate(60deg);}}`,sheet.cssRules.length);

// now we can actually create our app component
export default function App() {
  // let's define all our React states
  const [mode, setMode] = useState("login"); // we need this for our modal, determine between login vs register
  const [modalOpen, setModalOpen] = useState(false); // show/hide our modal
  const [username, setUsername] = useState(""); // authorization (username) input
  const [password, setPassword] = useState(""); // authorization (password) input
  const [user, setUser] = useState(null); // this is the logged in user object (name)
  const [zk, setZk] = useState(null); // this is our zk state: { tickets, is_banned, old_nonce }
  const [hasPosted, setHasPosted] = useState(false); // we need this to only allow one post per session
  const [postContent, setPostContent] = useState(""); // our new post content
  const [posts, setPosts] = useState([]); // our feed content
  const feedRef = useRef(null); // used to scroll to top on feed reload
  const isLoggedIn = !!user; // authorization check
  const isAdmin = user?.name === "Admin"; // a flag to determine if the user is a moderator or not

  // next up, some useful helper functions to load and save to LocalStorage
  const loadZk = (name) => JSON.parse(localStorage.getItem(keyFor(name)) || "null");
  const saveZk = (name, obj) => {
    localStorage.setItem(keyFor(name), JSON.stringify(obj));
    setZk(obj); // update state after saving
  };

  // load our feed
  useEffect(() => { fetchFeed(); }, []);
  async function fetchFeed() {
    const r = await fetch(API + "/forum/posts");
    setPosts(await r.json()); // store the posts in state
    feedRef.current?.scrollTo(0, 0); // scroll to the top
  }

  // handle authentication
  async function handleAuth() {
    const ep = mode === "login" ? "login" : "register";

    const res = await fetch(`${API}/forum/${ep}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    const data = await res.json();
    if (!res.ok) {
      toast(data.detail); 
      return;
    }

    // on success, set user and reset relevant state
    setUser({ name: username });
    setHasPosted(false);
    setPassword("");
    setModalOpen(false);

    if (mode === "register") {
      // on registration, start fresh ZK state
      saveZk(username, { username, tickets: [], is_banned: false, old_nonce: "0" });
    } else {
      // on login, restore previous ZK state
      const obj = loadZk(username);
      if (!obj) {
        toast("No ZK state; register first!");
        setUser(null);
      } else {
        setZk(obj);
      }
    }
  }

  // log out the user and clear state
  function handleLogout() {
    setUser(null);
    setZk(null);
    setHasPosted(false);
  }

  // open auth modal in given mode and clear inputs
  function openModal(which) {
    setUsername("");
    setPassword("");
    setMode(which);
    setModalOpen(true);
  }

  // handle new post submission (includes ZK proof generation)
  async function handlePost() {
    // prevent posting if not allowed
    if (!isLoggedIn || hasPosted || !postContent.trim()) return;

    // step 1: fetch all callback tickets before running proof
    const res = await fetch(API + "/all-callbacks");
    const callbackTickets = await res.json();

    try {
      // step 2: request ZK proof from local zk-prover endpoint
      const proofRes = await fetch('/zk-prove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          existing_tickets: zk.tickets,
          callback_tickets: callbackTickets,
          is_banned: zk.is_banned,
          old_nonce: zk.old_nonce,
        }),
      });
      if (!proofRes.ok) throw new Error(await proofRes.text());
      const journal = await proofRes.json();

      // step 3: update local ZK state with new ticket
      const newZk = {
        username: user.name,
        tickets: [...zk.tickets, journal.new_ticket],
        is_banned: false,
        old_nonce: String(journal.old_nonce),
      };
      saveZk(user.name, newZk);

      // step 4: submit post content along with new ticket
      const postRes = await fetch(API + '/forum/post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: postContent, ticket: journal.new_ticket }),
      });
      const postData = await postRes.json();
      if (!postRes.ok) { toast(postData.detail); return; }

      setHasPosted(true);
      setPostContent('');
      fetchFeed();
    } catch (err) {

      // try to parse the JSON body
      let body;
      try { body = JSON.parse(err.message); } catch {}

      // handle ban response specially
      if (body?.detail === 'banned') {
        toast(body.message || 'You are banned!');
        saveZk(user.name, { ...zk, is_banned: true }); // persist ban in zk state
      } else {
        toast(body?.message || 'Proof or post failed!');
      }
    }
  }


  // handle admin deleting functionality
  async function handleDelete(id, ticket) {
    // only the Admin can delete!
    if (!isAdmin) 
      return;

    const r = await fetch(`${API}/forum/post/${id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket }),
    });

    if (r.ok) {
      setPosts((p) => p.filter((x) => x.id !== id)); // remove post locally
    } else {
      toast("Delete failed!");
    }
  }

  // handle the hard reset button
  async function handleHardReset() {
    // step 1: call the server to delete app.db
    await fetch(API + "/reset-testing", { method: "POST" });
    // step 2: clear local ZK state
    localStorage.clear();
    // step 3: reload the page
    window.location.reload();
  }

  // these are our UI styles 
  const bg={
    minHeight: "100vh",
    background: "linear-gradient(135deg,#0f0c29 0%,#302b63 50%,#24243e 100%)",
    animation: "bgShift 12s ease-in-out infinite alternate",
    color: "white",
    display: "flex",
    flexDirection: "column"
  };

  const header = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "1rem 2rem",
    gap: 16
  };

  const btn = (extra) => ({
    padding: "8px 14px",
    borderRadius: 8,
    cursor: "pointer",
    border: "none",
    fontWeight: 600,
    ...extra
  });

  const card = { 
    background: "rgba(255,255,255,0.1)",
    backdropFilter: "blur(8px)",
    borderRadius: 12,
    padding: 24,
    boxShadow: "0 4px 14px #0004"
  };

  const postDisabled = !isLoggedIn || hasPosted || zk?.is_banned;
  const feedStyle = {
    ...card,
    flex: 1,
    overflowY: "auto",
    maxHeight: "60vh"
  };

  // render our JSX
  return (
    <div style={bg}>

      {/* hard reset button */}
      <button
        onClick={handleHardReset}
        style={{
          position: "fixed",
          bottom: 12,
          left: 12,
          padding: "6px 10px",
          fontSize: "0.8rem",
          background: "#f87171",
          color: "white",
          border: "none",
          borderRadius: 6,
          cursor: "pointer",
          opacity: 0.8,
        }}
      >
        Hard Reset (Testing)
      </button>

      {/* our header */}
      <div style={header}>
        <h2 style={{ margin: 0, fontWeight: 700, letterSpacing: 1 }}>GhostPost 🕯️</h2>
        {!isLoggedIn ? (
          <div style={{ display: "flex", gap: 8 }}>
            <button style={btn({ background: "#4ade80" })} onClick={() => openModal("login")}>Log in</button>
            <button style={btn({ background: "#60a5fa" })} onClick={() => openModal("register")}>Register</button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ opacity: .8 }}>Hi <b>{user.name}</b></span>
            <button style={btn({ background: "#f87171" })} onClick={handleLogout}>Log out</button>
          </div>
        )}
      </div>

      {/* our feed and composer */}
      <div style={{ display: "flex", justifyContent: "center", paddingBottom: 32 }}>
        <div style={{ width: "min(600px,90%)", display: "flex", flexDirection: "column", gap: 24 }}>

          {/* our composer */}
          <div style={card}>
            {zk?.is_banned && <p style={{ color: "#f87171", marginTop: 0 }}>You are banned.</p>}
            {!zk?.is_banned && isLoggedIn &&
              <p style={{ marginTop: 0, opacity: .8 }}>Posting as <b>{user.name}</b></p>}
            {!isLoggedIn &&
              <p style={{ marginTop: 0, opacity: .8 }}>Log in to post.</p>}

            <textarea
              style={{
                width: "100%", boxSizing: "border-box", height: 100, padding: 12, borderRadius: 8,
                border: "none", resize: "none", opacity: postDisabled ? .6 : 1
              }}
              placeholder="Share your thoughts…"
              value={postContent}
              onChange={e => setPostContent(e.target.value)}
              disabled={postDisabled}
            />

            <button
              style={btn({ background: "#38bdf8", marginTop: 12, width: "100%" })}
              disabled={postDisabled}
              onClick={handlePost}
            >Submit</button>
          </div>

          {/* our feed */}
          <div style={feedStyle} ref={feedRef}>
            <h3 style={{ marginTop: 0 }}>Latest posts</h3>
            {posts.length === 0 && <p>No posts yet.</p>}
            {posts.map(({ id, content, timestamp, ticket }) => (
              <div key={id} style={{ padding: "12px 0", borderBottom: "1px solid #ffffff22" }}>
                <p style={{ margin: "4px 0" }}>{content}</p>
                <small style={{ opacity: .7 }}>{new Date(timestamp).toLocaleString()}</small>
                {isAdmin &&
                  <button style={btn({ background: "#f87171", marginLeft: 12, fontSize: 12 })}
                    onClick={() => handleDelete(id, ticket)}>Delete</button>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* our authentication modal */}
      {modalOpen && (
        <div style={{
          position: "fixed", inset: 0, background: "#0008",
          display: "flex", alignItems: "center", justifyContent: "center"
        }} onClick={() => setModalOpen(false)}>

          <div style={{ ...card, width: 320 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>{mode === "login" ? "Log in" : "Register"}</h3>

            <input
              style={{ width: "100%", padding: 8, borderRadius: 8, border: "none", marginBottom: 12 }}
              placeholder="Username"
              value={username}
              onChange={e => setUsername(e.target.value)}
            />
            <input
              type="password"
              style={{ width: "100%", padding: 8, borderRadius: 8, border: "none", marginBottom: 12 }}
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
            />

            <button
              style={btn({ background: "#4ade80", width: "100%" })}
              onClick={handleAuth}>
              {mode === "login" ? "Log in" : "Register"}
            </button>

            <p style={{ fontSize: 12, marginTop: 8, textAlign: "center" }}>
              {mode === "login" ? "New here? " : "Have an account? "}
              <span style={{ textDecoration: "underline", cursor: "pointer" }}
                onClick={() => {
                  setUsername("");
                  setPassword("");
                  setMode(mode === "login" ? "register" : "login");
                }}>
                {mode === "login" ? "Register" : "Log in"}
              </span>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}