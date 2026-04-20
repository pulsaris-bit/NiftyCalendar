/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CalendarCategory, CalendarEvent } from './types';
import { addHours, startOfMonth, startOfToday } from 'date-fns';

export const INITIAL_CATEGORIES: CalendarCategory[] = [
  { id: 'personal', name: 'Persoonlijk', color: '#C36322', isVisible: true },
  { id: 'work', name: 'Werk', color: '#1a1a1a', isVisible: true },
  { id: 'family', name: 'Familie', color: '#10b981', isVisible: true },
];

const today = startOfToday();

export const INITIAL_EVENTS: CalendarEvent[] = [
  {
    id: '1',
    title: 'Product Lancering Update',
    start: addHours(today, 10),
    end: addHours(today, 11),
    description: 'Wekelijkse team sync om de product lanceerstrategie te bespreken.',
    calendarId: 'work',
  },
  {
    id: '2',
    title: 'Familie Diner',
    start: addHours(today, 18),
    end: addHours(today, 20),
    calendarId: 'family',
  },
  {
    id: '3',
    title: 'Doktersafspraak',
    start: addHours(today, 14),
    end: addHours(today, 15),
    calendarId: 'personal',
  },
];
