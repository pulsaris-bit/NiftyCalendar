import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import fs from "fs";
import CryptoJS from "crypto-js";

// Import CalDAV related modules
import { NextcloudOAuthClient } from './lib/oauthClient';
import { CalDAVClient, createCalDAVClientFromEnv } from './lib/caldavClient';
import { encryptPassword as forgeEncrypt, decryptPassword as forgeDecrypt } from './lib/encryption';

dotenv.config();

const app = express();
const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || "default-secret-key-123";

// CalDAV Configuration
const CALDAV_AUTH_METHOD = (process.env.CALDAV_AUTH_METHOD || 'basic') as 'oauth' | 'basic';
const CALDAV_SERVER_URL = process.env.CALDAV_SERVER_URL || '';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '';

// Oauth Configuration
const OAUTH_CLIENT_ID = process.env.OAUTH_CLIENT_ID || '';
const OAUTH_CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET || '';
const OAUTH_REDIRECT_URI = process.env.OAUTH_REDIRECT_URI || 'http://localhost:3000/api/auth/oauth/callback';
const OAUTH_AUTH_URL = process.env.OAUTH_AUTH_URL || '';
const OAUTH_TOKEN_URL = process.env.OAUTH_TOKEN_URL || '';

const APP_URL = process.env.APP_URL || 'http://localhost:3000';

