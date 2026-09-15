"use client";

import { useState, useEffect, useMemo } from 'react';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar as CalendarIcon, Clock, Activity, MapPin, QrCode, AlertCircle, ShieldCheck, CheckCircle } from 'lucide-react';
import QRScanner from './QRScanner';
import { toast } from 'sonner';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function StaffDashboard() {
  const { selectedHospitalId } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [staffId, setStaffId] = useState<number | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      const hospitalQueryParam = selectedHospitalId ? `?hospital_id=${selectedHospitalId}` : '';
      const role = localStorage.getItem("role") || "DOCTOR";
      const res = await apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/attendance/me${hospitalQueryParam}`, {
        headers: { 'X-Role': role }
      });
      if (res.ok) {
        const dashboardData = await res.json();
        setData(dashboardData);
        if (dashboardData?.staff?.id) {
          setStaffId(dashboardData.staff.id);
        }
      } else {
        if (res.status === 404) {
          setData(null);
        } else {
          throw new Error("Failed to fetch dashboard");
        }
      }
    } catch (e) {
      toast.error("Failed to fetch dashboard data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedHospitalId]);

  const handleLinkCalendar = () => {
    if (staffId) {
      window.location.href = `${process.env.NEXT_PUBLIC_API_URL}/api/v1/calendar/auth?doctor_id=${staffId}`;
    } else {
      toast.error("Staff ID not found.");
    }
  };

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'Present': return 'bg-green-100 text-green-700 border-green-200';
      case 'Late': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'Absent': return 'bg-red-100 text-red-700 border-red-200';
      case 'On Leave': return 'bg-blue-100 text-blue-700 border-blue-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const chartData = useMemo(() => {
    if (!data?.history || data.history.length === 0) return [];
    // Show last 7 days trend
    return [...data.history].reverse().slice(-7).map((h: any) => ({
      name: new Date(h.date).toLocaleDateString(undefined, { weekday: 'short' }),
      rate: h.status === 'Present' ? 100 : (h.status === 'Late' ? 80 : 0)
    }));
  }, [data]);

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground">Loading your dashboard...</div>;
  }

  if (!data) {
    return (
      <div className="flex h-[80vh] items-center justify-center flex-col gap-4">
        <AlertCircle className="w-16 h-16 text-muted-foreground opacity-50" />
        <h2 className="text-2xl font-bold text-foreground">No Dashboard Data</h2>
        <p className="text-muted-foreground text-center max-w-md">
          We could not find your staff profile. Please ensure you are registered in the system.
        </p>
      </div>
    );
  }

  const { staff, stats, history } = data;

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto pb-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-2">
        <div>
          <h2 className="text-2xl font-semibold text-foreground">Welcome, {staff.name}</h2>
          <p className="text-sm text-muted-foreground mt-1">{staff.role} • Your Personal Attendance Dashboard</p>
        </div>
        <div className="flex gap-3">
          {staffId && <QRScanner doctorId={staffId} onScanSuccess={fetchData} />}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-border shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2 text-primary"><Activity className="w-4 h-4" /><span className="text-xs font-semibold">Attendance %</span></div>
            <div className="text-3xl font-bold">{stats.attendance_percentage}%</div>
          </CardContent>
        </Card>
        <Card className="border-border shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2 text-green-600"><ShieldCheck className="w-4 h-4" /><span className="text-xs font-semibold">Current Streak</span></div>
            <div className="text-3xl font-bold">{stats.streak} Days</div>
          </CardContent>
        </Card>
        <Card className="border-border shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2 text-yellow-600"><AlertCircle className="w-4 h-4" /><span className="text-xs font-semibold">Late Count</span></div>
            <div className="text-3xl font-bold">{stats.late_count}</div>
          </CardContent>
        </Card>
        <Card className="border-border shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2 text-blue-600"><CalendarIcon className="w-4 h-4" /><span className="text-xs font-semibold">Leaves Taken</span></div>
            <div className="text-3xl font-bold">{stats.leaves_taken}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Left Col: Timeline & Calendar */}
        <div className="md:col-span-2 space-y-6">
          <Card className="border-border shadow-sm h-full">
            <CardHeader className="border-b border-border bg-muted/10 pb-4">
              <CardTitle className="text-base font-semibold">Attendance History Timeline</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {history.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">No attendance records found.</div>
              ) : (
                <div className="max-h-[400px] overflow-y-auto">
                  {history.map((record: any, idx: number) => (
                    <div key={idx} className="flex items-start gap-4 p-4 border-b border-border last:border-0 hover:bg-muted/10 transition-colors">
                      <div className="mt-1 flex-shrink-0">
                        {record.status === 'Present' ? <div className="w-3 h-3 rounded-full bg-green-500" /> : 
                         record.status === 'Late' ? <div className="w-3 h-3 rounded-full bg-yellow-500" /> :
                         <div className="w-3 h-3 rounded-full bg-red-500" />}
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between mb-1">
                          <span className="font-medium text-foreground">{record.date}</span>
                          <Badge variant="outline" className={getStatusColor(record.status)}>{record.status}</Badge>
                        </div>
                        <div className="flex gap-4 text-xs text-muted-foreground mt-2">
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3"/> Check-in (IST): {record.check_in ? new Date(record.check_in).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute:'2-digit' }) : '--:--'}</span>
                          {record.gps_verified && <span className="flex items-center gap-1 text-green-600"><MapPin className="w-3 h-3"/> GPS Verified</span>}
                          {record.qr_scanned && <span className="flex items-center gap-1 text-green-600"><QrCode className="w-3 h-3"/> QR Verified</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Col: Google Calendar & Chart */}
        <div className="space-y-6">
          {staff.role === 'DOCTOR' && (
            <Card className="border-border shadow-sm bg-gradient-to-br from-indigo-50 to-white dark:from-indigo-950/20 dark:to-background">
              <CardContent className="p-6">
                <div className="flex flex-col items-center text-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-white shadow-sm flex items-center justify-center p-2">
                    <svg viewBox="0 0 48 48" className="w-full h-full"><path fill="#4285F4" d="M34,44H14c-5.5,0-10-4.5-10-10V14c0-5.5,4.5-10,10-10h20c5.5,0,10,4.5,10,10v20C44,39.5,39.5,44,34,44z"/><path fill="#34A853" d="M34,14H14c-1.1,0-2,0.9-2,2v20c0,1.1,0.9,2,2,2h20c1.1,0,2-0.9,2-2V16C36,14.9,35.1,14,34,14z"/><path fill="#FBBC05" d="M17,21h14v-2H17V21z M17,29h14v-2H17V29z M17,37h8v-2h-8V37z"/></svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">Google Calendar Integration</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      {staff.calendar_linked 
                        ? "Your calendar is linked. The system automatically fetches your availability to mark 'On Leave' status appropriately."
                        : "Link your Google Calendar to automatically update your Leave status."}
                    </p>
                  </div>
                  {!staff.calendar_linked ? (
                    <Button onClick={handleLinkCalendar} className="w-full bg-blue-600 hover:bg-blue-700 text-white shadow-sm cursor-pointer">
                      Link Calendar Account
                    </Button>
                  ) : (
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                      <CheckCircle className="w-3 h-3 mr-1" /> Linked Successfully
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="border-border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Monthly Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12}} />
                    <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12}} domain={[0, 100]} />
                    <Tooltip cursor={{fill: 'transparent'}} />
                    <Line type="monotone" dataKey="rate" stroke="#4f46e5" strokeWidth={3} dot={{r: 4, fill: '#4f46e5', strokeWidth: 2, stroke: '#fff'}} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
        
      </div>
    </div>
  );
}


