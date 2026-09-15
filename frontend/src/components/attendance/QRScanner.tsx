"use client";

import { useState, useEffect, useRef } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScanLine, Loader2, MapPin, CheckCircle, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';

interface QRScannerProps {
  doctorId: number;
  onScanSuccess?: () => void;
}

export default function QRScanner({ doctorId, onScanSuccess }: QRScannerProps) {
  const [open, setOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [locating, setLocating] = useState(false);
  const [result, setResult] = useState<any>(null);
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    
    if (open && !result && scanning) {
      // Delay initialization to ensure the DOM element is fully mounted by Radix Dialog
      timer = setTimeout(() => {
        const element = document.getElementById("reader");
        if (element) {
          // Removed qrbox to allow scanning full uncropped screenshots!
          const scanner = new Html5QrcodeScanner("reader", { fps: 10 }, false);
          scannerRef.current = scanner;
          
          scanner.render((decodedText) => {
            if (scannerRef.current) {
              scannerRef.current.clear().then(() => {
                scannerRef.current = null;
                setScanning(false);
                handleScanSuccess(decodedText);
              }).catch(e => {
                scannerRef.current = null;
                setScanning(false);
                handleScanSuccess(decodedText);
              });
            } else {
              setScanning(false);
              handleScanSuccess(decodedText);
            }
          }, (error) => {
            // ignore continuous errors without letting them bubble up
            if (typeof error === 'string' && error.includes('NotFoundException')) return;
            if ((error as any)?.message?.includes('NotFoundException')) return;
          });
        }
      }, 150);
    }

    return () => {
      if (timer) clearTimeout(timer);
      if (scannerRef.current) {
        scannerRef.current.clear().catch(e => console.error(e));
        scannerRef.current = null;
      }
    };
  }, [open, result]);

  const handleScanSuccess = async (qrToken: string) => {
    setLocating(true);
    
    // Request Geolocation
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser");
      setLocating(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          const role = localStorage.getItem("role") || "DOCTOR";
          
          const res = await apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/attendance/scan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Role': role },
            body: JSON.stringify({
              qr_token: qrToken,
              lat: latitude,
              lng: longitude,
              doctor_id: doctorId
            })
          });
          
          const data = await res.json();
          setResult({ success: res.ok, message: data.message || (data.detail || "Error") });
          if(res.ok) {
            toast.success("Attendance verified!");
            if (onScanSuccess) onScanSuccess();
          }
          else toast.error("Verification failed");
          
        } catch(e) {
          toast.error("Network error");
          setResult({ success: false, message: "Network error occurred." });
        } finally {
          setLocating(false);
        }
      },
      (error) => {
        toast.error("Unable to retrieve your location");
        setLocating(false);
        setResult({ success: false, message: "Location permission denied." });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleOpen = (isOpen: boolean) => {
    if (!isOpen && scannerRef.current) {
      scannerRef.current.clear().then(() => {
        scannerRef.current = null;
        setOpen(false);
      }).catch(e => {
        scannerRef.current = null;
        setOpen(false);
      });
      return;
    }
    
    setOpen(isOpen);
    if(isOpen) {
      setResult(null);
      setScanning(true);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger render={<Button size="lg" className="flex items-center gap-2 cursor-pointer shadow-md bg-indigo-600 hover:bg-indigo-700" />}>
        <ScanLine className="w-5 h-5" />
        Scan Daily QR to Check-in
      </DialogTrigger>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle className="text-center">Daily Attendance Scan</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center justify-center py-4 min-h-[300px]">
          
          {locating && (
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="relative">
                <MapPin className="w-12 h-12 text-primary animate-bounce" />
                <Loader2 className="w-12 h-12 absolute inset-0 text-primary/30 animate-spin" />
              </div>
              <h3 className="text-lg font-semibold">Verifying Location...</h3>
              <p className="text-sm text-muted-foreground">Please allow location access if prompted. You must be within 100 meters of the PHC.</p>
            </div>
          )}

          {!locating && !result && scanning && (
            <div className="w-full">
              <p className="text-sm text-center text-muted-foreground mb-4">Point your camera at the PHC Admin's QR code.</p>
              <div id="reader" className="w-full rounded-xl overflow-hidden border-2 border-primary/20"></div>
            </div>
          )}

          {result && (
            <div className="flex flex-col items-center text-center space-y-4 w-full">
              {result.success ? (
                <>
                  <CheckCircle className="w-16 h-16 text-green-500" />
                  <h3 className="text-xl font-bold text-green-600">Attendance Successful</h3>
                </>
              ) : (
                <>
                  <XCircle className="w-16 h-16 text-red-500" />
                  <h3 className="text-xl font-bold text-red-600">Verification Failed</h3>
                </>
              )}
              <div className="bg-muted p-4 rounded-lg w-full text-sm">
                {result.message}
              </div>
              <Button onClick={() => setOpen(false)} className="w-full cursor-pointer mt-4">Close</Button>
            </div>
          )}
          
        </div>
      </DialogContent>
    </Dialog>
  );
}
