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
import { Calendar, Mail, Lock, User as UserIcon, ArrowRight, Loader2, AlertCircle, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import type { CalendarCategory } from '@/src/types';

interface User {
  id: number;
  email: string;
  name: string;
  authMethod?: 'oauth' | 'basic';
}

interface AuthPageProps {
  onLogin: (user: User, token: string) => void;
}

export function AuthPage({ onLogin }: AuthPageProps) {
  const [isLoading, setIsLoading] = React.useState(false);
  const [authMethod, setAuthMethod] = React.useState<'basic' | 'oauth'>('basic');
  const [isCheckingConfig, setIsCheckingConfig] = React.useState(true);
  const [caldavConfig, setCaldavConfig] = React.useState<{
    authMethod: 'oauth' | 'basic';
    serverUrl: string;
    oauthConfigured: boolean;
  } | null>(null);

  // Check CalDAV configuration on mount
  React.useEffect(() => {
    const checkConfig = async () => {
      try {
        const response = await fetch('/api/status');
        const data = await response.json();
        
        setCaldavConfig({
          authMethod: data.authMethod || 'basic',
          serverUrl: data.ServerUrl || '',
          oauthConfigured: data.authMethod === 'oauth'
        });
        
        // Set default auth method based on configuration
        if (data.authMethod) {
          setAuthMethod(data.authMethod);
        }
        
        // Only show OAuth tab if OAuth is configured
        if (data.authMethod === 'oauth') {
          setAuthMethod('oauth');
        }
      } catch (err) {
        console.error('Failed to check CalDAV config:', err);
      } finally {
        setIsCheckingConfig(false);
      }
    };
    
    checkConfig();
  }, []);

  const handleBasicAuthSubmit = async (e: React.FormEvent<HTMLFormElement>, type: 'login' | 'signup') => {
    e.preventDefault();
    setIsLoading(true);
    
    const formData = new FormData(e.currentTarget);
    const email = type === 'login' ? formData.get('email') : formData.get('signup-email');
    const password = type === 'login' ? formData.get('password') : formData.get('signup-password');
    const name = formData.get('name');

    try {
      const endpoint = type === 'login' ? '/api/auth/login' : '/api/auth/register';
      const body = type === 'login' 
        ? { email, password, authMethod: 'basic' } 
        : { email, name, password, authMethod: 'basic' };

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

  const handleOAuthLogin = async () => {
    setIsLoading(true);
    
    try {
      // Get OAuth authorization URL
      const response = await fetch('/api/auth/oauth/authorize', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to get OAuth authorization URL');
      }
      
      // Redirect to OAuth provider
      window.location.href = data.authorizationUrl;
    } catch (err: any) {
      toast.error(err.message);
      setIsLoading(false);
    }
  };

  const handleOAuthCallback = async (code: string, state?: string) => {
    setIsLoading(true);
    
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, state, authMethod: 'oauth' })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'OAuth login failed');
      }
      
      onLogin(data.user, data.token);
    } catch (err: any) {
      toast.error(err.message);
      setIsLoading(false);
    }
  };

  // Check URL for OAuth code on mount
  React.useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    const error = urlParams.get('error');
    
    if (error) {
      toast.error(error);
      // Clear error from URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    
    if (code && !isLoading && authMethod === 'oauth') {
      handleOAuthCallback(code, state);
      // Clear code from URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [authMethod, isLoading]);

  // If still checking config, show loading
  if (isCheckingConfig) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[#0c0a09] text-gray-900 p-4 relative overflow-hidden">
        <div className="w-12 h-12 border-4 border-t-[#C36322] border-gray-700 rounded-full animate-spin" />
      </div>
    );
  }

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
          
          {/* Show CalDAV info if configured */}
          {caldavConfig?.serverUrl && (
            <div className="mt-2 flex items-center gap-2 text-sm text-gray-400">
              <div className="w-2 h-2 bg-green-500 rounded-full" />
              <span>Verbonden met CalDAV</span>
            </div>
          )}
        </div>

        <Card className="border-gray-200 shadow-2xl shadow-slate-200/50 rounded-2xl overflow-hidden bg-white">
          {caldavConfig?.oauthConfigured ? (
            // OAuth only
            <div className="p-8">
              <div className="text-center mb-8">
                <h2 className="text-xl font-bold text-gray-900">Inloggen met Nextcloud</h2>
                <p className="text-sm text-gray-500 mt-2">
                  Klik op onderstaande knop om in te loggen via Nextcloud OAuth 2.0
                </p>
              </div>
              
              <Button 
                onClick={handleOAuthLogin}
                className="w-full h-11 bg-[#C36322] hover:bg-[#a6541d] text-white font-bold transition-all active:scale-[0.98] group"
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                ) : (
                  <>
                    Inloggen met Nextcloud
                    <ExternalLink className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>
            </div>
          ) : (
            // Basic Auth or both
            <Tabs defaultValue={authMethod === 'oauth' ? 'oauth' : 'login'} className="w-full">
              <TabsList className="grid w-full grid-cols-2 rounded-none h-12 bg-gray-50/50 border-b border-gray-100">
                <TabsTrigger value="login" className="text-xs font-bold uppercase tracking-widest data-[state=active]:bg-white data-[state=active]:text-[#C36322] transition-all">Inloggen</TabsTrigger>
                <TabsTrigger value="signup" className="text-xs font-bold uppercase tracking-widest data-[state=active]:bg-white data-[state=active]:text-[#C36322] transition-all">Registreren</TabsTrigger>
              </TabsList>
              
              <CardContent className="pt-8 pb-6 px-8">
                <TabsContent value="login" className="mt-0">
                  <form onSubmit={(e) => handleBasicAuthSubmit(e, 'login')} className="space-y-4">
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
                  <form onSubmit={(e) => handleBasicAuthSubmit(e, 'signup')} className="space-y-4">
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
                        <UserIcon className="w-4 h-4 absolute left-3.5 top-3.5 text-gray-300 group-focus-within:text-[#C36322] transition-colors" />
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
              
              {/* OAuth option for Basic Auth mode */}
              {caldavConfig?.authMethod === 'basic' && (
                <CardFooter className="flex justify-center pt-0 pb-6">
                  <p className="text-xs text-gray-500">
                    Of log in via CalDAV server 
                    <Button 
                      variant="link" 
                      className="text-[#C36322] p-0 h-auto text-xs font-bold"
                      onClick={() => setAuthMethod('oauth')}
                    >
                      OAuth configureren
                    </Button>
                  </p>
                </CardFooter>
              )}
            </Tabs>
          )}
        </Card>

      </motion.div>
    </div>
  );
}