// Database initialization
const dataDir = path.join(process.cwd(), "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
const dbPath = path.join(dataDir, "calendar.db");
const db = new Database(dbPath);

// Extended users table with CalDAV support
db.exec(`
  PRAGMA journal_mode = WAL;
  
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    settings TEXT DEFAULT '{}',
    -- CalDAV fields
    caldav_username TEXT,
    auth_method TEXT DEFAULT 'basic',
    access_token TEXT,
    refresh_token TEXT,
    encrypted_password TEXT,
    encryption_iv TEXT,
    token_expires DATETIME,
    caldav_user_id TEXT,
    last_sync DATETIME
  );

  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    is_visible INTEGER DEFAULT 1,
    -- CalDAV fields
    caldav_calendar_id TEXT,
    caldav_url TEXT,
    is_shared INTEGER DEFAULT 0,
    can_edit INTEGER DEFAULT 1,
    sync_enabled INTEGER DEFAULT 1
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
    color TEXT,
    -- CalDAV fields
    caldav_event_uid TEXT,
    caldav_etag TEXT,
    caldav_last_modified TEXT,
    recurrence_rule TEXT
  );

  CREATE TABLE IF NOT EXISTS category_shares (
    category_id TEXT REFERENCES categories(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    can_edit INTEGER DEFAULT 0,
    PRIMARY KEY (category_id, user_id)
  );

  -- Indexes for better performance
  CREATE INDEX IF NOT EXISTS idx_events_user ON events(user_id);
  CREATE INDEX IF NOT EXISTS idx_events_calendar ON events(calendar_id);
  CREATE INDEX IF NOT EXISTS idx_categories_user ON categories(user_id);
  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
`);

console.log("Database initialized successfully with CalDAV support");

// Helper functions for encryption (fallback if node-forge has issues)
function encryptPassword(password: string, key: string): { encrypted: string; iv: string } {
  if (!key) throw new Error('Encryption key is required');
  
  // If key is base64, decode it
  let keyBuffer: Buffer;
  try {
    keyBuffer = Buffer.from(key, 'base64');
    if (keyBuffer.length !== 32) {
      // Hash to 32 bytes
      const hash = CryptoJS.SHA256(key);
      keyBuffer = Buffer.from(hash.toString(CryptoJS.enc.Hex), 'hex');
    }
  } catch (e) {
    // Hash to 32 bytes
    const hash = CryptoJS.SHA256(key);
    keyBuffer = Buffer.from(hash.toString(CryptoJS.enc.Hex), 'hex');
  }
  
  const iv = CryptoJS.lib.WordArray.random(16);
  const encrypted = CryptoJS.AES.encrypt(CryptoJS.enc.Utf8.parse(password), CryptoJS.enc.Utf8.parse(keyBuffer.toString('utf8')), {
    iv: iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7
  });
  
  return {
    encrypted: encrypted.toString(),
    iv: CryptoJS.enc.Base64.stringify(iv)
  };
}

function decryptPassword(encrypted: string, iv: string, key: string): string {
  if (!key) throw new Error('Encryption key is required');
  
  let keyBuffer: Buffer;
  try {
    keyBuffer = Buffer.from(key, 'base64');
    if (keyBuffer.length !== 32) {
      const hash = CryptoJS.SHA256(key);
      keyBuffer = Buffer.from(hash.toString(CryptoJS.enc.Hex), 'hex');
    }
  } catch (e) {
    const hash = CryptoJS.SHA256(key);
    keyBuffer = Buffer.from(hash.toString(CryptoJS.enc.Hex), 'hex');
  }
  
  const decrypted = CryptoJS.AES.decrypt(encrypted, CryptoJS.enc.Utf8.parse(keyBuffer.toString('utf8')), {
    iv: CryptoJS.enc.Base64.parse(iv),
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7
  });
  
  return decrypted.toString(CryptoJS.enc.Utf8);
}

// Initialize OAuth client if OAuth is configured
let oauthClient: NextcloudOAuthClient | null = null;
if (CALDAV_AUTH_METHOD === 'oauth' && OAUTH_CLIENT_ID && OAUTH_CLIENT_SECRET) {
  try {
    oauthClient = new NextcloudOAuthClient({
      clientId: OAUTH_CLIENT_ID,
      clientSecret: OAUTH_CLIENT_SECRET,
      authUrl: OAUTH_AUTH_URL,
      tokenUrl: OAUTH_TOKEN_URL,
      redirectUri: OAUTH_REDIRECT_URI
    });
    console.log('OAuth client initialized for Nextcloud');
  } catch (err) {
    console.warn('Failed to initialize OAuth client:', err);
  }
}

// Initialize CalDAV client
let caldavClient: CalDAVClient | null = null;
try {
  caldavClient = createCalDAVClientFromEnv();
  console.log(`CalDAV client initialized with ${CALDAV_AUTH_METHOD} authentication`);
} catch (err) {
  console.warn('Failed to initialize CalDAV client:', err);
}

// Store OAuth state for verification
const oauthStates: Map<string, string> = new Map();

app.use(express.json());

// Generate OAuth state for CSRF protection
function generateState(): string {
  const state = Math.random().toString(36).substring(2, 15) + 
                Math.random().toString(36).substring(2, 15);
  return state;
}

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

// Get CalDAV client for a user
function getCalDAVClientForUser(userId: number): CalDAVClient {
  const userRow = db.prepare('SELECT auth_method, encrypted_password, encryption_iv, access_token, caldav_username FROM users WHERE id = ?').get(userId) as any;
  
  if (!userRow) {
    throw new Error('User not found');
  }

  const client = new CalDAVClient({
    serverUrl: CALDAV_SERVER_URL,
    authMethod: userRow.auth_method as 'oauth' | 'basic',
    encryptionKey: ENCRYPTION_KEY
  });

  // Initialize with user credentials
  if (userRow.auth_method === 'oauth') {
    // For OAuth, use the access token
    client.initialize(undefined, undefined, userRow.access_token);
  } else {
    // For Basic Auth, decrypt password and use it
    if (userRow.encrypted_password && userRow.encryption_iv) {
      const password = decryptPassword(userRow.encrypted_password, userRow.encryption_iv, ENCRYPTION_KEY);
      client.initialize(userRow.caldav_username, password);
    }
  }

  return client;
}

// ============= API Routes =============

app.get("/api/status", (req, res) => {
  res.json({ 
    mock: false, 
    type: 'caldav',
    authMethod: CALDAV_AUTH_METHOD,
    caldavConfigured: !!CALDAV_SERVER_URL
  });
});

// OAuth Routes
app.get("/api/auth/oauth/authorize", (req, res) => {
  if (!oauthClient) {
    return res.status(500).json({ error: 'OAuth is not configured' });
  }

  const state = generateState();
  oauthStates.set(state, 'pending');
  
  const { url } = oauthClient.getAuthorizationUrl(state);
  res.json({ authorizationUrl: url, state });
});

app.get("/api/auth/oauth/callback", async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    return res.redirect(`${APP_URL}/auth?error=${encodeURIComponent(error as string)}`);
  }

  if (!code || typeof code !== 'string') {
    return res.redirect(`${APP_URL}/auth?error=${encodeURIComponent('No authorization code received')}`);
  }

  if (!oauthClient) {
    return res.redirect(`${APP_URL}/auth?error=${encodeURIComponent('OAuth is not configured')}`);
  }

  // Verify state if provided
  const storedState = req.query.state as string;
  if (storedState && oauthStates.get(storedState) !== 'pending') {
    return res.redirect(`${APP_URL}/auth?error=${encodeURIComponent('Invalid state parameter')}`);
  }

  try {
    // Exchange code for tokens
    const tokens = await oauthClient.exchangeCode(code, storedState);
    
    // For OAuth, we need to create or update the user
    // In a real Nextcloud setup, we would get user info from the token
    // For now, we'll create a generic user or use the first available user
    
    // Store tokens in session and redirect back to app
    // The frontend will handle storing the tokens
    res.redirect(`${APP_URL}/auth/oauth?code=${encodeURIComponent(code)}&state=${encodeURIComponent(storedState || '')}`);
  } catch (err: any) {
    console.error('OAuth callback error:', err);
    res.redirect(`${APP_URL}/auth?error=${encodeURIComponent(err.message || 'OAuth failed')}`);
  }
});

