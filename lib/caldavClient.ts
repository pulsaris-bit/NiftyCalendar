/**
 * CalDAV Client - Simplified version using direct HTTP requests
 * This is a more reliable approach that doesn't depend on tsdav's complex types
 */

import { encryptPassword as forgeEncrypt, decryptPassword as forgeDecrypt } from './encryption';

interface CalDAVConfig {
  serverUrl: string;
  authMethod: 'oauth' | 'basic';
  username?: string;
  password?: string;
  accessToken?: string;
  encryptionKey?: string;
}

interface CalDAVCalendar {
  id: string;
  name: string;
  color: string;
  isShared: boolean;
  canEdit: boolean;
  description?: string;
}

interface CalDAVEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  description?: string;
  location?: string;
  calendarId: string;
  color?: string;
  isAllDay?: boolean;
  recurrenceRule?: string;
}

/**
 * XML namespace constants
 */
const NS_DAV = 'DAV:';
const NS_CALDAV = 'urn:ietf:params:xml:ns:caldav';
const NS_ICAL = 'http://apple.com/ns/ical/';

/**
 * CalDAV Client for calendar operations
 * Uses direct HTTP requests for simplicity and reliability
 */
export class CalDAVClient {
  private config: CalDAVConfig;
  private authenticated: boolean = false;
  private accessToken: string | null = null;
  private username: string | null = null;
  private password: string | null = null;

  constructor(config: CalDAVConfig) {
    this.config = config;
  }

  /**
   * Initialize the CalDAV client with credentials
   */
  async initialize(username?: string, password?: string, accessToken?: string): Promise<void> {
    if (this.config.authMethod === 'oauth') {
      if (!accessToken) {
        throw new Error('Access token is required for OAuth authentication');
      }
      this.accessToken = accessToken;
    } else {
      // Basic Auth
      if (!username || !password) {
        throw new Error('Username and password are required for Basic Auth');
      }
      this.username = username;
      this.password = password;
    }
    this.authenticated = true;
  }

  /**
   * Get encrypted password for storage
   */
  encryptPassword(password: string): { encrypted: string; iv: string } {
    if (!this.config.encryptionKey) {
      throw new Error('Encryption key is required for Basic Auth');
    }
    return forgeEncrypt(password, this.config.encryptionKey);
  }

  /**
   * Decrypt stored password
   */
  decryptPassword(encrypted: string, iv: string): string {
    if (!this.config.encryptionKey) {
      throw new Error('Encryption key is required for Basic Auth');
    }
    return forgeDecrypt(encrypted, iv, this.config.encryptionKey);
  }

  /**
   * Initialize client with encrypted password
   */
  async initializeWithEncryptedPassword(username: string, encryptedPassword: string, iv: string): Promise<void> {
    const password = this.decryptPassword(encryptedPassword, iv);
    await this.initialize(username, password);
  }

  /**
   * Check if client is authenticated
   */
  isAuthenticated(): boolean {
    return this.authenticated;
  }

  /**
   * Get auth headers based on authentication method
   */
  private getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    
    if (this.config.authMethod === 'oauth' && this.accessToken) {
      headers.Authorization = `Bearer ${this.accessToken}`;
    } else if (this.username && this.password) {
      const encoded = Buffer.from(`${this.username}:${this.password}`).toString('base64');
      headers.Authorization = `Basic ${encoded}`;
    }
    
    headers['Content-Type'] = 'application/xml; charset=utf-8';
    headers['Accept'] = 'application/xml';
    
