"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { RouteGuard } from "@/components/layout/RouteGuard";
import { FloatingChatbot } from "@/components/chat/FloatingChatbot";
import { EmergencyBanner } from "@/components/layout/EmergencyBanner";
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const pathname = usePathname();

  const [sidebarWidth, setSidebarWidth] = useState(256); // Default w-64 is 256px
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    if (!isResizing) return;
    const handleMouseMove = (e: MouseEvent) => {
      let newWidth = e.clientX;
      if (newWidth < 200) newWidth = 200;
      if (newWidth > 300) newWidth = 300;
      setSidebarWidth(newWidth);
    };
    const handleMouseUp = () => setIsResizing(false);
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  if (pathname === '/login') {
    return <>{children}</>;
  }

  return (
    <>
      <Sidebar 
        isCollapsed={isCollapsed} 
        setIsCollapsed={setIsCollapsed} 
        isMobileOpen={isMobileOpen} 
        setIsMobileOpen={setIsMobileOpen}
        sidebarWidth={sidebarWidth}
        setIsResizing={setIsResizing}
        isResizing={isResizing}
      />
      
      {/* Mobile overlay */}
      {isMobileOpen && (
        <div 
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      <div 
        className={`flex-1 flex flex-col h-screen overflow-hidden transition-all duration-0 md:[margin-left:var(--sidebar-width)]`}
        style={{ '--sidebar-width': `${isCollapsed ? 80 : sidebarWidth}px` } as React.CSSProperties}
      >
        <EmergencyBanner />
        <Header setIsMobileOpen={setIsMobileOpen} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 relative">
          <RouteGuard>
            {children}
          </RouteGuard>
        </main>
        <FloatingChatbot />
      </div>
    </>
  );
}
