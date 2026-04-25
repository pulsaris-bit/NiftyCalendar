/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar, Mail, Lock, User, ArrowRight, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

import { toast } from 'sonner';

interface AuthPageProps {
  onLogin: (user: { email: string; name: string }, token: string) => void;
}

export function AuthPage({ onLogin }: AuthPageProps) {
  const [isLoading, setIsLoading] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>, type: 'login' | 'signup') => {
    e.preventDefault();
    setIsLoading(true);
    
    const formData = new FormData(e.currentTarget);
    const email = type === 'login' ? formData.get('email') : formData.get('signup-email');
    const password = type === 'login' ? formData.get('password') : formData.get('signup-password');
    const name = formData.get('name');

    try {
      const endpoint = type === 'login' ? '/api/auth/login' : '/api/auth/register';
      const body = type === 'login' 
        ? { email, password } 
        : { email, name, password };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      let data;
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        data = await response.json();
      } else {
        const text = await response.text();
        throw new Error(text || 'De server stuurde een ongeldig antwoord terug.');
      }

      if (!response.ok) {
        throw new Error(data.error || 'Er is iets misgegaan');
      }

      onLogin(data.user, data.token);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#0c0a09] text-gray-900 p-4 relative overflow-hidden">
      {/* Background patterns */}
      <div className="absolute inset-0 z-0 opacity-[0.07] pointer-events-none">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(#C36322_1px,transparent_1px)] [background-size:24px_24px]" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full max-w-[420px] z-10"
      >
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-[#C36322] rounded-2xl flex items-center justify-center text-white text-3xl font-black shadow-2xl shadow-[#C36322]/20 mb-4 rotate-[5deg]">
            <Calendar className="w-10 h-10" />
          </div>
          <h1 className="text-3xl font-black tracking-tighter text-white">NiftyCalendar</h1>
        </div>

        <Card className="border-gray-200 shadow-2xl shadow-slate-200/50 rounded-2xl overflow-hidden bg-white">
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2 rounded-none h-12 bg-gray-50/50 border-b border-gray-100">
              <TabsTrigger value="login" className="text-xs font-bold uppercase tracking-widest data-[state=active]:bg-white data-[state=active]:text-[#C36322] transition-all">Inloggen</TabsTrigger>
              <TabsTrigger value="signup" className="text-xs font-bold uppercase tracking-widest data-[state=active]:bg-white data-[state=active]:text-[#C36322] transition-all">Registreren</TabsTrigger>
            </TabsList>
            
            <CardContent className="pt-8 pb-6 px-8">
              <TabsContent value="login" className="mt-0">
                <form onSubmit={(e) => handleSubmit(e, 'login')} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-[10px] font-bold uppercase text-gray-400 tracking-wider">E-mailadres</Label>
                    <div className="relative group">
                      <Input 
                        id="email" 
                        name="email"
                        type="email" 
                        placeholder="name@company.com" 
                        required 
                        className="pl-10 h-11 border-gray-100 bg-gray-50/30 focus-visible:ring-[#C36322]"
                      />
                      <Mail className="w-4 h-4 absolute left-3.5 top-3.5 text-gray-300 group-focus-within:text-[#C36322] transition-colors" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password" className="text-[10px] font-bold uppercase text-gray-400 tracking-wider">Wachtwoord</Label>
                      <a href="#" className="text-[10px] font-bold uppercase text-[#C36322] hover:underline">Vergeten?</a>
                    </div>
                    <div className="relative group">
                      <Input 
                        id="password" 
                        name="password"
                        type="password" 
                        required 
                        className="pl-10 h-11 border-gray-100 bg-gray-50/30 focus-visible:ring-[#C36322]"
                      />
                      <Lock className="w-4 h-4 absolute left-3.5 top-3.5 text-gray-300 group-focus-within:text-[#C36322] transition-colors" />
                    </div>
                  </div>
                  <Button 
                    type="submit" 
                    className="w-full h-11 bg-[#C36322] hover:bg-[#a6541d] text-white font-bold transition-all active:scale-[0.98] mt-2 group"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    ) : (
                      <>
                        Inloggen
                        <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                      </>
                    )}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup" className="mt-0">
                <form onSubmit={(e) => handleSubmit(e, 'signup')} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name" className="text-[10px] font-bold uppercase text-gray-400 tracking-wider">Volledige naam</Label>
                    <div className="relative group">
                      <Input 
                        id="name" 
                        name="name"
                        placeholder="John Doe" 
                        required 
                        className="pl-10 h-11 border-gray-100 bg-gray-50/30 focus-visible:ring-[#C36322]"
                      />
                      <User className="w-4 h-4 absolute left-3.5 top-3.5 text-gray-300 group-focus-within:text-[#C36322] transition-colors" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-email" className="text-[10px] font-bold uppercase text-gray-400 tracking-wider">E-mailadres</Label>
                    <div className="relative group">
                      <Input 
                        id="signup-email" 
                        name="signup-email"
                        type="email" 
                        placeholder="name@company.com" 
                        required 
                        className="pl-10 h-11 border-gray-100 bg-gray-50/30 focus-visible:ring-[#C36322]"
                      />
                      <Mail className="w-4 h-4 absolute left-3.5 top-3.5 text-gray-300 group-focus-within:text-[#C36322] transition-colors" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password" className="text-[10px] font-bold uppercase text-gray-400 tracking-wider">Wachtwoord</Label>
                    <div className="relative group">
                      <Input 
                        id="signup-password" 
                        name="signup-password"
                        type="password" 
                        required 
                        className="pl-10 h-11 border-gray-100 bg-gray-50/30 focus-visible:ring-[#C36322]"
                      />
                      <Lock className="w-4 h-4 absolute left-3.5 top-3.5 text-gray-300 group-focus-within:text-[#C36322] transition-colors" />
                    </div>
                  </div>
                  <Button 
                    type="submit" 
                    className="w-full h-11 bg-[#C36322] hover:bg-[#a6541d] text-white font-bold transition-all active:scale-[0.98] mt-2 group"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    ) : (
                      <>
                        Account aanmaken
                        <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                      </>
                    )}
                  </Button>
                </form>
              </TabsContent>
            </CardContent>
            
          </Tabs>
        </Card>

      </motion.div>
    </div>
  );
}
