# NiftyCalendar

## 1. Wat voor app dit is

NiftyCalendar is een webgebaseerde agenda-applicatie die naadloos integreert met CalDAV-servers, met name Nextcloud. De applicatie biedt:

- **Synchronisatie met Nextcloud** via CalDAV protocol
- **Meerdere weergaves**: dag, week, maand en agenda
- **OAuth 2.0 authenticatie** voor Nextcloud
- **Basic Auth** voor andere CalDAV-servers (bijv. Radicale)
- **Agenda delen** en gedeelde agenda's bekijken
- **All-day events** ondersteuning
- **Multi-day events** die correct over meerdere dagen worden getoond
- **Categorieën/kleuren** per agenda


## 2. Architectuur

### Frontend
- **Framework**: React + TypeScript
- **UI**: Eigen componenten met Tailwind CSS voor styling
- **State management**: React hooks (useState, useEffect)
- ** Routing**: Handmatig beheer zonder externe router library
- **Date handling**: `date-fns` voor datum manipulatie en formatting

### Backend
- **Server**: Node.js met Express
- **CalDAV client**: Eigen implementatie in `lib/caldavClient.ts`
  - Communiceert met CalDAV-servers via HTTP requests
  - Parseert iCalendar (ICS) data met `ical.js`
  - Ondersteunt OAuth 2.0 en Basic Auth
- **Database**: SQLite voor lokale opslag (gebruikers, encrypted wachtwoorden)
- **Encryption**: Forage voor encryptie van wachtwoorden

### Data Flow
```
Frontend (React) ↑↓ HTTP ↑↓ Backend (Express) ↑↓ CalDAV Server
          ↑↓ JSON               ↑↓ CalDAV requests
```

### CalDAV Integratie
- **Nextcloud**: Gebruikt OAuth 2.0 flow voor authenticatie
- **Andere servers**: Basic Auth met encrypted credentials
- **Events**: Wordt opgeslagen en opgevraagd als iCalendar (RFC 5545) format
- **Timezone handling**: UTC voor opslag, lokale tijd voor weergave

### Project Structuur
```
├── src/                   # Frontend (React)
│   ├── components/        # React componenten
│   ├── lib/               # Hulpfuncties
│   └── types.ts           # TypeScript types
├── lib/                   # Backend bibliotheken
│   └── caldavClient.ts    # CalDAV client implementatie
├── server.ts              # Express server
├── docker-compose.yml     # Docker configuratie
└── README.md              # Deze file
```


## 3. Installatie instructies

### Vereisten
- Node.js 18+ 
- npm 9+
- Docker (voor containerized deployment)
- Docker Compose

### Lokale installatie (development)

1. **Clone de repository:**
   ```bash
   git clone <repository-url>
   cd NiftyCalendar
   ```

2. **Installeer dependencies:**
   ```bash
   npm install
   ```

3. **Maak een .env bestand:**
   ```bash
   cp .env.example .env
   ```

4. **Configureer omgevingsvariabelen:**
   ```
   # CalDAV server configuratie
   CALDAV_SERVER_URL=https://your-nextcloud-server/remote.php/dav
   CALDAV_AUTH_METHOD=oauth  # of 'basic'
   
   # Encryptie key voor wachtwoorden
   ENCRYPTION_KEY=your-random-encryption-key-here
   
   # OAuth configuratie (voor Nextcloud)
   OAUTH_CLIENT_ID=your-client-id
   OAUTH_CLIENT_SECRET=your-client-secret
   OAUTH_REDIRECT_URI=http://localhost:3000/auth/callback
   OAUTH_AUTH_URL=https://your-nextcloud-server/index.php/apps/oauth2/authorize
   OAUTH_TOKEN_URL=https://your-nextcloud-server/index.php/apps/oauth2/token
   
   # Session secret
   SESSION_SECRET=your-session-secret
   
   # Server poort
   PORT=3000
   ```

5. **Start de development server:**
   ```bash
   npm run dev
   ```

   De applicatie is beschikbaar op `http://localhost:3000`

### Docker deployment

1. **Pas docker-compose.yml aan** met je CalDAV server URL en OAuth configuratie

2. **Build en start de containers:**
   ```bash
   docker-compose up -d --build
   ```

3. **Toegang tot de applicatie:**
   - Open `http://localhost:3000` in je browser

### CalDAV Server Configuratie

#### Nextcloud (OAuth 2.0)
1. Maak een OAuth 2.0 client aan in Nextcloud:
   - Ga naar **Instellingen → Beveiligheid → OAuth 2.0 Clients**
   - Voeg een nieuwe client toe
   - Stel de redirect URI in: `http://localhost:3000/auth/callback` (of je domein)
   - Noteer de Client ID en Client Secret

2. Vul deze in in je `.env` of `docker-compose.yml`

#### Radicale (Basic Auth)
1. Zorg dat je Radicale server draait
2. Stel `CALDAV_AUTH_METHOD=basic` in
3. Vul de server URL in: `CALDAV_SERVER_URL=http://your-radicale-server/`

### Gebruik

1. **Eerste keer inloggen:**
   - Selecteer de authenticatie methode (OAuth of Basic)
   - Log in met je CalDAV server credentials

2. **Agenda's bekijken:**
   - Alle agenda's waar je toegang toe hebt worden 자동isch geladen
   - Schakel tussen weergaves: dag, week, maand, agenda

3. **Events toevoegen:**
   - Klik op eendatum of gebruik de "Afspraak maken" knop
   - Selecteer agenda, titel, datum/tijd
   - Optioneel: beschrijving, locatie, herhaling
