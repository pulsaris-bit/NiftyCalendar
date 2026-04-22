import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import pg from "pg";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

const { Pool } = pg;
const app = express();
const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || "default-secret-key-123";

// Database initialization
let pool: any = null;
let isMockMode = false;

// Mock storage
const mockDb = {
  users: [] as any[],
  categories: [] as any[],
  events: [] as any[],
  shares: [] as any[],
};

if (!process.env.DATABASE_URL) {
  console.warn("DATABASE_URL environment variable is not set! Running in MOCK MODE (in-memory). Data will be lost on restart.");
  isMockMode = true;
} else {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });
}

async function initDb(retries = 5, delay = 5000) {
  if (isMockMode) {
    console.log("Running in Mock Mode, database skipped.");
    return;
  }
  
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`Connecting to database (attempt ${i + 1}/${retries})...`);
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
            calendar_id TEXT REFERENCES categories(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            start_time TIMESTAMP WITH TIME ZONE NOT NULL,
            end_time TIMESTAMP WITH TIME ZONE NOT NULL,
            description TEXT,
            location TEXT,
            is_all_day BOOLEAN DEFAULT false,
            color TEXT
          );

          CREATE TABLE IF NOT EXISTS category_shares (
            category_id TEXT REFERENCES categories(id) ON DELETE CASCADE,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            can_edit BOOLEAN DEFAULT false,
            PRIMARY KEY (category_id, user_id)
          );
        `);
        console.log("Database initialized successfully");
        return; // Success!
      } finally {
        client.release();
      }
    } catch (err) {
      console.error(`Database connection attempt ${i + 1} failed:`, err.message);
      if (i < retries - 1) {
        console.log(`Retrying in ${delay / 1000} seconds...`);
        await new Promise(res => setTimeout(res, delay));
      } else {
        console.error("All database connection attempts failed. Falling back to mock mode.");
        isMockMode = true;
      }
    }
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

app.get("/api/status", (req, res) => {
  res.json({ mock: isMockMode });
});

app.get("/api/auth/me", authenticateToken, async (req: any, res) => {
  try {
    if (isMockMode) {
      const user = mockDb.users.find(u => u.id === req.user.id);
      if (!user) return res.status(404).json({ error: "User not found" });
      return res.json({ id: user.id, email: user.email, name: user.name, settings: user.settings });
    }
    const result = await pool.query("SELECT id, email, name, settings FROM users WHERE id = $1::integer", [req.user.id]);
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
    if (isMockMode) {
      if (mockDb.users.some(u => u.email === email)) throw new Error("Email already registered");
      const userId = mockDb.users.length + 1;
      const newUser = { id: userId, email, name, password_hash: hash, settings: {} };
      mockDb.users.push(newUser);
      
      // Seed categories in mock mode
      mockDb.categories.push(
        { id: `personal-${userId}`, user_id: userId, name: 'Persoonlijk', color: '#3b82f6', is_visible: true },
        { id: `work-${userId}`, user_id: userId, name: 'Werk', color: '#22c55e', is_visible: true }
      );
      
      const token = jwt.sign({ id: userId, email, name }, JWT_SECRET);
      return res.json({ user: { id: userId, email, name }, token });
    }
    const result = await pool.query(
      "INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3) RETURNING id, email, name",
      [email, name, hash]
    );
    
    // Seed initial categories for new user
    const userId = result.rows[0].id;
    await pool.query(`
      INSERT INTO categories (id, user_id, name, color, is_visible) VALUES 
      ($1, $2::integer, 'Persoonlijk', '#3b82f6', true),
      ($3, $2::integer, 'Werk', '#22c55e', true)
    `, [`personal-${userId}`, userId, `work-${userId}`]);

    const storeId = Number(userId);
    const token = jwt.sign({ id: storeId, email, name }, JWT_SECRET);
    res.json({ user: { id: storeId, email, name }, token });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    if (isMockMode) {
      const user = mockDb.users.find(u => u.email === email);
      if (!user) return res.status(401).json({ error: "Gebruiker niet gevonden" });
      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) return res.status(401).json({ error: "Ongeldig wachtwoord" });

      const token = jwt.sign({ id: Number(user.id), email: user.email, name: user.name }, JWT_SECRET);
      return res.json({ user: { id: Number(user.id), email: user.email, name: user.name, settings: user.settings }, token });
    }
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    if (result.rows.length === 0) return res.status(401).json({ error: "Gebruiker niet gevonden" });

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: "Ongeldig wachtwoord" });

    const token = jwt.sign({ id: Number(user.id), email: user.email, name: user.name }, JWT_SECRET);
    res.json({ user: { id: Number(user.id), email: user.email, name: user.name, settings: user.settings }, token });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/user/settings", authenticateToken, async (req: any, res) => {
  try {
    if (isMockMode) {
      const user = mockDb.users.find(u => u.id === req.user.id);
      return res.json(user?.settings || {});
    }
    const result = await pool.query("SELECT settings FROM users WHERE id = $1::integer", [req.user.id]);
    res.json(result.rows[0].settings);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/user/settings", authenticateToken, async (req: any, res) => {
  try {
    if (isMockMode) {
      const userIndex = mockDb.users.findIndex(u => u.id === req.user.id);
      if (userIndex !== -1) mockDb.users[userIndex].settings = req.body;
      return res.json(req.body);
    }
    const result = await pool.query(
      "UPDATE users SET settings = $1 WHERE id = $2::integer RETURNING settings",
      [req.body, req.user.id]
    );
    res.json(result.rows[0].settings);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/categories", authenticateToken, async (req: any, res) => {
  try {
    if (isMockMode) {
      const owned = mockDb.categories.filter(c => c.user_id === req.user.id);
      const sharedMappings = mockDb.shares.filter(s => s.user_id === req.user.id);
      const shared = mockDb.categories.filter(c => sharedMappings.some(s => s.category_id === c.id));
      
      const all = [...owned, ...shared].map(row => {
        const share = sharedMappings.find(s => s.category_id === row.id);
        const isOwner = row.user_id === req.user.id;
        return {
          id: row.id,
          name: row.name,
          color: row.color,
          isVisible: row.is_visible,
          isOwner,
          canEdit: isOwner || (share ? share.can_edit : false)
        };
      });
      return res.json(all);
    }
    const result = await pool.query(`
      SELECT c.*, 
             (c.user_id = $1::integer) as is_owner,
             COALESCE(cs.can_edit, false) OR (c.user_id = $1::integer) as can_edit
      FROM categories c
      LEFT JOIN category_shares cs ON c.id = cs.category_id AND cs.user_id = $1::integer
      WHERE c.user_id = $1::integer OR cs.user_id = $1::integer
    `, [req.user.id]);
    res.json(result.rows.map(row => ({
      id: row.id,
      name: row.name,
      color: row.color,
      isVisible: row.is_visible,
      isOwner: row.is_owner,
      canEdit: row.can_edit
    })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/categories/:id/shares", authenticateToken, async (req: any, res) => {
  try {
    if (isMockMode) {
      const category = mockDb.categories.find(c => c.id === req.params.id && c.user_id === req.user.id);
      if (!category) return res.status(403).json({ error: "Access denied" });
      const shares = mockDb.shares.filter(s => s.category_id === req.params.id).map(s => {
        const user = mockDb.users.find(u => u.id === s.user_id);
        return { userId: s.user_id, username: user?.name, canEdit: s.can_edit };
      });
      return res.json(shares);
    }
    const checkOwner = await pool.query("SELECT id FROM categories WHERE id = $1 AND user_id = $2::integer", [req.params.id, req.user.id]);
    if (checkOwner.rows.length === 0) return res.status(403).json({ error: "Access denied" });

    const result = await pool.query(`
      SELECT cs.user_id as "userId", u.name as "username", cs.can_edit as "canEdit"
      FROM category_shares cs
      JOIN users u ON cs.user_id = u.id
      WHERE cs.category_id = $1
    `, [req.params.id]);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/categories/:id/share", authenticateToken, async (req: any, res) => {
  const { username, canEdit } = req.body;
  try {
    if (isMockMode) {
      const category = mockDb.categories.find(c => c.id === req.params.id && c.user_id === req.user.id);
      if (!category) return res.status(403).json({ error: "Access denied" });
      const targetUser = mockDb.users.find(u => u.name === username);
      if (!targetUser) return res.status(404).json({ error: "Gebruiker niet gevonden" });
      if (targetUser.id === req.user.id) return res.status(400).json({ error: "Je kunt niet met jezelf delen" });

      const existing = mockDb.shares.find(s => s.category_id === req.params.id && s.user_id === targetUser.id);
      if (existing) {
        existing.can_edit = canEdit;
      } else {
        mockDb.shares.push({ category_id: req.params.id, user_id: targetUser.id, can_edit: canEdit });
      }
      return res.json({ success: true });
    }
    const checkOwner = await pool.query("SELECT id FROM categories WHERE id = $1 AND user_id = $2::integer", [req.params.id, req.user.id]);
    if (checkOwner.rows.length === 0) return res.status(403).json({ error: "Access denied" });

    const userRes = await pool.query("SELECT id FROM users WHERE name = $1", [username]);
    if (userRes.rows.length === 0) return res.status(404).json({ error: "Gebruiker niet gevonden" });
    const targetUserId = userRes.rows[0].id;
    if (targetUserId === req.user.id) return res.status(400).json({ error: "Je kunt niet met jezelf delen" });

    await pool.query(`
      INSERT INTO category_shares (category_id, user_id, can_edit)
      VALUES ($1, $2::integer, $3)
      ON CONFLICT (category_id, user_id) DO UPDATE SET can_edit = $3
    `, [req.params.id, targetUserId, canEdit]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/categories/:id/share/:userId", authenticateToken, async (req: any, res) => {
  try {
    if (isMockMode) {
      const category = mockDb.categories.find(c => c.id === req.params.id && c.user_id === req.user.id);
      if (!category) return res.status(403).json({ error: "Access denied" });
      mockDb.shares = mockDb.shares.filter(s => !(s.category_id === req.params.id && s.user_id === parseInt(req.params.userId)));
      return res.json({ success: true });
    }
    const checkOwner = await pool.query("SELECT id FROM categories WHERE id = $1 AND user_id = $2::integer", [req.params.id, req.user.id]);
    if (checkOwner.rows.length === 0) return res.status(403).json({ error: "Access denied" });

    await pool.query("DELETE FROM category_shares WHERE category_id = $1 AND user_id = $2::integer", [req.params.id, req.params.userId]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/categories/:id", authenticateToken, async (req: any, res) => {
  const { name, color, isVisible } = req.body;
  try {
    if (isMockMode) {
      const index = mockDb.categories.findIndex(c => c.id === req.params.id);
      if (index !== -1) {
        mockDb.categories[index] = { ...mockDb.categories[index], name, color, is_visible: isVisible };
        return res.json(mockDb.categories[index]);
      }
      return res.status(404).json({ error: "Category not found" });
    }
    const result = await pool.query(
      "UPDATE categories SET name = $1, color = $2, is_visible = $3 WHERE id = $4 AND user_id = $5::integer RETURNING *",
      [name, color, isVisible, req.params.id, req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/events", authenticateToken, async (req: any, res) => {
  try {
    if (isMockMode) {
      const myCats = mockDb.categories.filter(c => c.user_id === req.user.id).map(c => c.id);
      const sharedCats = mockDb.shares.filter(s => s.user_id === req.user.id).map(s => s.category_id);
      const allAccessible = [...myCats, ...sharedCats];
      
      return res.json(mockDb.events.filter(e => allAccessible.includes(e.calendar_id)).map(row => ({
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
    }
    const result = await pool.query(`
      SELECT e.* 
      FROM events e
      JOIN categories c ON e.calendar_id = c.id
      LEFT JOIN category_shares cs ON c.id = cs.category_id AND cs.user_id = $1::integer
      WHERE c.user_id = $1::integer OR cs.user_id = $1::integer
    `, [req.user.id]);
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
    if (isMockMode) {
      const category = mockDb.categories.find(c => c.id === calendarId);
      const isOwner = category && category.user_id === req.user.id;
      const canEdit = isOwner || mockDb.shares.some(s => s.category_id === calendarId && s.user_id === req.user.id && s.can_edit);
      
      if (!category || !canEdit) return res.status(403).json({ error: "Access denied" });

      const newEvent = { 
        id, user_id: req.user.id, title, start_time: start, end_time: end, 
        description, location, calendar_id: calendarId, color, is_all_day: isAllDay 
      };
      mockDb.events.push(newEvent);
      return res.json(newEvent);
    }
    
    // Check permissions
    const permRes = await pool.query(`
      SELECT (c.user_id = $1::integer) as is_owner, COALESCE(cs.can_edit, false) as is_shared_editor
      FROM categories c
      LEFT JOIN category_shares cs ON c.id = cs.category_id AND cs.user_id = $1::integer
      WHERE c.id = $2 AND (c.user_id = $1::integer OR cs.user_id = $1::integer)
    `, [req.user.id, calendarId]);

    if (permRes.rows.length === 0 || (!permRes.rows[0].is_owner && !permRes.rows[0].is_shared_editor)) {
      return res.status(403).json({ error: "Access denied" });
    }

    const result = await pool.query(
      `INSERT INTO events (id, user_id, title, start_time, end_time, description, location, calendar_id, color, is_all_day) 
       VALUES ($1, $2::integer, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
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
    if (isMockMode) {
      const event = mockDb.events.find(e => e.id === req.params.id);
      if (!event) return res.status(404).json({ error: "Event not found" });

      const category = mockDb.categories.find(c => c.id === event.calendar_id);
      const isOwner = category && category.user_id === req.user.id;
      const canEdit = isOwner || mockDb.shares.some(s => s.category_id === event.calendar_id && s.user_id === req.user.id && s.can_edit);
      
      if (!canEdit) return res.status(403).json({ error: "Access denied" });

      const index = mockDb.events.findIndex(e => e.id === req.params.id);
      mockDb.events[index] = { 
        ...mockDb.events[index], 
        title, start_time: start, end_time: end, 
        description, location, calendar_id: calendarId, color, is_all_day: isAllDay 
      };
      return res.json(mockDb.events[index]);
    }

    // Check permissions on the event/category
    const permRes = await pool.query(`
      SELECT (c.user_id = $1::integer) as is_owner, COALESCE(cs.can_edit, false) as is_shared_editor
      FROM events e
      JOIN categories c ON e.calendar_id = c.id
      LEFT JOIN category_shares cs ON c.id = cs.category_id AND cs.user_id = $1::integer
      WHERE e.id = $2 AND (c.user_id = $1::integer OR cs.user_id = $1::integer)
    `, [req.user.id, req.params.id]);

    if (permRes.rows.length === 0 || (!permRes.rows[0].is_owner && !permRes.rows[0].is_shared_editor)) {
      return res.status(403).json({ error: "Access denied" });
    }

    const result = await pool.query(
      `UPDATE events SET title = $1, start_time = $2, end_time = $3, description = $4, location = $5, calendar_id = $6, color = $7, is_all_day = $8 
       WHERE id = $9 RETURNING *`,
      [title, start, end, description, location, calendarId, color, isAllDay, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/events/:id", authenticateToken, async (req: any, res) => {
  try {
    if (isMockMode) {
      const event = mockDb.events.find(e => e.id === req.params.id);
      if (!event) return res.status(404).json({ error: "Event not found" });

      const category = mockDb.categories.find(c => c.id === event.calendar_id);
      const isOwner = category && category.user_id === req.user.id;
      const canEdit = isOwner || mockDb.shares.some(s => s.category_id === event.calendar_id && s.user_id === req.user.id && s.can_edit);
      
      if (!canEdit) return res.status(403).json({ error: "Access denied" });

      mockDb.events = mockDb.events.filter(e => e.id !== req.params.id);
      return res.sendStatus(204);
    }

    const permRes = await pool.query(`
      SELECT (c.user_id = $1::integer) as is_owner, COALESCE(cs.can_edit, false) as is_shared_editor
      FROM events e
      JOIN categories c ON e.calendar_id = c.id
      LEFT JOIN category_shares cs ON c.id = cs.category_id AND cs.user_id = $1::integer
      WHERE e.id = $2 AND (c.user_id = $1::integer OR cs.user_id = $1::integer)
    `, [req.user.id, req.params.id]);

    if (permRes.rows.length === 0 || (!permRes.rows[0].is_owner && !permRes.rows[0].is_shared_editor)) {
      return res.status(403).json({ error: "Access denied" });
    }

    await pool.query("DELETE FROM events WHERE id = $1", [req.params.id]);
    res.sendStatus(204);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

async function startServer() {
  const isProduction = process.env.NODE_ENV === "production";
  const distPath = path.join(process.cwd(), 'dist');
  
  // Initialize DB in background - DO NOT AWAIT
  initDb().catch(err => console.error("Background DB init failed:", err));

  // Setup middleware BEFORE listening
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

  // Final step: listen
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Environment: ${isProduction ? 'production' : 'development'}`);
  });
}

startServer();
