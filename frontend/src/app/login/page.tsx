"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { ROLE_HOME } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Hospital, User, Lock, ArrowRight, Shield } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isAdminMode, setIsAdminMode] = useState(false);

  const doLogin = async (user: string, pass: string) => {
    setIsLoading(true);
    try {
      await login(user, pass);
      const role = localStorage.getItem("role") || "MEDICAL_OFFICER";
      const home = ROLE_HOME[role] || "/inventory";
      toast.success("Login successful!");
      router.push(home);
    } catch (err: any) {
      toast.error(err.message || "Login failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    await doLogin(username, password);
  };

  const quickLogin = (user: string) => {
    setUsername(user);
    setPassword("password123");
    doLogin(user, "password123");
  };

  return (
    <div className="min-h-screen w-full flex-1 bg-background flex flex-col py-8 px-4 sm:px-6 lg:px-8 relative overflow-x-hidden overflow-y-auto">
      {/* Background Image */}
      <div
        className="absolute inset-0 z-0 opacity-20"
        style={{
          backgroundImage: "url('https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?q=80&w=2753&auto=format&fit=crop')",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
      {/* White Overlay Div */}
      <div className="absolute inset-0 z-0 bg-white/80 dark:bg-background/80 backdrop-blur-sm"></div>

      <div className="absolute inset-0 z-0">
        <div className="absolute top-0 -left-4 w-72 h-72 bg-primary rounded-full mix-blend-multiply filter blur-2xl opacity-20 animate-blob"></div>
        <div className="absolute top-0 -right-4 w-72 h-72 bg-blue-500 rounded-full mix-blend-multiply filter blur-2xl opacity-20 animate-blob animation-delay-2000"></div>
        <div className="absolute -bottom-8 left-20 w-72 h-72 bg-purple-500 rounded-full mix-blend-multiply filter blur-2xl opacity-20 animate-blob animation-delay-4000"></div>
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="m-auto w-full max-w-lg relative z-10 flex flex-col"
      >
        <div className="flex justify-center">
          <div className="h-20 w-20 bg-background rounded-2xl flex items-center justify-center border border-primary/20 shadow-sm backdrop-blur-sm overflow-hidden p-2">
            <img src="./logo.png" alt="Aarogya Logo" className="w-full h-full object-contain" />
          </div>
        </div>
        <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-foreground">
          Welcome to Aarogya
        </h2>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          AI-Powered Health Centre Management System
        </p>

        <div className="mt-8 w-full">
          <div className="bg-card/60 backdrop-blur-xl py-8 px-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)] sm:rounded-2xl sm:px-10 border border-border/50">
            
            <form className="space-y-6" onSubmit={handleLogin}>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Username</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <User className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <input
                    id="username"
                    type="text"
                    required
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2.5 border border-border rounded-xl bg-background/50 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all duration-200"
                    placeholder="Enter your username"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Password</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <input
                    id="password"
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2.5 border border-border rounded-xl bg-background/50 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all duration-200"
                    placeholder="Enter your password"
                  />
                </div>
              </div>

              <div>
                <Button
                  type="submit"
                  id="login-submit"
                  disabled={isLoading}
                  className="w-full flex justify-center py-2.5 px-4 rounded-xl text-sm font-medium shadow-md transition-all duration-200 hover:shadow-lg"
                >
                  {isLoading ? "Signing in..." : "Sign in"}
                </Button>
              </div>
            </form>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-card/60 px-2 text-muted-foreground backdrop-blur-xl">Or quick login</span>
              </div>
            </div>

            <div className="space-y-6">
              <div className="text-center mb-6">
                <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  {isAdminMode ? "Admin Login" : "Staff Login"}
                </p>
                <div className="h-px bg-border/60 w-1/2 mx-auto"></div>
              </div>

              <AnimatePresence mode="wait">
                {!isAdminMode ? (
                  <motion.div 
                    key="staff"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="flex flex-col gap-3"
                  >
                    <Button onClick={() => quickLogin("mo_alpha")} disabled={isLoading} variant="outline" className="w-full justify-between h-12 text-base font-medium">
                      <div className="flex items-center gap-2"><User className="w-4 h-4 text-blue-500" /> Medical Officer Alpha</div>
                      <ArrowRight className="w-4 h-4 text-muted-foreground" />
                    </Button>
                    <Button onClick={() => quickLogin("recp_alpha")} disabled={isLoading} variant="outline" className="w-full justify-between h-12 text-base font-medium">
                      <div className="flex items-center gap-2"><User className="w-4 h-4 text-purple-500" /> Receptionist Alpha</div>
                      <ArrowRight className="w-4 h-4 text-muted-foreground" />
                    </Button>
                    <Button onClick={() => quickLogin("doctor_alpha")} disabled={isLoading} variant="outline" className="w-full justify-between h-12 text-base font-medium">
                      <div className="flex items-center gap-2"><User className="w-4 h-4 text-green-500" /> Doctor Alpha</div>
                      <ArrowRight className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  </motion.div>
                ) : (
                  <motion.div 
                    key="admin"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="flex flex-col gap-3"
                  >
                    <Button onClick={() => quickLogin("admin")} disabled={isLoading} variant="outline" className="w-full justify-between h-12 text-base font-medium border-primary/20 bg-primary/5 hover:bg-primary/10">
                      <div className="flex items-center gap-2"><Shield className="w-4 h-4 text-primary" /> District Administrator</div>
                      <ArrowRight className="w-4 h-4 text-primary" />
                    </Button>
                    <Button onClick={() => quickLogin("admin_ind")} disabled={isLoading} variant="outline" className="w-full justify-between h-12 text-base font-medium border-orange-500/20 bg-orange-500/5 hover:bg-orange-500/10">
                      <div className="flex items-center gap-2"><Shield className="w-4 h-4 text-orange-500" /> India Administrator</div>
                      <ArrowRight className="w-4 h-4 text-orange-500" />
                    </Button>
                    <Button onClick={() => quickLogin("admin_bra")} disabled={isLoading} variant="outline" className="w-full justify-between h-12 text-base font-medium border-green-500/20 bg-green-500/5 hover:bg-green-500/10">
                      <div className="flex items-center gap-2"><Shield className="w-4 h-4 text-green-500" /> Brazil Administrator</div>
                      <ArrowRight className="w-4 h-4 text-green-500" />
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="mt-8 pt-6 border-t border-border flex justify-center w-full">
                <Button 
                  variant="default" 
                  onClick={() => setIsAdminMode(!isAdminMode)}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors py-6 text-base"
                >
                  {isAdminMode ? "Switch to Staff Login" : "Switch to Admin"}
                </Button>
              </div>
            </div>

          </div>
        </div>
      </motion.div>
    </div>
  );
}
