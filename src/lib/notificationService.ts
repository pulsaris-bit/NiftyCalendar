/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CalendarEvent } from '../types';

class NotificationService {
  private hasPermission: boolean = false;
  private notifiedEventIds: Set<string> = new Set();

  constructor() {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      this.hasPermission = Notification.permission === 'granted';
    }
  }

  async requestPermission(): Promise<boolean> {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return false;
    }

    if (Notification.permission === 'granted') {
      this.hasPermission = true;
      return true;
    }

    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      this.hasPermission = permission === 'granted';
      return this.hasPermission;
    }

    return false;
  }

  notify(event: CalendarEvent) {
    if (!this.hasPermission || this.notifiedEventIds.has(event.id)) {
      return;
    }

    const options: NotificationOptions = {
      body: `${event.location ? `@ ${event.location}\n` : ''}${event.description || ''}`,
      icon: '/favicon.ico', // Default icon if available
    };

    new Notification(`Herinnering: ${event.title}`, options);
    this.notifiedEventIds.add(event.id);
  }

  checkUpcomingEvents(events: CalendarEvent[], thresholdMinutes: number = 5) {
    if (!this.hasPermission) return;

    const now = new Date();
    const threshold = thresholdMinutes * 60 * 1000;

    events.forEach(event => {
      const startTime = new Date(event.start).getTime();
      const diff = startTime - now.getTime();

      // Only notify if event is starting within the threshold and hasn't started yet
      if (diff > 0 && diff <= threshold) {
        this.notify(event);
      }
    });
  }

  clearNotifiedIds() {
    // Optionally clear old notifications to keep the set small
    // For simplicity, we keep them for the current session
  }
}

export const notificationService = new NotificationService();
