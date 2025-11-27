import React, { useState, useMemo } from 'react';
import { Channel, ContentType, Series, SortOption } from '../types';
import { processSeries, sortChannels, sortSeries } from '../services/dataProcessor';
import { Search, Home, MonitorPlay, Film, Clapperboard, Clock, Play, ArrowUpDown, ChevronDown, ChevronRight, Layers, Settings, Trash2, Edit, ListFilter } from 'lucide-react';
import VideoPlayer from './VideoPlayer';

interface DashboardProps {
    channels: Channel[];
    history: Channel[];
    onPlay: (channel: Channel) => void;
    onLogout: () => void;
}

type Tab = 'HOME' | 'SEARCH' | 'LIVE' | 'MOVIE' | 'SERIES' | 'SETTINGS';

const Dashboard: React.FC<DashboardProps> = ({ channels, history, onPlay, onLogout }) => {
    const [activeTab, setActiveTab] = useState<Tab>('HOME');
    
    // Selection State
    const [selectedCategory, setSelectedCategory] = useState<string>('All');
    
    // Live/Movie State
    const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
    
    // Series State
    const [selectedSeries, setSelectedSeries] = useState<Series | null>(null);
    const [expandedSeason, setExpandedSeason] = useState<string | null>(null);
    const [episodeSortOrder, setEpisodeSortOrder] = useState<'ASC' | 'DESC'>('ASC');

    // Search/Sort State
    const [searchQuery, setSearchQuery] = useState('');
    const [sortOrder, setSortOrder] = useState<SortOption>('DEFAULT');

    // --- Data Processing ---

    // 1. Process Series (Global)
    // We compute this once for the 'SERIES' tab and 'SEARCH' tab to share logic
    const allSeries = useMemo(() => {
        const seriesChannels = channels.filter(c => c.type === 'SERIES');
        return processSeries(seriesChannels);
    }, [channels]);

    // 2. Get Base Data for Live/Movies
    const baseData = useMemo(() => {
        let type: ContentType | null = null;
        if (activeTab === 'LIVE') type = 'LIVE';
        if (activeTab === 'MOVIE') type = 'MOVIE';
        
        if (!type) return [];
        return channels.filter(c => c.type === type);
    }, [channels, activeTab]);

    // 3. Extract Categories (Groups)
    const categories = useMemo(() => {
        if (activeTab === 'HOME' || activeTab === 'SEARCH' || activeTab === 'SETTINGS') return [];
        
        const uniqueGroups = new Set<string>();
        
        // Use series groups for Series tab, otherwise channel groups
        if (activeTab === 'SERIES') {
            allSeries.forEach(s => uniqueGroups.add(s.group));
        } else {
            baseData.forEach(c => uniqueGroups.add(c.group || 'Uncategorized'));
        }
        
        return ['All', ...Array.from(uniqueGroups).sort()];
    }, [baseData, allSeries, activeTab]);

    // 4. Categorized Search Results
    const searchResults = useMemo(() => {
        if (activeTab !== 'SEARCH' || !searchQuery) return { live: [], movie: [], series: [] };
        
        const lower = searchQuery.toLowerCase();
        
        return {
            live: channels.filter(c => c.type === 'LIVE' && c.name.toLowerCase().includes(lower)),
            movie: channels.filter(c => c.type === 'MOVIE' && c.name.toLowerCase().includes(lower)),
            series: allSeries.filter(s => s.name.toLowerCase().includes(lower))
        };
    }, [activeTab, searchQuery, channels, allSeries]);

    // 5. Filter & Sort Items for Display (Main List)
    const filteredItems = useMemo(() => {
        if (activeTab === 'SEARCH') {
            // For SEARCH, we just return a combined list to get the total count for the header.
            // The actual rendering uses `searchResults` to split them up.
            if (!searchQuery) return [];
            return [...searchResults.live, ...searchResults.movie, ...searchResults.series];
        }
        if (activeTab === 'HOME' || activeTab === 'SETTINGS') return [];

        if (activeTab === 'SERIES') {
            let items = allSeries;
            
            // Filter
            if (selectedCategory !== 'All') {
                items = items.filter(s => s.group === selectedCategory);
            }
            
            // Sort
            return sortSeries(items, sortOrder);
        } else {
            // Live or Movie
            let items = baseData;
            
            // Filter
            if (selectedCategory !== 'All') {
                items = items.filter(c => c.group === selectedCategory);
            }

            // Sort
            return sortChannels(items, sortOrder);
        }
    }, [baseData, allSeries, selectedCategory, activeTab, searchQuery, searchResults, sortOrder]);

    // Reset logic
    const handleTabChange = (tab: Tab) => {
        setActiveTab(tab);
        setSelectedCategory('All');
        setSelectedChannel(null);
        setSelectedSeries(null);
        setSearchQuery('');
        setSortOrder('DEFAULT');
    };

    const toggleSort = () => {
        const cycle: SortOption[] = ['DEFAULT', 'A_Z', 'Z_A', 'RECENT', 'OLD'];
        const currentIdx = cycle.indexOf(sortOrder);
        setSortOrder(cycle[(currentIdx + 1) % cycle.length]);
    };

    const getSortLabel = () => {
        switch(sortOrder) {
            case 'DEFAULT': return 'Default';
            case 'A_Z': return 'A-Z';
            case 'Z_A': return 'Z-A';
            case 'RECENT': return 'Newest';
            case 'OLD': return 'Oldest';
        }
    };

    const clearHistory = () => {
        localStorage.removeItem('watch_history');
        window.location.reload(); 
    };

    // --- Renderers ---

    const renderSidebarItem = (id: Tab, icon: React.ReactNode, label: string) => (
        <button
            onClick={() => handleTabChange(id)}
            className={`flex flex-col items-center gap-1 p-3 rounded-xl transition-all w-full mb-2 ${
                activeTab === id 
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40 scale-105' 
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
        >
            {icon}
            <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
        </button>
    );

    const renderChannelCard = (channel: Channel) => {
        const isSelected = selectedChannel?.id === channel.id;
        return (
            <div 
                key={channel.id}
                onClick={() => setSelectedChannel(channel)}
                onDoubleClick={() => onPlay(channel)}
                className={`group flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all border border-transparent ${
                    isSelected 
                    ? 'bg-blue-600 text-white border-blue-400' 
                    : 'hover:bg-white/10 text-slate-300 hover:border-white/5'
                }`}
            >
                <div className="w-12 h-12 rounded bg-black/40 flex items-center justify-center shrink-0 overflow-hidden">
                     {channel.logo ? (
                         <img src={channel.logo} alt={channel.name} className="w-full h-full object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />
                     ) : (
                         <span className="text-xs font-bold text-slate-500">{channel.name.slice(0,2)}</span>
                     )}
                </div>
                <div className="flex-1 min-w-0">
                    <h4 className={`font-medium truncate text-sm ${isSelected ? 'text-white' : 'group-hover:text-white'}`}>
                        {channel.name}
                    </h4>
                    <p className={`text-[10px] truncate ${isSelected ? 'text-blue-200' : 'text-slate-500'}`}>
                        {channel.group}
                    </p>
                </div>
            </div>
        );
    };

    const renderSeriesCard = (series: Series) => {
        const isSelected = selectedSeries?.id === series.id;
        return (
            <div 
                key={series.id}
                onClick={() => {
                    setSelectedSeries(series);
                    // Auto-expand season 1
                    const firstSeason = Object.keys(series.seasons).sort((a,b) => parseInt(a)-parseInt(b))[0];
                    setExpandedSeason(firstSeason);
                    setEpisodeSortOrder('ASC'); // Reset sort to default (Oldest/Episode 1 first)
                }}
                className={`group flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all border border-transparent ${
                    isSelected 
                    ? 'bg-blue-600 text-white border-blue-400' 
                    : 'hover:bg-white/10 text-slate-300 hover:border-white/5'
                }`}
            >
                 <div className="w-10 h-14 rounded bg-black/40 flex items-center justify-center shrink-0 overflow-hidden shadow-sm">
                     {series.cover ? (
                         <img src={series.cover} alt={series.name} className="w-full h-full object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />
                     ) : (
                         <Clapperboard className="w-5 h-5 text-slate-600" />
                     )}
                </div>
                <div className="flex-1 min-w-0">
                    <h4 className={`font-medium truncate text-sm ${isSelected ? 'text-white' : 'group-hover:text-white'}`}>
                        {series.name}
                    </h4>
                    <p className={`text-[10px] truncate ${isSelected ? 'text-blue-200' : 'text-slate-500'}`}>
                        {series.episodeCount} Episodes
                    </p>
                </div>
                <ChevronRight className={`w-4 h-4 ${isSelected ? 'text-white' : 'text-slate-600'}`} />
            </div>
        );
    }

    return (
        <div className="flex w-full h-full bg-slate-950 overflow-hidden text-white font-sans">
            
            {/* 1. Sidebar Navigation */}
            <div className="w-24 bg-black/40 border-r border-white/5 flex flex-col items-center py-6 shrink-0 z-20 backdrop-blur-md">
                <div className="mb-6">
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-700 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/30">
                        <span className="font-bold text-lg">S</span>
                    </div>
                </div>
                
                {renderSidebarItem('HOME', <Home className="w-6 h-6" />, "Home")}
                {renderSidebarItem('SEARCH', <Search className="w-6 h-6" />, "Search")}
                <div className="w-12 h-px bg-white/10 my-2"></div>
                {renderSidebarItem('LIVE', <MonitorPlay className="w-6 h-6" />, "Live TV")}
                {renderSidebarItem('MOVIE', <Film className="w-6 h-6" />, "Movies")}
                {renderSidebarItem('SERIES', <Layers className="w-6 h-6" />, "Series")}

                <div className="flex-1" />
                {renderSidebarItem('SETTINGS', <Settings className="w-6 h-6" />, "Settings")}
            </div>

            {/* Main Content Area */}
            <div className="flex-1 flex overflow-hidden relative">
                
                {/* 2. Secondary Navigation (Categories) */}
                {activeTab !== 'HOME' && activeTab !== 'SEARCH' && activeTab !== 'SETTINGS' && (
                    <div className="w-60 bg-slate-900/50 border-r border-white/5 flex flex-col shrink-0 backdrop-blur-sm">
                        <div className="p-5 border-b border-white/5">
                            <h2 className="text-lg font-bold text-white tracking-tight">Categories</h2>
                            <p className="text-xs text-slate-400 mt-1">{categories.length} Groups</p>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-hide">
                            {categories.map(cat => (
                                <button
                                    key={cat}
                                    onClick={() => setSelectedCategory(cat)}
                                    className={`w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                                        selectedCategory === cat 
                                        ? 'bg-white/10 text-white' 
                                        : 'text-slate-400 hover:text-white hover:bg-white/5'
                                    }`}
                                >
                                    {cat}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* 3. List Area (Channels/Movies/Series/Settings) */}
                <div className={`flex-1 flex flex-col bg-slate-900/30 ${activeTab === 'HOME' || activeTab === 'SETTINGS' ? 'w-full' : 'max-w-md border-r border-white/5'}`}>
                    
                    {/* Header */}
                    <div className="p-4 border-b border-white/5 flex justify-between items-center bg-black/10 shrink-0 h-[72px]">
                        <div className="min-w-0">
                            <h2 className="text-lg font-bold text-white truncate">
                                {activeTab === 'HOME' ? 'Dashboard' : 
                                 activeTab === 'SEARCH' ? 'Search' : 
                                 activeTab === 'SETTINGS' ? 'Settings' :
                                 selectedCategory}
                            </h2>
                            {activeTab !== 'HOME' && activeTab !== 'SETTINGS' && (
                                <p className="text-xs text-slate-400 mt-0.5">
                                    {filteredItems.length} {activeTab === 'SERIES' ? 'Shows' : 'Items'}
                                </p>
                            )}
                        </div>
                        
                        {activeTab !== 'HOME' && activeTab !== 'SEARCH' && activeTab !== 'SETTINGS' && (
                             <button 
                                onClick={toggleSort}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-medium text-slate-300 transition-colors"
                             >
                                 <ArrowUpDown className="w-3 h-3" />
                                 {getSortLabel()}
                             </button>
                        )}
                    </div>

                    {/* Content List */}
                    <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-hide relative">
                        {activeTab === 'HOME' ? (
                            <div className="p-4 space-y-8">
                                <section>
                                    <h3 className="flex items-center gap-2 text-slate-300 text-sm font-bold uppercase tracking-wider mb-4">
                                        <Clock className="w-4 h-4" /> Continue Watching
                                    </h3>
                                    {history.length === 0 ? (
                                        <div className="text-slate-500 text-sm italic p-4 border border-white/5 rounded-lg bg-white/5">
                                            No recent history.
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                            {history.slice(0, 8).map(channel => (
                                                <div 
                                                    key={channel.id}
                                                    onClick={() => onPlay(channel)}
                                                    className="aspect-video bg-slate-800 rounded-lg overflow-hidden relative group cursor-pointer border border-white/10 hover:border-blue-500"
                                                >
                                                     {channel.logo ? (
                                                        <img src={channel.logo} alt={channel.name} className="w-full h-full object-cover opacity-70 group-hover:opacity-100" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center bg-slate-700 text-slate-500 font-bold">{channel.name[0]}</div>
                                                    )}
                                                    <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/90 to-transparent">
                                                        <p className="text-xs font-bold text-white truncate">{channel.name}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </section>
                            </div>
                        ) : activeTab === 'SETTINGS' ? (
                            <div className="p-4 max-w-2xl mx-auto space-y-6">
                                {/* Playlist Management */}
                                <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                                    <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                                        <Settings className="w-5 h-5 text-blue-400" /> Playlist Management
                                    </h3>
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between p-4 bg-black/20 rounded-lg">
                                            <div>
                                                <p className="text-sm font-medium text-slate-200">Active Session</p>
                                                <p className="text-xs text-slate-500 mt-1">{channels.length} Channels Loaded</p>
                                            </div>
                                            <div className="px-3 py-1 bg-green-500/20 text-green-400 text-xs rounded-full font-bold">
                                                Connected
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <button 
                                                onClick={onLogout}
                                                className="flex items-center justify-center gap-2 p-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-all font-medium"
                                            >
                                                <Edit className="w-4 h-4" />
                                                Edit / Switch Playlist
                                            </button>
                                            
                                            <button 
                                                onClick={clearHistory}
                                                className="flex items-center justify-center gap-2 p-4 bg-white/5 hover:bg-red-500/20 hover:text-red-400 text-slate-300 rounded-xl transition-all font-medium"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                                Clear History
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="text-center pt-8 text-slate-600 text-xs">
                                    <p>Super Star IPTV • v1.2.0</p>
                                </div>
                            </div>
                        ) : activeTab === 'SEARCH' ? (
                            <div className="p-2 space-y-6">
                                <div className="mb-4 sticky top-0 z-10 bg-slate-900 pb-2 border-b border-white/5">
                                    <input 
                                        type="text"
                                        placeholder="Search channels, movies, series..."
                                        className="w-full bg-black/30 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-all"
                                        autoFocus
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                    />
                                </div>
                                
                                {filteredItems.length === 0 ? (
                                    <div className="text-center py-10 text-slate-500">
                                        <Search className="w-12 h-12 mx-auto mb-2 opacity-20" />
                                        <p>No results found for "{searchQuery}"</p>
                                    </div>
                                ) : (
                                    <div className="space-y-8">
                                        {/* Series Results */}
                                        {searchResults.series.length > 0 && (
                                            <section>
                                                <h3 className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase tracking-wider mb-3 px-1">
                                                    <Layers className="w-3 h-3" /> Series ({searchResults.series.length})
                                                </h3>
                                                <div className="grid grid-cols-1 gap-2">
                                                    {searchResults.series.slice(0, 50).map(renderSeriesCard)}
                                                </div>
                                            </section>
                                        )}

                                        {/* Movie Results */}
                                        {searchResults.movie.length > 0 && (
                                            <section>
                                                <h3 className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase tracking-wider mb-3 px-1">
                                                    <Film className="w-3 h-3" /> Movies ({searchResults.movie.length})
                                                </h3>
                                                <div className="grid grid-cols-1 gap-2">
                                                    {searchResults.movie.slice(0, 50).map(renderChannelCard)}
                                                </div>
                                            </section>
                                        )}

                                        {/* Live TV Results */}
                                        {searchResults.live.length > 0 && (
                                            <section>
                                                <h3 className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase tracking-wider mb-3 px-1">
                                                    <MonitorPlay className="w-3 h-3" /> Live TV ({searchResults.live.length})
                                                </h3>
                                                <div className="grid grid-cols-1 gap-2">
                                                    {searchResults.live.slice(0, 50).map(renderChannelCard)}
                                                </div>
                                            </section>
                                        )}
                                    </div>
                                )}
                            </div>
                        ) : activeTab === 'SERIES' ? (
                             // SERIES LIST
                             filteredItems.length === 0 ? (
                                <div className="text-center py-10 text-slate-500">No shows found</div>
                             ) : (
                                (filteredItems as Series[]).map(renderSeriesCard)
                             )
                        ) : (
                            // LIVE / MOVIE LIST
                             filteredItems.length === 0 ? (
                                <div className="text-center py-10 text-slate-500">No content found</div>
                             ) : (
                                (filteredItems as Channel[]).slice(0, 500).map(renderChannelCard)
                             )
                        )}
                    </div>
                </div>

                {/* 4. Preview / Detail Panel (Right Side) */}
                {activeTab !== 'HOME' && activeTab !== 'SETTINGS' && (
                    <div className="flex-[1.5] bg-black/60 relative flex flex-col">
                        
                        {/* A. SERIES DETAIL VIEW */}
                        {((activeTab === 'SERIES' || activeTab === 'SEARCH') && selectedSeries) ? (
                            <div className="absolute inset-0 flex flex-col">
                                {/* Header */}
                                <div className="p-6 md:p-8 relative overflow-hidden shrink-0">
                                    {selectedSeries.cover && (
                                        <div 
                                            className="absolute inset-0 opacity-20 blur-3xl scale-125 z-0"
                                            style={{ backgroundImage: `url(${selectedSeries.cover})`, backgroundPosition: 'center', backgroundSize: 'cover' }}
                                        />
                                    )}
                                    <div className="relative z-10 flex gap-6">
                                        <div className="w-32 h-48 bg-black/50 rounded-lg shadow-2xl overflow-hidden shrink-0 border border-white/10">
                                            {selectedSeries.cover ? (
                                                <img src={selectedSeries.cover} alt={selectedSeries.name} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center"><Clapperboard className="w-10 h-10 text-slate-600"/></div>
                                            )}
                                        </div>
                                        <div className="flex flex-col justify-end pb-2">
                                            <div className="inline-block px-2 py-1 bg-purple-600 rounded text-[10px] font-bold uppercase mb-2 self-start">
                                                Series
                                            </div>
                                            <h1 className="text-3xl md:text-4xl font-bold text-white shadow-black drop-shadow-md">{selectedSeries.name}</h1>
                                            <p className="text-slate-300 mt-2 text-sm">{selectedSeries.group} • {selectedSeries.episodeCount} Episodes</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Seasons & Episodes List */}
                                <div className="flex-1 overflow-y-auto bg-slate-900/50 p-6">
                                    {Object.keys(selectedSeries.seasons).sort((a,b) => parseInt(a)-parseInt(b)).map(seasonKey => {
                                        
                                        // Sort Episodes
                                        const episodes = selectedSeries.seasons[seasonKey];
                                        const sortedEpisodes = [...episodes].sort((a, b) => {
                                            const getEpNum = (str: string) => {
                                                const m = str.match(/E(\d+)/i) || str.match(/x(\d+)/) || str.match(/Episode\s?(\d+)/i);
                                                return m ? parseInt(m[1], 10) : 0;
                                            };
                                            const nA = getEpNum(a.name);
                                            const nB = getEpNum(b.name);
                                            return episodeSortOrder === 'ASC' ? nA - nB : nB - nA;
                                        });

                                        return (
                                            <div key={seasonKey} className="mb-6">
                                                <div className="flex items-center justify-between mb-3 border-b border-white/5 pb-2">
                                                    <button 
                                                        onClick={() => setExpandedSeason(expandedSeason === seasonKey ? null : seasonKey)}
                                                        className="flex items-center gap-2 text-lg font-bold text-white hover:text-blue-400 transition-colors"
                                                    >
                                                        <ChevronDown className={`w-5 h-5 transition-transform ${expandedSeason === seasonKey ? 'rotate-0' : '-rotate-90'}`} />
                                                        Season {seasonKey}
                                                    </button>
                                                    
                                                    {expandedSeason === seasonKey && (
                                                        <button 
                                                            onClick={() => setEpisodeSortOrder(prev => prev === 'ASC' ? 'DESC' : 'ASC')}
                                                            className="flex items-center gap-2 px-3 py-1 rounded bg-white/5 hover:bg-white/10 text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-white transition-colors"
                                                        >
                                                            <ListFilter className="w-3 h-3" />
                                                            Sort: {episodeSortOrder === 'ASC' ? 'Oldest First' : 'Newest First'}
                                                        </button>
                                                    )}
                                                </div>
                                                
                                                {expandedSeason === seasonKey && (
                                                    <div className="grid grid-cols-1 gap-2 pl-4 animate-in fade-in duration-300">
                                                        {sortedEpisodes.map(ep => {
                                                            // Try to parse episode number for cleaner display
                                                            const epMatch = ep.name.match(/E(\d+)/i) || ep.name.match(/(\d+)x(\d+)/);
                                                            const epNum = epMatch ? (epMatch[1] || epMatch[3]) : '';
                                                            const displayName = epNum ? `Episode ${epNum}` : ep.name;
                                                            
                                                            return (
                                                                <div 
                                                                    key={ep.id}
                                                                    onClick={() => onPlay(ep)}
                                                                    className="flex items-center gap-4 p-3 rounded-lg bg-white/5 hover:bg-white/10 cursor-pointer transition-all group"
                                                                >
                                                                    <div className="w-8 h-8 rounded-full bg-blue-600/20 flex items-center justify-center group-hover:bg-blue-600 transition-colors">
                                                                        <Play className="w-3 h-3 text-blue-400 group-hover:text-white fill-current" />
                                                                    </div>
                                                                    <div className="min-w-0">
                                                                        <p className="text-sm font-medium text-slate-200 group-hover:text-white truncate">{displayName}</p>
                                                                        <p className="text-[10px] text-slate-500 truncate">{ep.name}</p>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ) : 
                        
                        /* B. LIVE / MOVIE PREVIEW */
                        selectedChannel ? (
                            <>
                                <div className="absolute top-0 left-0 right-0 p-8 bg-gradient-to-b from-black/80 to-transparent z-10">
                                    <div className="flex gap-4 items-end">
                                        {selectedChannel.logo && (
                                            <img src={selectedChannel.logo} alt={selectedChannel.name} className="w-24 h-24 object-contain bg-white/5 rounded-lg shadow-2xl backdrop-blur-sm" onError={(e) => (e.currentTarget.style.display = 'none')} />
                                        )}
                                        <div>
                                            <div className="inline-block px-2 py-1 bg-blue-600 rounded text-[10px] font-bold uppercase mb-2">
                                                {selectedChannel.type}
                                            </div>
                                            <h1 className="text-2xl md:text-3xl font-bold text-white shadow-black drop-shadow-lg leading-tight">
                                                {selectedChannel.name}
                                            </h1>
                                            <p className="text-slate-300 text-sm mt-1">{selectedChannel.group}</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex-1 relative bg-slate-950 flex items-center justify-center overflow-hidden">
                                     {selectedChannel.logo && (
                                         <div 
                                            className="absolute inset-0 opacity-20 blur-3xl scale-110"
                                            style={{ backgroundImage: `url(${selectedChannel.logo})`, backgroundPosition: 'center', backgroundSize: 'cover' }}
                                        />
                                     )}

                                     {selectedChannel.type === 'LIVE' ? (
                                         <div className="w-full h-full relative">
                                             <VideoPlayer 
                                                url={selectedChannel.url} 
                                                type={selectedChannel.type} 
                                                minimal={true}
                                             />
                                             <div 
                                                className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/40 transition-colors cursor-pointer group"
                                                onClick={() => onPlay(selectedChannel)}
                                             >
                                                 <div className="w-16 h-16 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center group-hover:scale-110 transition-transform shadow-xl border border-white/20">
                                                     <Play className="w-6 h-6 text-white fill-white ml-1" />
                                                 </div>
                                             </div>
                                         </div>
                                     ) : (
                                         <div className="relative z-10 flex flex-col items-center gap-6 p-10">
                                             <button 
                                                onClick={() => onPlay(selectedChannel)}
                                                className="px-8 py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-lg shadow-2xl shadow-blue-900/50 transition-all hover:scale-105 flex items-center gap-3"
                                             >
                                                 <Play className="w-6 h-6 fill-current" />
                                                 Watch Now
                                             </button>
                                         </div>
                                     )}
                                </div>
                            </>
                        ) : (
                            // Empty State
                            <div className="flex-1 flex flex-col items-center justify-center text-slate-600">
                                <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-4">
                                    <MonitorPlay className="w-8 h-8 opacity-50" />
                                </div>
                                <p>Select an item to preview</p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Dashboard;