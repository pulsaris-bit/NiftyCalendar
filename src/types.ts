/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type CalendarView = 'day' | 'week' | 'month' | 'agenda';

export interface CalendarEvent {
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
  caldavEventUid?: string;
  caldavEtag?: string;
}

export interface CalendarCategory {
  id: string;
  name: string;
  color: string;
  isVisible: boolean;
  isOwner?: boolean;
  canEdit?: boolean;
  isCaldav?: boolean;
  caldavUrl?: string;
  caldavCalendarId?: string;
  syncEnabled?: boolean;
}

export interface User {
  id: number;
  email: string;
  name: string;
  authMethod?: 'oauth' | 'basic';
  settings?: any;
}

export interface CalDAVConfig {
  serverUrl: string;
  authMethod: 'oauth' | 'basic';
  oauth?: {
    clientId: string;
    authUrl: string;
    tokenUrl: string;
    redirectUri: string;
  };
}

export interface AuthState {
  error?: string;
  isLoading?: boolean;
  authorizationUrl?: string;
}
