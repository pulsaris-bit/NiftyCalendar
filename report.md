# NiftyCalendar - Technisch Rapport

## Inhoudsopgave
1. [Code-analyse](#1-code-analyse)
2. [Software structuur](#2-software-structuur)
3. [Database-structuur](#3-database-structuur)
4. [API's](#4-apis)

---

## 1. Code-analyse

### Technologie Stack

| Categorij | Technologie | Versie | Gebruik |
|-----------|-------------|--------|---------|
| **Frontend Framework** | React | ^19.0.0 | UI-componenten |
| **Build Tool** | Vite | ^6.2.0 | Bundling & development server |
| **CSS Framework** | Tailwind CSS | ^4.1.14 | Styling |
| **TypeScript** | TypeScript | ~5.8.2 | Type safety |
| **Backend Framework** | Express.js | ^4.21.2 | API server |
| **Database** | SQLite (better-sqlite3) | ^12.9.0 | Datastorage |
| **ORM** | Geen (raw SQL queries) | - | Database interactie |
| **Authenticaie** | JWT (jsonwebtoken) | ^9.0.3 | Token-based auth |
| **Password Hashing** | bcryptjs | ^3.0.3 | Wachtwoord beveiliging |
| **State Management** | React Context + useState | Built-in | Client-side state |
| **Animaties** | Motion | ^12.38.0 | UI animaties |
| **Drag & Drop** | @dnd-kit/core | ^6.3.1 | Event drag functionality |
| **Date Handling** | date-fns | ^4.1.0 | Datum manipulatie |
| **Notifications** | Sonner | ^2.0.7 | Toast notificaties |
| **Desktop Notifications** | Native Browser API | - | aanmeldingen |
| **iCal Import** | ical.js | ^2.2.1 | .ics bestand import |
| **UI Components** | shadcn/ui | ^4.3.0 | Pre-built componenten |

### Code Kwaliteit

#### Positieve punten:
- **Modulaire struktuur**: Duidelijke scheiding tussen frontend (React), backend (Express) en database laag
- **TypeScript**: Sterke typing door hele codebase heen, wat de onderhoudsbaarheid vergroot
- **React Hooks**: Correct gebruik van useState, useEffect en custom hooks
- **Component-based**: Goede scheiding van concerns met afzonderlijke componenten
- **API Design**: RESTful endpoints met duidelijke naming conventions
- **Foutafhandeling**: Consistent error handling in zowel frontend als backend
- **Beveiliging**: JWT authenticatie, password hashing met bcrypt, input validatie
- **Responsive Design**: Goede ondersteuning voor mobile en desktop via Tailwind
- **Accessibility**: Gebruik van ARIA attributen en semantisch HTML
- **Dokumentatie**: TypeScript interfaces en types zijn goed gedefinieerd

#### Verbeterpunten:
- **API Validatie**: Backend zou meer input validatie kunnen hebben (bv. met Zod of Joi)
- **Rate Limiting**: Geen rate limiting op API endpoints implementatie
- **SQL Injection**: Gebruik van prepared statements (better-sqlite3 doet dit wel), maar extra validatie zou beter zijn
- **Error Logging**: Geen gestructureerd logging systeem (bv. Winston, Pino)
- **Unit Tests**: geen zichtbare test files in het project
- **Environment Variables**: JWT_SECRET heeft een default waarde in de code (`default-secret-key-123`)
- **Code Duplicatie**: Sommige SQL queries worden herhaald (bv. permission checks)
- **Middleware**: Authenticatie middleware zou in een apart bestand kunnen staan
- **Database Indexes**: Geen expliciete indexes gedefinieerd voor performance
- **Pagination**: API endpoints voor events en categories hebben geen pagination

#### Performance Overwegingen:
- SQLite is geschikt voor kleine tot middelgrote applicaties
- Geen caching mechanismen geimplementeerd (bv. Redis)
- Frontend fetches meere data dan nodig in sommige gevallen
- Bundle size kan geoptimaliseerd worden door ongebruikte dependencies te verwijderen

---

## 2. Software Structuur

### Project Structuur

```
NiftyCalendar/
├── src/
│   ├── components/          # React componenten
│   │   ├── AuthPage.tsx      # Inlog/registratie pagina
│   │   ├── CalendarGrid.tsx  # Kalender grid weergave
│   │   ├── CalendarHeader.tsx # Header met navigatie
│   │   ├── CalendarSidebar.tsx # Zijbalk met categorieën
│   │   ├── EventDialog.tsx   # Dialog voor event beheer
│   │   └── SettingsPage.tsx  # Instellingen pagina
│   ├── lib/
│   │   └── notificationService.ts # Desktop notificatie service
│   ├── types.ts              # TypeScript type definities
│   ├── constants.ts          # Constanten en mock data
│   ├── App.tsx               # Hoofd applicatie component
│   └── main.tsx              # Entry point
├── server.ts                 # Express server + API routes + Database
├── index.html                # HTML entry point
├── package.json              # Node.js dependencies
├── tsconfig.json             # TypeScript configuratie
├── vite.config.ts            # Vite configuratie
├── tailwind.config.js        # Tailwind configuratie
├── Dockerfile                # Docker build configuratie
├── docker-compose.yml        # Docker compose
├── .env.example              # Environment variables template
└── data/                     # SQLite database files (runtime)
```

### Architectuur Diagramm

```
┌─────────────────────────────────────────────────────────────┐
│                         Browser (Client)                         │
├─────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────┐ │
│  │  React (App.tsx) │───▶│  Components      │    │  Types  │ │
│  └─────────────────┘    └─────────────────┘    └─────────┘ │
│           │                                                │
│           ▼                                                │
│  ┌────────────────────────────────────────────────────────┐ │
│  │                HTTP Requests (fetch API)                │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Express Server (server.ts)                │
├─────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐    ┌─────────────────────────────────┐ │
│  │ Authentication   │    │         API Routes                │ │
│  │ Middleware      │    │  ┌─────────┐ ┌─────────┐          │ │
│  └────────┬────────┘    │  │ /auth   │ │ /api/*  │          │ │
│           │              │  └─────────┘ └─────────┘          │ │
│           ▼              └──────────────┬──────────────────┘ │
│  ┌─────────────────┐                 │                     │
│  │  JWT Verification│◀────────────────┘                     │
│  └─────────────────┘                                          │
│                                                                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    SQLite Database (calendar.db)               │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────┐ ┌─────────────┐ ┌─────────┐ ┌─────────────────┐ │
│  │  users  │ │ categories  │ │ events  │ │ category_shares │ │
│  └─────────┘ └─────────────┘ └─────────┘ └─────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

```
User Interaction → React Component → API Call → Express Route → 
Database Query → Response → React State Update → UI Render
```

### Hoofd Componenten Hierarchie

```
App (App.tsx)
├── CalendarHeader
│   ├── DropdownMenu (view selector)
│   ├── Search Input
│   └── User Menu
├── CalendarSidebar
│   ├── Calendar (date picker)
│   └── Categories List
├── CalendarGrid
│   ├── Event Cards
│   └── Day/Week/Month View
├── EventDialog
│   ├── Event Form
│   └── Delete Confirmation
└── SettingsPage
    ├── Category Management
    ├── Display Settings
    └── Data Import
```

---

## 3. Database-structuur

### Database Type
- **Type**: SQLite (via better-sqlite3)
- **Locatie**: `./data/calendar.db` (gepersisteerd via Docker volume)
- **Initialisatie**: Automatisch bij server start (server.ts:21-53)

### Tabel Structuur

#### Tabel: `users`

| Kolom | Type | Constraints | Beschrijving |
|-------|------|-------------|--------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | Unieke gebruiker ID |
| email | TEXT | UNIQUE NOT NULL | Gebruikers email |
| name | TEXT | NOT NULL | Gebruikers naam |
| password_hash | TEXT | NOT NULL | Bcrypt gehasht wachtwoord |
| settings | TEXT | DEFAULT '{}' | JSON string met gebruiker instellingen |

**Indexen**: 
- PRIMARY KEY op `id`
- UNIQUE index op `email`

#### Tabel: `categories` (Agenda's)

| Kolom | Type | Constraints | Beschrijving |
|-------|------|-------------|--------------|
| id | TEXT | PRIMARY KEY | Unieke categorie ID (bv. `personal-{userId}`) |
| user_id | INTEGER | REFERENCES users(id) | Eigenaren van de categorie |
| name | TEXT | NOT NULL | Categorienaam |
| color | TEXT | NOT NULL | Kleur in hex formaat (bv. `#3b82f6`) |
| is_visible | INTEGER | DEFAULT 1 | 1 = zichtbaar, 0 = verborgen |

**Indexen**:
- PRIMARY KEY op `id`
- Foreign key naar `users(id)`

#### Tabel: `events` (Afspraken)

| Kolom | Type | Constraints | Beschrijving |
|-------|------|-------------|--------------|
| id | TEXT | PRIMARY KEY | Unieke event ID |
| user_id | INTEGER | REFERENCES users(id) | Gebruiker die event heeft aangemaakt |
| calendar_id | TEXT | REFERENCES categories(id) ON DELETE CASCADE | Bijbehorende categorie |
| title | TEXT | NOT NULL | Titel van de afspraak |
| start_time | TEXT | NOT NULL | Startdatum/tijd (ISO string) |
| end_time | TEXT | NOT NULL | Einddatum/tijd (ISO string) |
| description | TEXT | NULL | Beschrijving |
| location | TEXT | NULL | Locatie |
| is_all_day | INTEGER | DEFAULT 0 | 1 = hele dag, 0 = specifieke tijd |
| color | TEXT | NULL | Event-specifieke kleur (override) |

**Indexen**:
- PRIMARY KEY op `id`
- Foreign key naar `categories(id)` met ON DELETE CASCADE
- Foreign key naar `users(id)`

#### Tabel: `category_shares` (Deling van Agenda's)

| Kolom | Type | Constraints | Beschrijving |
|-------|------|-------------|--------------|
| category_id | TEXT | REFERENCES categories(id) ON DELETE CASCADE | Gedeelde categorie |
| user_id | INTEGER | REFERENCES users(id) ON DELETE CASCADE | Gebruiker met toegang |
| can_edit | INTEGER | DEFAULT 0 | 1 = mag bewerken, 0 = alleen lezen |

**Indexen**:
- PRIMARY KEY (composite) op `(category_id, user_id)`
- Foreign key naar `categories(id)` met ON DELETE CASCADE
- Foreign key naar `users(id)` met ON DELETE CASCADE

### Entity Relationship Diagram (ERD)

```
┌──────────────┐       ┌──────────────┐
│    users     │       │  categories  │
├──────────────┤       ├──────────────┤
│ PK id         │◄──────►│ PK id         │
│    email      │   1:N │ FK user_id    │
│    name       │       │    name       │
│    password   │       │    color      │
│    settings   │       │    is_visible │
└──────────────┘       └────────┬─────┘
                                     │
                                     │ 1:N
                                     ▼
                              ┌──────────────┐
                              │    events    │
                              ├──────────────┤
                              │ PK id         │
                              │ FK user_id    │
                              │ FK calendar_id│
                              │    title      │
                              │    start_time │
                              │    end_time   │
                              │    description│
                              │    location   │
                              │    is_all_day │
                              │    color      │
                              └──────────────┘

┌──────────────┐
│ category_shares │
├──────────────┤
│ PK category_id│◄─────────────────────────────┐
│ PK user_id    │                              │
│    can_edit   │◄──────────────┐              │
└──────────────┘               │              │
     │                        │              │
     ▼                        ▼              ▼
  categories(id)           users(id)      users(id)
```

### Voorbeeld Data

#### users
```sql
INSERT INTO users (id, email, name, password_hash, settings)
VALUES (1, 'user@example.com', 'John Doe', '$2a$10$...', '{"highlightWeekends":true}');
```

#### categories
```sql
INSERT INTO categories (id, user_id, name, color, is_visible)
VALUES ('personal-1', 1, 'Persoonlijk', '#3b82f6', 1);
```

#### events
```sql
INSERT INTO events (id, user_id, calendar_id, title, start_time, end_time, description, location, is_all_day, color)
VALUES ('evt-1', 1, 'personal-1', 'Team Meeting', '2024-04-24T10:00:00', '2024-04-24T11:00:00', 'Weekly sync', 'Office', 0, NULL);
```

#### category_shares
```sql
INSERT INTO category_shares (category_id, user_id, can_edit)
VALUES ('personal-1', 2, 1);  -- User 2 has edit access to category 'personal-1'
```

---

## 4. API's

### Algemeen

- **Base URL**: `http://localhost:3000` (development)
- **Content-Type**: `application/json`
- **Authenticatie**: JWT Bearer Token in `Authorization` header
- **Response Format**: JSON met status codes

### Authenticatie

Alle endpoints behalve `/api/auth/*` en `/api/status` vereisen authenticatie via JWT token.

**Header format**:
```
Authorization: Bearer <JWT_TOKEN>
```

---

### Endpoints Overzicht

#### Status & Health

| Methode | Endpoint | Beschrijving | Auth | Request Body | Response |
|---------|----------|--------------|------|--------------|----------|
| GET | `/api/status` | Server status en config | ❌ | - | `{ mock: boolean, type: string }` |

#### Authenticatie

| Methode | Endpoint | Beschrijving | Auth | Request Body | Response |
|---------|----------|--------------|------|--------------|----------|
| POST | `/api/auth/register` | Nieuwe gebruiker registreren | ❌ | `{ email, name, password }` | `{ user, token }` |
| POST | `/api/auth/login` | Inloggen | ❌ | `{ email, password }` | `{ user, token }` |
| GET | `/api/auth/me` | Huidige gebruiker info | ✅ | - | `{ id, email, name, settings }` |

#### Gebruiker Instellingen

| Methode | Endpoint | Beschrijving | Auth | Request Body | Response |
|---------|----------|--------------|------|--------------|----------|
| GET | `/api/user/settings` | Haar instellingen ophalen | ✅ | - | `{ highlightWeekends, defaultCalendarId, ... }` |
| PUT | `/api/user/settings` | Instellingen bijwerken | ✅ | `{ highlightWeekends, defaultCalendarId, defaultDuration, notificationThreshold }` | Updated settings |

#### Categorien (Agenda's)

| Methode | Endpoint | Beschrijving | Auth | Request Body | Response |
|---------|----------|--------------|------|--------------|----------|
| GET | `/api/categories` | Alle beschikbare categorieën | ✅ | - | Array van `{ id, name, color, isVisible, isOwner, canEdit }` |
| PUT | `/api/categories/:id` | Categorienaam/kleur/visibiliteit bijwerken | ✅ | `{ name, color, isVisible }` | Updated category |

#### Deling van Categorien

| Methode | Endpoint | Beschrijving | Auth | Request Body | Response |
|---------|----------|--------------|------|--------------|----------|
| GET | `/api/categories/:id/shares` | Lijst van gebruikers met toegang | ✅ | - | Array van `{ userId, username, canEdit }` |
| POST | `/api/categories/:id/share` | Deel categorie met gebruiker | ✅ | `{ username, canEdit }` | `{ success: true }` |
| DELETE | `/api/categories/:id/share/:userId` | Verwijder toegang voor gebruiker | ✅ | - | `{ success: true }` |

#### Events (Afspraken)

| Methode | Endpoint | Beschrijving | Auth | Request Body | Response |
|---------|----------|--------------|------|--------------|----------|
| GET | `/api/events` | Alle events voor gebruiker | ✅ | - | Array van events |
| POST | `/api/events` | Nieuw event aanmaken | ✅ | `{ id, title, start, end, description, location, calendarId, color, isAllDay }` | Created event |
| PUT | `/api/events/:id` | Event bijwerken | ✅ | `{ title, start, end, description, location, calendarId, color, isAllDay }` | Updated event |
| DELETE | `/api/events/:id` | Event verwijderen | ✅ | - | 204 No Content |

---

### Request/Response Voorbeelden

#### POST /api/auth/register

**Request:**
```http
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "name": "John Doe",
  "password": "securePassword123"
}
```

**Response (200 OK):**
```json
{
  "user": {
    "id": 1,
    "email": "user@example.com",
    "name": "John Doe"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

#### GET /api/events

**Request:**
```http
GET /api/events
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response (200 OK):**
```json
[
  {
    "id": "evt-1",
    "title": "Team Meeting",
    "start": "2024-04-24T10:00:00",
    "end": "2024-04-24T11:00:00",
    "description": "Weekly sync",
    "location": "Office",
    "calendarId": "personal-1",
    "color": "#3b82f6",
    "isAllDay": false
  }
]
```

#### POST /api/categories/work-1/share

**Request:**
```http
POST /api/categories/work-1/share
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "username": "jane",
  "canEdit": true
}
```

**Response (200 OK):**
```json
{
  "success": true
}
```

---

### Foutcodes

| Status Code | Beschrijving | Voorbeeld Response |
|-------------|--------------|---------------------|
| 200 | Success | `{ data }` of `{ success: true }` |
| 201 | Created | `{ data }` |
| 204 | No Content | - |
| 400 | Bad Request | `{ error: "Invalid input" }` |
| 401 | Unauthorized | `{ error: "Token missing" }` |
| 403 | Forbidden | `{ error: "Access denied" }` |
| 404 | Not Found | `{ error: "User not found" }` |
| 500 | Internal Server Error | `{ error: "Database error" }` |

---

### Permissies Logica

De applicatie implementeert een permission systeem voor events en categorieën:

1. **Eigenaar (Owner)**: Gebruiker die de categorie heeft aangemaakt
   - Kan: alles (lezen, wijzigen, verwijderen, delen)

2. **Gedeelde Toegang (Shared)**: Gebruiker met wie de categorie is gedeeld
   - **canEdit = true**: Kan events toevoegen, wijzigen, verwijderen
   - **canEdit = false**: Kan alleen events lezen

3. **Permission Check Flow**:
```
1. Controleer of gebruiker de eigenaar is van de categorie
   ↓ Nee
2. Controleer of gebruiker in category_shares staat
   ↓ Nee
3. toegang ontzegd (403)
   ↓ Ja
4. Controleer canEdit flag voor write operaties
   ↓ canEdit = false && write operatie
5. toegang ontzegd (403)
   ↓ canEdit = true of read operatie
6. toegang verlenen
```

Zie `server.ts` regels 187-195, 207-215, 227-235 voor de implementatie.

---

*Rapport gegenereerd op: 2026-04-23 20:43:40* 