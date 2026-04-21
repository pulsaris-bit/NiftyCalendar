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
import { CalendarEvent, CalendarView, CalendarCategory } from './types';
import { INITIAL_EVENTS, INITIAL_CATEGORIES } from './constants';
import { Toaster, toast } from 'sonner';
import { startOfToday } from 'date-fns';
import { cn } from '@/lib/utils';

export default function App() {
  const [user, setUser] = React.useState<{ email: string; name: string; id: number } | null>(null);
  const [currentDate, setCurrentDate] = React.useState(startOfToday());
  const [view, setView] = React.useState<CalendarView>('month');
  const [events, setEvents] = React.useState<CalendarEvent[]>(INITIAL_EVENTS);
  const [categories, setCategories] = React.useState<CalendarCategory[]>(INITIAL_CATEGORIES);
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(true);
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);
  const [highlightWeekends, setHighlightWeekends] = React.useState(false);
  const [defaultCalendarId, setDefaultCalendarId] = React.useState<string>(INITIAL_CATEGORIES[0].id);
  const [defaultDuration, setDefaultDuration] = React.useState<number>(60);
  const [selectedEvent, setSelectedEvent] = React.useState<Partial<CalendarEvent> | null>(null);

  const handleLogin = (userData: { email: string; name: string }) => {
    setUser(userData);
    toast.success(`Welkom terug, ${userData.name}!`);
  };

  const handleLogout = () => {
    setUser(null);
    toast.info('Succesvol uitgelogd');
  };

  if (!user) {
    return (
      <>
        <AuthPage onLogin={handleLogin} />
        <Toaster position="bottom-right" richColors />
      </>
    );
  }

  const handleToggleCategory = (id: string) => {
    setCategories(prev => prev.map(cat => 
      cat.id === id ? { ...cat, isVisible: !cat.isVisible } : cat
    ));
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

  const handleSaveEvent = (eventData: Partial<CalendarEvent>) => {
    if (eventData.id) {
      setEvents(prev => prev.map(e => e.id === eventData.id ? (eventData as CalendarEvent) : e));
      toast.success('Afspraak bijgewerkt');
    } else {
      const newEvent: CalendarEvent = {
        ...(eventData as Omit<CalendarEvent, 'id'>),
        id: Math.random().toString(36).substr(2, 9),
      };
      setEvents(prev => [...prev, newEvent]);
      toast.success('Afspraak aangemaakt');
    }
    setIsDialogOpen(false);
  };

  const handleDeleteEvent = (id: string) => {
    setEvents(prev => prev.filter(e => e.id !== id));
    toast.success('Afspraak verwijderd');
    setIsDialogOpen(false);
  };

  const handleEventMove = (eventId: string, newStart: Date, newEnd: Date) => {
    setEvents(prev => prev.map(event => 
      event.id === eventId ? { ...event, start: newStart, end: newEnd } : event
    ));
    toast.success('Afspraak verplaatst');
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
              onUpdateHighlightWeekends={setHighlightWeekends}
              defaultCalendarId={defaultCalendarId}
              onUpdateDefaultCalendarId={setDefaultCalendarId}
              defaultDuration={defaultDuration}
              onUpdateDefaultDuration={setDefaultDuration}
              onUpdateCategories={(newCats) => {
                setCategories(newCats);
                // Ensure default calendar is still valid
                if (!newCats.find(c => c.id === defaultCalendarId) && newCats.length > 0) {
                  setDefaultCalendarId(newCats[0].id);
                }
                toast.success('Instellingen opgeslagen');
              }}
              onImportEvents={(newEvents) => {
                setEvents(prev => [...prev, ...newEvents]);
              }}
              onClose={() => setIsSettingsOpen(false)} 
            />
          </div>
        </div>
      )}
    </div>
  );
}
