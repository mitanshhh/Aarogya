"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bell, Check, Loader2 } from "lucide-react";
import { apiFetch, API_BASE_URL } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";

export default function NotificationsPage() {
  const { token, user } = useAuth();
  const { t } = useLanguage();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = async () => {
    if (!token) return;
    try {
      setLoading(true);
      const res = await apiFetch(`${API_BASE_URL}/api/v1/notifications`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
    // Poll every 30s
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [token]);

  const markAsRead = async (id: number) => {
    if (!token) return;
    try {
      await apiFetch(`${API_BASE_URL}/api/v1/notifications/${id}/read`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      // Optimistically update
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    } catch (e) {
      console.error(e);
    }
  };

  const markAllAsRead = async () => {
    if (!token) return;
    try {
      await apiFetch(`${API_BASE_URL}/api/v1/notifications/read-all`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      // Optimistically update
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch (e) {
      console.error(e);
    }
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto p-4 md:p-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <Bell className="w-6 h-6 text-primary" />
            {t("header.notifications") || "Notifications"}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Stay updated with the latest alerts and approvals.
          </p>
        </div>
        {unreadCount > 0 && (
          <Button onClick={markAllAsRead} variant="outline" className="flex items-center gap-2">
            <Check className="w-4 h-4" />
            Mark All as Read
          </Button>
        )}
      </div>

      {loading && notifications.length === 0 ? (
        <div className="flex justify-center p-8">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : notifications.length === 0 ? (
        <Card className="border-border bg-muted/30">
          <CardContent className="p-12 text-center flex flex-col items-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <Bell className="w-8 h-8 text-muted-foreground opacity-50" />
            </div>
            <h3 className="text-lg font-semibold text-foreground">No Notifications</h3>
            <p className="text-muted-foreground mt-2">You're all caught up!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`relative p-5 rounded-xl border transition-all ${
                n.is_read
                  ? "bg-card border-border/50 opacity-80"
                  : "bg-primary/5 border-primary/20 shadow-sm"
              }`}
            >
              {/* Unread Indicator Blinking */}
              {!n.is_read && (
                <div className="absolute top-5 right-5 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
                </div>
              )}

              <div className="pr-10">
                <h3 className={`font-semibold text-lg ${n.is_read ? "text-muted-foreground" : "text-foreground"}`}>
                  {n.title}
                </h3>
                <p className="text-sm text-foreground/80 mt-2 whitespace-pre-wrap leading-relaxed">
                  {n.message}
                </p>
                <div className="flex items-center gap-4 mt-4">
                  <span className="text-xs text-muted-foreground/80 font-medium">
                    {new Date(n.timestamp).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
                  </span>
                  {!n.is_read && (
                    <button
                      onClick={() => markAsRead(n.id)}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Mark as read
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
