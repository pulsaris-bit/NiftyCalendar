/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as React from 'react';
import { Plus, Calendar as CalendarIcon, Check, Settings, HelpCircle, ChevronLeft, ChevronRight, LogOut, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { CalendarCategory } from '@/src/types';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { format, subMonths, addMonths } from 'date-fns';
import { nl } from 'date-fns/locale';

interface CalendarSidebarProps {
  categories: CalendarCategory[];
  onToggleCategory: (id: string) => void;
  selectedDate: Date;
  onDateChange: (date: Date | undefined) => void;
  onAddEvent: () => void;
  onLogout: () => void;
  onSettings: () => void;
  onSync?: () => void;
  isSyncing?: boolean;
}

export function CalendarSidebar({
  categories,
  onToggleCategory,
  selectedDate,
  onDateChange,
  onAddEvent,
  onLogout,
  onSettings,
  onSync,
  isSyncing = false
}: CalendarSidebarProps) {
  const [viewMonth, setViewMonth] = React.useState(selectedDate);

  // Sync view month when selected date changes from outside (e.g. Header nav)
  React.useEffect(() => {
    setViewMonth(selectedDate);
  }, [selectedDate]);

  return (
    <aside className="w-64 bg-[#1c1917] border-r border-stone-800 flex flex-col h-full overflow-hidden shadow-xl">
      <div className="p-4 shrink-0">
        <div className="flex gap-2">
          <Button 
            onClick={onAddEvent}
            className="flex-1 bg-[#C36322] hover:bg-[#a6541d] text-white font-medium py-2 rounded-md shadow-lg shadow-black/20 transition-all active:scale-95 h-10 border-0"
          >
            <Plus className="h-4 w-4 mr-2" />
            <span className="text-sm">Afspraak maken</span>
          </Button>
          
          {/* Sync Button - show if configured */}
          {onSync && (
            <Button
              onClick={onSync}
              variant="outline"
              size="icon"
              className="h-10 w-10 border-0 bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white transition-all"
              disabled={isSyncing}
              title="Synchroniseren met CalDAV"
            >
              <RefreshCw className={`h-5 w-5 ${isSyncing ? 'animate-spin' : ''}`} />
            </Button>
          )}
        </div>
      </div>

      <div className="px-4 pb-4 border-b border-stone-800 flex flex-col shrink-0">
        <div className="flex justify-between items-center mb-3 px-1 text-stone-200">
          <span className="font-semibold text-sm uppercase tracking-tight">
            {format(viewMonth, 'MMMM yyyy', { locale: nl })}
          </span>
          <div className="flex gap-2 text-stone-500">
             <ChevronLeft 
              className="w-4 h-4 cursor-pointer hover:text-stone-200 transition-colors" 
              onClick={() => setViewMonth(subMonths(viewMonth, 1))}
             />
             <ChevronRight 
              className="w-4 h-4 cursor-pointer hover:text-stone-200 transition-colors" 
              onClick={() => setViewMonth(addMonths(viewMonth, 1))}
             />
          </div>
        </div>
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={onDateChange}
          month={viewMonth}
          onMonthChange={setViewMonth}
          showOutsideDays={false}
          locale={nl}
          className="rounded-md border-0 bg-transparent p-0 scale-[0.9] origin-top -mt-2"
          classNames={{
            day_selected: "bg-[#C36322] text-white hover:bg-[#C36322] hover:text-white focus:bg-[#C36322] focus:text-white rounded-full",
            day_today: "bg-stone-800 text-stone-100 rounded-full font-bold",
            head_cell: "text-stone-600 font-bold text-[10px] uppercase w-8 h-8",
            day: "h-8 w-8 text-xs p-0 font-normal text-stone-400 aria-selected:opacity-100 hover:bg-stone-800 hover:text-stone-200 rounded-full",
            nav: "hidden",
            table: "w-full border-collapse space-y-1",
          }}
        />
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-4 flex flex-col gap-6">
          <div>
            <h3 className="text-[10px] font-bold uppercase text-stone-500 tracking-widest mb-3 px-1">
              Mijn agenda's
            </h3>
            <div className="flex flex-col gap-1">
              {categories.map((category) => (
                <div
                  key={category.id}
                  className="flex items-center justify-between p-1.5 rounded-md hover:bg-stone-800/50 cursor-pointer group transition-all"
                  onClick={() => onToggleCategory(category.id)}
                >
                  <div className="flex items-center gap-2">
                    <Checkbox 
                      id={category.id} 
                      checked={category.isVisible} 
                      className="w-4 h-4 rounded text-[#C36322] border-stone-700 bg-stone-900"
                    />
                    <div className="w-3 h-3 rounded-full shrink-0 shadow-sm" style={{ backgroundColor: category.color }} />
                    <label 
                      htmlFor={category.id}
                      className="text-sm text-stone-300 group-hover:text-stone-100 cursor-pointer select-none truncate transition-colors"
                    >
                      {category.name}
                    </label>
                    {category.isCaldav && (
                      <span className="text-[8px] bg-green-600/20 text-green-400 px-1 rounded font-bold">CalDAV</span>
                    )}
                    {category.syncEnabled === false && (
                      <span className="text-[8px] bg-amber-600/20 text-amber-400 px-1 rounded font-bold">Lokaal</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </ScrollArea>

      <div className="p-2 border-t border-stone-800 shrink-0">
        <div className="flex gap-1 px-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onSettings}
            className="flex-1 h-8 text-stone-400 hover:text-stone-200 hover:bg-stone-800 transition-all"
            title="Instellingen"
          >
            <Settings className="h-4 w-4 mr-1" />
            <span className="text-xs">Instellingen</span>
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={onLogout}
            className="flex-1 h-8 text-stone-400 hover:text-red-400 hover:bg-red-900/20 transition-all"
            title="Uitloggen"
          >
            <LogOut className="h-4 w-4 mr-1" />
            <span className="text-xs">Uitloggen</span>
          </Button>
        </div>
      </div>
    </aside>
  );
}
