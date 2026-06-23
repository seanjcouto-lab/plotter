// Native BarcodeDetector wrapper.
// Works on iPhone Safari 17+, Android Chrome, macOS Chrome.
// Windows desktop browsers do NOT support it — we degrade to manual entry.

type BarcodeFormat =
  | 'aztec'
  | 'code_128'
  | 'code_39'
  | 'code_93'
  | 'codabar'
  | 'data_matrix'
  | 'ean_13'
  | 'ean_8'
  | 'itf'
  | 'pdf417'
  | 'qr_code'
  | 'upc_a'
  | 'upc_e';

interface DetectedBarcode {
  rawValue: string;
  format: BarcodeFormat;
  boundingBox: DOMRectReadOnly;
}

interface BarcodeDetectorConstructor {
  new (opts?: { formats?: BarcodeFormat[] }): {
    detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]>;
  };
  getSupportedFormats?: () => Promise<BarcodeFormat[]>;
}

declare global {
  interface Window {
    BarcodeDetector?: BarcodeDetectorConstructor;
  }
}

export function isBarcodeScanSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.BarcodeDetector === 'function';
}

export interface ScannerHandle {
  stop: () => void;
}

export interface StartScannerOptions {
  video: HTMLVideoElement;
  onDetected: (value: string, format: BarcodeFormat) => void;
  onError?: (error: Error) => void;
  intervalMs?: number;
}

export async function startScanner({
  video,
  onDetected,
  onError,
  intervalMs = 200,
}: StartScannerOptions): Promise<ScannerHandle> {
  if (!isBarcodeScanSupported()) {
    throw new Error('BarcodeDetector not supported in this browser');
  }
  const Ctor = window.BarcodeDetector!;
  const detector = new Ctor({
    formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'code_93', 'qr_code', 'data_matrix'],
  });

  let stopped = false;
  let stream: MediaStream | null = null;

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false,
    });
  } catch (err) {
    onError?.(err as Error);
    throw err;
  }

  video.srcObject = stream;
  video.setAttribute('playsinline', 'true');
  await video.play().catch(() => undefined);

  const tick = async () => {
    if (stopped) return;
    try {
      const results = await detector.detect(video);
      if (results.length > 0) {
        onDetected(results[0].rawValue, results[0].format);
        return;
      }
    } catch (err) {
      onError?.(err as Error);
    }
    if (!stopped) setTimeout(tick, intervalMs);
  };

  setTimeout(tick, intervalMs);

  return {
    stop: () => {
      stopped = true;
      stream?.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    },
  };
}
