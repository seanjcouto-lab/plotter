import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { isBarcodeScanSupported, startScanner, type ScannerHandle } from '@/services/barcodeScanner';

interface Props {
  open: boolean;
  onClose: () => void;
  onDetected: (value: string) => void;
}

export function BarcodeScannerSheet({ open, onClose, onDetected }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const handleRef = useRef<ScannerHandle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [supported] = useState(() => isBarcodeScanSupported());

  useEffect(() => {
    if (!open) return;
    setError(null);

    if (!supported) {
      setError('This browser does not support live barcode scanning. Use Safari on iPhone or Chrome on Android, or type the part number below.');
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;

    startScanner({
      video,
      onDetected: (value) => {
        if (cancelled) return;
        handleRef.current?.stop();
        onDetected(value);
      },
      onError: (err) => {
        if (cancelled) return;
        setError(err.message || 'Camera error');
      },
    })
      .then((h) => {
        if (cancelled) {
          h.stop();
        } else {
          handleRef.current = h;
        }
      })
      .catch((err) => {
        if (!cancelled) {
          const msg = (err as Error).message || 'Camera unavailable';
          if (msg.includes('Permission') || msg.includes('denied')) {
            setError('Camera permission denied. Enable camera access for this site, or type the part number.');
          } else {
            setError(msg);
          }
        }
      });

    return () => {
      cancelled = true;
      handleRef.current?.stop();
      handleRef.current = null;
    };
  }, [open, supported, onDetected]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col">
      <div className="flex justify-between items-center px-4 pt-4 pb-2 safe-top">
        <h2 className="text-white text-lg font-medium">Scan barcode</h2>
        <button
          onClick={onClose}
          aria-label="Close scanner"
          className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center"
        >
          <X className="w-5 h-5 text-white" />
        </button>
      </div>

      <div className="relative flex-1 flex items-center justify-center overflow-hidden">
        {supported && !error ? (
          <>
            <video
              ref={videoRef}
              className="w-full h-full object-cover"
              playsInline
              muted
            />
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="w-72 h-44 border-2 border-gold-500 rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
            </div>
            <div className="absolute bottom-8 left-0 right-0 text-center text-white/80 text-sm px-6">
              Point the camera at the barcode on the part or packing slip
            </div>
          </>
        ) : (
          <div className="px-8 text-center">
            <p className="text-white/90 text-sm leading-relaxed">{error}</p>
            <button
              onClick={onClose}
              className="mt-6 px-5 py-2.5 rounded-lg bg-gold-500 text-navy-900 font-medium text-sm"
            >
              Enter manually
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