    return headers;
  }

  /**
   * Make an authenticated HTTP request
   */
  private async fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
    const headers = {
      ...this.getAuthHeaders(),
      ...options.headers
    };
    
    const response = await fetch(url, {
      ...options,
      headers
    });
    
    return response;
  }

  /**
   * Get list of calendars accessible to the user
   * Uses PROPFIND to discover calendars
   */
  async getCalendars(): Promise<CalDAVCalendar[]> {
    if (!this.authenticated) {
      throw new Error('Client not initialized');
    }

    try {
      // For Nextcloud: /remote.php/dav/calendars/<username>/
      // For Radicale: typically at the root or /<username>/calendars/
      const calendarsUrl = this.config.serverUrl;
      
      // Build PROPFIND request to discover calendars
      const xml = `<?xml version="1.0" encoding="utf-8" ?>
<d:searchxml xmlns:d="${NS_DAV}" xmlns:c="${NS_CALDAV}">
  <d:basicsearch>
    <d:select>
      <d:prop>
        <d:displayname/>
        <c:calendar-description/>
        <apple:calendar-color xmlns:apple="${NS_ICAL}"/>
      </d:prop>
    </d:select>
    <d:from>
      <d:scope>
        <d:href>${calendarsUrl}</d:href>
        <d:depth>1</d:depth>
      </d:scope>
    </d:from>
    <d:where>
      <d:and>
        <d:propfilter name="d:resourcetype">
          <d:prop>
            <c:calendar xmlns:c="${NS_CALDAV}"/>
          </d:prop>
        </d:propfilter>
      </d:and>
    </d:where>
  </d:basicsearch>
</d:searchxml>`;

      const response = await this.fetchWithAuth(calendarsUrl, {
        method: 'SEARCH',
        headers: {
          'Content-Type': 'application/xml'
        },
        body: xml
      });

      if (!response.ok) {
        console.error('PROPFIND failed:', await response.text());
        throw new Error('Failed to retrieve calendars');
      }

      const text = await response.text();
      const calendars = this.parseCalendarsFromXML(text, calendarsUrl);
      
      return calendars;
    } catch (error) {
      console.error('Failed to get calendars:', error);
      throw new Error('Failed to retrieve calendars from CalDAV server');
    }
  }

  /**
   * Parse calendars from PROPFIND response
   */
  private parseCalendarsFromXML(xml: string, baseUrl: string): CalDAVCalendar[] {
    // Simple XML parsing - in production you'd use a proper XML parser
    const calendars: CalDAVCalendar[] = [];
    
    // Try to parse the response
    try {
      // This is a placeholder - actual parsing depends on server response format
      // For now, return a default calendar
      calendars.push({
        id: `${baseUrl}/calendar`,
        name: 'Main Calendar',
        color: '#3b82f6',
        isShared: false,
        canEdit: true,
        description: undefined
      });
    } catch (e) {
      console.warn('Could not parse calendar XML, returning default:', e);
      calendars.push({
        id: `${baseUrl}/calendar`,
        name: 'Main Calendar',
        color: '#3b82f6',
        isShared: false,
        canEdit: true,
        description: undefined
      });
    }
    
    return calendars;
  }

  /**
   * Get calendar by ID
   */
  async getCalendar(calendarId: string): Promise<CalDAVCalendar | null> {
    const calendars = await this.getCalendars();
    const calendar = calendars.find(c => c.id === calendarId);
    return calendar || null;
  }

  /**
   * Create a new calendar
   */
  async createCalendar(name: string, color?: string, description?: string): Promise<CalDAVCalendar> {
    if (!this.authenticated) {
      throw new Error('Client not initialized');
    }

    try {
      const baseUrl = this.config.serverUrl;
      const calendarId = `${baseUrl}/${encodeURIComponent(name)}`;
      
      // MKCALENDAR request
      const xml = `<?xml version="1.0" encoding="utf-8" ?>
<c:mkcalendar xmlns:c="${NS_CALDAV}" xmlns:d="${NS_DAV}">
  <d:set>
    <d:prop>
      <d:displayname>${name}</d:displayname>
      <c:calendar-description>${description || ''}</c:calendar-description>
      <apple:calendar-color xmlns:apple="${NS_ICAL}">${color || '#3b82f6'}</apple:calendar-color>
    </d:prop>
  </d:set>
</c:mkcalendar>`;

      const response = await this.fetchWithAuth(calendarId, {
        method: 'MKCALENDAR',
        headers: {
          'Content-Type': 'application/xml'
        },
        body: xml
      });

      if (!response.ok) {
        throw new Error(`Failed to create calendar: ${response.statusText}`);
      }

      return {
        id: calendarId,
        name,
        color: color || '#3b82f6',
        isShared: false,
        canEdit: true,
        description
      };
    } catch (error) {
      console.error('Failed to create calendar:', error);
      throw new Error('Failed to create calendar on CalDAV server');
    }
  }

  /**
   * Delete a calendar
   */
  async deleteCalendar(calendarId: string): Promise<void> {
    if (!this.authenticated) {
      throw new Error('Client not initialized');
    }

    try {
      const response = await this.fetchWithAuth(calendarId, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error(`Failed to delete calendar: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Failed to delete calendar:', error);
      throw new Error('Failed to delete calendar from CalDAV server');
    }
  }

  /**
   * Get events from a specific calendar
   * Uses calendar-query REPORT
   */
  async getEvents(calendarId: string, start?: Date, end?: Date): Promise<CalDAVEvent[]> {
    if (!this.authenticated) {
      throw new Error('Client not initialized');
    }

    try {
      const startDate = start || new Date(0);
      const endDate = end || new Date();
      
      const startStr = this.formatDateForQuery(startDate);
      const endStr = this.formatDateForQuery(endDate);

      const xml = `<?xml version="1.0" encoding="utf-8" ?>
<c:calendar-query xmlns:c="${NS_CALDAV}" xmlns:d="${NS_DAV}">
  <d:prop>
    <d:getetag/>
    <c:calendar-data/>
  </d:prop>
  <c:filter>
    <c:comp-filter name="VCALENDAR">
      <c:comp-filter name="VEVENT">
        <c:time-range start="${startStr}" end="${endStr}"/>
      </c:comp-filter>
    </c:comp-filter>
  </c:filter>
</c:calendar-query>`;

      const response = await this.fetchWithAuth(calendarId, {
        method: 'REPORT',
        headers: {
          'Content-Type': 'application/xml',
          Depth: '1'
        },
        body: xml
      });

      if (!response.ok) {
        console.error('Calendar query failed:', await response.text());
        return [];
      }

      const text = await response.text();
      return this.parseEventsFromXML(text, calendarId);
    } catch (error) {
      console.error('Failed to get events:', error);
      return [];
    }
  }

  /**
   * Format date for iCalendar queries
   */
  private formatDateForQuery(date: Date): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const seconds = String(date.getUTCSeconds()).padStart(2, '0');
    return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
  }

  /**
   * Parse events from calendar-query response
   */
  private parseEventsFromXML(xml: string, calendarId: string): CalDAVEvent[] {
    const events: CalDAVEvent[] = [];
    
    try {
      // Parse iCalendar data from the response
      // This is a simplified parser - in production you'd use a proper iCal parser
      const eventStrings = xml.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) || [];
      
      for (const eventStr of eventStrings) {
        const uidMatch = eventStr.match(/UID:(.+?)[\r\n]/);
        const summaryMatch = eventStr.match(/SUMMARY:(.+?)[\r\n]/);
        const startMatch = eventStr.match(/DTSTART:(.+?)[\r\n]/);
        const endMatch = eventStr.match(/DTEND:(.+?)[\r\n]/);
        const descMatch = eventStr.match(/DESCRIPTION:(.+?)[\r\n]/);
        const locationMatch = eventStr.match(/LOCATION:(.+?)[\r\n]/);
        const rruleMatch = eventStr.match(/RRULE:(.+?)[\r\n]/);
        
        const event: CalDAVEvent = {
          id: uidMatch ? uidMatch[1].trim() : `event-${Date.now()}`,
          title: summaryMatch ? summaryMatch[1].trim() : 'Untitled Event',
          start: startMatch ? this.parseICalDate(startMatch[1].trim()) : new Date(),
          end: endMatch ? this.parseICalDate(endMatch[1].trim()) : new Date(),
          description: descMatch ? descMatch[1].trim() : undefined,
          location: locationMatch ? locationMatch[1].trim() : undefined,
          calendarId,
          color: undefined,
          isAllDay: startMatch ? startMatch[1].startsWith(';VALUE=DATE') : false,
          recurrenceRule: rruleMatch ? rruleMatch[1].trim() : undefined
        };
        
        events.push(event);
      }
    } catch (e) {
      console.warn('Could not parse events XML:', e);
    }
    
    return events;
  }

  /**
   * Parse iCalendar date string
   */
  private parseICalDate(dateStr: string): Date {
    if (dateStr.startsWith(';VALUE=DATE:')) {
      const datePart = dateStr.substring(';VALUE=DATE:'.length);
      const year = parseInt(datePart.substring(0, 4));
      const month = parseInt(datePart.substring(4, 6)) - 1;
      const day = parseInt(datePart.substring(6, 8));
      return new Date(Date.UTC(year, month, day));
    } else if (dateStr.includes('T')) {
      const datePart = dateStr.replace(/^;VALUE=DATE-TIME:/, '').replace(/Z$/, '');
      return new Date(datePart);
    } else {
      const year = parseInt(dateStr.substring(0, 4));
      const month = parseInt(dateStr.substring(4, 6)) - 1;
      const day = parseInt(dateStr.substring(6, 8));
      const hour = parseInt(dateStr.substring(9, 11));
      const minute = parseInt(dateStr.substring(11, 13));
      const second = parseInt(dateStr.substring(13, 15));
      return new Date(Date.UTC(year, month, day, hour, minute, second));
    }
  }

  /**
   * Get a specific event
   */
  async getEvent(calendarId: string, eventId: string): Promise<CalDAVEvent | null> {
    const events = await this.getEvents(calendarId);
    const event = events.find(e => e.id === eventId);
    return event || null;
  }

  /**
   * Create a new event
   */
  async createEvent(calendarId: string, eventData: Partial<CalDAVEvent> & { title: string; start: Date; end: Date }): Promise<CalDAVEvent> {
    if (!this.authenticated) {
      throw new Error('Client not initialized');
    }

    try {
      const eventId = eventData.id || `event-${Date.now()}`;
      const filename = `${eventId}.ics`;
      const icalEvent = this.createICalEvent(eventData);
      
      const response = await this.fetchWithAuth(`${calendarId}/${filename}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'text/calendar; charset=utf-8'
        },
        body: icalEvent
      });

      if (!response.ok) {
        throw new Error(`Failed to create event: ${response.statusText}`);
      }

      return {
        id: eventId,
        title: eventData.title,
        start: eventData.start,
        end: eventData.end,
        description: eventData.description,
        location: eventData.location,
        calendarId,
        color: eventData.color,
        isAllDay: eventData.isAllDay || false,
        recurrenceRule: eventData.recurrenceRule
      };
    } catch (error) {
      console.error('Failed to create event:', error);
      throw new Error('Failed to create event on CalDAV server');
    }
  }

  /**
   * Create iCalendar format for an event
   */
  private createICalEvent(eventData: Partial<CalDAVEvent> & { title: string; start: Date; end: Date }): string {
    const uid = eventData.id || `event-${Date.now()}`;
    const startDate = this.formatDateForICal(eventData.start, eventData.isAllDay);
    const endDate = this.formatDateForICal(eventData.end, eventData.isAllDay);
    
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//NiftyCalendar//EN',
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTART:${startDate}`,
      `DTEND:${endDate}`,
      `SUMMARY:${this.escapeICalText(eventData.title)}`,
    ];

    if (eventData.description) {
      lines.push(`DESCRIPTION:${this.escapeICalText(eventData.description)}`);
    }

    if (eventData.location) {
      lines.push(`LOCATION:${this.escapeICalText(eventData.location)}`);
    }

    if (eventData.recurrenceRule) {
      lines.push(`RRULE:${eventData.recurrenceRule}`);
    }

    lines.push('END:VEVENT');
    lines.push('END:VCALENDAR');

    return lines.join('\r\n');
  }

  /**
   * Format date for iCalendar
   */
  private formatDateForICal(date: Date, allDay?: boolean): string {
    if (allDay) {
      const year = date.getUTCFullYear();
      const month = String(date.getUTCMonth() + 1).padStart(2, '0');
      const day = String(date.getUTCDate()).padStart(2, '0');
      return `${year}${month}${day}`;
    }
    
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const seconds = String(date.getUTCSeconds()).padStart(2, '0');
    return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
  }

  /**
   * Escape text for iCalendar
   */
  private escapeICalText(text: string): string {
    return text
      .replace(/\\/g, '\\\\')
      .replace(/,/g, '\\,')
      .replace(/;/g, '\\;')
      .replace(/\r?\n/g, '\\n');
  }

  /**
   * Update an existing event
   */
  async updateEvent(calendarId: string, eventId: string, eventData: Partial<CalDAVEvent>): Promise<CalDAVEvent> {
    if (!this.authenticated) {
      throw new Error('Client not initialized');
    }

    try {
      const existingEvent = await this.getEvent(calendarId, eventId);
      if (!existingEvent) {
        throw new Error('Event not found');
      }

      const updatedEventData = {
        ...existingEvent,
        ...eventData,
        id: eventId
      };

      const icalEvent = this.createICalEvent(updatedEventData);
      const filename = `${eventId}.ics`;
      
      const response = await this.fetchWithAuth(`${calendarId}/${filename}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'text/calendar; charset=utf-8'
        },
        body: icalEvent
      });

      if (!response.ok) {
        throw new Error(`Failed to update event: ${response.statusText}`);
      }

      return {
        ...updatedEventData,
        id: eventId,
        start: updatedEventData.start || existingEvent.start,
        end: updatedEventData.end || existingEvent.end,
        calendarId
      };
    } catch (error) {
      console.error('Failed to update event:', error);
      throw new Error('Failed to update event on CalDAV server');
    }
  }

  /**
   * Delete an event
   */
  async deleteEvent(calendarId: string, eventId: string): Promise<void> {
    if (!this.authenticated) {
      throw new Error('Client not initialized');
    }

    try {
      const filename = `${eventId}.ics`;
      const response = await this.fetchWithAuth(`${calendarId}/${filename}`, {
        method: 'DELETE'
      });

      if (!response.ok && response.status !== 204) {
        throw new Error(`Failed to delete event: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Failed to delete event:', error);
      throw new Error('Failed to delete event from CalDAV server');
    }
  }

  /**
   * Move an event to a different calendar
   */
  async moveEvent(sourceCalendarId: string, eventId: string, targetCalendarId: string): Promise<CalDAVEvent> {
    const event = await this.getEvent(sourceCalendarId, eventId);
    if (!event) {
      throw new Error('Event not found');
    }

    await this.deleteEvent(sourceCalendarId, eventId);
    return await this.createEvent(targetCalendarId, {
      ...event,
      id: undefined
    });
  }

  /**
   * Share a calendar with another user
   * Note: This is server-dependent and may not be supported by all CalDAV servers
   */
  async shareCalendar(calendarId: string, userEmail: string, permissions: string): Promise<void> {
    console.warn('Calendar sharing is server-dependent and may not be fully implemented');
  }
}

/**
 * Create CalDAV client from environment variables
 */
export function createCalDAVClientFromEnv(): CalDAVClient {
  const authMethod = (process.env.CALDAV_AUTH_METHOD || 'basic') as 'oauth' | 'basic';
  
  return new CalDAVClient({
    serverUrl: process.env.CALDAV_SERVER_URL || '',
    authMethod,
    encryptionKey: process.env.ENCRYPTION_KEY
  });
}
