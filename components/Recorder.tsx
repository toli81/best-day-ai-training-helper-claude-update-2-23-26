
import React, { useRef, useState, useCallback, useEffect } from 'react';
import { SessionMode } from '../types';

type CameraKind = 'ultrawide' | 'wide' | 'telephoto' | 'front' | 'unknown';

interface CameraDevice {
  deviceId: string;
  label: string;
  kind: CameraKind;
  focalLengthRange?: { min: number; max: number };
}

interface RecorderProps {
  onSessionComplete: (blob: Blob, clientName: string, mode: SessionMode, snapshots: string[], duration: number) => void;
  onRecordingStateChange?: (isRecording: boolean) => void;
}

const Recorder: React.FC<RecorderProps> = ({ onSessionComplete, onRecordingStateChange }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const isStartingRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isProcessingUpload, setIsProcessingUpload] = useState(false);

  const [recording, setRecording] = useState(false);
  const [clientName, setClientName] = useState('');
  const [chunks, setChunks] = useState<Blob[]>([]);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [timer, setTimer] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<SessionMode>('clip');
  const [snapshots, setSnapshots] = useState<string[]>([]);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');

  // Camera lens selection state
  const [availableCameras, setAvailableCameras] = useState<CameraDevice[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const camerasEnumeratedRef = useRef(false);

  // Keep streamRef in sync with state for cleanup
  useEffect(() => {
    streamRef.current = stream;
  }, [stream]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      onRecordingStateChange?.(false);
    };
  }, [onRecordingStateChange]);

  const captureSnapshot = useCallback(() => {
    if (!videoRef.current || !recording) return;
    
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 180;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0, 320, 180);
      const base64 = canvas.toDataURL('image/jpeg', 0.4).split(',')[1];
      setSnapshots(prev => {
        if (prev.length > 500) return prev;
        return [...prev, base64];
      });
    }
  }, [recording]);

  useEffect(() => {
    let interval: any;
    let snapshotInterval: any;
    
    if (recording) {
      interval = setInterval(() => setTimer(t => t + 1), 1000);
      const freq = mode === 'clip' ? 2000 : (mode === 'workout30' ? 5000 : 12000);
      snapshotInterval = setInterval(captureSnapshot, freq);
    }
    
    return () => {
      clearInterval(interval);
      clearInterval(snapshotInterval);
    };
  }, [recording, captureSnapshot, mode]);

  const stopCurrentStream = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(track => {
        track.stop();
      });
      setStream(null);
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, [stream]);

  useEffect(() => {
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.setAttribute('playsinline', 'true');
      videoRef.current.onloadedmetadata = async () => {
        try {
          await videoRef.current?.play();
        } catch (e) {
          console.error("Playback failed:", e);
        }
      };
    }
  }, [stream]);

  // Classify a camera device by its label
  const classifyByLabel = (label: string): CameraKind => {
    const l = label.toLowerCase();
    if (l.includes('front') || l.includes('facing front') || l.includes('facetime')) return 'front';
    if (l.includes('ultra') || l.includes('0.5x') || l.includes('0.5')) return 'ultrawide';
    if (l.includes('tele') || l.includes('2x') || l.includes('3x') || l.includes('5x') || l.includes('zoom')) return 'telephoto';
    if (l.includes('wide') && !l.includes('ultra')) return 'wide';
    return 'unknown';
  };

  // Enumerate and classify all available cameras
  const enumerateAndClassifyCameras = useCallback(async (): Promise<CameraDevice[]> => {
    if (!navigator.mediaDevices?.enumerateDevices) return [];

    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(d => d.kind === 'videoinput');

    if (videoDevices.length <= 1) return []; // No point showing selector for a single camera

    const classified: CameraDevice[] = [];

    for (const device of videoDevices) {
      const camera: CameraDevice = {
        deviceId: device.deviceId,
        label: device.label || `Camera ${classified.length + 1}`,
        kind: 'unknown',
      };

      // Fast classification from label (no stream needed)
      camera.kind = classifyByLabel(camera.label);

      // If still unknown and we have a label (permission was granted), try capabilities probe
      if (camera.kind === 'unknown' && device.label) {
        try {
          const tempStream = await navigator.mediaDevices.getUserMedia({
            video: { deviceId: { exact: device.deviceId } },
            audio: false,
          });
          const track = tempStream.getVideoTracks()[0];
          if (track && typeof track.getCapabilities === 'function') {
            const caps = track.getCapabilities() as any;
            if (caps.focalLength) {
              camera.focalLengthRange = { min: caps.focalLength.min, max: caps.focalLength.max };
              if (caps.focalLength.min < 20) camera.kind = 'ultrawide';
              else if (caps.focalLength.min < 40) camera.kind = 'wide';
              else camera.kind = 'telephoto';
            }
          }
          tempStream.getTracks().forEach(t => t.stop());
        } catch (e) {
          console.warn(`Could not probe camera ${device.label}:`, e);
        }
      }

      // Default: non-front unknown cameras are probably "wide" (the main camera)
      if (camera.kind === 'unknown') {
        const l = camera.label.toLowerCase();
        if (!l.includes('front') && !l.includes('facetime')) {
          camera.kind = 'wide';
        } else {
          camera.kind = 'front';
        }
      }

      classified.push(camera);
    }

    // Sort: ultrawide first, then wide, telephoto, front, unknown
    const sortOrder: Record<CameraKind, number> = { ultrawide: 0, wide: 1, telephoto: 2, front: 3, unknown: 4 };
    classified.sort((a, b) => sortOrder[a.kind] - sortOrder[b.kind]);

    return classified;
  }, []);

  const startCamera = async (facing: 'user' | 'environment', deviceId?: string) => {
    if (isStartingRef.current) return;
    isStartingRef.current = true;
    setError(null);
    
    stopCurrentStream();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError("Your browser does not support camera access. Please use a modern browser like Chrome or Safari.");
      isStartingRef.current = false;
      return;
    }

    try {
      // When a specific deviceId is provided, use it; otherwise fall back to facingMode
      const baseVideoConstraints: MediaTrackConstraints = deviceId
        ? { deviceId: { exact: deviceId } }
        : { facingMode: { ideal: facing } };

      const highResConstraints: MediaTrackConstraints = {
        ...baseVideoConstraints,
        width: { ideal: 1280 },
        height: { ideal: 720 }
      };

      let s;
      try {
        // Try high res first
        s = await navigator.mediaDevices.getUserMedia({ video: highResConstraints, audio: true });
      } catch (err: any) {
        console.warn("Failed high-res + audio, trying basic video + audio...", err);

        try {
          // Try basic video + audio
          s = await navigator.mediaDevices.getUserMedia({ video: baseVideoConstraints, audio: true });
        } catch (err2: any) {
          console.warn("Failed basic video + audio, trying video only with constraints...", err2);

          try {
            // Fallback: Try video only with constraints
            s = await navigator.mediaDevices.getUserMedia({ video: baseVideoConstraints, audio: false });
            setError("Microphone access denied or failed. Recording video only.");
          } catch (err3: any) {
             console.warn("Failed video only with constraints, trying absolute fallback (video: true)...", err3);

             try {
               // Absolute fallback: No constraints at all
               s = await navigator.mediaDevices.getUserMedia({ video: true });
               setError("Using default camera. Specific camera selection failed.");
             } catch (err4: any) {
                console.error("All camera attempts failed:", err4);
                throw err4;
             }
          }
        }
      }

      setStream(s);
      setFacingMode(facing);
      if (deviceId) setSelectedCameraId(deviceId);

      // After first successful camera access, enumerate and classify all cameras
      if (!camerasEnumeratedRef.current) {
        camerasEnumeratedRef.current = true;
        try {
          const cameras = await enumerateAndClassifyCameras();
          setAvailableCameras(cameras);

          // Auto-switch to widest lens if we're on the rear camera and haven't selected one yet
          if (!deviceId && facing === 'environment' && cameras.length > 0) {
            const ultrawide = cameras.find(c => c.kind === 'ultrawide');
            if (ultrawide) {
              // Re-start with the ultra-wide camera
              isStartingRef.current = false;
              startCamera('environment', ultrawide.deviceId);
              return;
            }
          }
        } catch (e) {
          console.warn('Camera enumeration failed:', e);
        }
      }
    } catch (err: any) {
      console.error("Camera access error full object:", err);
      console.error("Camera access error name:", err.name);
      console.error("Camera access error message:", err.message);
      
      if (err.name === 'AbortError') {
        setError("Camera hardware failed to start (AbortError). This usually means the camera is already in use by another application or the browser is stuck. Please close other apps and refresh the page.");
      } else if (err.name === 'NotReadableError' || err.message?.includes('videosource')) {
        setError("Camera is currently locked by another app. Please close other apps and try again.");
      } else if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
        setError("Camera permission denied or blocked. If you are on Safari, ensure you are interacting with the page and haven't blocked the camera in your system settings.");
      } else {
        const errorMsg = err.message || (typeof err === 'string' ? err : JSON.stringify(err)) || "Unknown camera error";
        setError("Could not start camera. " + errorMsg);
      }
    } finally {
      isStartingRef.current = false;
    }
  };

  const toggleCamera = () => {
    if (facingMode === 'user') {
      // Switching back to rear: use previously selected rear camera or default
      if (selectedCameraId) {
        const selectedCam = availableCameras.find(c => c.deviceId === selectedCameraId);
        if (selectedCam && selectedCam.kind !== 'front') {
          startCamera('environment', selectedCameraId);
          return;
        }
      }
      startCamera('environment');
    } else {
      // Switching to front: find front camera device if available
      const frontCamera = availableCameras.find(c => c.kind === 'front');
      if (frontCamera) {
        startCamera('user', frontCamera.deviceId);
      } else {
        startCamera('user');
      }
    }
  };

  const startRecording = useCallback(() => {
    if (!stream) return;
    setChunks([]);
    setSnapshots([]);
    setTimer(0);
    
    // Fallback for Safari/Mobile support
    const mimeType = [
      'video/webm;codecs=vp8,opus', 
      'video/mp4', 
      'video/webm'
    ].find(t => MediaRecorder.isTypeSupported(t)) || '';
    
    const bitrate = mode === 'clip' ? 400000 : 250000; 
    
    try {
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: bitrate }); 
      recorder.ondataavailable = (e) => { if (e.data.size > 0) setChunks(p => [...p, e.data]); };
      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      setRecording(true);
      onRecordingStateChange?.(true);
    } catch (e: any) {
      console.error("Recorder error:", e);
      const errorMsg = e.message || (typeof e === 'string' ? e : JSON.stringify(e)) || "Unknown recorder error";
      setError("Failed to initialize MediaRecorder: " + errorMsg);
    }
  }, [stream, mode]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessingUpload(true);
    try {
      const videoEl = document.createElement('video');
      const url = URL.createObjectURL(file);
      videoEl.src = url;
      videoEl.muted = true;
      videoEl.crossOrigin = 'anonymous';

      await new Promise<void>((resolve, reject) => {
        videoEl.onloadedmetadata = () => resolve();
        videoEl.onerror = () => reject(new Error('Could not load video file'));
        setTimeout(() => reject(new Error('Video load timed out')), 15000);
      });

      const duration = Math.round(videoEl.duration) || 1;
      const uploadedSnapshots: string[] = [];
      const snapshotCount = Math.min(12, Math.max(3, Math.floor(duration / 5)));

      for (let i = 0; i < snapshotCount; i++) {
        const seekTime = (duration / snapshotCount) * i + 0.1;
        await new Promise<void>((resolve) => {
          videoEl.currentTime = seekTime;
          videoEl.onseeked = () => {
            const canvas = document.createElement('canvas');
            canvas.width = 320;
            canvas.height = 180;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(videoEl, 0, 0, 320, 180);
              const base64 = canvas.toDataURL('image/jpeg', 0.4).split(',')[1];
              uploadedSnapshots.push(base64);
            }
            resolve();
          };
        });
      }

      URL.revokeObjectURL(url);
      onSessionComplete(file, clientName || 'Client', mode, uploadedSnapshots, duration);
    } catch (err: any) {
      setError('Upload failed: ' + (err.message || 'Unknown error'));
    } finally {
      setIsProcessingUpload(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [clientName, mode, onSessionComplete]);

  const formatTime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className="max-w-4xl mx-auto bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200">
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={handleFileUpload}
      />
      <div className="bg-slate-900 p-6 flex items-center justify-between text-white">
        <div>
          <h2 className="font-black text-sm uppercase tracking-widest text-brand-400 italic">
            {mode === 'clip' ? 'Precision Technique' : mode === 'workout30' ? '30m Audit' : '60m Endurance'}
          </h2>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter">
            {recording ? `Recording Live · ${snapshots.length} Samples` : 'Camera Standby'}
          </p>
        </div>
        <div className="font-mono text-2xl tabular-nums bg-slate-800 px-4 py-1 rounded-xl border border-slate-700">{formatTime(timer)}</div>
      </div>

      <div className="relative aspect-video bg-black flex flex-col items-center justify-center">
        {stream ? (
          <video ref={videoRef} autoPlay muted playsInline className="absolute inset-0 w-full h-full object-cover opacity-90" />
        ) : (
          <div className="z-10 text-center space-y-4 p-8">
            <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
              <svg className="w-8 h-8 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <h3 className="text-white font-black uppercase tracking-widest text-lg">Camera Access Required</h3>
            <p className="text-slate-400 text-xs font-medium max-w-xs mx-auto">
              To start recording, we need access to your camera and microphone.
            </p>
            <button
              onClick={() => startCamera(facingMode)}
              className="mt-4 px-8 py-3 bg-brand-500 text-white font-black uppercase tracking-widest text-xs rounded-xl shadow-lg shadow-brand-500/30 hover:bg-brand-400 transition-all active:scale-95"
            >
              Activate Camera
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessingUpload}
              className="mt-2 px-8 py-3 bg-slate-700 text-white font-black uppercase tracking-widest text-xs rounded-xl hover:bg-slate-600 transition-all active:scale-95 disabled:opacity-50"
            >
              {isProcessingUpload ? 'Processing…' : 'Upload Video'}
            </button>
          </div>
        )}
        
        {/* Camera flip button (front/back toggle) */}
        {!recording && stream && (
          <button
            onClick={toggleCamera}
            className="absolute bottom-6 right-6 p-4 bg-white/10 hover:bg-white/20 backdrop-blur-xl border border-white/20 rounded-2xl text-white transition-all active:scale-90 z-20"
            title="Switch Front/Back Camera"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        )}

        {/* Lens selector pill (only when multiple rear cameras exist and not recording) */}
        {!recording && stream && facingMode === 'environment' && availableCameras.filter(c => c.kind !== 'front').length > 1 && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-black/40 backdrop-blur-xl rounded-full px-1.5 py-1 border border-white/20 z-20">
            {availableCameras
              .filter(c => c.kind !== 'front')
              .map(camera => {
                const isActive = camera.deviceId === selectedCameraId;
                const label = camera.kind === 'ultrawide' ? '0.5x'
                  : camera.kind === 'wide' ? '1x'
                  : camera.kind === 'telephoto' ? '2x'
                  : '?';
                return (
                  <button
                    key={camera.deviceId}
                    onClick={() => startCamera('environment', camera.deviceId)}
                    className={`min-w-[40px] min-h-[40px] rounded-full flex items-center justify-center text-xs font-black transition-all ${
                      isActive
                        ? 'bg-brand-500 text-white scale-110 shadow-lg'
                        : 'text-white/70 active:bg-white/10'
                    }`}
                    title={camera.label}
                  >
                    {label}
                  </button>
                );
              })}
          </div>
        )}

        {recording && (
           <div className="absolute top-6 right-6 flex items-center gap-2 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 z-20">
              <div className="w-2 h-2 bg-red-600 rounded-full animate-pulse"></div>
              <span className="text-[9px] font-black text-white uppercase tracking-widest">Live</span>
           </div>
        )}
        
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/95 p-10 text-center z-30">
            <div className="space-y-6 max-w-sm">
              <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center mx-auto text-red-500">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h4 className="text-white text-sm font-black uppercase tracking-widest mb-2">Connection Issue</h4>
                <p className="text-slate-400 text-xs font-medium leading-relaxed">
                  {error}
                </p>
              </div>
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => {
                    stopCurrentStream();
                    setError(null);
                    startCamera(facingMode, selectedCameraId || undefined);
                  }} 
                  className="w-full bg-brand-500 text-white px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-brand-400"
                >
                  Retry Connection
                </button>
                <button 
                    onClick={() => setError(null)}
                    className="w-full bg-slate-800 text-slate-400 px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest hover:text-white"
                >
                    Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="p-6 space-y-6">
        {!recording && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { id: 'clip', label: 'Clip', desc: '< 5 mins' },
              { id: 'workout30', label: '30m', desc: 'Audit' },
              { id: 'workout60', label: '60m', desc: 'Audit' }
            ].map(m => (
              <button
                key={m.id}
                onClick={() => setMode(m.id as SessionMode)}
                className={`p-4 rounded-2xl border-2 transition-all text-center ${mode === m.id ? 'border-brand-500 bg-brand-50 ring-4 ring-brand-50' : 'border-slate-100 bg-white hover:border-slate-200'}`}
              >
                <div className={`text-xs font-black uppercase ${mode === m.id ? 'text-brand-500' : 'text-slate-400'}`}>{m.label}</div>
                <div className="text-[8px] font-bold text-slate-400 mt-1 uppercase tracking-tighter">{m.desc}</div>
              </button>
            ))}
          </div>
        )}

        <div>
          <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block tracking-widest">Athlete Profile</label>
          <input 
            type="text" 
            placeholder="e.g. David Goggins" 
            value={clientName} 
            onChange={e => setClientName(e.target.value)} 
            disabled={recording} 
            className="w-full px-5 py-4 rounded-2xl border border-slate-200 text-sm outline-none focus:ring-4 focus:ring-brand-100 transition-all placeholder:text-slate-300 font-medium" 
          />
        </div>
        
        <div className="flex gap-4">
          {!recording ? (
            <>
              <button
                onClick={startRecording}
                disabled={!!error || !stream}
                className="flex-1 bg-brand-500 text-white font-black py-5 rounded-2xl shadow-xl shadow-brand-100 hover:bg-brand-600 active:scale-95 transition-all uppercase text-xs tracking-[0.2em] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Start Recording
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessingUpload || recording}
                className="flex-1 bg-slate-800 text-white font-black py-5 rounded-2xl hover:bg-slate-700 active:scale-95 transition-all uppercase text-xs tracking-[0.2em] disabled:opacity-50"
              >
                {isProcessingUpload ? 'Processing…' : 'Upload Video'}
              </button>
            </>
          ) : (
            <button
              onClick={() => { mediaRecorderRef.current?.stop(); setRecording(false); onRecordingStateChange?.(false); }}
              className="flex-1 bg-slate-900 text-white font-black py-5 rounded-2xl active:scale-95 transition-all uppercase text-xs tracking-[0.2em] shadow-xl shadow-slate-200"
            >
              End Session
            </button>
          )}
          
          {chunks.length > 0 && !recording && (
            <button 
              onClick={() => onSessionComplete(new Blob(chunks, { type: mediaRecorderRef.current?.mimeType }), clientName || 'Client', mode, snapshots, timer)} 
              className="flex-1 bg-green-600 text-white font-black py-5 rounded-2xl shadow-xl shadow-green-100 active:scale-95 transition-all uppercase text-xs tracking-[0.2em]"
            >
              Run AI Report
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Recorder;
