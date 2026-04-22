/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as React from 'react';
import { Calendar as CalendarIcon, MapPin, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  isSameMonth, 
  isSameDay, 
  isToday, 
  startOfDay, 
  endOfDay, 
  isWithinInterval,
  addDays,
  addMonths,
  subMonths,
  isWeekend
} from 'date-fns';
import { nl } from 'date-fns/locale';
import { CalendarEvent, CalendarCategory, CalendarView } from '@/src/types';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { 
  DndContext, 
  useDraggable, 
  useDroppable, 
  DragEndEvent,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragStartEvent
} from '@dnd-kit/core';

interface CalendarGridProps {
  currentDate: Date;
  view: CalendarView;
  events: CalendarEvent[];
  categories: CalendarCategory[];
  onEventClick: (event: CalendarEvent) => void;
  onDateClick: (date: Date) => void;
  onEventMove: (eventId: string, newStart: Date, newEnd: Date) => void;
  onNavigate?: (date: Date) => void;
  onViewChange?: (view: CalendarView) => void;
  highlightWeekends: boolean;
}

interface DraggableEventProps {
  event: CalendarEvent;
  children: React.ReactNode;
  styles?: React.CSSProperties;
  className?: string;
  key?: React.Key;
}

function DraggableEvent({ 
  event, 
  children, 
  styles, 
  className 
}: DraggableEventProps) {
  const {attributes, listeners, setNodeRef, transform, isDragging} = useDraggable({
    id: event.id,
    data: { event }
  });

  const style: React.CSSProperties = {
    ...styles,
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.5 : undefined,
    zIndex: isDragging ? 1000 : undefined,
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      {...listeners} 
      {...attributes} 
      className={cn(
        styles?.position === 'absolute' ? 'absolute' : 'relative',
        className
      )}
    >
      {children}
    </div>
  );
}

interface DroppableColumnProps {
  id: string;
  children: React.ReactNode;
  date: Date;
  className?: string;
  onClick?: () => void;
  key?: React.Key;
}