// Auth Routes - Updated for CalDAV
app.post("/api/auth/register", async (req, res) => {
  const { email, name, password } = req.body;

  if (CALDAV_AUTH_METHOD === 'oauth') {
    // For OAuth, registration happens automatically on first login
    return res.status(400).json({ error: 'Registration not available with OAuth. Please use OAuth login.' });
  }

  const hash = await bcrypt.hash(password, 10);
  
  // For Basic Auth, encrypt the password
  let encryptedPassword: string | null = null;
  let encryptionIv: string | null = null;
  
  if (CALDAV_AUTH_METHOD === 'basic' && ENCRYPTION_KEY) {
    const encrypted = encryptPassword(password, ENCRYPTION_KEY);
    encryptedPassword = encrypted.encrypted;
    encryptionIv = encrypted.iv;
  }

  try {
    // Check if user already exists in CalDAV
    let caldavUserId: string | null = null;
    if (caldavClient) {
      try {
        await caldavClient.initialize(email, password);
        const calendars = await caldavClient.getCalendars();
        // User exists on CalDAV server
        caldavUserId = email;
      } catch (caldavErr) {
        console.log('CalDAV user check failed, continuing with local registration:', caldavErr);
      }
    }

    const insertUser = db.prepare(`
      INSERT INTO users (email, name, password_hash, auth_method, caldav_username, encrypted_password, encryption_iv)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const result = insertUser.run(email, name, hash, CALDAV_AUTH_METHOD, email, encryptedPassword, encryptionIv);
    const userId = result.lastInsertRowid as number;
    
    // Create initial calendars
    const initialCategories = [
      { id: `personal-${userId}`, name: 'Persoonlijk', color: '#3b82f6' },
      { id: `work-${userId}`, name: 'Werk', color: '#22c55e' }
    ];

    for (const cat of initialCategories) {
      db.prepare("INSERT INTO categories (id, user_id, name, color, is_visible, caldav_url) VALUES (?, ?, ?, ?, 1, NULL)")
        .run(cat.id, userId, cat.name, cat.color);
    }

    // If using CalDAV, try to fetch calendars from server
    if (caldavClient && CALDAV_SERVER_URL) {
      try {
        await caldavClient.initialize(email, password);
        const calendars = await caldavClient.getCalendars();
        
        // Update categories with CalDAV calendar info
        for (let i = 0; i < Math.min(calendars.length, initialCategories.length); i++) {
          db.prepare(`
            UPDATE categories 
            SET caldav_calendar_id = ?, caldav_url = ?, name = ?, color = ?
            WHERE id = ?
          `).run(
            calendars[i].id, 
            calendars[i].id, 
            calendars[i].name, 
            calendars[i].color,
            initialCategories[i].id
          );
        }
        
        // Add any additional calendars
        for (let i = initialCategories.length; i < calendars.length; i++) {
          const catId = `caldav-${userId}-${i}`;
          db.prepare("INSERT INTO categories (id, user_id, name, color, is_visible, caldav_url, sync_enabled) VALUES (?, ?, ?, ?, 1, ?, 1)")
            .run(catId, userId, calendars[i].name, calendars[i].color, calendars[i].id);
        }
      } catch (caldavErr) {
        console.log('Could not fetch CalDAV calendars during registration:', caldavErr);
      }
    }

    const token = jwt.sign({ id: userId, email, name, authMethod: CALDAV_AUTH_METHOD }, JWT_SECRET);
    res.json({ user: { id: userId, email, name, authMethod: CALDAV_AUTH_METHOD }, token });
  } catch (err: any) {
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Email already exists' });
    }
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password, code, state } = req.body;

  // Handle OAuth code exchange
  if (code && CALDAV_AUTH_METHOD === 'oauth' && oauthClient) {
    try {
      const tokens = await oauthClient.exchangeCode(code, state);
      
      // Check if user exists, create if not
      let userRow = db.prepare('SELECT id, email, name FROM users WHERE email = ?').get(email) as any;
      
      if (!userRow) {
        // Create new user with OAuth
        const result = db.prepare(`
          INSERT INTO users (email, name, password_hash, auth_method, access_token, refresh_token, token_expires)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          email,
          email.split('@')[0], // Use email prefix as name
          '', // No password hash for OAuth
          'oauth',
          tokens.accessToken,
          tokens.refreshToken,
          new Date(tokens.expiresAt * 1000).toISOString()
        );
        userRow = { id: result.lastInsertRowid, email, name: email.split('@')[0] };
      } else {
        // Update existing user with new tokens
        db.prepare(`
          UPDATE users 
          SET access_token = ?, refresh_token = ?, token_expires = ?, auth_method = 'oauth'
          WHERE id = ?
        `).run(tokens.accessToken, tokens.refreshToken, new Date(tokens.expiresAt * 1000).toISOString(), userRow.id);
      }

      const token = jwt.sign(
        { id: userRow.id, email: userRow.email, name: userRow.name, authMethod: 'oauth' },
        JWT_SECRET
      );
      
      res.json({ 
        user: { 
          id: userRow.id, 
          email: userRow.email, 
          name: userRow.name,
          authMethod: 'oauth'
        }, 
        token 
      });
      return;
    } catch (err: any) {
      console.error('OAuth login error:', err);
      return res.status(401).json({ error: err.message || 'OAuth login failed' });
    }
  }

  // Handle Basic Auth
  if (CALDAV_AUTH_METHOD === 'basic') {
    try {
      const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email) as any;
      if (!user) return res.status(401).json({ error: "Gebruiker niet gevonden" });

      // Verify password
      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) return res.status(401).json({ error: "Ongeldig wachtwoord" });

      // Verify CalDAV credentials if configured
      if (CALDAV_SERVER_URL) {
        try {
          const client = new CalDAVClient({
            serverUrl: CALDAV_SERVER_URL,
            authMethod: 'basic',
            encryptionKey: ENCRYPTION_KEY
          });
          
          const passwordToUse = user.encrypted_password && user.encryption_iv 
            ? decryptPassword(user.encrypted_password, user.encryption_iv, ENCRYPTION_KEY)
            : password;
          
          await client.initialize(user.caldav_username || email, passwordToUse);
          const calendars = await client.getCalendars();
          
          // Update user with CalDAV username if not set
          if (!user.caldav_username && calendars.length > 0) {
            db.prepare('UPDATE users SET caldav_username = ? WHERE id = ?').run(email, user.id);
          }
          
          // Sync calendars
          const existingCategories = db.prepare("SELECT * FROM categories WHERE user_id = ?").all(user.id) as any[];
          
          // Update or add calendars from CalDAV
          for (const calendar of calendars) {
            const existing = existingCategories.find(c => c.caldav_calendar_id === calendar.id);
            if (existing) {
              // Update existing calendar
              db.prepare(`
                UPDATE categories SET name = ?, color = ?, sync_enabled = 1 WHERE id = ?
              `).run(calendar.name, calendar.color, existing.id);
            } else {
              // Add new calendar
              const catId = `caldav-${user.id}-${calendar.id}`;
              db.prepare(`
                INSERT INTO categories (id, user_id, name, color, is_visible, caldav_url, caldav_calendar_id, sync_enabled)
                VALUES (?, ?, ?, ?, 1, ?, ?, 1)
              `).run(catId, user.id, calendar.name, calendar.color, calendar.id, calendar.id);
            }
          }
          
          // Mark calendars not in CalDAV as not synced
          for (const cat of existingCategories) {
            const existsInCalDAV = calendars.some(c => c.id === cat.caldav_calendar_id);
            if (!existsInCalDAV) {
              db.prepare('UPDATE categories SET sync_enabled = 0 WHERE id = ?').run(cat.id);
            }
          }
          
        } catch (caldavErr) {
          console.log('CalDAV sync during login failed:', caldavErr);
        }
      }

      const token = jwt.sign({ id: user.id, email: user.email, name: user.name, authMethod: 'basic' }, JWT_SECRET);
      res.json({ 
        user: { 
          id: user.id, 
          email: user.email, 
          name: user.name,
          authMethod: 'basic'
        }, 
        token 
      });
      return;
    } catch (err: any) {
      res.status(500).json({ error: err.message });
      return;
    }
  }

  // Fallback for non-CalDAV mode
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email) as any;
  if (!user) return res.status(401).json({ error: "Gebruiker niet gevonden" });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: "Ongeldig wachtwoord" });

  const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET);
  res.json({ user: { id: user.id, email: user.email, name: user.name }, token });
});

