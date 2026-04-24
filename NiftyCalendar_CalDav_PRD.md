# Product Requirements Document (PRD)

**Projectnaam:** NiftyCalendar - CalDAV Integratie  
**Versie:** 2.0  
**Datum:** 23 april 2026  
**Eigenaar:** Hayke Tjemmes

---

## 1. Inleiding

### Doel

Het doel van dit project is het uitbreiden van de bestaande NiftyCalendar-app met **CalDAV-functionaliteit**, waarbij gebruikers kunnen kiezen tussen **Nextcloud OAuth 2.0** (voor Nextcloud-servers) en **Basic Auth** (voor Radicale/andere CalDAV-servers). De app gebruikt `[tsdav](https://github.com/natelindev/tsdav)` als CalDAV-bibliotheek en slaat **alleen bij Basic Auth** versleutelde wachtwoorden op in de SQLite-database.

### Scope

- **In Scope:**
  - Integratie met CalDAV-servers via **OAuth 2.0 (Nextcloud)** of **Basic Auth (Radicale/andere servers)**.
  - Configuratie van de authenticatiemethode via **Docker Compose**.
  - Authenticatie via Nextcloud OAuth 2.0 (tokens) of Basic Auth (versleutelde credentials).
  - Dynamisch laden van agenda's en agenda-items van de CalDAV-server.
  - Ondersteuning voor CRUD-operaties op agenda-items.
  - Ondersteuning voor het delen van agenda's (indien ondersteund door de server).
  - Beheer van instellingen via SQLite-database.
- **Out of Scope:**
  - Migratie van bestaande SQLite-agenda-data naar CalDAV.
  - Ondersteuning voor andere protocolstandaarden (bijv. Exchange, Google Calendar API).

---

## 2. Functionele Vereisten

### 2.1 CalDAV Server Configuratie

- **Docker Compose:**
  - De **authenticatiemethode** (`oauth` of `basic`) en **server-URL** moeten configureerbaar zijn als environment variables in Docker Compose.
  - Voorbeeld:
    ```yaml
    environment:
      CALDAV_AUTH_METHOD: "oauth" # of "basic"
      CALDAV_SERVER_URL: "https://je-server.nl/caldav"
      OAUTH_CLIENT_ID: "je_client_id" # Alleen voor OAuth
      OAUTH_CLIENT_SECRET: "je_client_secret" # Alleen voor OAuth
    ```

### 2.2 Authenticatie

- **Keuze tussen OAuth 2.0 en Basic Auth:**
  - Gebruikers kunnen kiezen tussen **Nextcloud OAuth 2.0** (aanbevolen voor Nextcloud) of **Basic Auth** (voor Radicale/andere servers).
  - De gekozen methode wordt bepaald door de `CALDAV_AUTH_METHOD` in Docker Compose.
- **Nextcloud OAuth 2.0:**
  - Gebruikers loggen in via **Nextcloud OAuth 2.0**.
  - De app ontvangt een **access token** en **refresh token**, die **versleuteld** worden opgeslagen in de SQLite-database.
  - **Geen wachtwoorden** worden lokaal opgeslagen.
- **Basic Auth:**
  - Gebruikers loggen in met hun **gebruikersnaam en wachtwoord**.
  - Het wachtwoord wordt **versleuteld** opgeslagen in de SQLite-database (AES-256).
  - Bij wachtwoordwijzigingen moet de gebruiker **opnieuw inloggen**.
- **Automatische Registratie:**
  - Bij de eerste succesvolle login wordt een nieuwe entry aangemaakt in de 'users'-tabel, met de relevante credentials/tokens en gebruikersinstellingen.

### 2.3 Agenda Synchronisatie

- **Laden van Agenda's:**
  - Bij het inloggen worden **alle agenda's** waar de gebruiker toegang toe heeft (inclusief gedeelde agenda's) **direct van de CalDAV-server** ingeladen via `tsdav`.
  - De app toont een dynamische lijst van beschikbare agenda's, inclusief metadata zoals naam, kleur, en gedeelde status.
