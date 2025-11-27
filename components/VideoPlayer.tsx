import React, { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import { ContentType } from '../types';
import { Play, Pause, ArrowLeft, RotateCcw, RotateCw, Loader2, RefreshCw, WifiOff, ExternalLink, Copy, VolumeX, Volume2, AlertTriangle, Settings, MonitorPlay } from 'lucide-react';

interface VideoPlayerProps {
  url: string;
  type?: ContentType;
  title?: string;
  subtitle?: string;
  onBack?: () => void;
  onStateChange?: (state: 'playing' | 'paused' | 'buffering' | 'error') => void;
  minimal?: boolean; 
}

// --- ANDROID TV / EXOPLAYER STYLE CONFIGURATION ---
// These settings are tuned to mimic the stability of native apps like TiviMate
const EXOPLAYER_CONFIG: Partial<Hls.Config> = {
  debug: false,
  enableWorker: true,
  // STABILITY OVER LATENCY
  lowLatencyMode: false, 
  backBufferLength: 60, // Keep 60s behind
  maxBufferLength: 30, // Target 30s buffer ahead (High stability)
  maxMaxBufferLength: 600,
  
  // ROBUST NETWORK HANDLING
  fragLoadingTimeOut: 20000, // 20s timeout
  manifestLoadingTimeOut: 20000,
  levelLoadingTimeOut: 20000,
  fragLoadingMaxRetry: 6, // Aggressive retries
  manifestLoadingMaxRetry: 6,
  levelLoadingMaxRetry: 6,
  
  // ERROR TOLERANCE (Don't get stuck on small gaps)
  maxBufferHole: 0.5, // Skip holes < 0.5s
  highBufferWatchdogPeriod: 2, 
  nudgeOffset: 0.1,
  nudgeMaxRetry: 5,
  
  // LIVE SYNC
  liveSyncDurationCount: 3, // Stay 3 segments behind live edge to prevent buffering
  liveMaxLatencyDurationCount: 10,
};

interface ConnectionStrategy {
    name: string;
    mode: 'HLS' | 'NATIVE';
    transform: (url: string) => string;
}

const STRATEGIES: ConnectionStrategy[] = [
    // 1. Direct HLS (Standard for IPTV)
    // We force output=m3u8 to make Xtream servers transcode to HLS
    { 
        name: "Direct Connection", 
        mode: 'HLS', 
        transform: (u) => {
            let url = u.trim();
            // Xtream Codes Logic: Replace output=ts with output=m3u8
            if (url.includes('output=ts')) return url.replace('output=ts', 'output=m3u8');
            // If no extension, assume it needs one for HLS detection
            if (!url.includes('.m3u8') && !url.includes('.mp4') && !url.includes('?')) return `${url}.m3u8`;
            return url;
        }
    },
    // 2. CORS Proxy (High Speed)
    {
        name: "Gateway 1 (Cloud)",
        mode: 'HLS',
        transform: (u) => {
            let url = u.trim();
            if (url.includes('output=ts')) url = url.replace('output=ts', 'output=m3u8');
            else if (!url.includes('.m3u8') && !url.includes('.mp4') && !url.includes('?')) url = `${url}.m3u8`;
            return `https://corsproxy.io/?${encodeURIComponent(url)}`;
        }
    },
    // 3. CORS Proxy (Backup)
    {
        name: "Gateway 2 (Mirror)",
        mode: 'HLS',
        transform: (u) => {
            let url = u.trim();
            if (url.includes('output=ts')) url = url.replace('output=ts', 'output=m3u8');
            return `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`;
        }
    },
    // 4. Native Fallback (For MP4/MKV movies or Safari)
    {
        name: "Native Player",
        mode: 'NATIVE',
        transform: (u) => u.trim()
    }
];

const VideoPlayer: React.FC<VideoPlayerProps> = ({ 
  url, 
  type = 'LIVE', 
  title,
  subtitle,
  onBack,
  onStateChange,
  minimal = false
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const watchdogTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // State
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showControls, setShowControls] = useState(!minimal);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(minimal);
  const [debugMsg, setDebugMsg] = useState('');
  const [retryCount, setRetryCount] = useState(0);
  const [isReconnecting, setIsReconnecting] = useState(false);
  
  const [strategyIndex, setStrategyIndex] = useState(() => {
     // Smart Start: If on HTTPS and playing HTTP, skip direct connection to avoid Mixed Content block
     if (typeof window !== 'undefined' && window.location.protocol === 'https:' && url.startsWith('http:')) {
         console.log("Mixed Content detected: Defaulting to Proxy");
         return 1; // Skip Direct
     }
     return 0;
  });
  
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Interaction Handlers
  const showUI = useCallback(() => {
    if (minimal) return;
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
        if (isPlaying) setShowControls(false);
    }, 4000);
  }, [minimal, isPlaying]);

  const togglePlay = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (minimal) return;
    
    const video = videoRef.current;
    if (!video) return;

    try {
        if (video.paused) {
            await video.play();
            setIsPlaying(true);
        } else {
            video.pause();
            setIsPlaying(false);
        }
    } catch (err) {
        console.warn("Playback toggle failed:", err);
        // Force mute play
        if (video.paused) {
            video.muted = true;
            setIsMuted(true);
            video.play().catch(e => console.error("Muted play also failed", e));
        }
    }
    showUI();
  };

  const toggleMute = (e: React.MouseEvent) => {
      e.stopPropagation();
      const video = videoRef.current;
      if (!video) return;
      video.muted = !video.muted;
      setIsMuted(video.muted);
  };

  const seek = (seconds: number) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = Math.min(Math.max(videoRef.current.currentTime + seconds, 0), duration);
    showUI();
  };

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!videoRef.current) return;
    const time = parseFloat(e.target.value);
    videoRef.current.currentTime = time;
    setCurrentTime(time);
    showUI();
  };

  const forceRetry = () => {
      setError(null);
      setRetryCount(0);
      setIsReconnecting(true);
      setStrategyIndex(0);
  };

  const openExternal = () => {
      // Try VLC protocol first, then fallback
      window.location.href = `vlc://${url}`;
      setTimeout(() => {
          window.open(url, '_blank');
      }, 500);
  };

  // --- RECOVERY LOGIC (The "Android" Brain) ---
  
  const handleStall = useCallback(() => {
      // Watchdog detected a stall
      console.warn("Watchdog: Playback stalled. Nudging...");
      const video = videoRef.current;
      if (video && hlsRef.current) {
          // Nudge forward to skip bad frame
          video.currentTime += 0.5;
          // Force HLS to check buffer
          hlsRef.current.recoverMediaError();
      }
  }, []);

  const attemptNextStrategy = useCallback((reason: string) => {
      console.warn(`[VideoPlayer] Strategy ${strategyIndex} failed: ${reason}`);
      
      setStrategyIndex(prev => {
          if (prev < STRATEGIES.length - 1) {
             const next = prev + 1;
             setDebugMsg(`Switching to ${STRATEGIES[next].name}...`);
             return next;
          } else {
             // Cycle back to 0 (Infinite Retry Loop like TiviMate)
             // But wait a bit before doing so to avoid spamming
             setIsReconnecting(true);
             setTimeout(() => {
                 setStrategyIndex(0);
                 setRetryCount(c => c + 1);
                 setIsReconnecting(false);
             }, 3000);
             return prev;
          }
      });
  }, [strategyIndex]);

  // --- MAIN PLAYER ENGINE ---
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Reset State
    setError(null);
    setIsPlaying(false);
    setIsLoading(true);
    setDebugMsg(isReconnecting ? `Reconnecting (Attempt ${retryCount + 1})...` : `Connecting via ${STRATEGIES[strategyIndex].name}...`);
    
    if (minimal) {
        video.muted = true;
        setIsMuted(true);
    }

    // --- EVENT HANDLERS ---
    const onPlayEvent = () => { setIsPlaying(true); setIsLoading(false); onStateChange?.('playing'); };
    const onPauseEvent = () => { setIsPlaying(false); onStateChange?.('paused'); if(!minimal) showUI(); };
    const onWaiting = () => { setIsLoading(true); onStateChange?.('buffering'); };
    const onPlaying = () => { setIsLoading(false); setDebugMsg(''); };
    const onTimeUpdate = () => setCurrentTime(video.currentTime);
    const onDurationChange = () => setDuration(video.duration || 0);

    video.addEventListener('play', onPlayEvent);
    video.addEventListener('pause', onPauseEvent);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('durationchange', onDurationChange);

    // --- WATCHDOG (Stall Detector) ---
    // Clears existing watchdog
    if (watchdogTimerRef.current) clearInterval(watchdogTimerRef.current);
    
    // Start new watchdog
    watchdogTimerRef.current = setInterval(() => {
        if (!video.paused && video.readyState < 3 && isLoading) {
            // It's stuck buffering for too long (5s)
            handleStall();
        }
    }, 5000);


    // --- LOAD LOGIC ---
    const strategy = STRATEGIES[strategyIndex];
    const effectiveUrl = strategy.transform(url);

    // Cleanup previous HLS
    if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
    }

    if (strategy.mode === 'HLS' && Hls.isSupported()) {
        const hls = new Hls(EXOPLAYER_CONFIG);
        hlsRef.current = hls;

        hls.loadSource(effectiveUrl);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
            setDebugMsg("Live");
            setIsLoading(false);
            video.play().catch(() => {
                video.muted = true;
                setIsMuted(true);
                video.play().catch(() => {});
            });
        });

        // Robust Error Handling mimicking ExoPlayer
        hls.on(Hls.Events.ERROR, (event, data) => {
            if (data.fatal) {
                switch (data.type) {
                    case Hls.ErrorTypes.NETWORK_ERROR:
                        console.log("Network Error, trying to recover...");
                        hls.startLoad(); // Try to load again
                        break;
                    case Hls.ErrorTypes.MEDIA_ERROR:
                        console.log("Media Error, trying to recover...");
                        hls.recoverMediaError(); // Try to skip bad frame
                        break;
                    default:
                        hls.destroy();
                        attemptNextStrategy(`HLS Fatal: ${data.details}`);
                        break;
                }
            }
        });
    } else {
        // NATIVE MODE (Safari or Native Strategy)
        video.src = effectiveUrl;
        video.load();
        
        // Native Auto-Play
        video.play().catch(() => {
             video.muted = true;
             setIsMuted(true);
             video.play().catch(() => {});
        });

        const onNativeError = () => {
            const err = video.error;
            // Don't fail immediately, wait 1s then switch
            setTimeout(() => {
                attemptNextStrategy(`Native Error ${err?.code}: ${err?.message}`);
            }, 1000);
        };
        video.addEventListener('error', onNativeError);
        
        return () => {
             video.removeEventListener('error', onNativeError);
        };
    }

    // Cleanup Global Listeners
    return () => {
        if (watchdogTimerRef.current) clearInterval(watchdogTimerRef.current);
        
        video.removeEventListener('play', onPlayEvent);
        video.removeEventListener('pause', onPauseEvent);
        video.removeEventListener('waiting', onWaiting);
        video.removeEventListener('playing', onPlaying);
        video.removeEventListener('timeupdate', onTimeUpdate);
        video.removeEventListener('durationchange', onDurationChange);
        
        if (hlsRef.current) {
            hlsRef.current.destroy();
            hlsRef.current = null;
        }
        video.removeAttribute('src');
        video.load();
    };
  }, [url, strategyIndex, minimal, attemptNextStrategy, onStateChange, isReconnecting, retryCount, handleStall]);

  const isLive = type === 'LIVE';

  // --- RENDER ---
  return (
    <div 
        ref={containerRef}
        className={`w-full h-full bg-black flex items-center justify-center relative group overflow-hidden ${minimal ? '' : 'cursor-pointer'}`}
        onMouseMove={showUI}
        onClick={minimal ? undefined : showUI}
        onTouchStart={showUI}
    >
      {/* --- ERROR / RECONNECTING SCREEN --- */}
      {(error || isReconnecting) && (
        <div className={`absolute inset-0 flex items-center justify-center bg-black/95 z-50 ${minimal ? 'p-2' : 'p-8'}`}>
            <div className="text-center max-w-lg animate-in fade-in zoom-in duration-300">
                <div className="relative inline-block">
                    <WifiOff className="w-16 h-16 text-slate-700 mx-auto mb-4" />
                    {isReconnecting && (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                        </div>
                    )}
                </div>
                
                <h3 className="text-xl font-bold text-white mb-2">
                    {isReconnecting ? `Reconnecting (Attempt ${retryCount})...` : 'Stream Unavailable'}
                </h3>
                
                {!minimal && (
                    <>
                        <p className="text-slate-400 text-sm mb-6 max-w-xs mx-auto">
                           {isReconnecting 
                            ? "We're trying alternative connection paths..."
                            : "We couldn't reach the server after multiple attempts. The stream might be offline."}
                        </p>
                        
                        {!isReconnecting && (
                            <div className="flex flex-col gap-3">
                                <div className="flex gap-4 justify-center">
                                    <button onClick={onBack} className="px-6 py-3 bg-slate-800 rounded-lg hover:bg-slate-700 transition-colors font-medium">
                                        Back
                                    </button>
                                    <button onClick={forceRetry} className="px-6 py-3 bg-blue-600 rounded-lg hover:bg-blue-500 transition-colors flex items-center gap-2 font-bold">
                                        <RefreshCw className="w-4 h-4" /> Retry Now
                                    </button>
                                </div>
                                <div className="mt-4 pt-4 border-t border-white/10">
                                    <button onClick={openExternal} className="px-4 py-2 text-slate-400 hover:text-white text-sm flex items-center gap-2 mx-auto">
                                        <ExternalLink className="w-4 h-4" /> Open in System Player (VLC)
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
      )}

      {/* --- BUFFERING INDICATOR --- */}
      {isLoading && !error && !isReconnecting && (
        <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none">
            <div className="bg-black/60 p-6 rounded-2xl backdrop-blur-md flex flex-col items-center border border-white/10 shadow-2xl">
                <Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-4" />
                {!minimal && (
                    <div className="text-center">
                        <span className="text-xs text-white font-bold tracking-wider block mb-1">BUFFERING</span>
                        {debugMsg && <span className="text-[10px] text-slate-400 font-mono bg-black/40 px-2 py-1 rounded inline-block mt-1">{debugMsg}</span>}
                    </div>
                )}
            </div>
        </div>
      )}

      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        playsInline
        muted={minimal || isMuted}
        crossOrigin={strategyIndex >= 1 ? 'anonymous' : undefined}
      />

      {/* --- HUD CONTROLS --- */}
      {!minimal && !error && !isReconnecting && (
        <div 
            className={`absolute inset-0 bg-gradient-to-b from-black/80 via-transparent to-black/90 transition-opacity duration-300 flex flex-col justify-between p-6 z-40 ${showControls ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        >
            {/* Top Bar */}
            <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                    <button 
                        onClick={(e) => { e.stopPropagation(); onBack && onBack(); }}
                        className="p-3 bg-white/10 hover:bg-white/20 rounded-full backdrop-blur-md transition-all hover:scale-105"
                    >
                        <ArrowLeft className="w-6 h-6 text-white" />
                    </button>
                    <div>
                        <h2 className="text-xl font-bold text-white shadow-black drop-shadow-md max-w-md truncate">{title || "Unknown Channel"}</h2>
                        {subtitle && <p className="text-blue-300 text-sm font-medium">{subtitle}</p>}
                    </div>
                </div>
                
                <div className="flex gap-2">
                    <button onClick={toggleMute} className="p-2 bg-white/10 rounded-full hover:bg-white/20">
                        {isMuted ? <VolumeX className="w-5 h-5 text-red-400" /> : <Volume2 className="w-5 h-5 text-white" />}
                    </button>
                    {isLive && (
                        <div className="flex items-center gap-2 px-3 py-1 bg-red-600/90 rounded-lg text-xs font-bold text-white backdrop-blur-sm h-10 border border-white/10 shadow-lg">
                            <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                            LIVE
                        </div>
                    )}
                </div>
            </div>

            {/* Center Play Button (Only visible when paused) */}
            {!isPlaying && !isLoading && (
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                    <button 
                        onClick={togglePlay}
                        className="p-6 bg-blue-600/90 hover:bg-blue-500 rounded-full shadow-2xl transition-all hover:scale-110 group"
                    >
                        <Play className="w-8 h-8 text-white fill-current pl-1" />
                    </button>
                </div>
            )}

            {/* Bottom Bar */}
            <div className="flex flex-col gap-2 pb-2" onClick={e => e.stopPropagation()}>
                {/* Progress Bar (Only for VOD) */}
                {!isLive && duration > 0 && (
                    <div className="flex items-center gap-4 mb-2 animate-in slide-in-from-bottom-5 duration-300">
                        <span className="text-xs font-mono text-slate-300 w-12 text-right">{Math.floor(currentTime / 60)}:{String(Math.floor(currentTime % 60)).padStart(2, '0')}</span>
                        <input 
                            type="range" 
                            min={0} 
                            max={duration} 
                            value={currentTime} 
                            onChange={handleSeekChange}
                            className="flex-1 h-1.5 bg-slate-600 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:rounded-full hover:[&::-webkit-slider-thumb]:scale-125 transition-all"
                        />
                        <span className="text-xs font-mono text-slate-300 w-12">{Math.floor(duration / 60)}:{String(Math.floor(duration % 60)).padStart(2, '0')}</span>
                    </div>
                )}

                <div className="flex items-center justify-center gap-8">
                    {!isLive && (
                        <button onClick={() => seek(-10)} className="p-3 text-slate-300 hover:text-white hover:bg-white/10 rounded-full transition-all">
                            <RotateCcw className="w-6 h-6" />
                        </button>
                    )}
                    
                    <button onClick={togglePlay} className="md:hidden text-white p-2">
                        {isPlaying ? <Pause className="w-8 h-8 fill-current" /> : <Play className="w-8 h-8 fill-current" />}
                    </button>

                    {!isLive && (
                        <button onClick={() => seek(10)} className="p-3 text-slate-300 hover:text-white hover:bg-white/10 rounded-full transition-all">
                            <RotateCw className="w-6 h-6" />
                        </button>
                    )}
                </div>
                
                {/* Tech Info */}
                <div className="absolute bottom-4 right-6 text-[10px] text-slate-500 font-mono opacity-50 hidden md:block">
                   Protocol: {STRATEGIES[strategyIndex].name}
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default VideoPlayer;