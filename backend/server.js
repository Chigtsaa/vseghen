const express = require("express");
const cors = require("cors");
const Database = require("better-sqlite3");

const app = express();
app.use(cors());
app.use(express.json());

const db = new Database("mongol_letters.db");

// 1) Table-ууд үүсгэх
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  username TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS syllables (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  order_no INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS letters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  syllable_id INTEGER NOT NULL,
  char TEXT NOT NULL,
  hint TEXT NOT NULL,
  FOREIGN KEY (syllable_id) REFERENCES syllables(id)
);

CREATE TABLE IF NOT EXISTS user_progress (
  username TEXT NOT NULL,
  syllable_id INTEGER NOT NULL,
  best_score INTEGER NOT NULL DEFAULT 0,
  stars INTEGER NOT NULL DEFAULT 0,
  passed INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (username, syllable_id),
  FOREIGN KEY (username) REFERENCES users(username),
  FOREIGN KEY (syllable_id) REFERENCES syllables(id)
);
`);

// 2) Username бүртгэх (давтагдахгүй)
app.post("/api/signup", (req, res) => {
  const { username } = req.body;
  if (!username || !username.trim()) return res.status(400).json({ error: "username required" });

  try {
    const stmt = db.prepare("INSERT INTO users(username, created_at) VALUES (?, ?)");
    stmt.run(username.trim(), Date.now());
    return res.json({ ok: true, username: username.trim() });
  } catch (e) {
    // PRIMARY KEY давхцвал энд орно
    return res.status(409).json({ error: "username already exists" });
  }
});

// 3) Нэг үеийн үсгүүдээс random 5 авах
app.get("/api/syllables/:id/random5", (req, res) => {
  const syllableId = Number(req.params.id);
  const letters = db
    .prepare("SELECT id, char, hint FROM letters WHERE syllable_id = ?")
    .all(syllableId);

  if (letters.length === 0) return res.status(404).json({ error: "no letters" });

  // shuffle + take 5
  const shuffled = letters.sort(() => Math.random() - 0.5);
  const five = shuffled.slice(0, Math.min(5, shuffled.length));

  res.json({ syllableId, questions: five });
});

// 4) Үе дуусахад progress хадгалах
app.post("/api/progress", (req, res) => {
  const { username, syllableId, score } = req.body;
  if (!username || !syllableId || score == null) return res.status(400).json({ error: "missing fields" });

  const stars = score >= 5 ? 3 : score === 4 ? 2 : score === 3 ? 1 : 0;
  const passed = score >= 4 ? 1 : 0;

  // best_score зөвхөн өсөхөөр update хийх
  const existing = db
    .prepare("SELECT best_score FROM user_progress WHERE username = ? AND syllable_id = ?")
    .get(username, syllableId);

  const bestScore = existing ? Math.max(existing.best_score, score) : score;

  db.prepare(`
    INSERT INTO user_progress(username, syllable_id, best_score, stars, passed, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(username, syllable_id) DO UPDATE SET
      best_score = excluded.best_score,
      stars = excluded.stars,
      passed = excluded.passed,
      updated_at = excluded.updated_at
  `).run(username, syllableId, bestScore, stars, passed, Date.now());

  res.json({ ok: true, stars, passed: !!passed, bestScore });
});

app.listen(3000, () => console.log("API running on http://localhost:3000"));