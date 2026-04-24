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
const PORT = parseInt(process.env.PORT || '3000');
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
      const password = forgeDecrypt(userRow.encrypted_password, userRow.encryption_iv, ENCRYPTION_KEY);
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
// Registration disabled - users are created automatically on first CalDAV login
app.post("/api/auth/register", async (req, res) => {
  if (CALDAV_AUTH_METHOD === 'oauth') {
    return res.status(400).json({ error: 'Registration not available with OAuth. Please use OAuth login.' });
  }
  
  // For Basic Auth with CalDAV, users are created on first login
  // No local registration needed
  return res.status(400).json({ error: 'Registratie is uitgeschakeld. Gebruikers worden automatisch aangemaakt bij eerste CalDAV login.' });
});

app.post("/api/auth/login", async (req, res) => {
  const { email, username, password, code, state } = req.body;
  
  // For Basic Auth, prefer username; for OAuth, use email
  const loginIdentifier = CALDAV_AUTH_METHOD === 'basic' ? username : (email || username);

  // Handle OAuth code exchange
  if (code && CALDAV_AUTH_METHOD === 'oauth' && oauthClient) {
    try {
      const tokens = await oauthClient.exchangeCode(code, state);
      
      // Check if user exists, create if not
      let userRow = db.prepare('SELECT id, email, name FROM users WHERE email = ? OR caldav_username = ?').get(email, email) as any;
      
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
      // Try to find user by username (caldav_username) or email
      let user = db.prepare("SELECT * FROM users WHERE email = ? OR caldav_username = ?").get(loginIdentifier, loginIdentifier) as any;

      // If user doesn't exist locally but CalDAV is configured, try to authenticate with CalDAV first
      if (!user && CALDAV_SERVER_URL) {
        try {
          const client = new CalDAVClient({
            serverUrl: CALDAV_SERVER_URL,
            authMethod: 'basic',
            encryptionKey: ENCRYPTION_KEY
          });
          
          // Try to authenticate with CalDAV server
          await client.initialize(loginIdentifier, password);
          const calendars = await client.getCalendars();
          
          // CalDAV authentication succeeded - create local user if doesn't exist
          if (!user) {
            const hash = await bcrypt.hash(password, 10);
            const encrypted = ENCRYPTION_KEY ? forgeEncrypt(password, ENCRYPTION_KEY) : null;
            
            const insertResult = db.prepare(`
              INSERT INTO users (email, name, password_hash, auth_method, caldav_username, encrypted_password, encryption_iv)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(
              loginIdentifier,
              loginIdentifier,
              hash,
              'basic',
              loginIdentifier,
              encrypted?.encrypted || null,
              encrypted?.iv || null
            );
            
            user = db.prepare("SELECT * FROM users WHERE id = ?").get(insertResult.lastInsertRowid) as any;
          }
          
        } catch (caldavErr) {
          console.log('CalDAV authentication failed:', caldavErr);
          return res.status(401).json({ error: "CalDAV authenticatie mislukt" });
        }
      }

      // Verify password for existing local user
      if (user) {
        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) return res.status(401).json({ error: "Ongeldig wachtwoord" });
      } else if (!CALDAV_SERVER_URL) {
        // Local-only auth without CalDAV
        return res.status(401).json({ error: "Gebruiker niet gevonden" });
      }

      // If we have a user from CalDAV auth but CALDAV_SERVER_URL wasn't set, this shouldn't happen
      if (!user) {
        return res.status(401).json({ error: "Gebruiker niet gevonden" });
      }

      const token = jwt.sign({ id: user.id, username: user.email, name: user.name, authMethod: 'basic' }, JWT_SECRET);
      res.json({ 
        user: { 
          id: user.id, 
          username: user.email, 
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
    const dbUser = db.prepare("SELECT id, email as username, name, settings, auth_method FROM users WHERE id = ?").get(req.user.id) as any;
    if (!dbUser) return res.status(404).json({ error: "User not found" });
    res.json({ 
      id: dbUser.id,
      username: dbUser.username,
      name: dbUser.name,
      settings: JSON.parse(dbUser.settings || '{}'),
      authMethod: dbUser.auth_method
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
        ? forgeDecrypt(userRow.encrypted_password, userRow.encryption_iv, ENCRYPTION_KEY)
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

// Categories Routes - Direct CalDAV only, no local fallback
app.get("/api/categories", authenticateToken, async (req: any, res) => {
  try {
    if (!CALDAV_SERVER_URL || !CALDAV_AUTH_METHOD) {
      return res.status(503).json({ error: "CalDAV server is niet geconfigureerd" });
    }

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
        ? forgeDecrypt(userRow.encrypted_password, userRow.encryption_iv, ENCRYPTION_KEY)
        : undefined;
      await client.initialize(userRow.caldav_username || req.user.email, password);
    }

    const calendars = await client.getCalendars();
    
    // Map CalDAV calendars to our format - frontend uses caldav calendar id directly
    const categories = calendars.map(cal => ({
      id: cal.id,
      name: cal.name,
      color: cal.color,
      isVisible: true,
      isOwner: true,
      canEdit: cal.canEdit || true,
      isCaldav: true
    }));

    res.json(categories);
  } catch (err: any) {
    console.error('Failed to get CalDAV calendars:', err);
    res.status(503).json({ error: "CalDAV server is niet beschikbaar: " + (err.message || String(err)) });
  }
});

// Category share endpoints removed - using CalDAV directly without local storage
// Calendar sharing is server-dependent and handled by CalDAV server (Nextcloud, Radicale)

// Events Routes - Direct CalDAV only, no local fallback
app.get("/api/events", authenticateToken, async (req: any, res) => {
  try {
    if (!CALDAV_SERVER_URL || !CALDAV_AUTH_METHOD) {
      return res.status(503).json({ error: "CalDAV server is niet geconfigureerd" });
    }

    const { calendarId, start, end } = req.query;
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
        ? forgeDecrypt(userRow.encrypted_password, userRow.encryption_iv, ENCRYPTION_KEY)
        : undefined;
      await client.initialize(userRow.caldav_username || req.user.email, password);
    }

    // If calendarId is provided, get events from that specific calendar
    // Otherwise, get events from all calendars
    // If no date range provided, use current month as default
    const now = new Date();
    const startDate = start ? new Date(start as string) : new Date(now.getFullYear(), now.getMonth(), 1);
    const endDate = end ? new Date(end as string) : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    
    let events: any[] = [];
    if (calendarId) {
      events = await client.getEvents(calendarId as string, startDate, endDate);
    } else {
      // Get all calendars first
      const calendars = await client.getCalendars();
      // Get events from each calendar
      for (const cal of calendars) {
        const calEvents = await client.getEvents(cal.id, startDate, endDate);
        events = events.concat(calEvents);
      }
    }
    
    // Convert dates to ISO strings for JSON response
    const responseEvents = events.map(e => ({
      ...e,
      start: e.start.toISOString(),
      end: e.end.toISOString()
    }));
    
    res.json(responseEvents);
  } catch (err: any) {
    console.error('Failed to get CalDAV events:', err);
    res.status(503).json({ error: "CalDAV server is niet beschikbaar: " + (err.message || String(err)) });
  }
});

app.post("/api/events", authenticateToken, async (req: any, res) => {
  const { id, title, start, end, description, location, calendarId, color, isAllDay, recurrenceRule } = req.body;
  
  try {
    if (!CALDAV_SERVER_URL || !CALDAV_AUTH_METHOD) {
      return res.status(503).json({ error: "CalDAV server is niet geconfigureerd" });
    }

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
        ? forgeDecrypt(userRow.encrypted_password, userRow.encryption_iv, ENCRYPTION_KEY)
        : undefined;
      await client.initialize(userRow.caldav_username || req.user.email, password);
    }

    // Create event on CalDAV - calendarId is the CalDAV calendar id (e.g., "testuser/uuid")
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
  } catch (err: any) {
    console.error('Failed to create CalDAV event:', err);
    res.status(503).json({ error: "CalDAV event aanmaken mislukt: " + (err.message || String(err)) });
  }
});

app.put("/api/events/:id", authenticateToken, async (req: any, res) => {
  const { title, start, end, description, location, calendarId, color, isAllDay, recurrenceRule } = req.body;
  
  try {
    if (!CALDAV_SERVER_URL || !CALDAV_AUTH_METHOD) {
      return res.status(503).json({ error: "CalDAV server is niet geconfigureerd" });
    }

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
        ? forgeDecrypt(userRow.encrypted_password, userRow.encryption_iv, ENCRYPTION_KEY)
        : undefined;
      await client.initialize(userRow.caldav_username || req.user.email, password);
    }

    // calendarId from request body is the CalDAV calendar id
    const caldavEvent = await client.updateEvent(calendarId, req.params.id, {
      id: req.params.id,
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
  } catch (err: any) {
    console.error('Failed to update CalDAV event:', err);
    res.status(503).json({ error: "CalDAV event bijwerken mislukt: " + (err.message || String(err)) });
  }
});

app.delete("/api/events/:id", authenticateToken, async (req: any, res) => {
  try {
    if (!CALDAV_SERVER_URL || !CALDAV_AUTH_METHOD) {
      return res.status(503).json({ error: "CalDAV server is niet geconfigureerd" });
    }

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
        ? forgeDecrypt(userRow.encrypted_password, userRow.encryption_iv, ENCRYPTION_KEY)
        : undefined;
      await client.initialize(userRow.caldav_username || req.user.email, password);
    }

    // calendarId can come from query param, body, or other field names
    let calendarId = req.query.calendarId || req.body.calendarId || req.query.calendar_id || req.body.calendar_id || req.query.categoryId || req.body.categoryId;
    
    // If no calendarId provided, try to find and delete the event directly
    if (!calendarId) {
      console.log('[DELETE] No calendarId provided, trying to find event:', req.params.id);
      const calendars = await client.getCalendars();
      console.log('[DELETE] Available calendars:', calendars.map(c => c.id));
      
      // First, try to find the event by searching
      for (const cal of calendars) {
        try {
          const events = await client.getEvents(cal.id);
          console.log('[DELETE] Events in calendar', cal.id, ':', events.map(e => ({ id: e.id, title: e.title })));
          const event = events.find(e => e.id === req.params.id);
          if (event) {
            calendarId = cal.id;
            console.log('[DELETE] Found event in calendar:', calendarId);
            break;
          }
        } catch (err) {
          console.log('[DELETE] Error searching calendar:', cal.id, err);
        }
      }
      
      // If still not found, try to delete directly from each calendar (in case UID differs from filename)
      if (!calendarId) {
        console.log('[DELETE] Event not found by ID, trying direct DELETE in each calendar');
        for (const cal of calendars) {
          try {
            // Try to delete the event file directly (filename = eventId.ics)
            let calendarUrl = new URL(cal.id, CALDAV_SERVER_URL).toString();
            if (!calendarUrl.endsWith('/')) {
              calendarUrl += '/';
            }
            const eventUrl = new URL(`${req.params.id}.ics`, calendarUrl).toString();
            console.log('[DELETE] Trying to delete at URL:', eventUrl);
            
            const response = await client['fetchWithAuth'](eventUrl, { method: 'DELETE' });
            if (response.ok || response.status === 204) {
              console.log('[DELETE] Successfully deleted event at:', eventUrl);
              res.sendStatus(204);
              return;
            }
          } catch (err) {
            console.log('[DELETE] Failed to delete at calendar:', cal.id, err.message);
          }
        }
      }
    }
    
    if (!calendarId) {
      console.error('[DELETE] calendarId not found in any calendar. Query:', req.query, 'Body:', req.body);
      return res.status(400).json({ 
        error: "calendarId is vereist voor delete. Het event moet in een calendar zitten. Ontvangen: query=" + JSON.stringify(req.query) + ", body=" + JSON.stringify(req.body) + 
        ". Hint: stuur calendarId mee als query param of in de body." 
      });
    }

    await client.deleteEvent(calendarId, req.params.id);
    res.sendStatus(204);
  } catch (err: any) {
    console.error('Failed to delete CalDAV event:', err);
    res.status(503).json({ error: "CalDAV event verwijderen mislukt: " + (err.message || String(err)) });
  }
});

// Sync endpoint - returns OK since all data comes directly from CalDAV now
app.post("/api/sync", authenticateToken, (req: any, res) => {
  res.json({ success: true, message: "All data comes directly from CalDAV" });
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
