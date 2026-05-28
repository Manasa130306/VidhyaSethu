import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import Database from "better-sqlite3";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Database
const db = new Database("vidyasethu.db");

// Create tables (SQLite version of the requested PostgreSQL schema)
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    course_name TEXT,
    subject_code TEXT,
    modules TEXT, -- JSON Array
    cos TEXT, -- JSON Array
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS exam_sets (
    id TEXT PRIMARY KEY,
    session_id TEXT,
    set_name TEXT,
    total_marks INTEGER,
    duration_minutes INTEGER DEFAULT 180,
    FOREIGN KEY(session_id) REFERENCES sessions(id)
  );

  CREATE TABLE IF NOT EXISTS questions (
    id TEXT PRIMARY KEY,
    set_id TEXT,
    text TEXT,
    options TEXT, -- JSON Array
    correct_answer TEXT,
    rationale TEXT,
    k_level TEXT, -- K1 to K6
    difficulty TEXT, -- Easy, Medium, Hard
    topic TEXT,
    co TEXT, -- CO1 to CO6
    marks INTEGER,
    quality_score INTEGER DEFAULT 100,
    FOREIGN KEY(set_id) REFERENCES exam_sets(id)
  );

  CREATE TABLE IF NOT EXISTS repository (
    id TEXT PRIMARY KEY,
    text TEXT UNIQUE,
    k_level TEXT,
    difficulty TEXT,
    topic TEXT,
    co TEXT,
    marks INTEGER,
    last_used DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Migrations for existing databases
try {
  db.exec("ALTER TABLE exam_sets ADD COLUMN total_marks INTEGER;");
} catch (e) {}
try {
  db.exec("ALTER TABLE exam_sets ADD COLUMN duration_minutes INTEGER DEFAULT 180;");
} catch (e) {}
try {
  db.exec("ALTER TABLE questions ADD COLUMN k_level TEXT;");
} catch (e) {}
try {
  db.exec("ALTER TABLE questions ADD COLUMN difficulty TEXT;");
} catch (e) {}
try {
  db.exec("ALTER TABLE questions ADD COLUMN topic TEXT;");
} catch (e) {}
try {
  db.exec("ALTER TABLE questions ADD COLUMN co TEXT;");
} catch (e) {}
try {
  db.exec("ALTER TABLE questions ADD COLUMN marks INTEGER;");
} catch (e) {}
try {
  db.exec("ALTER TABLE questions ADD COLUMN quality_score INTEGER DEFAULT 100;");
} catch (e) {}
try {
  db.exec("ALTER TABLE repository ADD COLUMN k_level TEXT;");
} catch (e) {}
try {
  db.exec("ALTER TABLE repository ADD COLUMN difficulty TEXT;");
} catch (e) {}
try {
  db.exec("ALTER TABLE repository ADD COLUMN topic TEXT;");
} catch (e) {}
try {
  db.exec("ALTER TABLE repository ADD COLUMN co TEXT;");
} catch (e) {}
try {
  db.exec("ALTER TABLE repository ADD COLUMN marks INTEGER;");
} catch (e) {}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Auth Mock
  app.post("/api/auth/login", (req, res) => {
    const { email, password } = req.body;
    if (email && password) {
      res.json({ success: true, user: { name: "Faculty Member", email } });
    } else {
      res.status(401).json({ error: "Invalid credentials" });
    }
  });

  // Sessions & Exams
  app.post("/api/sessions", (req, res) => {
    const { id, courseName, subjectCode, modules, cos } = req.body;
    const stmt = db.prepare("INSERT INTO sessions (id, course_name, subject_code, modules, cos) VALUES (?, ?, ?, ?, ?)");
    stmt.run(id, courseName, subjectCode, JSON.stringify(modules), JSON.stringify(cos));
    res.json({ success: true });
  });

  app.post("/api/sessions/:sessionId/sets", (req, res) => {
    const { sessionId } = req.params;
    const { id, setName, questions, totalMarks, durationMinutes } = req.body;
    
    const setStmt = db.prepare("INSERT INTO exam_sets (id, session_id, set_name, total_marks, duration_minutes) VALUES (?, ?, ?, ?, ?)");
    setStmt.run(id, sessionId, setName, totalMarks, durationMinutes);

    const qStmt = db.prepare(`
      INSERT INTO questions (id, set_id, text, options, correct_answer, rationale, k_level, difficulty, topic, co, marks, quality_score)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const repoStmt = db.prepare(`
      INSERT INTO repository (id, text, k_level, difficulty, topic, co, marks)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(text) DO UPDATE SET
        k_level = excluded.k_level,
        difficulty = excluded.difficulty,
        topic = excluded.topic,
        co = excluded.co,
        marks = excluded.marks,
        last_used = CURRENT_TIMESTAMP
    `);

    try {
      const transaction = db.transaction((qs: any[]) => {
        for (const q of qs) {
          qStmt.run(q.id, id, q.text, JSON.stringify(q.options || []), q.correctAnswer, q.rationale, q.kLevel, q.difficulty, q.topic, q.co, q.marks, q.qualityScore);
          repoStmt.run(q.id, q.text, q.kLevel, q.difficulty, q.topic, q.co, q.marks);
        }
      });

      transaction(questions);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Transaction failed:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/sessions", (req, res) => {
    const sessions = db.prepare("SELECT * FROM sessions ORDER BY created_at DESC").all();
    res.json(sessions.map((s: any) => ({
      ...s,
      modules: JSON.parse(s.modules),
      cos: JSON.parse(s.cos)
    })));
  });

  app.get("/api/sessions/:sessionId", (req, res) => {
    const { sessionId } = req.params;
    const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(sessionId);
    if (!session) return res.status(404).json({ error: "Session not found" });

    const sets = db.prepare("SELECT * FROM exam_sets WHERE session_id = ?").all(sessionId);
    const fullSets = sets.map((set: any) => {
      const questions = db.prepare("SELECT * FROM questions WHERE set_id = ?").all(set.id);
      return {
        ...set,
        questions: questions.map((q: any) => ({
          ...q,
          options: JSON.parse(q.options)
        }))
      };
    });

    res.json({
      ...session,
      modules: JSON.parse(session.modules),
      cos: JSON.parse(session.cos),
      sets: fullSets
    });
  });

  app.get("/api/repository", (req, res) => {
    const questions = db.prepare("SELECT * FROM repository").all();
    res.json(questions);
  });

  // API health
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
