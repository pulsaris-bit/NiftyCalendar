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
      // First, discover the calendar home set
      // For Radicale: PROPFIND / with Depth:0 to get calendar-home-set
      // For Nextcloud: the serverUrl might already point to the calendar home
      let calendarsUrl = this.config.serverUrl;
      
      // Try to discover calendar-home-set first
      try {
        const homeResponse = await this.fetchWithAuth(calendarsUrl, {
          method: 'PROPFIND',
          headers: {
            'Content-Type': 'application/xml',
            'Depth': '0'
          },
          body: `<?xml version="1.0" encoding="utf-8" ?>
<d:propfind xmlns:d="${NS_DAV}" xmlns:c="${NS_CALDAV}">
  <d:prop>
    <c:calendar-home-set/>
    <d:current-user-principal/>
  </d:prop>
</d:propfind>`
        });

        if (homeResponse.ok) {
          const homeText = await homeResponse.text();
          // Try calendar-home-set first
          const calendarHomeMatch = homeText.match(/<c:calendar-home-set[^>]*><d:href[^>]*>([^<]+)<\/d:href>/);
          if (calendarHomeMatch) {
            const homeHref = calendarHomeMatch[1];
            // If it's a relative URL, prepend the base
            if (homeHref.startsWith('/')) {
              const url = new URL(calendarsUrl);
              calendarsUrl = `${url.protocol}//${url.host}${homeHref}`;
            } else {
              calendarsUrl = homeHref;
            }
          } else {
            // Fall back to current-user-principal
            const principalMatch = homeText.match(/<d:current-user-principal[^>]*><d:href[^>]*>([^<]+)<\/d:href>/);
            if (principalMatch) {
              const principalHref = principalMatch[1];
              if (principalHref.startsWith('/')) {
                const url = new URL(calendarsUrl);
                calendarsUrl = `${url.protocol}//${url.host}${principalHref}`;
              } else {
                calendarsUrl = principalHref;
              }
            } else if (this.username) {
              // Last fallback: use /<username>/
              const url = new URL(calendarsUrl);
              calendarsUrl = `${url.protocol}//${url.host}/${this.username}/`;
            }
          }
        }
      } catch (e) {
        // If discovery fails, try with username path
        if (this.username) {
          const url = new URL(calendarsUrl);
          calendarsUrl = `${url.protocol}//${url.host}/${this.username}/`;
        }
      }
      
      // Build PROPFIND request to discover calendars
      const xml = `<?xml version="1.0" encoding="utf-8" ?>
<d:propfind xmlns:d="${NS_DAV}" xmlns:c="${NS_CALDAV}" xmlns:apple="${NS_ICAL}">
  <d:prop>
    <d:displayname/>
    <d:resourcetype/>
    <c:calendar-description/>
    <apple:calendar-color/>
    <c:supported-calendar-component-set/>
  </d:prop>
</d:propfind>`;

      const response = await this.fetchWithAuth(calendarsUrl, {
        method: 'PROPFIND',
        headers: {
          'Content-Type': 'application/xml',
          'Depth': '1'
        },
        body: xml
      });

      if (!response.ok) {
        console.error('PROPFIND failed for URL', calendarsUrl, ':', await response.text());
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
    const calendars: CalDAVCalendar[] = [];
    
    try {
      // Match all calendar responses in the multistatus (handle namespaced tags like d:response or just response)
      const calendarRegex = /<(?:[a-z0-9]*:)?response[^>]*>([\s\S]*?)<\/(?:[a-z0-9]*:)?response>/g;
      let match;
      
      while ((match = calendarRegex.exec(xml)) !== null) {
        const responseContent = match[1];
        
        // Extract href from response content
        const hrefMatch = responseContent.match(/<(?:[a-z0-9]*:)?href[^>]*>([^<]+)<\/(?:[a-z0-9]*:)?href>/i);
        if (!hrefMatch) continue;
        const href = hrefMatch[1];
        
        // Extract the full resourcetype content for precise checking
        const resourcetypeMatch = responseContent.match(/<(?:[a-z0-9]*:)?resourcetype[^>]*>([\s\S]*?)<\/(?:[a-z0-9]*:)?resourcetype>/i);
        const resourcetypeContent = resourcetypeMatch ? resourcetypeMatch[1] : '';
        
        // Check if this has calendar in resourcetype (handle self-closing tags)
        const hasCalendarResource = /<(?:[a-z0-9]*:)?calendar(?:\s*\/)?>/i.test(resourcetypeContent);
        
        // Check it's a collection (handle self-closing tags)
        const hasCollection = /<(?:[a-z0-9]*:)?collection(?:\s*\/)?>/i.test(resourcetypeContent);
        
        // Check if this is a principal (should be excluded) (handle self-closing tags)
        const hasPrincipal = /<(?:[a-z0-9]*:)?principal(?:\s*\/)?>/i.test(resourcetypeContent);
        
        // Filter out .ics files (these are events mistakenly created as collections)
        const isIcsFile = /\.ics(\/|$)/i.test(href);
        

        
        // Only include if: has calendar resource, has collection, NOT a principal, NOT an .ics file
        if (hasCalendarResource && hasCollection && !hasPrincipal && !isIcsFile) {
          // Extract properties (handle both prefixed and unprefixed tags)
          // Use non-greedy match across lines for displayname
          const displayNameMatch = responseContent.match(/<(?:[a-z0-9]*:)?displayname[^>]*>([\s\S]*?)<\/(?:[a-z0-9]*:)?displayname>/i);
          const colorMatch = responseContent.match(/<(?:[a-z0-9]*:)?calendar-color[^>]*>([\s\S]*?)<\/(?:[a-z0-9]*:)?calendar-color>/i);
          const descriptionMatch = responseContent.match(/<(?:[a-z0-9]*:)?calendar-description[^>]*>([\s\S]*?)<\/(?:[a-z0-9]*:)?calendar-description>/i);
          
          // Clean up the href - remove trailing slash and leading slash
          const cleanHref = href.replace(/^\/+|\/+$/g, '');
          
          // Clean up extracted values - trim whitespace and remove any remaining tags
          const name = displayNameMatch ? displayNameMatch[1].replace(/<[^>]*>/g, '').trim() : cleanHref.split('/').pop() || 'Unnamed Calendar';
          const color = colorMatch ? colorMatch[1].replace(/<[^>]*>/g, '').trim() : '#3b82f6';
          const description = descriptionMatch ? descriptionMatch[1].replace(/<[^>]*>/g, '').trim() : undefined;
          
          calendars.push({
            id: cleanHref,
            name,
            color,
            isShared: responseContent.toLowerCase().includes('shared'),
            canEdit: responseContent.toLowerCase().includes('write') || responseContent.toLowerCase().includes('all'),
            description
          });
        }
      }
      
      // If we found calendars, return them
      if (calendars.length > 0) {
        return calendars;
      }
      
      // Fallback: try to find any collection with calendar resourcetype
      const collectionRegex = /<[a-z0-9]*?:response[^>]*>[\s\S]*?<[a-z0-9]*?:href[^>]*>([^<]+)<\/[a-z0-9]*?:href>[\s\S]*?<[a-z0-9]*?:resourcetype[^>]*>([\s\S]*?)<\/[a-z0-9]*?:resourcetype>/gi;
      const collectionMatches = xml.match(collectionRegex) || [];
      
      for (const collectionMatch of collectionMatches) {
        const hrefMatch = collectionMatch.match(/<[a-z0-9]*?:href[^>]*>([^<]+)<\/[a-z0-9]*?:href>/i);
        if (!hrefMatch) continue;
        const href = hrefMatch[1].replace(/^\/+|\/+$/g, '');
        const resourcetypeContent = collectionMatch.match(/<[a-z0-9]*?:resourcetype[^>]*>([\s\S]*?)<\/[a-z0-9]*?:resourcetype>/i);
        const resContent = resourcetypeContent ? resourcetypeContent[1] : '';
        
        // Filter out .ics files, principals, and non-calendar resources
        if (/\.ics(\/|$)/i.test(hrefMatch[1])) continue;
        if (/<[a-z0-9]*?:principal/i.test(resContent)) continue;
        if (!/<[a-z0-9]*?:calendar/i.test(resContent)) continue;
        
        calendars.push({
          id: href,
          name: href.split('/').pop() || 'Unnamed Calendar',
          color: '#3b82f6',
          isShared: false,
          canEdit: true,
          description: undefined
        });
      }
      
      if (calendars.length > 0) {
        return calendars;
      }
    } catch (e) {
      console.warn('Could not parse calendar XML:', e);
    }
    
    // Last resort: return a default calendar based on the base URL
    console.warn('Could not parse calendars from XML, returning default calendar for URL:', baseUrl);
    calendars.push({
      id: `${baseUrl}calendar`,
      name: 'Main Calendar',
      color: '#3b82f6',
      isShared: false,
      canEdit: true,
      description: undefined
    });
    
    
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
   * Discover calendar home set URL
   */
  private async discoverCalendarHomeUrl(): Promise<string> {
    // Try to discover the calendar home set
    try {
      const homeResponse = await this.fetchWithAuth(this.config.serverUrl, {
        method: 'PROPFIND',
        headers: {
          'Content-Type': 'application/xml',
          'Depth': '0'
        },
        body: `<?xml version="1.0" encoding="utf-8" ?>
<d:propfind xmlns:d="${NS_DAV}" xmlns:c="${NS_CALDAV}">
  <d:prop>
    <c:calendar-home-set/>
    <d:current-user-principal/>
  </d:prop>
</d:propfind>`
      });

      if (homeResponse.ok) {
        const homeText = await homeResponse.text();
        // Try calendar-home-set first
        const calendarHomeMatch = homeText.match(/<c:calendar-home-set[^>]*><d:href[^>]*>([^<]+)<\/d:href>/);
        if (calendarHomeMatch) {
          const homeHref = calendarHomeMatch[1];
          if (homeHref.startsWith('/')) {
            const url = new URL(this.config.serverUrl);
            return `${url.protocol}//${url.host}${homeHref}`;
          }
          return homeHref;
        }
        // Fall back to current-user-principal
        const principalMatch = homeText.match(/<d:current-user-principal[^>]*><d:href[^>]*>([^<]+)<\/d:href>/);
        if (principalMatch) {
          const principalHref = principalMatch[1];
          if (principalHref.startsWith('/')) {
            const url = new URL(this.config.serverUrl);
            return `${url.protocol}//${url.host}${principalHref}`;
          }
          return principalHref;
        }
      }
    } catch (e) {
      // Ignore discovery errors
    }

    // Fallback: use username path if available
    if (this.username) {
      const url = new URL(this.config.serverUrl);
      return `${url.protocol}//${url.host}/${this.username}/`;
    }

    // Ultimate fallback: use server URL directly
    return this.config.serverUrl;
  }

  /**
   * Create a new calendar
   */
  async createCalendar(name: string, color?: string, description?: string): Promise<CalDAVCalendar> {
    if (!this.authenticated) {
      throw new Error('Client not initialized');
    }

    try {
      // Discover the calendar home URL
      const calendarHomeUrl = await this.discoverCalendarHomeUrl();
      
      // Ensure calendar home URL ends with /
      const baseUrl = calendarHomeUrl.endsWith('/') ? calendarHomeUrl : calendarHomeUrl + '/';
      const encodedName = encodeURIComponent(name);
      const calendarPath = `${baseUrl}${encodedName}`;
      
      // MKCALENDAR request - only use standard CalDAV properties
      // Note: apple:calendar-color is proprietary and may not be supported by all servers
      const xml = `<?xml version="1.0" encoding="utf-8" ?>
<c:mkcalendar xmlns:c="${NS_CALDAV}" xmlns:d="${NS_DAV}">
  <d:set>
    <d:prop>
      <d:displayname>${name}</d:displayname>
      <c:calendar-description>${description || ''}</c:calendar-description>
    </d:prop>
  </d:set>
</c:mkcalendar>`;

      const calendarUrl = new URL(calendarPath).toString();
      const response = await this.fetchWithAuth(calendarUrl, {
        method: 'MKCALENDAR',
        headers: {
          'Content-Type': 'application/xml'
        },
        body: xml
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`MKCALENDAR failed for URL ${calendarUrl}: ${response.status} ${response.statusText} - ${errorText}`);
        throw new Error(`Failed to create calendar: ${response.statusText} - ${errorText}`);
      }

      // Extract the path part from calendarUrl for the ID (remove protocol and host)
      const urlObj = new URL(calendarUrl);
      const calendarId = urlObj.pathname.replace(/^\/+/g, '');

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
      // Construct full URL from calendarId
      const calendarUrl = new URL(calendarId, this.config.serverUrl).toString();
      const response = await this.fetchWithAuth(calendarUrl, {
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
   * Update a calendar
   */
  async updateCalendar(calendarId: string, updates: { name?: string; color?: string; description?: string }): Promise<void> {
    if (!this.authenticated) {
      throw new Error('Client not initialized');
    }

    try {
      // Construct full URL from calendarId
      const calendarUrl = new URL(calendarId, this.config.serverUrl).toString();
      
      // PROPPATCH request to update calendar properties
      const xml = `<?xml version="1.0" encoding="utf-8" ?>
<d:propertyupdate xmlns:d="${NS_DAV}" xmlns:c="${NS_CALDAV}" xmlns:apple="${NS_ICAL}">
  <d:set>
    <d:prop>
      ${updates.name ? `<d:displayname>${updates.name}</d:displayname>` : ''}
      ${updates.description ? `<c:calendar-description>${updates.description}</c:calendar-description>` : ''}
      ${updates.color ? `<apple:calendar-color xmlns:apple="${NS_ICAL}">${updates.color}</apple:calendar-color>` : ''}
    </d:prop>
  </d:set>
</d:propertyupdate>`;

      const response = await this.fetchWithAuth(calendarUrl, {
        method: 'PROPPATCH',
        headers: {
          'Content-Type': 'application/xml'
        },
        body: xml
      });

      if (!response.ok) {
        throw new Error(`Failed to update calendar: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Failed to update calendar:', error);
      throw new Error('Failed to update calendar on CalDAV server');
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

      // Construct full URL from calendarId (which is a path like /testuser/abc123)
      let calendarUrl = new URL(calendarId, this.config.serverUrl).toString();
      if (!calendarUrl.endsWith('/')) {
        calendarUrl += '/';
      }
      const response = await this.fetchWithAuth(calendarUrl, {
        method: 'REPORT',
        headers: {
          'Content-Type': 'application/xml',
          Depth: '1'
        },
        body: xml
      });

      if (!response.ok) {
        console.error('Calendar query failed for URL', calendarUrl, ':', response.status, response.statusText);
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
      const datePart = dateStr.replace(/^;VALUE=DATE-TIME:/, '');
      // Parse ISO 8601 date-time format (YYYYMMDDTHHmmssZ)
      // If ends with Z, it's UTC
      if (datePart.endsWith('Z')) {
        const withoutZ = datePart.slice(0, -1);
        // Format: YYYYMMDDTHHmmss -> needs to be YYYY-MM-DDTHH:mm:ssZ for Date parsing
        const formatted = `${withoutZ.substring(0, 4)}-${withoutZ.substring(4, 6)}-${withoutZ.substring(6, 8)}T${withoutZ.substring(9, 11)}:${withoutZ.substring(11, 13)}:${withoutZ.substring(13, 15)}Z`;
        return new Date(formatted);
      }
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
   * Uses a broader date range to find the event if it's outside the current month
   */
  async getEvent(calendarId: string, eventId: string): Promise<CalDAVEvent | null> {
    // Try with a broad date range (1 year)
    const now = new Date();
    const startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    const endDate = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
    const events = await this.getEvents(calendarId, startDate, endDate);
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
      
      // Construct full URL from calendarId and filename
      // Ensure calendarUrl ends with / to avoid URL resolution issues
      let calendarUrl = new URL(calendarId, this.config.serverUrl).toString();
      if (!calendarUrl.endsWith('/')) {
        calendarUrl += '/';
      }
      const eventUrl = new URL(filename, calendarUrl).toString();
      const response = await this.fetchWithAuth(eventUrl, {
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
    const nowDate = this.formatDateForICal(new Date(), false);
    
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//NiftyCalendar//EN',
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${nowDate}`,
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
      
      // Construct full URL from calendarId and filename
      let calendarUrl = new URL(calendarId, this.config.serverUrl).toString();
      if (!calendarUrl.endsWith('/')) {
        calendarUrl += '/';
      }
      const eventUrl = new URL(filename, calendarUrl).toString();
      console.log(`[DEBUG] Updating event at ${eventUrl}`);
      console.log(`[DEBUG] iCal content: ${icalEvent.substring(0, 200)}...`);
      const response = await this.fetchWithAuth(eventUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'text/calendar; charset=utf-8'
        },
        body: icalEvent
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Failed to update event at ${eventUrl}: ${response.status} ${response.statusText} - ${errorText}`);
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
      // Construct full URL from calendarId and filename
      let calendarUrl = new URL(calendarId, this.config.serverUrl).toString();
      if (!calendarUrl.endsWith('/')) {
        calendarUrl += '/';
      }
      const eventUrl = new URL(filename, calendarUrl).toString();
      const response = await this.fetchWithAuth(eventUrl, {
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