- **CRUD-operaties:**
  - Agenda-items kunnen worden toegevoegd, verwijderd, en bijgewerkt. Wijzigingen worden direct gesynchroniseerd met de CalDAV-server via `tsdav`.
  - Conflicten worden opgelost volgens de CalDAV-standaard (bijv. `ETag`-gebaseerde synchronisatie).

### 2.4 Agenda Delen

- **Delen via CalDAV:**
  - Agenda's worden gedeeld via **CalDAV-server-functionaliteit** (bijv. `MKCALENDAR` met `ACL`-instellingen of `SHARE`-requests).
  - De app biedt een UI om agenda's te delen, maar **slaat geen lokale kopie van permissies op**. Permissies worden altijd live opgevraagd bij de CalDAV-server.

### 2.5 Instellingen

- **SQLite-database:** Voor het beheer van gebruikersspecifieke instellingen (bijv. weergavevoorkeuren, notificaties) blijft de SQLite-database gebruikt worden.

---

## 3. Niet-functionele Vereisten

### 3.1 Prestaties

- **Dynamische Agenda-Lijst:**
  - De lijst met agenda's wordt bij het openen van de app opgevraagd van de CalDAV-server en **tijdelijk gecached** voor snelle toegang.
- **Synchronisatiesnelheid:** Agenda-items moeten binnen 5 seconden gesynchroniseerd worden na een wijziging.
- **Responsiviteit:** De UI moet responsief blijven tijdens synchronisatieprocessen.

### 3.2 Beveiliging

- **OAuth 2.0:**
  - Alle communicatie met de Nextcloud-server vindt plaats via **HTTPS**.
  - Tokens worden **versleuteld** opgeslagen in de database.
- **Basic Auth:**
  - Wachtwoorden worden **versleuteld** met **AES-256** voordat ze worden opgeslagen in de database.
  - De **encryptie-sleutel** wordt veilig beheerd (bijv. via environment variables).
  - Alle communicatie met de CalDAV-server vindt plaats via **HTTPS**.
- **Geen plaintext-wachtwoorden:** Wachtwoorden worden **nooit** in plaintext opgeslagen of gelogd.

### 3.3 Betrouwbaarheid

- **Fouttolerantie:** De app moet robuust omgaan met tijdelijke verbindingsproblemen met de CalDAV-server.
- **Token/credential-verval:** Gebruikers krijgen een duidelijke melding als hun token/credentials verlopen zijn en moeten opnieuw inloggen.

---

## 4. Technische Specificaties

### 4.1 Technologie Stack

- **Frontend:** React, TypeScript, Tailwind CSS
- **Backend:** Express.js, TypeScript
- **Database:** SQLite (voor instellingen en credentials/tokens)
- **Authenticatie:**
  - Nextcloud: OAuth 2.0 (`oauth4webapi`)
  - Basic Auth: Versleutelde credentials (`node-forge` of `crypto-js`)
- **CalDAV Client:** `[tsdav](https://github.com/natelindev/tsdav)` (TypeScript)
- **Versleuteling:** AES-256 (voor Basic Auth-wachtwoorden)

### 4.2 Database Structuur

- **Tabel 'users':**

  | Veld                 | Type     | Beschrijving                                                |
  | -------------------- | -------- | ----------------------------------------------------------- |
  | `id`                 | INTEGER  | Primaire sleutel                                            |
  | `caldav_username`    | TEXT     | Gebruikersnaam (voor Basic Auth)                            |
  | `auth_method`        | TEXT     | `"oauth"` of `"basic"`                                      |
  | `access_token`       | TEXT     | OAuth access token (versleuteld)                            |
  | `refresh_token`      | TEXT     | OAuth refresh token (versleuteld)                           |
  | `encrypted_password` | TEXT     | Versleuteld wachtwoord (alleen voor Basic Auth, AES-256)    |
  | `encryption_iv`      | TEXT     | Initialisatievector voor decryptie (alleen voor Basic Auth) |
  | `token_expires`      | DATETIME | Vervaldatum access token (alleen voor OAuth)                |
  | `settings`           | JSON     | Gebruikersinstellingen                                      |


---

## 5. Acceptatiecriteria

