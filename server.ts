import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import pg from "pg";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;
const app = express();
const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || "default-secret-key-123";

// Database initialization
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL environment variable is not set!");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function initDb() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        settings JSONB DEFAULT '{}'
      );

      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        name TEXT NOT NULL,
        color TEXT NOT NULL,
        is_visible BOOLEAN DEFAULT true
      );

      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        calendar_id TEXT REFERENCES categories(id),
        title TEXT NOT NULL,
        start_time TIMESTAMP WITH TIME ZONE NOT NULL,
        end_time TIMESTAMP WITH TIME ZONE NOT NULL,
        description TEXT,
        location TEXT,
        is_all_day BOOLEAN DEFAULT false,
        color TEXT
      );
    `);
    console.log("Database tables initialized");
  } catch (err) {
    console.error("Error initializing database:", err);
  } finally {
    client.release();
  }
}

app.use(express.json());

// Auth Middleware
const authenticateToken = (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

app.get("/api/auth/me", authenticateToken, async (req: any, res) => {
  try {
    const result = await pool.query("SELECT id, email, name, settings FROM users WHERE id = $1", [req.user.id]);
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Auth Routes
app.post("/api/auth/register", async (req, res) => {
  const { email, name, password } = req.body;
  const hash = await bcrypt.hash(password, 10);
  try {
    const result = await pool.query(
      "INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3) RETURNING id, email, name",
      [email, name, hash]
    );
    
    // Seed initial categories for new user
    const userId = result.rows[0].id;
    await pool.query(`
      INSERT INTO categories (id, user_id, name, color, is_visible) VALUES 
      ('personal-' || $1, $1, 'Persoonlijk', '#C36322', true),
      ('work-' || $1, $1, 'Werk', '#1a1a1a', true),
      ('family-' || $1, $1, 'Familie', '#10b981', true)
    `, [userId]);

    const token = jwt.sign({ id: userId, email, name }, JWT_SECRET);
    res.json({ user: result.rows[0], token });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    if (result.rows.length === 0) return res.status(401).json({ error: "Gebruiker niet gevonden" });

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: "Ongeldig wachtwoord" });

    const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET);
    res.json({ user: { id: user.id, email: user.email, name: user.name, settings: user.settings }, token });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/user/settings", authenticateToken, async (req: any, res) => {
  try {
    const result = await pool.query("SELECT settings FROM users WHERE id = $1", [req.user.id]);
    res.json(result.rows[0].settings);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/user/settings", authenticateToken, async (req: any, res) => {
  try {
    const result = await pool.query(
      "UPDATE users SET settings = $1 WHERE id = $2 RETURNING settings",
      [req.body, req.user.id]
    );
    res.json(result.rows[0].settings);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/categories", authenticateToken, async (req: any, res) => {
  try {
    const result = await pool.query("SELECT * FROM categories WHERE user_id = $1", [req.user.id]);
    res.json(result.rows.map(row => ({
      id: row.id,
      name: row.name,
      color: row.color,
      isVisible: row.is_visible
    })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/categories/:id", authenticateToken, async (req: any, res) => {
  const { name, color, isVisible } = req.body;
  try {
    const result = await pool.query(
      "UPDATE categories SET name = $1, color = $2, is_visible = $3 WHERE id = $4 AND user_id = $5 RETURNING *",
      [name, color, isVisible, req.params.id, req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/events", authenticateToken, async (req: any, res) => {
  try {
    const result = await pool.query("SELECT * FROM events WHERE user_id = $1", [req.user.id]);
    res.json(result.rows.map(row => ({
      id: row.id,
      title: row.title,
      start: row.start_time,
      end: row.end_time,
      description: row.description,
      location: row.location,
      calendarId: row.calendar_id,
      color: row.color,
      isAllDay: row.is_all_day
    })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/events", authenticateToken, async (req: any, res) => {
  const { id, title, start, end, description, location, calendarId, color, isAllDay } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO events (id, user_id, title, start_time, end_time, description, location, calendar_id, color, is_all_day) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [id, req.user.id, title, start, end, description, location, calendarId, color, isAllDay]
    );
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/events/:id", authenticateToken, async (req: any, res) => {
  const { title, start, end, description, location, calendarId, color, isAllDay } = req.body;
  try {
    const result = await pool.query(
      `UPDATE events SET title = $1, start_time = $2, end_time = $3, description = $4, location = $5, calendar_id = $6, color = $7, is_all_day = $8 
       WHERE id = $9 AND user_id = $10 RETURNING *`,
      [title, start, end, description, location, calendarId, color, isAllDay, req.params.id, req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/events/:id", authenticateToken, async (req: any, res) => {
  try {
    await pool.query("DELETE FROM events WHERE id = $1 AND user_id = $2", [req.params.id, req.user.id]);
    res.sendStatus(204);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

async function startServer() {
  await initDb();

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
