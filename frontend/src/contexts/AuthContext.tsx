"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { apiLogin, apiLogout, apiGetMe, API_BASE_URL } from "@/lib/api";

// ─── Backend role names (matches UserRole enum exactly) ──────────────────────
// PHC_ADMIN → MEDICAL_OFFICER  |  PHC_STAFF → DATA_ENTRY  (frontend aliases)
export type BackendRole =
  | "DISTRICT_ADMIN"
  | "NATION_ADMIN"
  | "MEDICAL_OFFICER"
  | "RECEPTIONIST"
  | "DATA_ENTRY"
  | "PHARMACIST"
  | "DOCTOR"
  | "DEVELOPER";

export interface User {
  id: number;
  username: string;
  email: string;
  role: BackendRole;
  hospital_id: number | null;
  nation_id?: number | null;
  hospital_name?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  selectedHospitalId: number | null;
  setSelectedHospitalId: (id: number | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]     = useState<User | null>(null);
  const [token, setToken]   = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedHospitalId, setSelectedHospitalIdState] = useState<number | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  // ── Restore session from localStorage ─────────────────────────────────────
  useEffect(() => {
    const storedToken = localStorage.getItem("access_token");
    const storedUser  = localStorage.getItem("user");
    const storedHospId = localStorage.getItem("selectedHospitalId");

    const initializeAuth = async () => {
      if (storedToken && storedUser) {
        try {
          setToken(storedToken);
          setUser(JSON.parse(storedUser) as User);
          if (storedHospId) setSelectedHospitalIdState(parseInt(storedHospId, 10));
          
          // Refresh user data from API to get latest properties (like hospital_name)
          const me = await apiGetMe();
          const mappedUser: User = {
            id:          me.id,
            username:    me.username,
            email:       me.email,
            role:        me.role as BackendRole,
            hospital_id: me.hospital_id,
            nation_id:   me.nation_id,
            hospital_name: me.hospital_name,
          };
          setUser(mappedUser);
          localStorage.setItem("user", JSON.stringify(mappedUser));
        } catch (error) {
          console.error("Failed to refresh session", error);
        }
      }
      setIsLoading(false);
    };

    initializeAuth();
  }, []);

  // ── Route protection ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!isLoading && !token && pathname !== "/login") {
      router.replace("/login");
    }
  }, [isLoading, token, pathname, router]);

  // ── Login ──────────────────────────────────────────────────────────────────
  const login = async (username: string, password: string) => {
    // 1. Get tokens
    const tokenData = await apiLogin(username, password);
    localStorage.setItem("access_token", tokenData.access_token);
    localStorage.setItem("refresh_token", tokenData.refresh_token);
    setToken(tokenData.access_token);

    // 2. Fetch user profile from /users/me
    const me = await apiGetMe();
    const mappedUser: User = {
      id:          me.id,
      username:    me.username,
      email:       me.email,
      role:        me.role as BackendRole,
      hospital_id: me.hospital_id,
      nation_id:   me.nation_id,
      hospital_name: me.hospital_name,
    };

    localStorage.setItem("user", JSON.stringify(mappedUser));
    localStorage.setItem("role", mappedUser.role);
    setUser(mappedUser);

    // 3. Store hospital_id if present
    if (mappedUser.hospital_id) {
      setAndStoreHospitalId(mappedUser.hospital_id);
    }
  };

  // ── Logout ─────────────────────────────────────────────────────────────────
  const logout = async () => {
    const rt = localStorage.getItem("refresh_token") || "";
    apiLogout(rt).catch(() => {}); // Fire and forget
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("user");
    localStorage.removeItem("role");
    localStorage.removeItem("selectedHospitalId");
    setToken(null);
    setUser(null);
    setSelectedHospitalIdState(null);
    router.push("/login");
  };

  const setAndStoreHospitalId = (id: number | null) => {
    setSelectedHospitalIdState(id);
    if (id !== null) localStorage.setItem("selectedHospitalId", String(id));
    else localStorage.removeItem("selectedHospitalId");
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        login,
        logout,
        selectedHospitalId,
        setSelectedHospitalId: setAndStoreHospitalId,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
