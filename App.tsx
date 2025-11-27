import React, { useState, useEffect, useCallback } from 'react';
import { Channel, AppState } from './types';
import { parseM3U, DEMO_PLAYLIST } from './services/m3uParser';
import VideoPlayer from './components/VideoPlayer';
import ChannelList from './components/ChannelList';
import Dashboard from './components/Dashboard';
import { Tv, Upload, Play, User, Lock, Globe, Link as LinkIcon, Server, Loader2 } from 'lucide-react';

type SetupMode = 'm3u' | 'xtream';

interface PlaylistConfig {
    type: 'm3u' | 'xtream';
    url?: string;
    username?: string;
    password?: string;
}

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.SETUP);
  const [playlist, setPlaylist] = useState<Channel[]>([]);
  const [currentChannel, setCurrentChannel] = useState<Channel | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [history, setHistory] = useState<Channel[]>([]);
  
  // Setup State
  const [setupMode, setSetupMode] = useState<SetupMode>('m3u');
  const [m3uInput, setM3uInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState('');
  
  // Xtream State
  const [xtreamUrl, setXtreamUrl] = useState('');
  const [xtreamUser, setXtreamUser] = useState('');
  const [xtreamPass, setXtreamPass] = useState('');

  // --- Persistence Logic ---

  useEffect(() => {
      // Load History
      try {
          const savedHistory = localStorage.getItem('watch_history');
          if (savedHistory) {
              setHistory(JSON.parse(savedHistory));
          }
      } catch (e) { console.error(e); }
  }, []);

  const addToHistory = (channel: Channel) => {
      setHistory(prev => {
          const filtered = prev.filter(c => c.id !== channel.id);
          const newHistory = [channel, ...filtered].slice(0, 50); // Keep last 50
          localStorage.setItem('watch_history', JSON.stringify(newHistory));
          return newHistory;
      });
  };

  const processLoadedPlaylist = useCallback((channels: Channel[], config: PlaylistConfig) => {
    if (channels.length > 0) {
      setPlaylist(channels);
      // Switch to Dashboard instead of Player immediately
      setAppState(AppState.DASHBOARD);
      
      // Save Configuration (Credentials/URL)
      try {
        localStorage.setItem('playlist_config', JSON.stringify(config));
      } catch (e) {
        console.error("Failed to save playlist config", e);
      }

      // Try to save the full playlist cache
      try {
        localStorage.setItem('nebula_playlist', JSON.stringify(channels));
      } catch (e: any) {
        if (e.name === 'QuotaExceededError' || e.code === 22 || e.message?.includes('quota')) {
          console.warn("Playlist too large for localStorage. Switching to auto-fetch mode.");
          localStorage.removeItem('nebula_playlist');
        } else {
            console.error("Storage error:", e);
        }
      }
    } else {
      throw new Error("No valid channels found in playlist.");
    }
  }, []);

  // Helper to fetch with progress
  const fetchWithProgress = async (url: string): Promise<string> => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      if (!response.body) return await response.text();

      const reader = response.body.getReader();
      const contentLength = + (response.headers.get('Content-Length') || '0');
      let receivedLength = 0;
      const chunks = [];

      while(true) {
          const {done, value} = await reader.read();
          if (done) break;
          
          chunks.push(value);
          receivedLength += value.length;
          
          if (contentLength > 0) {
              setLoadingProgress(Math.round((receivedLength / contentLength) * 100));
          } else {
              setLoadingProgress(prev => Math.min(prev + 1, 95));
          }
      }

      const blob = new Blob(chunks);
      return await blob.text();
  };

  // Helper to fetch playlist with robust CORS fallback
  const fetchPlaylist = async (url: string): Promise<string> => {
    setLoadingProgress(5);
    setLoadingMessage("Connecting...");

    const fetchWithTimeout = async (fetchUrl: string, timeout = 15000) => {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeout);
        try {
            const text = await fetchWithProgress(fetchUrl); 
            clearTimeout(id);
            return text;
        } catch (error) {
            clearTimeout(id);
            throw error;
        }
    };

    const validateContent = (text: string) => {
        if (!text || text.length < 50) return false;
        if (text.includes('<!DOCTYPE html>') || text.includes('<html')) {
            if (!text.includes('#EXTM3U')) return false;
        }
        return true;
    };

    // 1. Try Direct Fetch
    try {
      setLoadingMessage("Attempting direct connection...");
      const text = await fetchWithTimeout(url, 5000); 
      if (validateContent(text)) return text;
    } catch (e) {
      console.warn("Direct fetch failed, switching to proxies...", e);
    }

    // 2. Try Multiple Proxies
    const proxies = [
        (u: string) => `https://corsproxy.io/?${encodeURIComponent(u)}`, 
        (u: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
        (u: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`
    ];

    let lastError;
    setLoadingProgress(10);
    
    for (let i = 0; i < proxies.length; i++) {
        const proxyGen = proxies[i];
        try {
            const proxyUrl = proxyGen(url);
            setLoadingMessage(`Trying alternate server ${i + 1}...`);
            const text = await fetchWithTimeout(proxyUrl, 20000);
            
            if (validateContent(text)) {
                setLoadingProgress(100);
                return text;
            }
        } catch (e: any) {
            console.warn("Proxy attempt failed:", e.message);
            lastError = e;
            setLoadingProgress(prev => prev + 10);
        }
    }

    throw new Error(`Failed to load playlist. The server might be blocking requests.\nLast error: ${lastError?.message || 'Unknown'}`);
  };

  // Reusable Loaders
  const loadM3uUrl = useCallback(async (url: string) => {
      setIsLoading(true);
      setLoadingProgress(0);
      try {
          const text = await fetchPlaylist(url);
          setLoadingMessage("Parsing playlist...");
          await new Promise(r => setTimeout(r, 100));
          
          const channels = parseM3U(text);
          
          setLoadingMessage("Preparing channels...");
          setLoadingProgress(95);
          await new Promise(r => setTimeout(r, 500));

          processLoadedPlaylist(channels, { type: 'm3u', url });
          setLoadingProgress(100);
      } catch (e: any) {
          alert(`Error: ${e.message}\n\nTroubleshooting:\n1. Check if the URL is correct.\n2. The server might be blocking web-based players.`);
          setAppState(AppState.SETUP);
      } finally {
          setTimeout(() => {
            setIsLoading(false);
            setLoadingProgress(0);
            setLoadingMessage("");
          }, 1000);
      }
  }, [processLoadedPlaylist]);

  const loadXtreamConnection = useCallback(async (url: string, user: string, pass: string) => {
      setIsLoading(true);
      setLoadingProgress(0);
      try {
          let baseUrl = url.trim();
          if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
              baseUrl = `http://${baseUrl}`;
          }
          if (baseUrl.endsWith('/')) {
              baseUrl = baseUrl.slice(0, -1);
          }

          const playlistUrl = `${baseUrl}/get.php?username=${user}&password=${pass}&type=m3u_plus&output=ts`;
          const text = await fetchPlaylist(playlistUrl);
          
          setLoadingMessage("Parsing playlist...");
          await new Promise(r => setTimeout(r, 100));
          const channels = parseM3U(text);
          
          setLoadingMessage("Preparing channels...");
          setLoadingProgress(95);
          await new Promise(r => setTimeout(r, 500));

          processLoadedPlaylist(channels, { type: 'xtream', url: baseUrl, username: user, password: pass });
          setLoadingProgress(100);
      } catch (e: any) {
          console.error(e);
          alert(`Failed to load Xtream playlist.\nError: ${e.message}`);
          setAppState(AppState.SETUP);
      } finally {
          setTimeout(() => {
            setIsLoading(false);
            setLoadingProgress(0);
            setLoadingMessage("");
          }, 1000);
      }
  }, [processLoadedPlaylist]);

  // Initialization Effect
  useEffect(() => {
    const init = async () => {
        const savedConfigStr = localStorage.getItem('playlist_config');
        const savedPlaylistStr = localStorage.getItem('nebula_playlist');
        
        // 1. Try to load config mostly to pre-fill inputs
        if (savedConfigStr) {
            try {
                const config = JSON.parse(savedConfigStr);
                if (config.type === 'm3u') {
                    setSetupMode('m3u');
                    setM3uInput(config.url || '');
                } else if (config.type === 'xtream') {
                    setSetupMode('xtream');
                    setXtreamUrl(config.url || '');
                    setXtreamUser(config.username || '');
                    setXtreamPass(config.password || '');
                }
            } catch(e) { console.error("Error parsing saved config", e); }
        }

        // 2. Try to fast-load playlist from cache
        if (savedPlaylistStr) {
            try {
                const parsed = JSON.parse(savedPlaylistStr);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    setPlaylist(parsed);
                    setAppState(AppState.DASHBOARD);
                    return; 
                }
            } catch (e) {
                console.warn("Saved playlist cache corrupted or invalid, attempting re-fetch...");
            }
        }

        // 3. If no cache, auto-fetch
        if (savedConfigStr) {
            try {
                const config = JSON.parse(savedConfigStr);
                console.log("Auto-reconnecting using saved config...", config);
                if (config.type === 'm3u' && config.url) {
                    await loadM3uUrl(config.url);
                } else if (config.type === 'xtream' && config.url && config.username && config.password) {
                    await loadXtreamConnection(config.url, config.username, config.password);
                }
            } catch (e) {
                console.error("Auto-login failed", e);
            }
        }
    };
    
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); 

  // --- Actions ---

  const handleM3uUrlLoad = () => {
      if(!m3uInput) return;
      loadM3uUrl(m3uInput);
  };

  const handleXtreamLogin = () => {
    if (!xtreamUrl || !xtreamUser || !xtreamPass) {
        alert("Please fill in all fields");
        return;
    }
    loadXtreamConnection(xtreamUrl, xtreamUser, xtreamPass);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const channels = parseM3U(content);
      processLoadedPlaylist(channels, { type: 'm3u', url: 'local_file' });
    };
    reader.readAsText(file);
  };

  const loadDemo = () => {
      const channels = parseM3U(DEMO_PLAYLIST);
      processLoadedPlaylist(channels, { type: 'm3u', url: 'demo' });
  };

  const startPlaying = (channel: Channel) => {
      if (!channel.url) {
          alert("Error: Channel has no URL");
          return;
      }
      setCurrentChannel(channel);
      addToHistory(channel);
      setAppState(AppState.PLAYER);
  };

  const backToDashboard = () => {
      setAppState(AppState.DASHBOARD);
      // Note: We don't clear currentChannel here so the channel list (quick menu) remembers position if needed,
      // but Dashboard has its own selection state.
  };
  
  const handleLogout = () => {
      // We switch back to SETUP, which allows "Edit" because the input states (m3uInput etc) 
      // are preserved in the component state unless specifically cleared.
      // If the user wants to "Add", they can just type new details over the old ones.
      setAppState(AppState.SETUP);
  };

  return (
    <>
      {isLoading && (
          <div className="fixed inset-0 bg-slate-950 z-[100] flex flex-col items-center justify-center p-8 transition-opacity duration-300">
              <div className="w-16 h-16 mb-6 text-blue-500 animate-spin">
                <Loader2 className="w-full h-full" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">{loadingMessage || "Downloading Playlist..."}</h3>
              <div className="w-full max-w-md h-2 bg-slate-800 rounded-full overflow-hidden mb-2">
                  <div 
                    className="h-full bg-blue-500 transition-all duration-300 ease-out"
                    style={{ width: `${loadingProgress}%` }}
                  ></div>
              </div>
              <p className="text-slate-400 font-mono text-sm">{loadingProgress}%</p>
          </div>
      )}

      {appState === AppState.SETUP && (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black">
          <div className="w-full max-w-2xl bg-white/5 backdrop-filter backdrop-blur-xl border border-white/10 p-10 rounded-3xl shadow-2xl relative overflow-hidden">
            
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center p-4 bg-blue-600 rounded-2xl mb-4 shadow-lg shadow-blue-900/50">
                  <Tv className="w-10 h-10 text-white" />
              </div>
              <h1 className="text-4xl md:text-5xl font-bold text-white mb-2 tracking-tight">Super Star IPTV</h1>
              <p className="text-slate-400 text-lg">Load your content to begin</p>
            </div>

            {/* Setup Tabs */}
            <div className="flex bg-black/40 p-1.5 rounded-xl mb-8">
                <button 
                    className={`flex-1 py-2.5 rounded-lg text-sm font-bold tracking-wide transition-all flex items-center justify-center gap-2 ${setupMode === 'm3u' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                    onClick={() => setSetupMode('m3u')}
                >
                    <LinkIcon className="w-4 h-4" /> M3U Playlist
                </button>
                <button 
                    className={`flex-1 py-2.5 rounded-lg text-sm font-bold tracking-wide transition-all flex items-center justify-center gap-2 ${setupMode === 'xtream' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                    onClick={() => setSetupMode('xtream')}
                >
                    <Server className="w-4 h-4" /> Xtream Codes
                </button>
            </div>

            {setupMode === 'm3u' ? (
                 <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-300 ml-1 flex items-center gap-2">
                        <Globe className="w-4 h-4" /> Playlist URL
                    </label>
                    <div className="flex gap-2">
                        <input
                        type="text"
                        placeholder="https://example.com/playlist.m3u"
                        className="flex-1 bg-black/30 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                        value={m3uInput}
                        onChange={(e) => setM3uInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleM3uUrlLoad()}
                        />
                        <button 
                        onClick={handleM3uUrlLoad}
                        disabled={isLoading}
                        className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-6 py-3 rounded-xl font-medium transition-colors"
                        >
                        Load
                        </button>
                    </div>
                    </div>

                    <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-white/10"></div>
                        </div>
                        <div className="relative flex justify-center text-sm">
                            <span className="px-2 bg-[#0a0f18] text-slate-500">Or</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <label className="cursor-pointer flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-700 rounded-xl hover:bg-white/5 hover:border-slate-500 transition-all group">
                        <Upload className="w-8 h-8 text-slate-500 mb-2 group-hover:text-blue-400 transition-colors" />
                        <span className="text-slate-400 font-medium">Upload .m3u File</span>
                        <input type="file" accept=".m3u,.m3u8" className="hidden" onChange={handleFileUpload} />
                    </label>
                    
                    <button onClick={loadDemo} className="flex flex-col items-center justify-center p-6 bg-slate-800 hover:bg-slate-700 rounded-xl transition-all border border-white/5 group">
                        <Play className="w-8 h-8 text-green-500 mb-2 group-hover:scale-110 transition-transform" />
                        <span className="text-slate-200 font-medium">Try Demo Playlist</span>
                    </button>
                    </div>
                </div>
            ) : (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="space-y-1">
                        <label className="text-sm font-medium text-slate-300 ml-1 flex items-center gap-2">
                            <Globe className="w-4 h-4" /> Server URL
                        </label>
                        <input
                            type="text"
                            placeholder="http://domain.com:port"
                            className="w-full bg-black/30 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                            value={xtreamUrl}
                            onChange={(e) => setXtreamUrl(e.target.value)}
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-sm font-medium text-slate-300 ml-1 flex items-center gap-2">
                                <User className="w-4 h-4" /> Username
                            </label>
                            <input
                                type="text"
                                placeholder="Username"
                                className="w-full bg-black/30 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                                value={xtreamUser}
                                onChange={(e) => setXtreamUser(e.target.value)}
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-sm font-medium text-slate-300 ml-1 flex items-center gap-2">
                                <Lock className="w-4 h-4" /> Password
                            </label>
                            <input
                                type="password"
                                placeholder="Password"
                                className="w-full bg-black/30 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                                value={xtreamPass}
                                onChange={(e) => setXtreamPass(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleXtreamLogin()}
                            />
                        </div>
                    </div>
                    <div className="pt-2">
                        <button 
                            onClick={handleXtreamLogin}
                            disabled={isLoading}
                            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-6 py-3.5 rounded-xl font-bold transition-colors shadow-lg shadow-blue-900/40"
                        >
                            Connect
                        </button>
                    </div>
                    <p className="text-xs text-center text-slate-500">
                        Note: App will attempt multiple connection methods (Direct & Proxies) to bypass restrictions.
                    </p>
                </div>
            )}
          </div>
        </div>
      )}

      {appState === AppState.DASHBOARD && (
          <Dashboard 
            channels={playlist} 
            history={history}
            onPlay={startPlaying}
            onLogout={handleLogout}
          />
      )}

      {appState === AppState.PLAYER && currentChannel && (
        <div className="relative w-screen h-screen bg-black overflow-hidden">
             <VideoPlayer 
                url={currentChannel.url} 
                type={currentChannel.type}
                title={currentChannel.name}
                subtitle={currentChannel.group}
                onBack={backToDashboard}
            />

            {/* Optional: Keep the old channel list overlay accessible via a menu button inside Player if needed, 
                but for now we rely on the main Dashboard for navigation */}
            <ChannelList 
                channels={playlist} 
                visible={isMenuOpen} 
                onClose={() => setIsMenuOpen(false)} 
                onSelectChannel={(ch) => {
                    startPlaying(ch);
                    setIsMenuOpen(false); 
                }}
                currentChannelId={currentChannel?.id}
            />
        </div>
      )}
    </>
  );
};

export default App;