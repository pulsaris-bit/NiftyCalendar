/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CalendarCategory, CalendarEvent } from '@/src/types';
import { Plus, Trash2, Check, X, Palette, ChevronRight, Layout, Clock, Calendar as CalendarIcon, Upload, Bell, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { notificationService } from '@/src/lib/notificationService';
import { Button } from '@/components/ui/button';

interface SettingsPageProps {
  categories: CalendarCategory[];
  highlightWeekends: boolean;
  onUpdateHighlightWeekends: (value: boolean) => void;
  defaultCalendarId: string;
  onUpdateDefaultCalendarId: (id: string) => void;
  defaultDuration: number;
  onUpdateDefaultDuration: (duration: number) => void;
  notificationThreshold: number;
  onUpdateNotificationThreshold: (threshold: number) => void;
  onUpdateCategories: (categories: CalendarCategory[]) => void;
  onImportEvents: (events: CalendarEvent[]) => void;
  onClose: () => void;
  token: string | null;
  username: string;
  caldavServerUrl: string;
}

export function SettingsPage({ 
  categories, 
  highlightWeekends, 
  onUpdateHighlightWeekends, 
  defaultCalendarId,
  onUpdateDefaultCalendarId,
  defaultDuration,
  onUpdateDefaultDuration,
  notificationThreshold,
  onUpdateNotificationThreshold,
  onUpdateCategories, 
  onImportEvents,
  onClose,
  token,
  username,
  caldavServerUrl
}: SettingsPageProps) {
  const [localCategories, setLocalCategories] = React.useState<CalendarCategory[]>(categories);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [importTargetCalendarId, setImportTargetCalendarId] = React.useState<string>(defaultCalendarId);
  const fileInputRef = React.useRef<HTMLInputElement>(null);



  const colors = [
    '#C36322', // Nifty Orange
    '#4F46E5', // Indigo
    '#10B981', // Emerald
    '#F59E0B', // Amber
    '#EF4444', // Red
    '#8B5CF6', // Violet
    '#EC4899', // Pink
    '#06B6D4', // Cyan
    '#22C55E', // Green
    '#3B82F6', // Blue
    '#F97316', // Orange
    '#6366F1', // Light Indigo
    '#0D9488', // Teal
    '#D946EF', // Fuchsia
    '#444444', // Slate
    '#78350F', // Dark Orange
    '#1E3A8A', // Navy
    '#991B1B', // Dark Red
    '#166534', // Dark Green
  ];

  const handleAddCategory = async () => {
    // Generate a random color
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    const newCategoryName = 'Nieuwe Agenda';
    
    try {
      const response = await fetch('/api/caldav/calendars', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: newCategoryName,
          color: randomColor
        })
      });
      
      if (response.ok) {
        const newCalendar = await response.json();
        // Add the new calendar to local state
        const updated = [...localCategories, {
          id: newCalendar.id,
          name: newCalendar.name,
          color: newCalendar.color,
          isVisible: true,
          canEdit: true,
          isOwner: true,
          isCaldav: true
        }];
        setLocalCategories(updated);
        setEditingId(newCalendar.id);
        toast.success('Agenda aangemaakt op CalDAV server');
      } else {
        const data = await response.json();
        toast.error(data.error || 'Fout bij aanmaken agenda');
      }
    } catch (err) {
      toast.error('Fout bij verbinden met CalDAV server');
    }
  };

  const handleUpdateCategory = async (id: string, updates: Partial<CalendarCategory>) => {
    // Optimistic update for UI
    const updated = localCategories.map(cat => 
      cat.id === id ? { ...cat, ...updates } : cat
    );
    setLocalCategories(updated);
    
    // Send update to CalDAV server
    try {
      const response = await fetch(`/api/caldav/calendars/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: updates.name,
          color: updates.color,
          description: updates.description
        })
      });
      
      if (!response.ok) {
        const data = await response.json();
        toast.error(data.error || 'Fout bij bijwerken agenda');
        // Revert optimistic update
        setLocalCategories(localCategories);
      } else {
        toast.success('Agenda bijgewerkt');
      }
    } catch (err) {
      toast.error('Fout bij verbinden met CalDAV server');
      setLocalCategories(localCategories);
    }
  };

  const handleDeleteCategory = async (id: string) => {
    if (localCategories.length <= 1) {
      toast.error('Je moet minstens 1 agenda hebben');
      return;
    }
    
    try {
      const response = await fetch(`/api/caldav/calendars/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const updated = localCategories.filter(cat => cat.id !== id);
        setLocalCategories(updated);
        toast.success('Agenda verwijderd');
      } else {
        const data = await response.json();
        toast.error(data.error || 'Fout bij verwijderen agenda');
      }
    } catch (err) {
      toast.error('Fout bij verbinden met CalDAV server');
    }
  };

  const handleSave = () => {
    // No need to call onUpdateCategories since we're updating directly to CalDAV
    onClose();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !token) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const icsData = event.target?.result as string;
        
        // Send to CalDAV server for import
        const response = await fetch('/api/caldav/import', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            calendarId: importTargetCalendarId,
            icsFile: icsData
          })
        });

        const result = await response.json();
        
        if (response.ok) {
          toast.success(result.message || `${result.count} afspraken geïmporteerd naar CalDAV`);
          // Reload events from CalDAV
          if (typeof window !== 'undefined' && window.location) {
            window.location.reload();
          }
        } else {
          toast.error(result.error || 'Fout bij importeren naar CalDAV');
        }
      } catch (error) {
        console.error('Error importing ICS:', error);
        toast.error('Fout bij het importeren van het .ics bestand.');
      }
    };
    reader.readAsText(file);
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="flex flex-col h-full bg-white">
      <header className="h-14 border-b border-gray-100 flex items-center justify-between px-6 shrink-0">
        <h2 className="text-lg font-black text-slate-800 tracking-tight flex items-center gap-2">
          Instellingen
        </h2>
        <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full hover:bg-gray-100">
          <X className="h-4 w-4" />
        </Button>
      </header>

      <div className="flex-1 overflow-auto p-8">
        <div className="max-w-2xl mx-auto space-y-12">
          {/* Calendar Management */}
          <section>
            <div className="flex flex-col sm:items-center sm:justify-between mb-6 gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-widest mb-1">Mijn Agenda's</h3>
                <p className="text-xs text-slate-500 font-medium tracking-tight">Beheer je verschillende agenda's en hun kleuren.</p>
              </div>
              <Button 
                onClick={handleAddCategory}
                variant="outline"
                size="sm"
                className="text-[10px] font-bold uppercase tracking-widest h-8 px-3 border-slate-200 hover:bg-slate-50 w-full sm:w-auto"
              >
                <Plus className="h-3 w-3 mr-1.5 text-[#C36322]" />
                Toevoegen
              </Button>
            </div>

            <div className="grid gap-3">
              <AnimatePresence initial={false}>
                {localCategories.map((cat) => (
                  <motion.div 
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    key={cat.id}
                    className={cn(
                      "group flex flex-row items-center gap-4 p-3 rounded-xl border transition-all",
                      editingId === cat.id ? "bg-slate-50 border-[#C36322]/20 shadow-sm" : "bg-white border-gray-100 hover:border-gray-200"
                    )}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <Popover>
                        <PopoverTrigger asChild>
                          <button 
                            className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 shadow-sm transition-transform active:scale-95 cursor-pointer relative overflow-hidden group/color"
                            style={{ backgroundColor: cat.color }}
                          >
                            <Palette className="w-4 h-4 text-white opacity-0 group-hover/color:opacity-100 transition-opacity" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-[180px] p-3">
                          <div className="grid grid-cols-5 gap-2">
                            {colors.map(color => (
                              <button
                                key={color}
                                onClick={() => handleUpdateCategory(cat.id, { color })}
                                className={cn(
                                  "w-6 h-6 rounded-full transition-all hover:scale-125 border-2 shrink-0 shadow-sm",
                                  cat.color === color ? "border-white ring-2 ring-[#C36322] scale-110" : "border-transparent"
                                )}
                                style={{ backgroundColor: color }}
                              />
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>
  
                      <div className="flex-1 min-w-0">
                        {editingId === cat.id ? (
                          <Input 
                            autoFocus
                            value={cat.name}
                            onChange={(e) => handleUpdateCategory(cat.id, { name: e.target.value })}
                            onBlur={() => setEditingId(null)}
                            className="h-8 py-0 px-2 text-sm font-bold bg-white border-slate-200 focus-visible:ring-[#C36322]"
                          />
                        ) : (
                          <p 
                            className="text-sm font-bold text-slate-700 truncate cursor-pointer hover:text-[#C36322] transition-colors"
                            onClick={() => setEditingId(cat.id)}
                          >
                            {cat.name}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => handleDeleteCategory(cat.id)}
                        className="h-9 w-9 text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all shrink-0"
                        disabled={localCategories.length <= 1 || !cat.isOwner}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </section>

          {/* Display Settings */}
          <section className="pt-8 border-t border-gray-100">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-widest mb-6">Weergave & Voorkeuren</h3>
            <div className="space-y-4">
              <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center text-[#C36322] border-2 border-[#C36322]">
                      <Layout className="w-5 h-5" />
                    </div>
                    <div>
                      <Label htmlFor="highlight-weekends" className="text-sm font-bold text-slate-700 cursor-pointer">Weekenden accentueren</Label>
                      <p className="text-xs text-slate-500 font-medium">Geef zaterdag en zondag een subtiele gele achtergrondkleur.</p>
                    </div>
                  </div>
                  <Checkbox 
                    id="highlight-weekends" 
                    checked={highlightWeekends}
                    onCheckedChange={(checked) => onUpdateHighlightWeekends(!!checked)}
                    className="w-6 h-6 rounded-lg border-slate-200 data-[state=checked]:bg-[#C36322] data-[state=checked]:border-[#C36322]"
                  />
                </div>
              </div>

              <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center text-[#C36322] border-2 border-[#C36322]">
                    <CalendarIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <Label className="text-sm font-bold text-slate-700">Standaard Agenda</Label>
                    <p className="text-xs text-slate-500 font-medium">De agenda die als eerste gekozen wordt bij een nieuwe afspraak.</p>
                  </div>
                </div>
                <Select value={defaultCalendarId} onValueChange={onUpdateDefaultCalendarId}>
                  <SelectTrigger className="w-full sm:w-48 bg-white font-bold text-slate-700 border-slate-200 h-10">
                    <SelectValue placeholder="Kies agenda">
                      {localCategories.find(c => c.id === defaultCalendarId)?.name || 'Kies agenda'}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {localCategories.map(cat => (
                      <SelectItem key={cat.id} value={cat.id}>
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.color }} />
                          <span className="truncate">{cat.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center text-[#C36322] border-2 border-[#C36322]">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <Label className="text-sm font-bold text-slate-700">Standaard Duur</Label>
                    <p className="text-xs text-slate-500 font-medium">De tijdsduur van een nieuwe afspraak bij het aanmaken.</p>
                  </div>
                </div>
                <Select value={defaultDuration.toString()} onValueChange={(val) => onUpdateDefaultDuration(parseInt(val, 10))}>
                  <SelectTrigger className="w-full sm:w-48 bg-white font-bold text-slate-700 border-slate-200 h-10">
                    <SelectValue placeholder="Kies duur" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="15">15 minuten</SelectItem>
                    <SelectItem value="30">30 minuten</SelectItem>
                    <SelectItem value="45">45 minuten</SelectItem>
                    <SelectItem value="60">1 uur</SelectItem>
                    <SelectItem value="90">1,5 uur</SelectItem>
                    <SelectItem value="120">2 uur</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center text-[#C36322] border-2 border-[#C36322]">
                    <Bell className="w-5 h-5" />
                  </div>
                  <div>
                    <Label className="text-sm font-bold text-slate-700">Notificatie Herinnering</Label>
                    <p className="text-xs text-slate-500 font-medium">Hoeveel minuten van tevoren wil je een melding ontvangen?</p>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row items-center gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => notificationService.sendTestNotification()}
                    className="w-full sm:w-auto h-10 border-slate-200 text-slate-600 font-bold text-[10px] uppercase tracking-widest px-4 hover:bg-white"
                  >
                    Test nu
                  </Button>
                  <Select value={notificationThreshold.toString()} onValueChange={(val) => onUpdateNotificationThreshold(parseInt(val, 10))}>
                  <SelectTrigger className="w-full sm:w-48 bg-white font-bold text-slate-700 border-slate-200 h-10">
                    <SelectValue placeholder="Kies tijd" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Op het moment zelf</SelectItem>
                    <SelectItem value="1">1 minuut van tevoren</SelectItem>
                    <SelectItem value="2">2 minuten van tevoren</SelectItem>
                    <SelectItem value="5">5 minuten van tevoren</SelectItem>
                    <SelectItem value="10">10 minuten van tevoren</SelectItem>
                    <SelectItem value="15">15 minuten van tevoren</SelectItem>
                    <SelectItem value="30">30 minuten van tevoren</SelectItem>
                  </SelectContent>
                </Select>
                </div>
              </div>
            </div>
          </section>

          {/* Data Management */}
          <section className="pt-8 border-t border-gray-100">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-widest mb-6">Data & Importeren</h3>
            <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100">
              <div className="flex flex-col gap-6">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center text-[#C36322] border-2 border-[#C36322]">
                    <Upload className="w-5 h-5" />
                  </div>
                  <div>
                    <Label className="text-sm font-bold text-slate-700">Importeer .ics bestand</Label>
                    <p className="text-xs text-slate-500 font-medium">Voeg afspraken van andere agenda's toe aan je overzicht.</p>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 bg-white/50 p-4 rounded-xl border border-slate-100">
                  <div className="flex-1 w-full space-y-2">
                    <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Importeren in agenda:</Label>
                    <Select value={importTargetCalendarId} onValueChange={setImportTargetCalendarId}>
                      <SelectTrigger className="w-full bg-white font-bold text-slate-700 border-slate-200 h-10 shadow-sm">
                        <SelectValue placeholder="Kies agenda">
                          {localCategories.find(c => c.id === importTargetCalendarId)?.name || 'Kies agenda'}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {localCategories.map(cat => (
                          <SelectItem key={cat.id} value={cat.id}>
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.color }} />
                              <span className="truncate">{cat.name}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="shrink-0 w-full sm:w-auto pt-6 flex justify-end">
                    <input
                      type="file"
                      accept=".ics"
                      className="hidden"
                      ref={fileInputRef}
                      onChange={handleFileChange}
                    />
                    <Button 
                      variant="outline" 
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full sm:w-auto font-bold text-xs uppercase tracking-widest px-6 border-[#C36322] text-[#C36322] hover:bg-orange-50 bg-white h-10 shadow-sm"
                    >
                      Bestand kiezen
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Account information */}
          <section className="pt-8 border-t border-gray-100">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-widest mb-4">Account</h3>
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center text-[#C36322] border-2 border-[#C36322] shrink-0">
                  <User className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-col gap-1">
                    <div className="flex gap-2">
                      <span className="text-sm font-bold text-slate-700 w-28 shrink-0">Gebruikersnaam:</span>
                      <span className="text-sm text-slate-600 truncate">{username}</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-sm font-bold text-slate-700 w-28 shrink-0">CalDAV Server:</span>
                      <span className="text-sm text-slate-600 truncate">{caldavServerUrl}</span>
                    </div>
                  </div>
                </div>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={async () => {
                  const granted = await notificationService.requestPermission();
                  if (granted) {
                    toast.success("Bureaubladmeldingen ingeschakeld");
                  } else {
                    toast.error("Meldingen zijn geweigerd door de browser");
                  }
                }}
                className="mt-4 h-8 text-[10px] font-bold uppercase tracking-widest border-slate-200 hover:bg-slate-50 w-full"
              >
                <Bell className="h-3 w-3 mr-1.5 text-[#C36322]" />
                Bureaubladmeldingen inschakelen
              </Button>
            </div>
          </section>
        </div>
      </div>

      <footer className="h-auto min-h-20 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between p-4 sm:px-8 gap-4 shrink-0 bg-gray-50/50">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] text-center sm:text-left">Vergeet niet je wijzigingen op te slaan.</p>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <Button variant="ghost" onClick={onClose} className="flex-1 sm:flex-none text-sm font-bold text-slate-600 hover:bg-white h-10 px-6">Annuleren</Button>
          <Button onClick={handleSave} className="flex-1 sm:flex-none bg-[#C36322] hover:bg-[#a6541d] text-white font-bold h-10 px-8 shadow-lg shadow-[#C36322]/20 transition-all active:scale-95">Wijzigingen Opslaan</Button>
        </div>
      </footer>
    </div>
  );
}


