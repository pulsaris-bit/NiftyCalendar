# CalDAV Test Commando's voor Nextcloud

## 1. Raw CalDAV data (VEVENT structuur)

```bash
curl -X REPORT "https://neo.tjemm.es/remote.php/dav/calendars/hayke/personal/" \
  -H "Depth: 1" \
  -H "Content-Type: application/xml" \
  -u 'hayke:PeW%Qt^kUV!xGDgwMj2cb9LW6' \
  -d '<?xml version="1.0" encoding="utf-8" ?>
<c:calendar-query xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:d="DAV:">
  <d:prop><c:calendar-data/></d:prop>
  <c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT">
    <c:time-range start="20240101T000000Z" end="20261231T235959Z"/>
  </c:comp-filter></c:comp-filter></c:filter>
</c:calendar-query>'
```

**Wat jeilt:** VEVENT structuur met DTSTART/DTEND format (bijv. `DTSTART:20240508T073000Z`)

---

## 2. API endpoint test

```bash
curl -v "https://neo.tjemm.es:59993/api/events?start=2024-01-01&end=2026-12-31" \
  -u 'hayke:PeW%Qt^kUV!xGDgwMj2cb9LW6'
```

**Wat je ziet:** JSON met events en start/end datums (bijv. `"start": "2024-05-08T07:30:00.000Z"`)

---

## 3. Simpele PROPFIND (optioneel)

```bash
curl -X PROPFIND "https://neo.tjemm.es/remote.php/dav/calendars/hayke/" \
  -H "Depth: 1" \
  -H "Content-Type: application/xml" \
  -u 'hayke:PeW%Qt^kUV!xGDgwMj2cb9LW6' \
  -d '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:displayname/></d:prop></d:propfind>'
```
