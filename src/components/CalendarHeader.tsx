/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as React from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  Menu, 
  Search, 
  Settings, 
  HelpCircle,
  Calendar as CalendarIcon,
  Bell
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CalendarView } from '@/src/types';
import { format, addMonths, subMonths, addWeeks, subWeeks, addDays, subDays, startOfWeek, endOfWeek, isSameMonth } from 'date-fns';
import { nl } from 'date-fns/locale';
import { Input } from '@/components/ui/input';

import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface CalendarHeaderProps {
  currentDate: Date;
  onNavigate: (date: Date) => void;
  view: CalendarView;
  onViewChange: (view: CalendarView) => void;
  onToday: () => void;
  onToggleSidebar: () => void;
  user: { name: string; email: string } | null;
  onLogout: () => void;
  onSettings: () => void;
  isMockMode?: boolean;
}

export function CalendarHeader({
  currentDate,
  onNavigate,
  view,
  onViewChange,
  onToday,
  onToggleSidebar,
  user,
  onLogout,
  onSettings,
  isMockMode = false
}: CalendarHeaderProps) {
  const handlePrev = () => {
    if (view === 'month' || view === 'agenda') onNavigate(subMonths(currentDate, 1));
    else if (view === 'week') onNavigate(subWeeks(currentDate, 1));
    else if (view === 'day') onNavigate(subDays(currentDate, 1));
  };

  const handleNext = () => {
    if (view === 'month' || view === 'agenda') onNavigate(addMonths(currentDate, 1));
    else if (view === 'week') onNavigate(addWeeks(currentDate, 1));
    else if (view === 'day') onNavigate(addDays(currentDate, 1));
  };

  const getTitle = () => {
    if (view === 'month' || view === 'agenda') return format(currentDate, 'MMMM yyyy', { locale: nl });
    if (view === 'week') {
      const start = startOfWeek(currentDate, { locale: nl });
      const end = endOfWeek(currentDate, { locale: nl });
      if (isSameMonth(start, end)) return format(currentDate, 'MMMM yyyy', { locale: nl });
      return `${format(start, 'MMM', { locale: nl })} - ${format(end, 'MMM yyyy', { locale: nl })}`;
    }
    return format(currentDate, 'd MMMM yyyy', { locale: nl });
  };

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-1.5 sm:px-4 shadow-sm relative z-40 sticky top-0 overflow-hidden">
      <div className="flex items-center gap-1 sm:gap-6 min-w-0">
        <Button variant="ghost" size="icon" onClick={onToggleSidebar} className="text-gray-500 h-9 w-9 shrink-0">
          <Menu className="h-5 w-5" />
        </Button>

        <div className="flex items-center gap-2 shrink-0">
          <div className="w-8 h-8 bg-[#C36322] rounded-lg flex items-center justify-center text-white font-bold shadow-sm shrink-0">
            N
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold tracking-tight text-slate-700 hidden md:inline truncate leading-tight">
              NiftyCalendar
            </span>
            {isMockMode && (
              <span className="text-[8px] bg-amber-100 text-amber-700 px-1 rounded font-bold w-fit leading-none py-0.5 ml-0 md:ml-0.5">MOCK</span>
            )}
          </div>
        </div>

        <div className="hidden lg:flex bg-gray-100 p-1 rounded-md text-sm">
          <button 
            onClick={() => onViewChange('day')}
            className={`px-4 py-1 rounded transition-all ${view === 'day' ? 'bg-white shadow-sm font-medium' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Dag
          </button>
          <button 
            onClick={() => onViewChange('week')}
            className={`px-4 py-1 rounded transition-all ${view === 'week' ? 'bg-white shadow-sm font-medium' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Week
          </button>
          <button 
            onClick={() => onViewChange('month')}
            className={`px-4 py-1 rounded transition-all ${view === 'month' ? 'bg-white shadow-sm font-medium' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Maand
          </button>
          <button 
            onClick={() => onViewChange('agenda')}
            className={`px-4 py-1 rounded transition-all ${view === 'agenda' ? 'bg-white shadow-sm font-medium' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Agenda
          </button>
        </div>

        <div className="flex items-center gap-0 sm:gap-0.5 sm:ml-2 shrink-0">
          <Button variant="ghost" size="sm" onClick={onToday} className="h-8 text-[10px] sm:text-xs font-bold text-slate-600 hover:bg-slate-100 px-1.5 sm:px-3 mr-1 sm:mr-2 border border-slate-200 bg-white shadow-sm shrink-0">
            <span className="hidden xs:inline">Vandaag</span>
            <CalendarIcon className="h-3 w-3 xs:hidden" />
          </Button>
          <div className="flex items-center shrink-0">
            <Button variant="ghost" size="icon" onClick={handlePrev} className="h-8 w-7 sm:w-8 text-gray-400 hover:text-gray-600">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-[10px] sm:text-sm font-bold text-slate-800 min-w-[80px] sm:min-w-[140px] text-center tracking-tight truncate">
              {getTitle()}
            </span>
            <Button variant="ghost" size="icon" onClick={handleNext} className="h-8 w-7 sm:w-8 text-gray-400 hover:text-gray-600">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-0.5 sm:gap-1">
        <div className="relative group hidden lg:block">
          <Input 
            placeholder="Afspraken zoeken..." 
            className="pl-8 pr-4 py-1.5 bg-gray-50 border border-gray-200 rounded-md text-sm focus-visible:ring-2 focus-visible:ring-[#C36322] w-48 xl:w-64 h-9 transition-all"
          />
          <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-gray-400 group-focus-within:text-[#C36322] transition-colors" />
        </div>

        <div className="flex items-center gap-0 sm:gap-1 shrink-0 ml-auto">
          <div className="lg:hidden shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="text-gray-400 h-9 w-8 sm:w-9">
                  <CalendarIcon className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onViewChange('day')} className={view === 'day' ? 'bg-slate-50 font-bold' : ''}>Dag</DropdownMenuItem>
                <DropdownMenuItem onClick={() => onViewChange('week')} className={view === 'week' ? 'bg-slate-50 font-bold' : ''}>Week</DropdownMenuItem>
                <DropdownMenuItem onClick={() => onViewChange('month')} className={view === 'month' ? 'bg-slate-50 font-bold' : ''}>Maand</DropdownMenuItem>
                <DropdownMenuItem onClick={() => onViewChange('agenda')} className={view === 'agenda' ? 'bg-slate-50 font-bold' : ''}>Agenda</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          
          <Button variant="ghost" size="icon" className="text-gray-400 h-9 w-9 hidden sm:flex shrink-0">
            <Bell className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" className="text-gray-400 h-9 w-9 hidden sm:flex shrink-0" onClick={onSettings}>
            <Settings className="h-5 w-5" />
          </Button>
          
          <DropdownMenu>
            <DropdownMenuTrigger className="w-8 h-8 rounded-full bg-slate-200 border border-slate-300 flex items-center justify-center text-[10px] sm:text-xs font-extrabold text-slate-600 ml-1 sm:ml-2 hover:ring-2 hover:ring-[#C36322]/20 transition-all outline-none shrink-0">
              {user?.name.split(' ').map(n => n[0]).join('').toUpperCase() || 'SJ'}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 p-2 rounded-xl shadow-xl border-gray-100">
              <div className="px-2 py-2 mb-2">
                <p className="text-sm font-bold text-slate-800">{user?.name}</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">{user?.email}</p>
              </div>
              <DropdownMenuItem 
                className="rounded-lg text-sm font-medium focus:bg-gray-50 focus:text-[#C36322] cursor-pointer"
                onClick={onSettings}
              >
                Instellingen
              </DropdownMenuItem>
              <DropdownMenuItem className="rounded-lg text-sm font-medium focus:bg-gray-50 focus:text-[#C36322] cursor-pointer text-red-500 focus:text-red-600" onClick={onLogout}>
                Uitloggen
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
