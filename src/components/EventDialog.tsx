/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as React from 'react';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { CalendarEvent, CalendarCategory } from '@/src/types';
import { Clock, MapPin, AlignLeft, Calendar as CalendarIcon, Info } from 'lucide-react';

interface EventDialogProps {
  isOpen: boolean;
  onClose: () => void;
  event: Partial<CalendarEvent> | null;
  categories: CalendarCategory[];
  onSave: (event: Partial<CalendarEvent>) => void;
  onDelete?: (id: string, calendarId: string) => void;
}

export function EventDialog({
  isOpen,
  onClose,
  event,
  categories,
  onSave,
  onDelete
}: EventDialogProps) {
  const [formData, setFormData] = React.useState<Partial<CalendarEvent>>({
    title: '',
    start: new Date(),
    end: new Date(Date.now() + 60 * 60 * 1000), // Default: 1 hour duration
    calendarId: categories[0]?.id || '',
    description: '',
    location: '',
  });

  React.useEffect(() => {
    if (event) {
      setFormData(event);
    }
  }, [event]);

  const currentCategory = categories.find(c => c.id === formData.calendarId);
  const canEdit = currentCategory ? currentCategory.canEdit !== false : true;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (canEdit) onSave(formData);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[450px] p-0 overflow-hidden rounded-xl border-0 shadow-2xl flex flex-col max-h-[90vh]" showCloseButton={false}>
        <div className="bg-gray-50 px-6 py-4 border-b shrink-0">
           <DialogHeader>
            <DialogTitle className="text-xl font-bold text-gray-800">
              {event?.id ? (canEdit ? 'Afspraak wijzigen' : 'Afspraak details') : 'Afspraak maken'}
            </DialogTitle>
          </DialogHeader>
        </div>
        
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 flex flex-col gap-6 scrollbar-hide">
          <div className="flex flex-col gap-2">
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Titel toevoegen"
              className="text-xl font-semibold border-0 border-b rounded-none px-0 focus-visible:ring-0 focus-visible:border-[#C36322] transition-all placeholder:text-gray-300"
              autoFocus={canEdit}
              disabled={!canEdit}
            />
          </div>

          <div className="flex flex-col gap-5">
            <div className="flex items-center space-x-2 px-1">
              <Checkbox 
                id="allDay" 
                checked={formData.isAllDay} 
                onCheckedChange={(checked) => setFormData({ ...formData, isAllDay: !!checked })}
                className="data-[state=checked]:bg-[#C36322] data-[state=checked]:border-[#C36322]"
                disabled={!canEdit}
              />
              <Label htmlFor="allDay" className={`text-sm font-medium cursor-pointer ${!canEdit ? 'text-gray-400' : 'text-gray-600'}`}>Hele dag</Label>
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex items-start gap-3 text-gray-600">
                <CalendarIcon className="h-5 w-5 shrink-0 mt-2" />
                <div className="flex flex-1 flex-col gap-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1">
                      <Label className="text-[10px] uppercase font-bold text-gray-400">Startdatum</Label>
                      <Input 
                        type="date" 
                        className="h-9 text-sm w-full bg-white border-gray-200 focus-visible:ring-[#C36322]"
                        value={formData.start ? format(formData.start, 'yyyy-MM-dd') : ''}
                        onChange={(e) => {
                          const dateStr = e.target.value;
                          if (!dateStr) return;
                          const [year, month, day] = dateStr.split('-').map(Number);
                          const newStart = new Date(formData.start || new Date());
                          newStart.setFullYear(year, month - 1, day);
                          
                          let newEnd = formData.end ? new Date(formData.end) : new Date();
                          newEnd.setFullYear(year, month - 1, day);
                          
                          // If end was on a different date, keep it on that date
                          // Otherwise ensure it's on or after start date
                          if (formData.end) {
                            const originalEnd = new Date(formData.end);
                            if (originalEnd.getFullYear() !== newStart.getFullYear() ||
                                originalEnd.getMonth() !== newStart.getMonth() ||
                                originalEnd.getDate() !== newStart.getDate()) {
                              // End was on a different date, try to preserve the date
                              const endDate = new Date(originalEnd);
                              endDate.setFullYear(year, month - 1, day);
                              if (endDate >= newStart) {
                                newEnd = endDate;
                              } else {
                                newEnd = new Date(newStart);
                                newEnd.setTime(newStart.getTime() + 60 * 60 * 1000);
                              }
                            } else {
                              // End was on same date, ensure it's after start
                              if (newEnd <= newStart) {
                                newEnd = new Date(newStart.getTime() + 60 * 60 * 1000);
                              }
                            }
                          } else {
                            // No end set, default to start + 1 hour
                            newEnd = new Date(newStart.getTime() + 60 * 60 * 1000);
                          }
                          
                          setFormData({ ...formData, start: newStart, end: newEnd });
                        }}
                        disabled={!canEdit}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-[10px] uppercase font-bold text-gray-400">Einddatum</Label>
                      <Input 
                        type="date" 
                        className="h-9 text-sm w-full bg-white border-gray-200 focus-visible:ring-[#C36322]"
                        value={formData.end ? format(formData.end, 'yyyy-MM-dd') : ''}
                        onChange={(e) => {
                          const dateStr = e.target.value;
                          if (!dateStr) return;
                          const [year, month, day] = dateStr.split('-').map(Number);
                          const newEnd = new Date();
                          newEnd.setFullYear(year, month - 1, day);
                          
                          // If end date is before start date, set it to start date
                          if (formData.start) {
                            const startDate = new Date(formData.start);
                            startDate.setHours(0, 0, 0, 0);
                            newEnd.setHours(0, 0, 0, 0);
                            
                            if (newEnd < startDate) {
                              // Set end date to start date
                              const startYear = formData.start.getFullYear();
                              const startMonth = formData.start.getMonth();
                              const startDay = formData.start.getDate();
                              newEnd.setFullYear(startYear, startMonth, startDay);
                              
                              // If end time is before start time on the same day, set to start + 1 hour
                              const startHours = formData.start.getHours();
                              const startMinutes = formData.start.getMinutes();
                              newEnd.setHours(Math.max(startHours + 1, newEnd.getHours()), startMinutes, 0, 0);
                            }
                          }
                          
                          setFormData({ ...formData, end: newEnd });
                        }}
                        min={formData.start ? format(formData.start, 'yyyy-MM-dd') : ''}
                        disabled={!canEdit}
                      />
                    </div>
                  </div>
                  
                  {!formData.isAllDay && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex items-center gap-2">
                        <Label className="text-[10px] uppercase font-bold text-gray-400 w-10 shrink-0">Van</Label>
                        <Input 
                          type="time" 
                          className="h-9 text-sm bg-white border-gray-200 focus-visible:ring-[#C36322]"
                          value={formData.start ? format(formData.start, 'HH:mm') : ''}
                          onChange={(e) => {
                            const [hours, minutes] = e.target.value.split(':');
                            if (formData.start) {
                              const date = new Date(formData.start);
                              date.setHours(parseInt(hours) || 0, parseInt(minutes) || 0, 0, 0);
                              setFormData({ ...formData, start: date });
                            }
                          }}
                          onBlur={(e) => {
                            if (!formData.start || !formData.end) return;
                            const startDate = new Date(formData.start);
                            const endDate = new Date(formData.end);
                            
                            // Update end time if it's on the same day and now before start
                            if (endDate.getDate() === startDate.getDate() &&
                                endDate.getMonth() === startDate.getMonth() &&
                                endDate.getFullYear() === startDate.getFullYear()) {
                              if (endDate < startDate) {
                                const newEnd = new Date(startDate.getTime() + 60 * 60 * 1000);
                                setFormData({ ...formData, end: newEnd });
                              }
                            }
                          }}
                          disabled={!canEdit}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="text-[10px] uppercase font-bold text-gray-400 w-10 shrink-0 text-center">Tot</Label>
                        <Input 
                          type="time" 
                          className="h-9 text-sm bg-white border-gray-200 focus-visible:ring-[#C36322]"
                          value={formData.end ? format(formData.end, 'HH:mm') : ''}
                          onChange={(e) => {
                            const [hours, minutes] = e.target.value.split(':');
                            if (formData.end) {
                              const date = new Date(formData.end);
                              date.setHours(parseInt(hours) || 0, parseInt(minutes) || 0, 0, 0);
                              setFormData({ ...formData, end: date });
                            }
                          }}
                          onBlur={(e) => {
                            if (!formData.start || !formData.end) return;
                            const startDate = new Date(formData.start);
                            const endDate = new Date(formData.end);
                            
                            // Fix end date if it's before start
                            if (endDate < startDate) {
                              // If end is before start on same day, move to next day
                              if (endDate.getDate() === startDate.getDate() &&
                                  endDate.getMonth() === startDate.getMonth() &&
                                  endDate.getFullYear() === startDate.getFullYear()) {
                                const newEnd = new Date(endDate);
                                newEnd.setDate(newEnd.getDate() + 1);
                                setFormData({ ...formData, end: newEnd });
                              } else {
                                // If end is on different day but still before start, set to start + 1 hour
                                const newEnd = new Date(startDate);
                                newEnd.setHours(startDate.getHours() + 1, startDate.getMinutes(), 0, 0);
                                setFormData({ ...formData, end: newEnd });
                              }
                            }
                          }}
                          disabled={!canEdit}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 text-gray-600">
              <CalendarIcon className="h-5 w-5 shrink-0" />
              <Select 
                value={formData.calendarId} 
                onValueChange={(val) => setFormData({ ...formData, calendarId: val })}
                disabled={!canEdit}
              >
                <SelectTrigger className="flex-1 h-9 bg-white border-gray-200 focus:ring-[#C36322]">
                  <SelectValue placeholder="Kies agenda">
                    {categories.find(c => c.id === formData.calendarId)?.name || 'Kies agenda'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {categories.filter(cat => cat.canEdit !== false && !cat.isDeleted).map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: cat.color }} />
                        <span className="truncate">{cat.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-3 text-gray-600">
              <MapPin className="h-5 w-5 shrink-0" />
              <Input 
                placeholder="Locatie toevoegen" 
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                className="flex-1 h-9 bg-white focus-visible:ring-[#C36322]"
                disabled={!canEdit}
              />
            </div>

            <div className="flex items-start gap-3 text-gray-600">
              <AlignLeft className="h-5 w-5 shrink-0 mt-2" />
              <textarea 
                placeholder="Beschrijving toevoegen" 
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="flex-1 min-h-[100px] p-2 text-sm border rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-[#C36322] border-gray-200"
                disabled={!canEdit}
              />
            </div>
            
            {!canEdit && (
              <div className="flex items-center gap-2 p-3 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium border border-blue-100">
                <Info className="w-4 h-4" />
                Deze agenda is met jou gedeeld (alleen lezen).
              </div>
            )}
          </div>

          <DialogFooter className="pt-4 border-t mt-auto sticky bottom-0 bg-white">
            {canEdit && event?.id && onDelete && (
              <Button 
                type="button" 
                variant="ghost" 
                className="text-red-600 hover:bg-red-50"
                onClick={() => onDelete(event.id!, formData.calendarId)}
              >
                Verwijderen
              </Button>
            )}
            <div className="flex gap-2 ml-auto">
              <Button type="button" variant="outline" onClick={onClose}>
                {canEdit ? 'Annuleren' : 'Sluiten'}
              </Button>
              {canEdit && (
                <Button type="submit" className="bg-[#C36322] hover:bg-[#a6541d] text-white px-8">
                  Opslaan
                </Button>
              )}
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
