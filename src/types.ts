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
}

export interface CalendarCategory {
  id: string;
  name: string;
  color: string;
  isVisible: boolean;
  isOwner?: boolean;
  canEdit?: boolean;
}
