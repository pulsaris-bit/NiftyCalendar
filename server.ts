import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Database Connection
  const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'user',
    database: process.env.DB_NAME || 'nifty_calendar',
  };

  const connectionString = process.env.DATABASE_URL || `postgresql://${dbConfig.user}:${process.env.DB_PASSWORD}@${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`;
  
  console.log(`Connecting to database at ${dbConfig.host}:${dbConfig.port} (DB: ${dbConfig.database}, User: ${dbConfig.user})`);

  const pool = new Pool({ connectionString });

  // Initialize Database
  try {
    const res = await pool.query('SELECT NOW()');
    console.log('Database connected successfully:', res.rows[0]);
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Users table checked/created');
  } catch (err) {
    console.error('CRITICAL: Database initialization failed!');
    console.error(err);
  }

  // API Routes
  app.post('/api/auth/signup', async (req, res) => {
    const { name, email, password } = req.body;
    try {
      // NOTE: The error "column-id is a type of integer, but expression is a type of text" 
      // often happens if we try to insert a string into the 'id' SERIAL column.
      // We omit 'id' so Postgres handles it automatically.
      const result = await pool.query(
        'INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id, name, email',
        [name, email, password]
      );
      res.status(201).json(result.rows[0]);
    } catch (err: any) {
      console.error('Signup error:', err);
      if (err.code === '23505') {
        return res.status(400).json({ error: 'E-mailadres is al in gebruik' });
      }
      // Re-throwing or returning the specific DB error to help debugging (but sanitized for prod usually)
      res.status(500).json({ error: err.message || 'Interne serverfout' });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    try {
      const result = await pool.query(
        'SELECT id, name, email FROM users WHERE email = $1 AND password = $2',
        [email, password]
      );
      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Ongeldige inloggegevens' });
      }
      res.json(result.rows[0]);
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ error: 'Interne serverfout' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