function DroppableColumn({ id, children, date, className, onClick }: DroppableColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id,
    data: { date }
  });

  return (
    <div 
      ref={setNodeRef} 
      className={cn(className, isOver && "bg-[#C36322]/5 transition-colors")}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

function NowIndicator() {
  const [top, setTop] = React.useState(0);

  React.useEffect(() => {
    const update = () => {
      const now = new Date();
      setTop(now.getHours() * 60 + now.getMinutes());
    };
    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div 
      className="absolute left-0 right-0 z-40 flex items-center pointer-events-none"
      style={{ top: `${top}px` }}
    >
      <div className="w-2 h-2 rounded-full bg-red-500 -ml-1" />
      <div className="flex-1 h-px bg-red-500/50" />
    </div>
  );
}

export function CalendarGrid({
  currentDate,
  view,
  events,
  categories,
  onEventClick,
  onDateClick,
  onEventMove,
  onNavigate,
  onViewChange,
  highlightWeekends
}: CalendarGridProps) {
  const [selectedMobileDate, setSelectedMobileDate] = React.useState(currentDate);
  const scrollAreaRef = React.useRef<HTMLDivElement>(null);
  const agendaScrollRef = React.useRef<HTMLDivElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 6,
      },
    })
  );

  const scrollToCurrentTime = React.useCallback((instant = false) => {
    setTimeout(() => {
      if (scrollAreaRef.current) {
        const viewport = scrollAreaRef.current.querySelector('[data-slot="scroll-area-viewport"]');
        if (viewport) {
          const now = new Date();
          const minutes = now.getHours() * 60 + now.getMinutes();
          // Center the current time in the viewport
          const scrollPos = Math.max(0, minutes - (viewport.clientHeight / 2)); 
          viewport.scrollTo({
            top: scrollPos,
            behavior: instant ? 'auto' : 'smooth'
          });
        }
      }
    }, 100);
  }, []);

  const scrollToNextAgendaEvent = React.useCallback(() => {
    setTimeout(() => {
      if (agendaScrollRef.current) {
        const viewport = agendaScrollRef.current.querySelector('[data-slot="scroll-area-viewport"]');
        if (viewport) {
          const now = new Date();
          const items = viewport.querySelectorAll('[data-agenda-event]');
          let targetEl: HTMLElement | null = null;
          
          for (const item of Array.from(items) as HTMLElement[]) {
            const startTimeStr = item.getAttribute('data-start');
            if (startTimeStr) {
               const startTime = new Date(startTimeStr);
               // If after now or starts now
               if (startTime >= now || isSameDay(startTime, now)) {
                  targetEl = item;
                  break;
               }
            }
          }
          
          if (targetEl) {
             const top = targetEl.offsetTop - 20;
             viewport.scrollTo({ top, behavior: 'smooth' });
          }
        }
      }
    }, 200);
  }, []);

  // UseEffect to scroll when entering day/week/agenda view
  React.useEffect(() => {
    if (view === 'day' || view === 'week') {
      // If it's today being viewed, scroll to current time
      const isTodayViewed = view === 'day' ? isToday(currentDate) : true; 
      if (isTodayViewed) {
        scrollToCurrentTime(true);
      }
    } else if (view === 'agenda') {
      scrollToNextAgendaEvent();
    }
  }, [view, currentDate, scrollToCurrentTime, scrollToNextAgendaEvent]);

  // Update selected mobile date when currentDate changes (e.g. via navigation)
  React.useEffect(() => {
    setSelectedMobileDate(currentDate);
  }, [currentDate]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const draggedEvent = active.data.current?.event as CalendarEvent;
    const targetDate = over.data.current?.date as Date;

    if (!draggedEvent || !targetDate) return;

    const category = categories.find(c => c.id === draggedEvent.calendarId);
    if (category && category.canEdit === false) {
      toast.error("Je hebt geen rechten om afspraken in deze agenda te wijzigen.");
      return;
    }

    const droppableRect = over.rect;
    const activeRect = active.rect.current.translated;
    
    if (!activeRect || !droppableRect) return;

    // Calculate relative Y within the day column
    const relativeY = activeRect.top - droppableRect.top;
    
    // 60px = 60 minutes. Snap to 15-minute intervals for better UX
    const totalMinutes = Math.max(0, Math.min(1439, Math.round((relativeY / 60) * 4) * 15));
    
    const newStart = startOfDay(targetDate);
    newStart.setHours(Math.floor(totalMinutes / 60));
    newStart.setMinutes(totalMinutes % 60);

    const duration = draggedEvent.end.getTime() - draggedEvent.start.getTime();
    const newEnd = new Date(newStart.getTime() + duration);

    onEventMove(draggedEvent.id, newStart, newEnd);
  };

  const getFilteredEvents = () => {
    return events.filter(event => {
      const category = categories.find(c => c.id === event.calendarId);
      return category?.isVisible;
    });
  };

  const getEventsForDay = (date: Date) => {
    return getFilteredEvents().filter(event => isSameDay(event.start, date))
      .sort((a, b) => a.start.getTime() - b.start.getTime());
  };

  const renderEventPill = (event: CalendarEvent) => {
    const category = categories.find(c => c.id === event.calendarId);
    return (
      <div
        key={event.id}
        onClick={(e) => {
          e.stopPropagation();
          onEventClick(event);
        }}
        className="text-[11px] leading-tight px-1.5 py-0.5 rounded-[3px] border-l-[3px] truncate transition-all flex items-center gap-1 hover:brightness-95 mb-0.5"
        style={{ 
          backgroundColor: category?.color + '15',
          borderLeftColor: category?.color,
          color: category?.color
        }}
      >
        {!event.isAllDay && (
          <span className="opacity-70 font-semibold shrink-0">
            {format(event.start, 'HH:mm')}
          </span>
        )}
        <span className="font-medium truncate text-gray-800">
          {event.title}
        </span>
      </div>
    );
  };

  if (view === 'month') {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart, { locale: nl });
    const endDate = endOfWeek(monthEnd, { locale: nl });
    const days = eachDayOfInterval({ start: startDate, end: endDate });
    const weekDays = ['MA', 'DI', 'WO', 'DO', 'VR', 'ZA', 'ZO'];

    const handleSwipe = (e: any, info: any) => {
      if (!onNavigate) return;
      const threshold = 50;
      if (info.offset.x > threshold) {
        onNavigate(subMonths(currentDate, 1));
      } else if (info.offset.x < -threshold) {
        onNavigate(addMonths(currentDate, 1));
      }
    };

    return (
      <div className="flex-1 flex flex-col min-h-0 bg-white overflow-hidden">
        {/* Month Header & Grid */}
        <div className="lg:flex-1 flex flex-col min-h-0">
          <div className="flex border-b border-gray-200 bg-white shadow-sm z-20">
            <div className="w-8 shrink-0 flex items-center justify-center bg-gray-50/50 border-r border-gray-100 text-[8px] font-bold text-gray-300 uppercase vertical-rl">
              Wk
            </div>
            <div className="flex-1 grid grid-cols-7">
              {weekDays.map(day => (
                <div key={day} className="py-2 text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                  {day}
                </div>
              ))}
            </div>
          </div>
          
          <motion.div 
            className="flex-1 lg:overflow-hidden bg-white touch-none"
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.2}
            onDragEnd={handleSwipe}
          >
            <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
              <div className="flex h-full min-h-[300px]">
                <div className="w-8 shrink-0 flex flex-col divide-y divide-gray-100 bg-gray-50/30 border-r border-gray-100">
                  {[0, 1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="flex-1 flex items-center justify-center text-[10px] font-bold text-gray-400 bg-gray-50/20 lowercase">
                      {days[i * 7] ? format(days[i * 7], 'w', { locale: nl }) : ''}
                    </div>
                  ))}
                </div>
                <div className="flex-1 grid grid-cols-7 grid-rows-6 auto-rows-fr h-full divide-x divide-y divide-gray-100">
                  {days.map((day, idx) => {
                    const dayEvents = getEventsForDay(day);
                    const isSelected = isSameDay(day, selectedMobileDate);
                    const isCurrentMonth = isSameMonth(day, monthStart);

                    return (
                      <DroppableColumn 
                        key={day.toString()} 
                        id={`month-day-${day.toISOString()}`}
                        date={day}
                        className={cn(
                          "min-h-0 p-1 transition-all cursor-pointer group flex flex-col relative",
                          !isCurrentMonth && "bg-gray-50/30",
                          isToday(day) && "bg-[#C36322]/5",
                          highlightWeekends && isWeekend(day) && isCurrentMonth && "bg-yellow-50/50",
                          isSelected && "lg:bg-gray-50/50"
                        )}
                        onClick={() => {
                          if (window.innerWidth < 1024) {
                            setSelectedMobileDate(day);
                          } else {
                            onDateClick(day);
                          }
                        }}
                      >
                        {isSelected && (
                          <div className="absolute inset-0 border-2 border-[#C36322] lg:hidden z-10 pointer-events-none rounded-sm" />
                        )}

                        <div className="flex justify-center lg:justify-start items-center p-1 mb-0.5 lg:mb-1">
                          <span className={cn(
                            "text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full transition-colors",
                            !isCurrentMonth ? "text-gray-300" : "text-slate-600",
                            isToday(day) ? "bg-[#C36322] text-white shadow-sm" : "",
                            isSelected && !isToday(day) ? "bg-slate-100 text-slate-900 lg:bg-transparent lg:text-slate-600" : ""
                          )}>
                            {format(day, 'd')}
                          </span>
                        </div>

                        <ScrollArea className="flex-1 hidden lg:block overflow-hidden">
                          <div className="flex flex-col pr-1">
                            {dayEvents.map(event => (
                              <DraggableEvent key={event.id} event={event}>
                                {renderEventPill(event)}
                              </DraggableEvent>
                            ))}
                          </div>
                        </ScrollArea>

                        <div className="lg:hidden flex flex-wrap justify-center gap-0.5 mt-auto pb-1 px-1">
                          {dayEvents.slice(0, 4).map((event, i) => {
                            const category = categories.find(c => c.id === event.calendarId);
                            return (
                              <div 
                                key={event.id}
                                className="w-1.5 h-1.5 rounded-full"
                                style={{ backgroundColor: category?.color }}
                              />
                            );
                          })}
                          {dayEvents.length > 4 && (
                            <div className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                          )}
                        </div>
                      </DroppableColumn>
                    );
                  })}
                </div>
              </div>
            </DndContext>
          </motion.div>
        </div>

        {/* Mobile Detail List */}
        <div className="lg:hidden flex-1 flex flex-col bg-gray-50 border-t border-gray-200 min-h-0">
          <header className="px-4 py-2 bg-white border-b border-gray-100 flex items-center justify-between shrink-0">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              {format(selectedMobileDate, 'd MMMM', { locale: nl })}
            </h3>
            <div className="flex items-center gap-2">
              <Button 
                variant="ghost" 
                size="icon-sm" 
                className="h-6 w-6 text-[#C36322]"
                onClick={() => onDateClick(selectedMobileDate)}
              >
                <Plus className="w-4 h-4" />
              </Button>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-6 text-[10px] font-bold text-[#C36322] uppercase tracking-tighter"
                onClick={() => {
                  if (onNavigate) onNavigate(selectedMobileDate);
                  if (onViewChange) onViewChange('day');
                }}
              >
                Bekijk Dag
              </Button>
            </div>
          </header>
          <ScrollArea className="flex-1 p-4 scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
             <div className="flex flex-col gap-2">
                {getEventsForDay(selectedMobileDate).map(event => {
                   const category = categories.find(c => c.id === event.calendarId);
                   return (
                     <div 
                       key={event.id}
                       onClick={() => onEventClick(event)}
                       className="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-100 shadow-sm active:scale-95 transition-transform"
                     >
                        <div className="w-1 h-8 rounded-full" style={{ backgroundColor: category?.color }} />
                        <div className="flex-1 min-w-0">
                           <p className="text-xs font-bold text-slate-800 truncate">{event.title}</p>
                           <p className="text-[10px] text-slate-400 font-medium">
                             {event.isAllDay ? 'Hele dag' : format(event.start, 'HH:mm')}
                           </p>
                        </div>
                     </div>
                   );
                })}
                {getEventsForDay(selectedMobileDate).length === 0 && (
                  <p className="text-[10px] text-slate-400 font-medium italic text-center py-8">Geen afspraken voor deze dag.</p>
                )}
             </div>
          </ScrollArea>
        </div>
      </div>
    );
  }

  if (view === 'week') {
    const startDate = startOfWeek(currentDate, { locale: nl });
    const endDate = endOfWeek(currentDate, { locale: nl });
    const days = eachDayOfInterval({ start: startDate, end: endDate });
    const hours = Array.from({ length: 24 }, (_, i) => i);

    const getEventStyles = (event: CalendarEvent) => {
      if (event.isAllDay) return {};
      const startHour = event.start.getHours();
      const startMin = event.start.getMinutes();
      const endHour = event.end.getHours();
      const endMin = event.end.getMinutes();
      
      const top = (startHour * 60 + startMin) * (60 / 60); // 60px per hour
      const duration = ((endHour * 60 + endMin) - (startHour * 60 + startMin)) * (60 / 60);
      
      return {
        top: `${top}px`,
        height: `${Math.max(duration, 30)}px`,
        position: 'absolute' as const,
      };
    };

    return (
      <div className="flex-1 flex flex-col h-full min-h-0 bg-white lg:overflow-hidden">
        <div className="bg-white border-b border-gray-100 py-2 flex items-center justify-center gap-4 lg:min-w-[850px] lg:pl-[64px] shadow-sm z-20 shrink-0">
          <span className="text-[10px] font-black text-[#C36322] uppercase tracking-[0.2em] bg-orange-50 px-3 py-1 rounded-full border border-orange-100">
            Week {format(startDate, 'w', { locale: nl })}
          </span>
        </div>
        
        {/* Desktop Grid */}
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="hidden lg:flex flex-col flex-1 h-full min-h-0 min-w-[900px]">
            {/* Header row + All Day Section */}
            <div className="flex flex-col bg-white border-b border-gray-100 pr-4 shrink-0 shadow-sm z-30">
               {/* Day labels */}
               <div className="flex">
                  <div className="w-[64px] shrink-0 border-r border-gray-100" />
                  <div className="flex-1 grid grid-cols-7 divide-x divide-gray-50 uppercase text-[10px] font-bold text-gray-400">
                     {days.map(day => (
                       <div key={day.toString()} className="py-3 flex flex-col items-center gap-1">
                          <span>{format(day, 'EEE', { locale: nl })}</span>
                          <span className={cn(
                            "text-lg w-8 h-8 flex items-center justify-center rounded-full transition-colors",
                            isToday(day) ? "bg-[#C36322] text-white shadow-sm" : "text-slate-700"
                          )}>
                            {format(day, 'd')}
                          </span>
                       </div>
                     ))}
                  </div>
               </div>

               {/* All day events row */}
               <div className="flex border-t border-gray-50 min-h-[40px]">
                  <div className="w-[64px] shrink-0 border-r border-gray-100 flex items-center justify-center">
                    <span className="text-[10px] font-extrabold text-gray-300 uppercase [writing-mode:vertical-rl] rotate-180">Hele dag</span>
                  </div>
                  <div className="flex-1 grid grid-cols-7 divide-x divide-gray-100">
                     {days.map(day => {
                        const dayEvents = getFilteredEvents().filter(e => isSameDay(e.start, day) && e.isAllDay);
                        return (
                          <div key={day.toString()} className="p-1 flex flex-col gap-1 min-h-[40px]">
                             {dayEvents.map(event => {
                                const category = categories.find(c => c.id === event.calendarId);
                                return (
                                  <div 
                                    key={event.id}
                                    onClick={(e) => { e.stopPropagation(); onEventClick(event); }}
                                    className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-orange-100 border-l-2 border-[#C36322] text-[#C36322] truncate cursor-pointer hover:brightness-95 transition-all"
                                  >
                                     {event.title}
                                  </div>
                                );
                             })}
                          </div>
                        );
                     })}
                  </div>
               </div>
            </div>

            <div className="flex-1 relative min-h-0 h-full">
              <div ref={scrollAreaRef as any} className="absolute inset-0 bg-white w-full h-full overflow-y-auto scroll-smooth">
                <div className="flex h-[1440px] relative"> {/* 24 * 60px */}
                {/* Hours Column */}
                <div className="w-[64px] shrink-0 bg-gray-50/50 border-r border-gray-100 flex flex-col divide-y divide-gray-100/50">
                  {hours.map(hour => (
                    <div key={hour} className="h-[60px] pr-2 text-right">
                      <span className="text-[10px] font-bold text-gray-400 relative top-[-6px]">
                        {hour.toString().padStart(2, '0')}:00
                      </span>
                    </div>
                  ))}
                </div>

                {/* Grid Content */}
                <div className="flex-1 grid grid-cols-7 divide-x divide-gray-100 relative">
                   {/* Background hour lines */}
                   <div className="absolute inset-0 flex flex-col pointer-events-none">
                      {hours.map(hour => (
                        <div key={hour} className="h-[60px] border-b border-gray-50" />
                      ))}
                   </div>

                   {/* Day Columns */}
                   {days.map(day => {
                      const dayEvents = getFilteredEvents().filter(e => isSameDay(e.start, day));
                      const timedEvents = dayEvents.filter(e => !e.isAllDay);

                      return (
                        <DroppableColumn 
                          key={day.toString()} 
                          id={`week-day-${day.toISOString()}`}
                          date={day}
                          className={cn(
                            "relative h-full transition-colors hover:bg-gray-50/30",
                            isToday(day) && "bg-orange-50/5",
                            highlightWeekends && isWeekend(day) && "bg-yellow-50/30"
                          )}
                          onClick={() => onDateClick(day)}
                        >
                           {/* Now Indicator for today */}
                           {isToday(day) && <NowIndicator />}

                           {/* Timed Events Container */}
                           <div className="relative flex-1 h-full">
                              {timedEvents.map(event => {
                                 const category = categories.find(c => c.id === event.calendarId);
                                 const styles = getEventStyles(event);
                                 return (
                                    <DraggableEvent key={event.id} event={event} styles={styles} className="w-full">
                                      <div 
                                        onClick={(e) => { e.stopPropagation(); onEventClick(event); }}
                                        className="absolute inset-x-0.5 rounded-sm p-1 border-l-2 shadow-sm transition-all hover:shadow-lg hover:z-30 cursor-pointer overflow-hidden group h-full"
                                        style={{ 
                                          backgroundColor: (category?.color || '#3b82f6') + '25',
                                          borderLeftColor: category?.color || '#3b82f6'
                                        }}
                                      >
                                         <div className="flex flex-col h-full relative">
                                            <span className="text-[8px] font-bold leading-none mb-0.5" style={{ color: category?.color }}>
                                               {format(event.start, 'HH:mm')}
                                            </span>
                                            <span className="text-[10px] font-bold text-slate-800 tracking-tight leading-tight line-clamp-2">
                                               {event.title}
                                            </span>
                                         </div>
                                      </div>
                                    </DraggableEvent>
                                 );
                              })}
                           </div>
                        </DroppableColumn>
                      );
                   })}
                </div>
              </div>
            </div>
           </div>
          </div>
        </DndContext>

        {/* Mobile Vertical List */}
        <ScrollArea className="lg:hidden flex-1 bg-slate-50 scrollbar-hide">
           <div className="p-4 flex flex-col gap-4">
              {days.map((day) => {
                 const dayEvents = getEventsForDay(day);
                 return (
                   <div key={day.toString()} className="flex flex-col gap-2">
                      <div className="flex items-center gap-2 px-1">
                         <span className={cn(
                           "text-xs font-black uppercase tracking-widest",
                           isToday(day) ? "text-[#C36322]" : "text-slate-400"
                         )}>
                            {format(day, 'EEEE d MMMM', { locale: nl })}
                         </span>
                         {isToday(day) && <span className="w-1 h-1 rounded-full bg-[#C36322]" />}
                      </div>
                      <div className="flex flex-col gap-1">
                         {dayEvents.map(event => {
                            const category = categories.find(c => c.id === event.calendarId);
                            return (
                              <div 
                                key={event.id}
                                onClick={() => onEventClick(event)}
                                className="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-100 shadow-sm active:scale-[0.98] transition-all"
                              >
                                 <div className="w-1 h-8 rounded-full" style={{ backgroundColor: category?.color }} />
                                 <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold text-slate-800 truncate">{event.title}</p>
                                    <div className="flex items-center gap-2 mt-0.5">
                                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">
                                        {event.isAllDay ? 'Hele dag' : format(event.start, 'HH:mm')}
                                      </span>
                                      <span className="text-[10px] text-slate-300">•</span>
                                      <span className="text-[10px] text-slate-400 font-medium truncate">{category?.name}</span>
                                    </div>
                                 </div>
                              </div>
                            );
                         })}
                         {dayEvents.length === 0 && (
                           <div className="py-2 px-4 bg-white/50 rounded-xl border border-dashed border-gray-200">
                             <p className="text-[10px] text-gray-300 font-medium italic italic">Geen afspraken</p>
                           </div>
                         )}
                      </div>
                   </div>
                 );
              })}
           </div>
        </ScrollArea>
      </div>
    );
  }

  if (view === 'day') {
    const dayEvents = getEventsForDay(currentDate);
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const allDayEvents = dayEvents.filter(e => e.isAllDay);
    const timedEvents = dayEvents.filter(e => !e.isAllDay);

    const getEventStyles = (event: CalendarEvent) => {
      const startHour = event.start.getHours();
      const startMin = event.start.getMinutes();
      const endHour = event.end.getHours();
      const endMin = event.end.getMinutes();
      
      const top = (startHour * 60 + startMin);
      const duration = ((endHour * 60 + endMin) - (startHour * 60 + startMin));
      
      return {
        top: `${top}px`,
        height: `${Math.max(duration, 30)}px`,
        position: 'absolute' as const,
      };
    };

    return (
      <div className="flex-1 flex flex-col h-full bg-white overflow-hidden">
        <div className="lg:hidden flex flex-col items-center shrink-0 border-b border-gray-100 p-3 bg-slate-50/50">
          <div className="text-[10px] font-bold text-[#C36322] uppercase tracking-[0.2em] mb-0.5">{format(currentDate, 'EEEE', { locale: nl })}</div>
          <div className="flex items-center gap-3">
            <div className="text-3xl font-black text-slate-800 tracking-tighter">{format(currentDate, 'd')}</div>
            <div className="text-xs font-medium text-slate-500">{format(currentDate, 'MMMM yyyy', { locale: nl })}</div>
          </div>
        </div>

        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="flex-1 flex h-full min-h-0">
            {/* Legend - Desktop only for side details */}
            <div className="hidden lg:flex w-64 flex-col items-center shrink-0 border-r border-gray-100 p-8 bg-slate-50/50">
               <div className="text-xs font-bold text-[#C36322] uppercase tracking-[0.2em] mb-2">{format(currentDate, 'EEEE', { locale: nl })}</div>
               <div className="text-[120px] font-black text-slate-800 tracking-tighter leading-none mb-4">{format(currentDate, 'd')}</div>
               <div className="text-xl font-medium text-slate-500 mb-8">{format(currentDate, 'MMMM yyyy', { locale: nl })}</div>
               
               <Button 
                 className="w-full bg-[#C36322] hover:bg-[#a6541d] text-white font-bold h-11 rounded-xl transition-all active:scale-95 shadow-lg shadow-orange-200 border-0 text-sm"
                 onClick={() => onDateClick(currentDate)}
               >
                 Afspraak maken
               </Button>
            </div>

            {/* Time Grid View */}
            <div className="flex-1 flex flex-col min-h-0 bg-white relative">
              {/* All Day Section */}
              {allDayEvents.length > 0 && (
                <div className="bg-orange-50/30 border-b border-gray-100 p-2 shrink-0">
                   <div className="flex flex-col gap-1 max-w-4xl mx-auto">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest pl-2">Hele dag</span>
                      {allDayEvents.map(event => (
                        <div key={event.id} className="bg-white p-2 border border-orange-100 rounded-lg shadow-sm text-xs font-bold text-[#C36322]">
                          {event.title}
                        </div>
                      ))}
                   </div>
                </div>
              )}

              <div className="flex-1 relative min-h-0 h-full">
                <div ref={scrollAreaRef as any} className="absolute inset-0 bg-white w-full overflow-x-hidden overflow-y-auto scroll-smooth">
                  <div className="max-w-5xl mx-auto flex h-[1440px] relative p-6">
                  {/* Hours Label Column */}
                  <div className="hidden sm:flex w-[60px] shrink-0 flex-col">
                    {hours.map(hour => (
                      <div key={hour} className="h-[60px] pr-4 text-right">
                        <span className="text-[10px] font-bold text-gray-400">
                          {hour.toString().padStart(2, '0')}:00
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* The Grid */}
                  <DroppableColumn 
                    id={`day-view-${currentDate.toISOString()}`}
                    date={currentDate}
                    className={cn(
                      "flex-1 relative border-l border-gray-100",
                      highlightWeekends && isWeekend(currentDate) && "bg-yellow-50/30"
                    )}
                    onClick={() => onDateClick(currentDate)}
                  >
                    {/* Now Indicator for today */}
                    {isToday(currentDate) && <NowIndicator />}

                    {/* Horizontal Lines */}
                    <div className="absolute inset-0 pointer-events-none">
                       {hours.map(hour => (
                         <div key={hour} className="h-[60px] border-b border-gray-50" />
                       ))}
                    </div>

                    {/* Events */}
                    {timedEvents.map(event => {
                      const category = categories.find(c => c.id === event.calendarId);
                      const styles = getEventStyles(event);
                      const durationMins = (event.end.getTime() - event.start.getTime()) / 60000;
                      const showsExtraInfo = durationMins > 60;
                      
                      return (
                        <DraggableEvent key={event.id} event={event} styles={styles} className="left-2 right-2">
                           <div 
                             onClick={(e) => { e.stopPropagation(); onEventClick(event); }}
                             className="absolute inset-0 rounded-xl p-2 border-l-4 shadow-sm hover:shadow-xl hover:z-20 transition-all cursor-pointer overflow-hidden group h-full"
                             style={{ 
                               backgroundColor: (category?.color || '#3b82f6') + '15',
                               borderLeftColor: category?.color || '#3b82f6'
                             }}
                           >
                             <div className="flex flex-col h-full relative">
                                <span className={cn(
                                  "text-[10px] font-bold uppercase",
                                  showsExtraInfo ? "mb-1" : "mb-0.5"
                                )} style={{ color: category?.color }}>
                                   {format(event.start, 'HH:mm')} - {format(event.end, 'HH:mm')}
                                </span>
                                <h4 className="text-sm font-bold text-slate-800 truncate leading-tight">{event.title}</h4>
                                {event.description && showsExtraInfo && (
                                  <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed mt-1 opacity-80 group-hover:opacity-100 transition-opacity">
                                    {event.description}
                                  </p>
                                )}
                                {event.location && showsExtraInfo && (
                                  <div className="text-[10px] text-slate-500 mt-auto flex items-center gap-1">
                                    <MapPin className="w-2.5 h-2.5 text-slate-400" />
                                    {event.location}
                                  </div>
                                )}
                             </div>
                           </div>
                        </DraggableEvent>
                      );
                    })}
                  </DroppableColumn>
                </div>
              </div>
             </div>
            </div>
          </div>
        </DndContext>
      </div>
    );
  }

  if (view === 'agenda') {
    const sortedEvents = getFilteredEvents()
      .filter(e => e.start >= startOfDay(currentDate))
      .sort((a, b) => a.start.getTime() - b.start.getTime());

    return (
      <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden p-4 sm:p-8">
        <div className="max-w-4xl mx-auto w-full">
          <header className="mb-6 sm:mb-10 flex flex-col gap-2">
             <h2 className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
               Komende afspraken
               <span className="text-[10px] sm:text-xs font-bold px-2 py-1 bg-white border border-gray-200 rounded-full text-[#C36322] uppercase tracking-[0.1em]">Agenda</span>
             </h2>
             <p className="text-xs sm:text-sm text-slate-400 font-medium">Vanaf {format(currentDate, 'd MMMM yyyy', { locale: nl })}</p>
          </header>
          
          <ScrollArea ref={agendaScrollRef} className="h-[calc(100vh-200px)] sm:h-[calc(100vh-280px)] pr-2 sm:pr-4 scrollbar-hide">
            <div className="flex flex-col gap-6 sm:gap-12 sm:border-l-2 sm:border-dashed sm:border-slate-200 sm:ml-20 pb-20">
              {sortedEvents.map((event, idx) => {
                const category = categories.find(c => c.id === event.calendarId);
                const prevEvent = idx > 0 ? sortedEvents[idx - 1] : null;
                const showDateHeader = !prevEvent || !isSameDay(prevEvent.start, event.start);
                const isPast = event.end < new Date();

                return (
                  <div 
                    key={event.id} 
                    className={cn(
                      "relative sm:pl-12 group transition-opacity duration-300",
                      isPast && "opacity-40"
                    )}
                    data-agenda-event
                    data-start={event.start.toISOString()}
                  >
                    {showDateHeader && (
                      <>
                        {/* Desktop Date Indicator */}
                        <div className="hidden sm:flex absolute left-0 top-0 -translate-x-1/2 flex-col items-center">
                           <div className={cn(
                             "w-8 h-8 rounded-full border-4 border-white shadow-lg z-10 transition-colors",
                             isPast ? "bg-slate-300" : "bg-[#C36322]"
                           )} />
                           <div className="mt-2 bg-white px-2 py-1 rounded-md border border-gray-100 shadow-sm whitespace-nowrap">
                              <span className="text-xs font-black text-slate-700 tracking-tight uppercase">
                                {isToday(event.start) ? 'Vandaag' : format(event.start, 'EEE d MMM', { locale: nl })}
                              </span>
                           </div>
                        </div>

                        {/* Mobile Date Header */}
                        <div className="sm:hidden mb-4 flex items-center gap-2">
                           <div className={cn(
                             "w-1.5 h-1.5 rounded-full",
                             isPast ? "bg-slate-300" : "bg-[#C36322]"
                           )} />
                           <span className="text-[11px] font-black text-[#C36322] uppercase tracking-[0.15em]">
                             {isToday(event.start) ? 'Vandaag' : format(event.start, 'EEEE d MMMM', { locale: nl })}
                           </span>
                        </div>
                      </>
                    )}
                    
                    <div 
                      onClick={() => onEventClick(event)}
                      className={cn(
                        "bg-white p-4 sm:p-5 rounded-xl sm:rounded-2xl border border-gray-100 shadow-sm transition-all cursor-pointer flex flex-col sm:flex-row gap-3 sm:gap-6 items-start",
                        !isPast && "hover:shadow-2xl hover:shadow-[#C36322]/10 hover:-translate-y-1"
                      )}
                    >
                      <div className={cn(
                        "w-full sm:w-16 flex items-center sm:flex-col justify-between sm:justify-center shrink-0 sm:border-r border-slate-100 pb-2 sm:pb-0 sm:pr-6 transition-colors",
                        !isPast && "group-hover:border-[#C36322]/20"
                      )}>
                        <span className="text-xs font-black text-slate-400 uppercase tracking-tighter leading-none">
                          {format(event.start, 'HH:mm')}
                        </span>
                        <div 
                          className={cn("h-2 w-2 rounded-full", isPast && "grayscale")} 
                          style={{ backgroundColor: isPast ? '#94a3b8' : category?.color }} 
                        />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                         <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">{category?.name}</span>
                            {event.isAllDay && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-orange-100 text-[#C36322] uppercase tracking-[0.1em]">Hele dag</span>}
                         </div>
                         <h4 className={cn(
                           "text-lg font-bold text-slate-800 mb-2 truncate transition-colors",
                           !isPast && "group-hover:text-[#C36322]"
                         )}>{event.title}</h4>
                         {event.description && <p className="text-sm text-slate-500 line-clamp-2 leading-relaxed opacity-80">{event.description}</p>}
                         {event.location && (
                           <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-400 font-medium">
                             <MapPin className={cn("w-3 h-3", isPast ? "text-slate-300" : "text-[#C36322]")} />
                             {event.location}
                           </div>
                         )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {sortedEvents.length === 0 && (
                <div className="flex flex-col items-center justify-center py-32 text-center ml-12">
                   <div className="w-20 h-20 bg-slate-100 rounded-3xl rotate-12 flex items-center justify-center mb-6">
                      <CalendarIcon className="w-10 h-10 text-slate-300" />
                   </div>
                   <h3 className="text-xl font-bold text-slate-700 mb-2">Schone lei!</h3>
                   <p className="text-slate-400 font-medium">Je hebt momenteel geen komende afspraken.</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    );
  }

  return null;
}
