/**
 * RBAC permissions — role names match backend UserRole enum exactly.
 *
 * Backend roles: DISTRICT_ADMIN | MEDICAL_OFFICER | RECEPTIONIST |
 *                DATA_ENTRY | PHARMACIST | DOCTOR | DEVELOPER
 *
 * Note: The old "PHC_ADMIN" maps to MEDICAL_OFFICER,
 *       the old "PHC_STAFF"  maps to DATA_ENTRY.
 */

export const ROUTE_PERMISSIONS: Record<string, string[]> = {
  "/district-admin": ["NATION_ADMIN", "DISTRICT_ADMIN", "DEVELOPER"],
  "/health-centre":  ["DISTRICT_ADMIN", "DEVELOPER"],
  "/inventory":      ["NATION_ADMIN", "DISTRICT_ADMIN", "MEDICAL_OFFICER", "DATA_ENTRY", "RECEPTIONIST", "PHARMACIST", "DEVELOPER"],
  "/forecasting":    ["NATION_ADMIN", "DISTRICT_ADMIN", "MEDICAL_OFFICER", "DEVELOPER"],
  "/attendance":     ["DISTRICT_ADMIN", "MEDICAL_OFFICER", "DOCTOR", "RECEPTIONIST", "PHARMACIST", "DATA_ENTRY", "LAB_TECHNICIAN", "DEVELOPER"],
  "/patients":       ["DISTRICT_ADMIN", "MEDICAL_OFFICER", "DATA_ENTRY", "RECEPTIONIST", "DOCTOR", "DEVELOPER"],
  "/beds":           ["DISTRICT_ADMIN", "MEDICAL_OFFICER", "DATA_ENTRY", "RECEPTIONIST", "DEVELOPER"],
  "/analytics":      ["NATION_ADMIN", "DISTRICT_ADMIN", "MEDICAL_OFFICER", "DEVELOPER"],
  "/ai-audit":       ["DISTRICT_ADMIN", "MEDICAL_OFFICER", "DEVELOPER"],
  "/manage-roles":   ["DISTRICT_ADMIN", "MEDICAL_OFFICER", "DEVELOPER"],
  "/phc":            ["DISTRICT_ADMIN", "MEDICAL_OFFICER", "DEVELOPER"],
  "/reports":        ["DISTRICT_ADMIN", "MEDICAL_OFFICER", "DEVELOPER"],
  "/federation":     ["NATION_ADMIN", "DEVELOPER"],
  "/redistribution": ["NATION_ADMIN", "DISTRICT_ADMIN", "DEVELOPER"],
};

export const ROLE_HOME: Record<string, string> = {
  NATION_ADMIN:    "/federation",
  DISTRICT_ADMIN:  "/district-admin",
  MEDICAL_OFFICER: "/inventory",
  DATA_ENTRY:      "/inventory",
  RECEPTIONIST:    "/patients",
  PHARMACIST:      "/inventory",
  DOCTOR:          "/attendance",
  DEVELOPER:       "/district-admin",
};

export function canAccess(role: string, pathname: string): boolean {
  if (role === "DEVELOPER") return true;
  if (pathname === "/" || pathname === "/login") return true;

  const basePath = "/" + pathname.split("/")[1];
  const allowed = ROUTE_PERMISSIONS[basePath];
  if (!allowed) return true; // public or unmanaged

  return allowed.includes(role);
}
