/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CalendarCategory, CalendarEvent } from '@/src/types';
import { Plus, Trash2, Check, X, Palette, ChevronRight, Layout, Clock, Calendar as CalendarIcon, Upload, Users, UserPlus } from 'lucide-react';
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
import ICAL from 'ical.js';
import { toast } from 'sonner';

interface SettingsPageProps {
  categories: CalendarCategory[];
  highlightWeekends: boolean;
  onUpdateHighlightWeekends: (value: boolean) => void;
  defaultCalendarId: string;
  onUpdateDefaultCalendarId: (id: string) => void;
  defaultDuration: number;
  onUpdateDefaultDuration: (duration: number) => void;
  onUpdateCategories: (categories: CalendarCategory[]) => void;
  onImportEvents: (events: CalendarEvent[]) => void;
  onClose: () => void;
  token: string | null;
}

export function SettingsPage({ 
  categories, 
  highlightWeekends, 
  onUpdateHighlightWeekends, 
  defaultCalendarId,
  onUpdateDefaultCalendarId,
  defaultDuration,
  onUpdateDefaultDuration,
  onUpdateCategories, 
  onImportEvents,
  onClose,
  token
}: SettingsPageProps) {
  const [localCategories, setLocalCategories] = React.useState<CalendarCategory[]>(categories);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [sharingId, setSharingId] = React.useState<string | null>(null);
  const [shares, setShares] = React.useState<any[]>([]);
  const [shareUsername, setShareUsername] = React.useState("");
  const [shareCanEdit, setShareCanEdit] = React.useState(false);
  const [isSharingLoading, setIsSharingLoading] = React.useState(false);
  const [importTargetCalendarId, setImportTargetCalendarId] = React.useState<string>(defaultCalendarId);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (sharingId && token) {
      fetchShares(sharingId);
    }
  }, [sharingId]);

  const fetchShares = async (id: string) => {
    try {
      const res = await fetch(`/api/categories/${id}/shares`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setShares(data);
      }
    } catch (err) {
      console.error("Failed to fetch shares", err);
    }
  };

  const handleShare = async () => {
    if (!sharingId || !shareUsername || !token) return;
    setIsSharingLoading(true);
    try {
      const res = await fetch(`/api/categories/${sharingId}/share`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ username: shareUsername, canEdit: shareCanEdit })
      });
      if (res.ok) {
        toast.success(`Gedeeld met ${shareUsername}`);
        setShareUsername("");
        fetchShares(sharingId);
      } else {
        const data = await res.json();
        toast.error(data.error || "Delen mislukt");
      }
    } catch (err) {
      toast.error("Fout bij delen");
    } finally {
      setIsSharingLoading(false);
    }
  };

  const handleUnshare = async (userId: number) => {
    if (!sharingId || !token) return;
    try {
      const res = await fetch(`/api/categories/${sharingId}/share/${userId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        toast.success("Toegang ingetrokken");
        fetchShares(sharingId);
      }
    } catch (err) {
      toast.error("Fout bij intrekken");
    }
  };

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

  const handleAddCategory = () => {
    const newCategory: CalendarCategory = {
      id: Math.random().toString(36).substr(2, 9),
      name: 'Nieuwe Agenda',
      color: colors[Math.floor(Math.random() * colors.length)],
      isVisible: true,
    };
    const updated = [...localCategories, newCategory];
    setLocalCategories(updated);
    setEditingId(newCategory.id);
  };

  const handleUpdateCategory = (id: string, updates: Partial<CalendarCategory>) => {
    const updated = localCategories.map(cat => 
      cat.id === id ? { ...cat, ...updates } : cat
    );
    setLocalCategories(updated);
  };

  const handleDeleteCategory = (id: string) => {
    if (localCategories.length <= 1) return; // Keep at least one
    const updated = localCategories.filter(cat => cat.id !== id);
    setLocalCategories(updated);
  };

  const handleSave = () => {
    onUpdateCategories(localCategories);
    onClose();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const icsData = event.target?.result as string;
        const jcalData = ICAL.parse(icsData);
        const vcalendar = new ICAL.Component(jcalData);
        const vevents = vcalendar.getAllSubcomponents('vevent');
        
        const importedEvents: CalendarEvent[] = vevents.map(vevent => {
          const icalEvent = new ICAL.Event(vevent);
          return {
            id: Math.random().toString(36).substr(2, 9),
            title: icalEvent.summary || 'Naamloze afspraak',
            start: icalEvent.startDate.toJSDate(),
            end: icalEvent.endDate.toJSDate(),
            description: icalEvent.description || '',
            location: icalEvent.location || '',
            calendarId: importTargetCalendarId,
            isAllDay: icalEvent.startDate.isDate,
          };
        });

        if (importedEvents.length > 0) {
          onImportEvents(importedEvents);
          toast.success(`${importedEvents.length} afspraken succesvol geïmporteerd!`);
        } else {
          toast.error('Geen geldige afspraken gevonden in dit bestand.');
        }
      } catch (error) {
        console.error('Error parsing ICS:', error);
        toast.error('Fout bij het laden van het .ics bestand. Controleer of het bestand geldig is.');
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
                      {cat.isOwner && (
                        <Popover open={sharingId === cat.id} onOpenChange={(open) => !open && setSharingId(null)}>
                          <PopoverTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => setSharingId(cat.id)}
                              className="h-9 w-9 text-slate-400 hover:text-[#C36322] hover:bg-orange-50 transition-all shrink-0"
                            >
                              <Users className="h-4 w-4" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent align="end" className="w-[300px] p-4 shadow-xl border-slate-200">
                             <h4 className="text-xs font-bold uppercase tracking-widest text-slate-800 mb-4 flex items-center gap-2">
                               <Users className="w-3 h-3 text-[#C36322]" />
                               Agenda Delen: {cat.name}
                             </h4>
                             
                             <div className="space-y-4">
                               <div className="flex flex-col gap-2 p-3 bg-slate-50 rounded-lg border border-slate-100">
                                 <Label className="text-[10px] font-bold text-slate-400 uppercase">Nieuwe gebruiker uitnodigen</Label>
                                 <div className="flex gap-2">
                                   <Input 
                                     placeholder="Gebruikersnaam" 
                                     value={shareUsername}
                                     onChange={(e) => setShareUsername(e.target.value)}
                                     className="h-8 text-xs bg-white"
                                   />
                                   <Button 
                                     size="sm" 
                                     onClick={handleShare}
                                     disabled={isSharingLoading || !shareUsername}
                                     className="h-8 px-2 bg-[#C36322] hover:bg-[#a6541d]"
                                   >
                                     <UserPlus className="w-4 h-4" />
                                   </Button>
                                 </div>
                                 <div className="flex items-center gap-2 mt-1">
                                    <Checkbox 
                                      id="can-edit" 
                                      checked={shareCanEdit} 
                                      onCheckedChange={(checked) => setShareCanEdit(!!checked)}
                                      className="w-3 h-3 rounded text-[#C36322]"
                                    />
                                    <Label htmlFor="can-edit" className="text-[10px] text-slate-500 cursor-pointer">Mag afspraken wijzigen</Label>
                                 </div>
                               </div>

                               <div className="space-y-2">
                                 <Label className="text-[10px] font-bold text-slate-400 uppercase px-1">Toegang verleend aan:</Label>
                                 {shares.length === 0 ? (
                                   <p className="text-[10px] text-slate-400 italic px-1">Nog niet gedeeld met anderen.</p>
                                 ) : (
                                   <div className="max-h-[150px] overflow-auto pr-1 flex flex-col gap-2">
                                     {shares.map(s => (
                                       <div key={s.userId} className="flex items-center justify-between bg-white p-2 rounded-md border border-slate-100 shadow-sm">
                                         <div className="min-w-0">
                                            <p className="text-[10px] font-bold text-slate-700 truncate">{s.username}</p>
                                            <p className="text-[9px] text-slate-400">{s.canEdit ? 'Kan bewerken' : 'Alleen lezen'}</p>
                                         </div>
                                         <Button 
                                           variant="ghost" 
                                           size="icon" 
                                           onClick={() => handleUnshare(s.userId)}
                                           className="h-6 w-6 text-slate-300 hover:text-red-500"
                                         >
                                           <X className="h-3 w-3" />
                                         </Button>
                                       </div>
                                     ))}
                                   </div>
                                 )}
                               </div>
                             </div>
                          </PopoverContent>
                        </Popover>
                      )}

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

          {/* Other settings placeholders */}
          <section className="pt-8 border-t border-gray-100 opacity-50 pointer-events-none">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-widest mb-4">Account</h3>
            <div className="bg-gray-50 rounded-xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-slate-200" />
                <div>
                   <p className="text-sm font-bold text-slate-700">Persoonlijke Gegevens</p>
                   <p className="text-xs text-slate-500 font-medium">Naam, email en wachtwoord</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-300" />
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


