import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

const app = express();
const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || "default-secret-key-123";

// Database initialization
const dbPath = path.join(process.cwd(), "calendar.db");
const db = new Database(dbPath);

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    settings TEXT DEFAULT '{}'
  );

  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    is_visible INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    calendar_id TEXT REFERENCES categories(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    description TEXT,
    location TEXT,
    is_all_day INTEGER DEFAULT 0,
    color TEXT
  );

  CREATE TABLE IF NOT EXISTS category_shares (
    category_id TEXT REFERENCES categories(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    can_edit INTEGER DEFAULT 0,
    PRIMARY KEY (category_id, user_id)
  );
`);

console.log("Database initialized successfully with SQLite");

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

app.get("/api/status", (req, res) => {
  res.json({ mock: false, type: 'sqlite' });
});

app.get("/api/auth/me", authenticateToken, async (req: any, res) => {
  try {
    const user = db.prepare("SELECT id, email, name, settings FROM users WHERE id = ?").get(req.user.id) as any;
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ ...user, settings: JSON.parse(user.settings) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Auth Routes
app.post("/api/auth/register", async (req, res) => {
  const { email, name, password } = req.body;
  const hash = await bcrypt.hash(password, 10);
  try {
    const insertUser = db.prepare("INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)");
    const result = insertUser.run(email, name, hash);
    const userId = result.lastInsertRowid as number;
    
    // Seed initial categories
    db.prepare("INSERT INTO categories (id, user_id, name, color, is_visible) VALUES (?, ?, 'Persoonlijk', '#3b82f6', 1)").run(`personal-${userId}`, userId);
    db.prepare("INSERT INTO categories (id, user_id, name, color, is_visible) VALUES (?, ?, 'Werk', '#22c55e', 1)").run(`work-${userId}`, userId);

    const token = jwt.sign({ id: userId, email, name }, JWT_SECRET);
    res.json({ user: { id: userId, email, name }, token });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email) as any;
    if (!user) return res.status(401).json({ error: "Gebruiker niet gevonden" });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: "Ongeldig wachtwoord" });

    const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET);
    res.json({ user: { id: user.id, email: user.email, name: user.name, settings: JSON.parse(user.settings) }, token });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/user/settings", authenticateToken, async (req: any, res) => {
  try {
    const row = db.prepare("SELECT settings FROM users WHERE id = ?").get(req.user.id) as any;
    res.json(JSON.parse(row?.settings || '{}'));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/user/settings", authenticateToken, async (req: any, res) => {
  try {
    const settingsStr = JSON.stringify(req.body);
    db.prepare("UPDATE users SET settings = ? WHERE id = ?").run(settingsStr, req.user.id);
    res.json(req.body);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/categories", authenticateToken, async (req: any, res) => {
  try {
    const rows = db.prepare(`
      SELECT c.*, 
             (c.user_id = ?) as is_owner,
             COALESCE(cs.can_edit, 0) OR (c.user_id = ?) as can_edit
      FROM categories c
      LEFT JOIN category_shares cs ON c.id = cs.category_id AND cs.user_id = ?
      WHERE c.user_id = ? OR cs.user_id = ?
    `).all(req.user.id, req.user.id, req.user.id, req.user.id, req.user.id) as any[];

    res.json(rows.map(row => ({
      id: row.id,
      name: row.name,
      color: row.color,
      isVisible: Boolean(row.is_visible),
      isOwner: Boolean(row.is_owner),
      canEdit: Boolean(row.can_edit)
    })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/categories/:id/shares", authenticateToken, async (req: any, res) => {
  try {
    const checkOwner = db.prepare("SELECT id FROM categories WHERE id = ? AND user_id = ?").get(req.params.id, req.user.id);
    if (!checkOwner) return res.status(403).json({ error: "Access denied" });

    const rows = db.prepare(`
      SELECT cs.user_id as userId, u.name as username, cs.can_edit as canEdit
      FROM category_shares cs
      JOIN users u ON cs.user_id = u.id
      WHERE cs.category_id = ?
    `).all(req.params.id) as any[];

    res.json(rows.map(row => ({ ...row, canEdit: Boolean(row.canEdit) })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/categories/:id/share", authenticateToken, async (req: any, res) => {
  const { username, canEdit } = req.body;
  try {
    const checkOwner = db.prepare("SELECT id FROM categories WHERE id = ? AND user_id = ?").get(req.params.id, req.user.id);
    if (!checkOwner) return res.status(403).json({ error: "Access denied" });

    const targetUser = db.prepare("SELECT id FROM users WHERE name = ?").get(username) as any;
    if (!targetUser) return res.status(404).json({ error: "Gebruiker niet gevonden" });
    if (targetUser.id === req.user.id) return res.status(400).json({ error: "Je kunt niet met jezelf delen" });

    db.prepare(`
      INSERT INTO category_shares (category_id, user_id, can_edit)
      VALUES (?, ?, ?)
      ON CONFLICT (category_id, user_id) DO UPDATE SET can_edit = excluded.can_edit
    `).run(req.params.id, targetUser.id, canEdit ? 1 : 0);
    
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/categories/:id/share/:userId", authenticateToken, async (req: any, res) => {
  try {
    const checkOwner = db.prepare("SELECT id FROM categories WHERE id = ? AND user_id = ?").get(req.params.id, req.user.id);
    if (!checkOwner) return res.status(403).json({ error: "Access denied" });

    db.prepare("DELETE FROM category_shares WHERE category_id = ? AND user_id = ?").run(req.params.id, req.params.userId);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/categories/:id", authenticateToken, async (req: any, res) => {
  const { name, color, isVisible } = req.body;
  try {
    const result = db.prepare(
      "UPDATE categories SET name = ?, color = ?, is_visible = ? WHERE id = ? AND user_id = ? RETURNING *"
    ).get(name, color, isVisible ? 1 : 0, req.params.id, req.user.id) as any;
    
    if (!result) return res.status(404).json({ error: "Category not found or access denied" });
    res.json({ ...result, isVisible: Boolean(result.is_visible) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/events", authenticateToken, async (req: any, res) => {
  try {
    const rows = db.prepare(`
      SELECT e.* 
      FROM events e
      JOIN categories c ON e.calendar_id = c.id
      LEFT JOIN category_shares cs ON c.id = cs.category_id AND cs.user_id = ?
      WHERE c.user_id = ? OR cs.user_id = ?
    `).all(req.user.id, req.user.id, req.user.id) as any[];

    res.json(rows.map(row => ({
      id: row.id,
      title: row.title,
      start: row.start_time,
      end: row.end_time,
      description: row.description,
      location: row.location,
      calendarId: row.calendar_id,
      color: row.color,
      isAllDay: Boolean(row.is_all_day)
    })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/events", authenticateToken, async (req: any, res) => {
  const { id, title, start, end, description, location, calendarId, color, isAllDay } = req.body;
  try {
    const perm = db.prepare(`
      SELECT (c.user_id = ?) as is_owner, COALESCE(cs.can_edit, 0) as is_shared_editor
      FROM categories c
      LEFT JOIN category_shares cs ON c.id = cs.category_id AND cs.user_id = ?
      WHERE c.id = ? AND (c.user_id = ? OR cs.user_id = ?)
    `).get(req.user.id, req.user.id, calendarId, req.user.id, req.user.id) as any;

    if (!perm || (!perm.is_owner && !perm.is_shared_editor)) {
      return res.status(403).json({ error: "Access denied" });
    }

    const insert = db.prepare(`
      INSERT INTO events (id, user_id, title, start_time, end_time, description, location, calendar_id, color, is_all_day) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *
    `);
    
    const result = insert.get(id, req.user.id, title, start, end, description, location, calendarId, color, isAllDay ? 1 : 0);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/events/:id", authenticateToken, async (req: any, res) => {
  const { title, start, end, description, location, calendarId, color, isAllDay } = req.body;
  try {
    const perm = db.prepare(`
      SELECT (c.user_id = ?) as is_owner, COALESCE(cs.can_edit, 0) as is_shared_editor
      FROM events e
      JOIN categories c ON e.calendar_id = c.id
      LEFT JOIN category_shares cs ON c.id = cs.category_id AND cs.user_id = ?
      WHERE e.id = ? AND (c.user_id = ? OR cs.user_id = ?)
    `).get(req.user.id, req.user.id, req.params.id, req.user.id, req.user.id) as any;

    if (!perm || (!perm.is_owner && !perm.is_shared_editor)) {
      return res.status(403).json({ error: "Access denied" });
    }

    const result = db.prepare(`
      UPDATE events SET title = ?, start_time = ?, end_time = ?, description = ?, location = ?, calendar_id = ?, color = ?, is_all_day = ? 
      WHERE id = ? RETURNING *
    `).get(title, start, end, description, location, calendarId, color, isAllDay ? 1 : 0, req.params.id);
    
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/events/:id", authenticateToken, async (req: any, res) => {
  try {
    const perm = db.prepare(`
      SELECT (c.user_id = ?) as is_owner, COALESCE(cs.can_edit, 0) as is_shared_editor
      FROM events e
      JOIN categories c ON e.calendar_id = c.id
      LEFT JOIN category_shares cs ON c.id = cs.category_id AND cs.user_id = ?
      WHERE e.id = ? AND (c.user_id = ? OR cs.user_id = ?)
    `).get(req.user.id, req.user.id, req.params.id, req.user.id, req.user.id) as any;

    if (!perm || (!perm.is_owner && !perm.is_shared_editor)) {
      return res.status(403).json({ error: "Access denied" });
    }

    db.prepare("DELETE FROM events WHERE id = ?").run(req.params.id);
    res.sendStatus(204);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

async function startServer() {
  const isProduction = process.env.NODE_ENV === "production";
  const distPath = path.join(process.cwd(), 'dist');
  
  if (!isProduction || !fs.existsSync(path.join(distPath, 'index.html'))) {
    console.log("Using Vite middleware for development/fallback...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Serving production build from dist...");
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Environment: ${isProduction ? 'production' : 'development'}`);
  });
}

startServer();
