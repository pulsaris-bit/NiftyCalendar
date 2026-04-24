/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as React from 'react';
import { CalendarHeader } from './components/CalendarHeader';
import { CalendarSidebar } from './components/CalendarSidebar';
import { CalendarGrid } from './components/CalendarGrid';
import { EventDialog } from './components/EventDialog';
import { AuthPage } from './components/AuthPage';
import { SettingsPage } from './components/SettingsPage';
import { CalendarEvent, CalendarView, CalendarCategory, User } from '@/src/types';
import { INITIAL_EVENTS, INITIAL_CATEGORIES } from './constants';
import { Toaster, toast } from 'sonner';
import { startOfToday } from 'date-fns';
import { cn } from '@/lib/utils';
import { notificationService } from './lib/notificationService';

export default function App() {
  const [user, setUser] = React.useState<User | null>(null);
  const [token, setToken] = React.useState<string | null>(localStorage.getItem('token'));
  const [currentDate, setCurrentDate] = React.useState(startOfToday());
  const [view, setView] = React.useState<CalendarView>('month');
  const [events, setEvents] = React.useState<CalendarEvent[]>([]);
  const [categories, setCategories] = React.useState<CalendarCategory[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(true);
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);
  const [highlightWeekends, setHighlightWeekends] = React.useState(false);
  const [defaultCalendarId, setDefaultCalendarId] = React.useState<string>('');
  const [defaultDuration, setDefaultDuration] = React.useState<number>(60);
  const [notificationThreshold, setNotificationThreshold] = React.useState<number>(5);
  const [selectedEvent, setSelectedEvent] = React.useState<Partial<CalendarEvent> | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isMockMode, setIsMockMode] = React.useState(false);
  const [caldavConfigured, setCaldavConfigured] = React.useState(false);
  const [authMethod, setAuthMethod] = React.useState<'oauth' | 'basic' | null>(null);
  const [isSyncing, setIsSyncing] = React.useState(false);

  // Notification timer
  React.useEffect(() => {
    if (!token || events.length === 0) return;

    // Check immediately on data load
    notificationService.checkUpcomingEvents(events, notificationThreshold);

    // Then check every minute
    const interval = setInterval(() => {
      notificationService.checkUpcomingEvents(events, notificationThreshold);
    }, 60000);

    return () => clearInterval(interval);
  }, [events, token, notificationThreshold]);

  React.useEffect(() => {
    checkStatus();
    if (token) {
      fetchAllData();
    } else {
      setIsLoading(false);
    }
  }, [token]);

  const checkStatus = async () => {
    try {
      const res = await fetch('/api/status');
      const data = await res.json();
      setIsMockMode(data.mock);
      setCaldavConfigured(!!data.caldavConfigured);
      if (data.authMethod) {
        setAuthMethod(data.authMethod as 'oauth' | 'basic');
      }
    } catch (err) {
      console.error("Status check failed", err);
    }
  };

  const fetchAllData = async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      
      // Sync with CalDAV if configured
      if (caldavConfigured) {
        try {
          setIsSyncing(true);
          await fetch('/api/sync', {
            method: 'POST',
            headers,
            signal: controller.signal
          });
        } catch (syncErr) {
          console.log('CalDAV sync failed, continuing with local data:', syncErr);
        } finally {
          setIsSyncing(false);
        }
      }

      const [eventsRes, catsRes, settingsRes, meRes] = await Promise.all([
        fetch('/api/events', { headers, signal: controller.signal }),
        fetch('/api/categories', { headers, signal: controller.signal }),
        fetch('/api/user/settings', { headers, signal: controller.signal }),
        fetch('/api/auth/me', { headers, signal: controller.signal })
      ]);

      clearTimeout(timeoutId);

      if (eventsRes.ok && catsRes.ok && settingsRes.ok && meRes.ok) {
        const eventsData = await eventsRes.json();
        const catsData = await catsRes.json();
        const settingsData = await settingsRes.json();
        const meData = await meRes.json();

        setUser({ id: meData.id, email: meData.email, name: meData.name, authMethod: meData.authMethod });

        // Convert date strings back to Date objects
        const formattedEvents = eventsData.map((e: any) => ({
          ...e,
          start: new Date(e.start),
          end: new Date(e.end)
        }));

        setEvents(formattedEvents);
        setCategories(catsData);
        
        // Apply settings
        if (settingsData.highlightWeekends !== undefined) setHighlightWeekends(settingsData.highlightWeekends);
        if (settingsData.defaultCalendarId) setDefaultCalendarId(settingsData.defaultCalendarId);
        if (settingsData.defaultDuration) setDefaultDuration(settingsData.defaultDuration);
        if (settingsData.notificationThreshold !== undefined) setNotificationThreshold(settingsData.notificationThreshold);
        
        // If no default calendar set but categories exist, set one
        if (!settingsData.defaultCalendarId && catsData.length > 0) {
          setDefaultCalendarId(catsData[0].id);
        }

        // Show welcome message
        toast.success(`Welkom terug, ${meData.name}!`);
      } else if (eventsRes.status === 401 || eventsRes.status === 403) {
        handleLogout();
      }
    } catch (err) {
      console.error("Failed to fetch data", err);
      toast.error('Failed to load data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = (userData: User, authToken: string) => {
    setUser(userData);
    setToken(authToken);
    localStorage.setItem('token', authToken);
    if (userData.authMethod) {
      setAuthMethod(userData.authMethod);
    }
    // Data will be fetched by effect
  };

  const handleLogout = () => {
    setUser(null);
    setToken(null);
    setEvents([]);
    setCategories([]);
    localStorage.removeItem('token');
    toast.info('Succesvol uitgelogd');
  };

  // Sync with CalDAV
  const handleSync = async () => {
    if (!token) return;
    
    try {
      setIsSyncing(true);
      const headers = { 'Authorization': `Bearer ${token}` };
      
      const response = await fetch('/api/sync', {
        method: 'POST',
        headers
      });
      
      const data = await response.json();
      
      if (response.ok) {
        toast.success(`Synchronisatie volgtooid: ${data.syncedCalendars} agenda's gesynchroniseerd`);
        // Refresh data
        await fetchAllData();
      } else {
        throw new Error(data.error || 'Synchronisatie mislukt');
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-t-[#C36322] border-gray-200 rounded-full animate-spin" />
          <p className="text-gray-500 font-medium">{isSyncing ? 'Synchroniseren met CalDAV...' : 'Agenda laden...'}</p>
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <>
        <AuthPage onLogin={handleLogin} />
        <Toaster position="bottom-right" richColors />
      </>
    );
  }

  const handleToggleCategory = async (id: string) => {
    const category = categories.find(c => c.id === id);
    if (!category) return;

    const updatedCategory = { ...category, isVisible: !category.isVisible };
    
    try {
      const headers = { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      };
      
      const res = await fetch(`/api/categories/${id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(updatedCategory)
      });

      if (res.ok) {
        setCategories(prev => prev.map(cat => cat.id === id ? updatedCategory : cat));
      }
    } catch (err) {
      toast.error("Kon categorie niet bijwerken");
    }
  };

  const handleAddEvent = () => {
    setSelectedEvent({
      start: new Date(currentDate),
      end: new Date(currentDate.getTime() + defaultDuration * 60 * 1000),
      calendarId: defaultCalendarId,
    });
    setIsDialogOpen(true);
  };

  const handleEditEvent = (event: CalendarEvent) => {
    setSelectedEvent(event);
    setIsDialogOpen(true);
  };

  const handleDateClick = (date: Date) => {
    setCurrentDate(date);
    setSelectedEvent({
      start: date,
      end: new Date(date.getTime() + defaultDuration * 60 * 1000),
      calendarId: defaultCalendarId,
    });
    setIsDialogOpen(true);
  };

  const handleSaveEvent = async (eventData: Partial<CalendarEvent>) => {
    try {
      const isNew = !eventData.id;
      const method = isNew ? 'POST' : 'PUT';
      const url = isNew ? '/api/events' : `/api/events/${eventData.id}`;
      const finalEvent = isNew ? { 
        ...eventData, 
        id: Math.random().toString(36).substr(2, 9) 
      } : eventData;

      const headers = { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      };
      
      const res = await fetch(url, {
        method,
        headers,
        body: JSON.stringify(finalEvent)
      });

      const data = await res.json();

      if (res.ok) {
        if (isNew) {
          setEvents(prev => [...prev, {
            ...(finalEvent as CalendarEvent),
            start: new Date(finalEvent.start as Date),
            end: new Date(finalEvent.end as Date)
          }]);
          toast.success('Afspraak aangemaakt');
        } else {
          setEvents(prev => prev.map(e => e.id === eventData.id ? (eventData as CalendarEvent) : e));
          toast.success('Afspraak bijgewerkt');
        }
        setIsDialogOpen(false);
      } else {
        throw new Error(data.error || "Opslaan mislukt");
      }
    } catch (err: any) {
      toast.error(err.message || "Kon afspraak niet opslaan");
    }
  };

  const handleDeleteEvent = async (id: string, calendarId: string) => {
    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      
      const res = await fetch(`/api/events/${id}?calendarId=${encodeURIComponent(calendarId)}`, {
        method: 'DELETE',
        headers
      });

      if (res.ok) {
        setEvents(prev => prev.filter(e => e.id !== id));
        toast.success('Afspraak verwijderd');
        setIsDialogOpen(false);
      }
    } catch (err) {
      toast.error("Kon afspraak niet verwijderen");
    }
  };

  const handleEventMove = async (eventId: string, newStart: Date, newEnd: Date) => {
    const event = events.find(e => e.id === eventId);
    if (!event) return;

    const updatedEvent = { ...event, start: newStart, end: newEnd };
    
    try {
      const headers = { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      };
      
      const res = await fetch(`/api/events/${eventId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(updatedEvent)
      });

      if (res.ok) {
        setEvents(prev => prev.map(e => e.id === eventId ? updatedEvent : e));
        toast.success('Afspraak verplaatst');
      }
    } catch (err) {
      toast.error("Kon afspraak niet verplaatsen");
    }
  };

  const updateSettings = async (newSettings: any) => {
    try {
      const headers = { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      };
      
      await fetch('/api/user/settings', {
        method: 'PUT',
        headers,
        body: JSON.stringify(newSettings)
      });
    } catch (err) {
      console.error("Failed to save settings", err);
      toast.error("Instellingen konden niet worden opgeslagen");
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 text-gray-900 overflow-hidden relative">
      <CalendarHeader 
        currentDate={currentDate}
        onNavigate={setCurrentDate}
        view={view}
        onViewChange={setView}
        onToday={() => setCurrentDate(startOfToday())}
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        user={user}
        onLogout={handleLogout}
        onSettings={() => setIsSettingsOpen(true)}
        isMockMode={isMockMode}
        isSyncing={isSyncing}
        onSync={handleSync}
        caldavConfigured={caldavConfigured}
      />
      
      <div className="flex flex-1 overflow-hidden relative">
        {/* Mobile Sidebar Overlay */}
        {isSidebarOpen && (
          <div 
            className="fixed inset-0 bg-black/50 z-20 lg:hidden"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}
        
        <div className={cn(
          "transition-all duration-300 ease-in-out z-30 shrink-0",
          "lg:relative lg:translate-x-0 lg:block",
          "fixed inset-y-0 left-0 translate-x-0 shadow-2xl lg:shadow-none",
          !isSidebarOpen && "-translate-x-full lg:hidden"
        )}>
          <CalendarSidebar 
            categories={categories}
            onToggleCategory={handleToggleCategory}
            selectedDate={currentDate}
            onDateChange={(date) => {
              date && setCurrentDate(date);
              // Close sidebar on mobile after selecting a date
              if (window.innerWidth < 1024) setIsSidebarOpen(false);
            }}
            onAddEvent={() => {
              handleAddEvent();
              if (window.innerWidth < 1024) setIsSidebarOpen(false);
            }}
            onLogout={handleLogout}
            onSettings={() => {
              setIsSettingsOpen(true);
              if (window.innerWidth < 1024) setIsSidebarOpen(false);
            }}
            onSync={handleSync}
            isSyncing={isSyncing}
          />
        </div>
        
        <main className="flex-1 flex flex-col min-w-0 bg-gray-50 overflow-hidden">
          <CalendarGrid 
            currentDate={currentDate}
            view={view}
            events={events}
            categories={categories}
            onEventClick={handleEditEvent}
            onDateClick={handleDateClick}
            onEventMove={handleEventMove}
            onNavigate={setCurrentDate}
            onViewChange={setView}
            highlightWeekends={highlightWeekends}
          />
        </main>
      </div>

      <EventDialog 
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        event={selectedEvent}
        categories={categories}
        onSave={handleSaveEvent}
        onDelete={handleDeleteEvent}
      />
      <Toaster position="bottom-right" richColors />

      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4 md:p-8">
          <div className="w-full h-full max-w-4xl bg-white rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <SettingsPage 
              categories={categories} 
              highlightWeekends={highlightWeekends}
              onUpdateHighlightWeekends={(val) => {
                setHighlightWeekends(val);
                updateSettings({ highlightWeekends: val, defaultCalendarId, defaultDuration, notificationThreshold });
              }}
              defaultCalendarId={defaultCalendarId}
              onUpdateDefaultCalendarId={(id) => {
                setDefaultCalendarId(id);
                updateSettings({ highlightWeekends, defaultCalendarId: id, defaultDuration, notificationThreshold });
              }}
              defaultDuration={defaultDuration}
              onUpdateDefaultDuration={(dur) => {
                setDefaultDuration(dur);
                updateSettings({ highlightWeekends, defaultCalendarId, defaultDuration: dur, notificationThreshold });
              }}
              notificationThreshold={notificationThreshold}
              onUpdateNotificationThreshold={(threshold) => {
                setNotificationThreshold(threshold);
                updateSettings({ highlightWeekends, defaultCalendarId, defaultDuration, notificationThreshold: threshold });
              }}
              onUpdateCategories={(newCats) => {
                setCategories(newCats);
                setIsSettingsOpen(false);
              }}
              onImportEvents={(newEvents) => {
                setEvents(prev => [...prev, ...newEvents]);
              }}
              onClose={() => setIsSettingsOpen(false)} 
              token={token}
            />
          </div>
        </div>
      )}
    </div>
  );
}