- Gebruikers kunnen kiezen tussen **Nextcloud OAuth 2.0** en **Basic Auth** via Docker Compose.
- Bij **OAuth 2.0** loggen gebruikers in via Nextcloud en worden **tokens** versleuteld opgeslagen.
- Bij **Basic Auth** loggen gebruikers in met gebruikersnaam/wachtwoord en wordt het **wachtwoord versleuteld** opgeslagen.
- Gebruikers zien bij het inloggen een **dynamische lijst** van alle agenda's waar ze toegang toe hebben.
- CRUD-operaties op agenda-items worden direct gesynchroniseerd met de CalDAV-server.
- Agenda's kunnen worden gedeeld via de CalDAV-server (indien ondersteund).
- Instellingen worden opgeslagen in de SQLite-database.

---

## 6. Risico's en Afhankelijkheden

- **Afhankelijkheid van CalDAV-server:** De functionaliteit is afhankelijk van de beschikbaarheid en compatibiliteit van de CalDAV-server.
- **Beveiligingsrisico's:**
  - Bij Basic Auth: Onveilige opslag van versleutelde wachtwoorden kan leiden tot datalekken als de encryptie-sleutel gecompromitteerd wordt.
  - Bij OAuth: Tokens moeten veilig worden opgeslagen en beheerd.
- **Wachtwoordwijzigingen:** Bij Basic Auth moeten gebruikers opnieuw inloggen als hun wachtwoord verandert.

---

## 7. Tijdlijn en Milestones


| Milestone | Beschrijving                                                | Geplande Datum |
| --------- | ----------------------------------------------------------- | -------------- |
| M1        | Docker Compose configuratie voor auth-methode en server-URL | 15 mei 2026    |
| M2        | Implementatie Nextcloud OAuth 2.0                           | 30 mei 2026    |
| M3        | Implementatie Basic Auth met encryptie                      | 15 juni 2026   |
| M4        | Agenda synchronisatie en CRUD-operaties                     | 30 juni 2026   |
| M5        | Agenda delen en UI voor delen                               | 15 juli 2026   |
| M6        | Testen en bugfixes                                          | 31 juli 2026   |


---



---

## 9. Bijlagen

### 9.1 Voorbeeld Docker Compose

```yaml
version: '3.8'
services:
  niftycalendar:
    image: niftycalendar:latest
    environment:
      CALDAV_AUTH_METHOD: "oauth" # of "basic"
      CALDAV_SERVER_URL: "https://je-server.nl/caldav"
      # Alleen voor OAuth:
      OAUTH_CLIENT_ID: "je_client_id"
      OAUTH_CLIENT_SECRET: "je_client_secret"
      OAUTH_REDIRECT_URI: "https://je-app-domein.nl/oauth/callback"
      # Alleen voor Basic Auth (encryptie-sleutel):
      ENCRYPTION_KEY: "je_veilige_encryptie_sleutel" # Moet 32 bytes zijn voor AES-256
    ports:
      - "3000:3000"
```

### 9.2 Voorbeeld Encryptie (Basic Auth)

```typescript
import forge from 'node-forge';

// Encryptie-sleutel (moet 32 bytes zijn voor AES-256)
const encryptionKey = process.env.ENCRYPTION_KEY!;
const iv = forge.random.getBytesSync(16);

// Versleutel het wachtwoord
function encryptPassword(password: string): { encrypted: string; iv: string } {
  const cipher = forge.cipher.createCipher('AES-CBC', encryptionKey);
  cipher.start({ iv });
  cipher.update(forge.util.createBuffer(password));
  cipher.finish();
  return {
    encrypted: forge.util.encode64(cipher.output.getBytes()),
    iv: forge.util.encode64(iv),
  };
}

// Ontsleutel het wachtwoord
function decryptPassword(encrypted: string, iv: string): string {
  const decipher = forge.cipher.createDecipher('AES-CBC', encryptionKey);
  decipher.start({ iv: forge.util.decode64(iv) });
  decipher.update(forge.util.createBuffer(forge.util.decode64(encrypted)));
  decipher.finish();
  return decipher.output.toString();
}
```