app.post("/api/auth/logout", authenticateToken, (req: any, res) => {
  // Invalidate JWT by adding to blacklist (or just let it expire)
  res.json({ success: true });
});

app.get("/api/auth/me", authenticateToken, async (req: any, res) => {
  try {
    const user = db.prepare("SELECT id, email, name, settings, auth_method FROM users WHERE id = ?").get(req.user.id) as any;
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ 
      ...user, 
      settings: JSON.parse(user.settings || '{}'),
      authMethod: user.auth_method
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// User Settings
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

// Token refresh endpoint for OAuth
app.post("/api/auth/refresh", authenticateToken, async (req: any, res) => {
  if (CALDAV_AUTH_METHOD !== 'oauth' || !oauthClient) {
    return res.status(400).json({ error: 'OAuth is not configured' });
  }

  try {
    const userRow = db.prepare("SELECT access_token, refresh_token FROM users WHERE id = ?").get(req.user.id) as any;
    
    if (!userRow?.refresh_token) {
      return res.status(400).json({ error: 'No refresh token available' });
    }

    // Use the OAuth client to refresh
    const client = new NextcloudOAuthClient({
      clientId: OAUTH_CLIENT_ID,
      clientSecret: OAUTH_CLIENT_SECRET,
      authUrl: OAUTH_AUTH_URL,
      tokenUrl: OAUTH_TOKEN_URL,
      redirectUri: OAUTH_REDIRECT_URI
    });

    const tokens = await client.refreshToken();
    
    // Update user with new tokens
    db.prepare(`
      UPDATE users 
      SET access_token = ?, refresh_token = ?, token_expires = ?
      WHERE id = ?
    `).run(tokens.accessToken, tokens.refreshToken, new Date(tokens.expiresAt * 1000).toISOString(), req.user.id);

    res.json({ success: true, accessToken: tokens.accessToken });
  } catch (err: any) {
    console.error('Token refresh error:', err);
    res.status(401).json({ error: err.message || 'Token refresh failed' });
  }
});

// CalDAV specific endpoints
app.get("/api/caldav/calendars", authenticateToken, async (req: any, res) => {
  try {
    const userRow = db.prepare("SELECT auth_method, encrypted_password, encryption_iv, access_token, caldav_username FROM users WHERE id = ?").get(req.user.id) as any;
    
    if (!userRow) {
      return res.status(404).json({ error: "User not found" });
    }

    const client = new CalDAVClient({
      serverUrl: CALDAV_SERVER_URL,
      authMethod: userRow.auth_method as 'oauth' | 'basic',
      encryptionKey: ENCRYPTION_KEY
    });

    // Initialize client based on auth method
    if (userRow.auth_method === 'oauth') {
      await client.initialize(undefined, undefined, userRow.access_token);
    } else {
      const password = userRow.encrypted_password && userRow.encryption_iv
        ? decryptPassword(userRow.encrypted_password, userRow.encryption_iv, ENCRYPTION_KEY)
        : undefined;
      await client.initialize(userRow.caldav_username || req.user.email, password);
    }

    const calendars = await client.getCalendars();
    
    // Map to our format
    const result = calendars.map(cal => ({
      id: cal.id,
      name: cal.name,
      color: cal.color,
      isShared: cal.isShared || false,
      canEdit: cal.canEdit || true,
      description: cal.description
    }));

    res.json(result);
  } catch (err: any) {
    console.error('Failed to get CalDAV calendars:', err);
    res.status(500).json({ error: err.message || 'Failed to retrieve calendars' });
  }
});

// Categories Routes (updated for CalDAV)
app.get("/api/categories", authenticateToken, async (req: any, res) => {
  try {
    // First, try to get from CalDAV if configured
    if (CALDAV_SERVER_URL && CALDAV_AUTH_METHOD) {
      try {
        const userRow = db.prepare("SELECT auth_method, encrypted_password, encryption_iv, access_token, caldav_username FROM users WHERE id = ?").get(req.user.id) as any;
        
        if (userRow) {
          const client = new CalDAVClient({
            serverUrl: CALDAV_SERVER_URL,
            authMethod: userRow.auth_method as 'oauth' | 'basic',
            encryptionKey: ENCRYPTION_KEY
          });

          if (userRow.auth_method === 'oauth') {
            await client.initialize(undefined, undefined, userRow.access_token);
          } else {
            const password = userRow.encrypted_password && userRow.encryption_iv
              ? decryptPassword(userRow.encrypted_password, userRow.encryption_iv, ENCRYPTION_KEY)
              : undefined;
            await client.initialize(userRow.caldav_username || req.user.email, password);
          }

          const calendars = await client.getCalendars();
          
          // Map CalDAV calendars to our format
          const caldavCategories = calendars.map((cal, index) => ({
            id: cal.id,
            name: cal.name,
            color: cal.color,
            isVisible: true,
            isOwner: true,
            canEdit: true,
            isCaldav: true
          }));

          res.json(caldavCategories);
          return;
        }
      } catch (caldavErr) {
        console.log('CalDAV categories failed, falling back to local:', caldavErr);
      }
    }

    // Fallback to local categories
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
      canEdit: Boolean(row.can_edit),
      isCaldav: Boolean(row.caldav_url)
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

// Events Routes (updated for CalDAV)
app.get("/api/events", authenticateToken, async (req: any, res) => {
  try {
    const { calendarId, start, end } = req.query;
    
    // Try CalDAV first if configured
    if (CALDAV_SERVER_URL && CALDAV_AUTH_METHOD && calendarId) {
      try {
        const userRow = db.prepare("SELECT auth_method, encrypted_password, encryption_iv, access_token, caldav_username FROM users WHERE id = ?").get(req.user.id) as any;
        
        if (userRow) {
          const client = new CalDAVClient({
            serverUrl: CALDAV_SERVER_URL,
            authMethod: userRow.auth_method as 'oauth' | 'basic',
            encryptionKey: ENCRYPTION_KEY
          });

          if (userRow.auth_method === 'oauth') {
            await client.initialize(undefined, undefined, userRow.access_token);
          } else {
            const password = userRow.encrypted_password && userRow.encryption_iv
              ? decryptPassword(userRow.encrypted_password, userRow.encryption_iv, ENCRYPTION_KEY)
              : undefined;
            await client.initialize(userRow.caldav_username || req.user.email, password);
          }

          // Get events from CalDAV
          const startDate = start ? new Date(start as string) : undefined;
          const endDate = end ? new Date(end as string) : undefined;
          const events = await client.getEvents(calendarId as string, startDate, endDate);
          
          res.json(events);
          return;
        }
      } catch (caldavErr) {
        console.log('CalDAV events failed, falling back to local:', caldavErr);
      }
    }

    // Fallback to local events
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
  const { id, title, start, end, description, location, calendarId, color, isAllDay, recurrenceRule } = req.body;
  
  try {
    // Check permissions
    let perm: any = null;
    if (CALDAV_SERVER_URL) {
      try {
        const userRow = db.prepare("SELECT auth_method, encrypted_password, encryption_iv, access_token, caldav_username FROM users WHERE id = ?").get(req.user.id) as any;
        
        if (userRow) {
          const client = new CalDAVClient({
            serverUrl: CALDAV_SERVER_URL,
            authMethod: userRow.auth_method as 'oauth' | 'basic',
            encryptionKey: ENCRYPTION_KEY
          });

          if (userRow.auth_method === 'oauth') {
            await client.initialize(undefined, undefined, userRow.access_token);
          } else {
            const password = userRow.encrypted_password && userRow.encryption_iv
              ? decryptPassword(userRow.encrypted_password, userRow.encryption_iv, ENCRYPTION_KEY)
              : undefined;
            await client.initialize(userRow.caldav_username || req.user.email, password);
          }

          // Create event on CalDAV
          const caldavEvent = await client.createEvent(calendarId, {
            id,
            title,
            start: new Date(start),
            end: new Date(end),
            description,
            location,
            calendarId,
            color,
            isAllDay,
            recurrenceRule
          });

          res.json({
            ...caldavEvent,
            start: caldavEvent.start.toISOString(),
            end: caldavEvent.end.toISOString()
          });
          return;
        }
      } catch (caldavErr) {
        console.log('CalDAV event creation failed, falling back to local:', caldavErr);
      }
    }

    // Fallback to local event creation
    perm = db.prepare(`
      SELECT (c.user_id = ?) as is_owner, COALESCE(cs.can_edit, 0) as is_shared_editor
      FROM categories c
      LEFT JOIN category_shares cs ON c.id = cs.category_id AND cs.user_id = ?
      WHERE c.id = ? AND (c.user_id = ? OR cs.user_id = ?)
    `).get(req.user.id, req.user.id, calendarId, req.user.id, req.user.id) as any;

    if (!perm || (!perm.is_owner && !perm.is_shared_editor)) {
      return res.status(403).json({ error: "Access denied" });
    }

    const insert = db.prepare(`
      INSERT INTO events (id, user_id, title, start_time, end_time, description, location, calendar_id, color, is_all_day, recurrence_rule) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *
    `);
    
    const result = insert.get(id, req.user.id, title, start, end, description, location, calendarId, color, isAllDay ? 1 : 0, recurrenceRule);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/events/:id", authenticateToken, async (req: any, res) => {
  const { title, start, end, description, location, calendarId, color, isAllDay, recurrenceRule } = req.body;
  
  try {
    // Try CalDAV first
    if (CALDAV_SERVER_URL) {
      try {
        const userRow = db.prepare("SELECT auth_method, encrypted_password, encryption_iv, access_token, caldav_username FROM users WHERE id = ?").get(req.user.id) as any;
        
        if (userRow) {
          const client = new CalDAVClient({
            serverUrl: CALDAV_SERVER_URL,
            authMethod: userRow.auth_method as 'oauth' | 'basic',
            encryptionKey: ENCRYPTION_KEY
          });

          if (userRow.auth_method === 'oauth') {
            await client.initialize(undefined, undefined, userRow.access_token);
          } else {
            const password = userRow.encrypted_password && userRow.encryption_iv
              ? decryptPassword(userRow.encrypted_password, userRow.encryption_iv, ENCRYPTION_KEY)
              : undefined;
            await client.initialize(userRow.caldav_username || req.user.email, password);
          }

          // Find the calendar ID for this event
          const eventRow = db.prepare("SELECT calendar_id FROM events WHERE id = ?").get(req.params.id) as any;
          const calId = eventRow?.calendar_id || calendarId;
          
          const caldavEvent = await client.updateEvent(calId, req.params.id, {
            id: req.params.id,
            title,
            start: new Date(start),
            end: new Date(end),
            description,
            location,
            calendarId: calId,
            color,
            isAllDay,
            recurrenceRule
          });

          res.json({
            ...caldavEvent,
            start: caldavEvent.start.toISOString(),
            end: caldavEvent.end.toISOString()
          });
          return;
        }
      } catch (caldavErr) {
        console.log('CalDAV event update failed, falling back to local:', caldavErr);
      }
    }

    // Fallback to local update
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
      UPDATE events SET title = ?, start_time = ?, end_time = ?, description = ?, location = ?, calendar_id = ?, color = ?, is_all_day = ?, recurrence_rule = ? 
      WHERE id = ? RETURNING *
    `).get(title, start, end, description, location, calendarId, color, isAllDay ? 1 : 0, recurrenceRule, req.params.id);
    
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/events/:id", authenticateToken, async (req: any, res) => {
  try {
    // Try CalDAV first
    if (CALDAV_SERVER_URL) {
      try {
        const userRow = db.prepare("SELECT auth_method, encrypted_password, encryption_iv, access_token, caldav_username FROM users WHERE id = ?").get(req.user.id) as any;
        
        if (userRow) {
          const client = new CalDAVClient({
            serverUrl: CALDAV_SERVER_URL,
            authMethod: userRow.auth_method as 'oauth' | 'basic',
            encryptionKey: ENCRYPTION_KEY
          });

          if (userRow.auth_method === 'oauth') {
            await client.initialize(undefined, undefined, userRow.access_token);
          } else {
            const password = userRow.encrypted_password && userRow.encryption_iv
              ? decryptPassword(userRow.encrypted_password, userRow.encryption_iv, ENCRYPTION_KEY)
              : undefined;
            await client.initialize(userRow.caldav_username || req.user.email, password);
          }

          // Find the calendar ID for this event
          const eventRow = db.prepare("SELECT calendar_id FROM events WHERE id = ?").get(req.params.id) as any;
          const calId = eventRow?.calendar_id;
          
          if (calId) {
            await client.deleteEvent(calId, req.params.id);
            res.sendStatus(204);
            return;
          }
        }
      } catch (caldavErr) {
        console.log('CalDAV event deletion failed, falling back to local:', caldavErr);
      }
    }

    // Fallback to local deletion
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

// Sync endpoint to sync local data with CalDAV
app.post("/api/sync", authenticateToken, async (req: any, res) => {
  try {
    const userRow = db.prepare("SELECT auth_method, encrypted_password, encryption_iv, access_token, caldav_username FROM users WHERE id = ?").get(req.user.id) as any;
    
    if (!userRow) {
      return res.status(404).json({ error: "User not found" });
    }

    const client = new CalDAVClient({
      serverUrl: CALDAV_SERVER_URL,
      authMethod: userRow.auth_method as 'oauth' | 'basic',
      encryptionKey: ENCRYPTION_KEY
    });

    if (userRow.auth_method === 'oauth') {
      await client.initialize(undefined, undefined, userRow.access_token);
    } else {
      const password = userRow.encrypted_password && userRow.encryption_iv
        ? decryptPassword(userRow.encrypted_password, userRow.encryption_iv, ENCRYPTION_KEY)
        : undefined;
      await client.initialize(userRow.caldav_username || req.user.email, password);
    }

    // Get calendars from CalDAV
    const calendars = await client.getCalendars();
    
    // Sync calendars
    for (const calendar of calendars) {
      const existing = db.prepare("SELECT * FROM categories WHERE caldav_calendar_id = ? AND user_id = ?").get(calendar.id, req.user.id) as any;
      
      if (existing) {
        // Update existing
        db.prepare(`
          UPDATE categories SET name = ?, color = ?, sync_enabled = 1 WHERE id = ?
        `).run(calendar.name, calendar.color, existing.id);
      } else {
        // Create new
        const catId = `caldav-${req.user.id}-${calendar.id}`;
        db.prepare(`
          INSERT INTO categories (id, user_id, name, color, is_visible, caldav_url, caldav_calendar_id, sync_enabled)
          VALUES (?, ?, ?, ?, 1, ?, ?, 1)
        `).run(catId, req.user.id, calendar.name, calendar.color, calendar.id, calendar.id);
      }
    }

    // Sync events for each calendar
    for (const calendar of calendars) {
      const events = await client.getEvents(calendar.id);
      const category = db.prepare("SELECT id FROM categories WHERE caldav_calendar_id = ? AND user_id = ?").get(calendar.id, req.user.id) as any;
      
      if (!category) continue;

      for (const event of events) {
        const existing = db.prepare("SELECT * FROM events WHERE caldav_event_uid = ?").get(event.id) as any;
        
        if (existing) {
          // Update existing
          db.prepare(`
            UPDATE events SET title = ?, start_time = ?, end_time = ?, description = ?, location = ?, is_all_day = ?, recurrence_rule = ?
            WHERE id = ?
          `).run(
            event.title,
            event.start.toISOString(),
            event.end.toISOString(),
            event.description,
            event.location,
            event.isAllDay ? 1 : 0,
            event.recurrenceRule,
            existing.id
          );
        } else {
          // Create new
          db.prepare(`
            INSERT INTO events (id, user_id, calendar_id, title, start_time, end_time, description, location, is_all_day, caldav_event_uid, recurrence_rule)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            `caldav-${req.user.id}-${event.id}`,
            req.user.id,
            category.id,
            event.title,
            event.start.toISOString(),
            event.end.toISOString(),
            event.description,
            event.location,
            event.isAllDay ? 1 : 0,
            event.id,
            event.recurrenceRule
          );
        }
      }
    }

    // Update last sync time
    db.prepare("UPDATE users SET last_sync = ? WHERE id = ?").run(new Date().toISOString(), req.user.id);

    res.json({ success: true, syncedCalendars: calendars.length });
  } catch (err: any) {
    console.error('Sync error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============= Server Start =============

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
    console.log(`CalDAV Auth Method: ${CALDAV_AUTH_METHOD}`);
    console.log(`CalDAV Server URL: ${CALDAV_SERVER_URL || 'Not configured'}`);
    console.log(`OAuth Enabled: ${oauthClient ? 'Yes' : 'No'}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
