/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CalendarEvent } from '../types';

class NotificationService {
  private notifiedEventIds: Set<string> = new Set();

  private get hasPermission(): boolean {
    return typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted';
  }

  constructor() {}

  async requestPermission(): Promise<boolean> {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      console.warn("Browser ondersteunt geen notificaties.");
      return false;
    }

    if (Notification.permission === 'granted') {
      return true;
    }

    try {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    } catch (err) {
      console.error("Fout bij aanvragen notificatiepermissie:", err);
      return false;
    }
  }

  sendTestNotification() {
    if (!this.hasPermission) {
      this.requestPermission().then(granted => {
        if (granted) this.executeNotification("Test Melding", "Hoera! Notificaties werken correct.");
      });
    } else {
      this.executeNotification("Test Melding", "Hoera! Notificaties werken correct.");
    }
  }

  private executeNotification(title: string, body: string, id?: string) {
    const options: NotificationOptions = {
      body: body,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: id || 'test-notification',
      requireInteraction: true,
      silent: false
    };

    try {
      new Notification(title, options);
    } catch (err) {
      // Fallback for some mobile browsers/PWA modes
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.ready.then(registration => {
          registration.showNotification(title, options);
        });
      }
    }
  }

  notify(event: CalendarEvent) {
    if (!this.hasPermission) return;
    if (this.notifiedEventIds.has(event.id)) return;

    this.executeNotification(
      `Herinnering: ${event.title}`, 
      `${event.location ? `@ ${event.location}\n` : ''}${event.description || ''}`,
      event.id
    );
    this.notifiedEventIds.add(event.id);
  }

  checkUpcomingEvents(events: CalendarEvent[], thresholdMinutes: number = 5) {
    if (!this.hasPermission) return;

    const now = new Date();
    const thresholdMs = thresholdMinutes * 60 * 1000;
    const bufferMs = 60 * 1000; 

    events.forEach(event => {
      const startTime = new Date(event.start).getTime();
      const diff = startTime - now.getTime();

      const shouldNotify = thresholdMinutes === 0 
        ? (diff >= -bufferMs && diff <= bufferMs) 
        : (diff > 0 && diff <= thresholdMs);

      if (shouldNotify && !this.notifiedEventIds.has(event.id)) {
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
