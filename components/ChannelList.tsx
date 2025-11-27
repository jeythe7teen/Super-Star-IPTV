import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Channel, AIResponse, ContentType } from '../types';
import { Search, Tv, Sparkles, AlertCircle, X, Film, Clapperboard, MonitorPlay, Pin, PinOff } from 'lucide-react';
import { getChannelRecommendations } from '../services/geminiService';

interface ChannelListProps {
  channels: Channel[];
  onSelectChannel: (channel: Channel) => void;
  currentChannelId?: string;
  visible: boolean;
  onClose: () => void;
}

const ChannelList: React.FC<ChannelListProps> = ({ 
  channels, 
  onSelectChannel, 
  currentChannelId,
  visible,
  onClose
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedContentType, setSelectedContentType] = useState<ContentType>('LIVE');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [pinnedCategories, setPinnedCategories] = useState<string[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiReasoning, setAiReasoning] = useState<string | null>(null);
  
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Load pinned categories
  useEffect(() => {
    try {
        const savedPins = localStorage.getItem('pinned_categories');
        if (savedPins) {
            setPinnedCategories(JSON.parse(savedPins));
        }
    } catch (e) {
        console.error("Failed to load pins", e as any);
    }
  }, []);

  // Save pinned categories
  const togglePin = (category: string) => {
      let newPins;
      if (pinnedCategories.includes(category)) {
          newPins = pinnedCategories.filter(c => c !== category);
      } else {
          newPins = [...pinnedCategories, category];
      }
      setPinnedCategories(newPins);
      localStorage.setItem('pinned_categories', JSON.stringify(newPins));
  };

  // --- PERFORMANCE OPTIMIZATION START ---
  
  // 1. Filter by Content Type (Memoized)
  const typeFilteredChannels = useMemo(() => {
    return channels.filter(c => c.type === selectedContentType);
  }, [channels, selectedContentType]);

  // 2. Extract Categories (Memoized)
  // This is the heavy operation that was causing lag. Now it only runs when content type changes.
  const sortedCategories = useMemo(() => {
      const uniqueGroups = new Set<string>();
      typeFilteredChannels.forEach(c => {
          if (c.group) uniqueGroups.add(c.group);
          else uniqueGroups.add('Uncategorized');
      });
      
      const allCats = Array.from(uniqueGroups).sort();
      
      return [
          'All',
          ...allCats.filter(c => pinnedCategories.includes(c)),
          ...allCats.filter(c => !pinnedCategories.includes(c))
      ];
  }, [typeFilteredChannels, pinnedCategories]);

  // 3. Final Filtering (Memoized)
  const finalFilteredChannels = useMemo(() => {
      // Optimization: If no search and All category, return everything fast
      if (selectedCategory === 'All' && !searchQuery) {
          return typeFilteredChannels;
      }

      const lowerQuery = searchQuery.toLowerCase();
      
      return typeFilteredChannels.filter(c => {
        const matchesCategory = selectedCategory === 'All' || c.group === selectedCategory;
        // Only run string matching if category matches first
        if (!matchesCategory) return false;
        
        if (!searchQuery) return true;
        return c.name.toLowerCase().includes(lowerQuery);
      });
  }, [typeFilteredChannels, selectedCategory, searchQuery]);

  // --- PERFORMANCE OPTIMIZATION END ---

  // Reset category when switching content type
  useEffect(() => {
    setSelectedCategory('All');
    setSearchQuery('');
    setAiReasoning(null);
  }, [selectedContentType]);

  // Focus management
  useEffect(() => {
    if (visible && searchInputRef.current) {
      // Small delay to ensure render is complete
      setTimeout(() => {
          searchInputRef.current?.focus();
      }, 50);
    }
  }, [visible]);

  const handleAISearch = async () => {
    if (!searchQuery) return;
    setAiLoading(true);
    setAiReasoning(null);
    try {
        const response: AIResponse = await getChannelRecommendations(searchQuery, channels);
        setAiReasoning(response.reasoning || "No suggestions found.");
    } catch (e) {
        setAiReasoning("AI Search unavailable.");
    }
    setAiLoading(false);
  };

  if (!visible) return null;

  return (
    <div className="absolute inset-y-0 left-0 w-full lg:w-[1000px] z-50 glass-panel flex shadow-2xl transform transition-transform duration-300 ease-out border-r border-white/10 text-white overflow-hidden">
      
      {/* Pane 1: Navigation Rail (Types) */}
      <div className="w-20 bg-black/60 flex flex-col items-center py-6 gap-6 border-r border-white/10 z-20 shrink-0">
         <div className="mb-2">
             <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-900/50">
                <Tv className="w-6 h-6 text-white" />
             </div>
         </div>
         
         <button 
            onClick={() => setSelectedContentType('LIVE')}
            className={`p-3 rounded-xl transition-all flex flex-col items-center gap-1 group ${selectedContentType === 'LIVE' ? 'bg-white/10 text-blue-400' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
            title="Live TV"
         >
            <MonitorPlay className={`w-6 h-6 ${selectedContentType === 'LIVE' ? 'fill-current' : ''}`} />
            <span className="text-[9px] font-bold uppercase tracking-wider">Live</span>
         </button>

         <button 
            onClick={() => setSelectedContentType('MOVIE')}
            className={`p-3 rounded-xl transition-all flex flex-col items-center gap-1 group ${selectedContentType === 'MOVIE' ? 'bg-white/10 text-blue-400' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
            title="Movies"
         >
            <Film className={`w-6 h-6 ${selectedContentType === 'MOVIE' ? 'fill-current' : ''}`} />
            <span className="text-[9px] font-bold uppercase tracking-wider">Movies</span>
         </button>

         <button 
            onClick={() => setSelectedContentType('SERIES')}
            className={`p-3 rounded-xl transition-all flex flex-col items-center gap-1 group ${selectedContentType === 'SERIES' ? 'bg-white/10 text-blue-400' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
            title="Series"
         >
            <Clapperboard className={`w-6 h-6 ${selectedContentType === 'SERIES' ? 'fill-current' : ''}`} />
            <span className="text-[9px] font-bold uppercase tracking-wider">Series</span>
         </button>

         <div className="flex-1" />

         <button onClick={onClose} className="p-3 text-slate-400 hover:text-white hover:bg-red-500/20 rounded-xl transition-colors">
            <X className="w-6 h-6" />
         </button>
      </div>

      {/* Pane 2: Categories List (Left Menu) */}
      <div className="w-64 bg-black/40 flex flex-col border-r border-white/10 z-10 shrink-0">
        <div className="p-4 border-b border-white/5">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Categories</h3>
            <div className="text-lg font-semibold text-white truncate">{selectedContentType === 'LIVE' ? 'Live TV' : selectedContentType === 'MOVIE' ? 'Movies' : 'Series'}</div>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-hide p-2 space-y-1">
            {sortedCategories.map(cat => {
                const isPinned = pinnedCategories.includes(cat);
                const isActive = selectedCategory === cat;
                return (
                    <div 
                        key={cat}
                        className={`group flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-all ${
                            isActive 
                            ? 'bg-blue-600/20 text-white shadow-sm ring-1 ring-blue-500/30' 
                            : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                        }`}
                        onClick={() => setSelectedCategory(cat)}
                    >
                        <span className="truncate text-sm font-medium w-40">{cat}</span>
                        {cat !== 'All' && (
                            <button 
                                onClick={(e) => { e.stopPropagation(); togglePin(cat); }}
                                className={`p-1 rounded-md transition-opacity ${isPinned ? 'opacity-100 text-yellow-400' : 'opacity-0 group-hover:opacity-100 text-slate-500 hover:text-white'}`}
                            >
                                {isPinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
                            </button>
                        )}
                    </div>
                );
            })}
        </div>
      </div>

      {/* Pane 3: Channels Grid/List */}
      <div className="flex-1 flex flex-col bg-transparent relative overflow-hidden">
         {/* Top Search Bar */}
         <div className="p-4 flex gap-3 items-center border-b border-white/5 bg-black/20 shrink-0">
            <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 text-slate-400 w-4 h-4" />
                <input
                    ref={searchInputRef}
                    type="text"
                    placeholder={`Search in ${selectedCategory === 'All' ? 'all categories' : selectedCategory}...`}
                    className="w-full bg-slate-800/50 border border-slate-700/50 rounded-lg py-2 pl-9 pr-10 text-sm text-white focus:outline-none focus:bg-slate-800 focus:border-blue-500 transition-all"
                    value={searchQuery}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.currentTarget.value)}
                    onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                        if(e.key === 'Enter') handleAISearch();
                    }}
                />
                 <button 
                    onClick={() => handleAISearch()}
                    disabled={aiLoading || !searchQuery}
                    className={`absolute right-1.5 top-1.5 p-1 rounded transition-all ${
                        searchQuery ? 'text-blue-400 hover:text-blue-300' : 'text-slate-600'
                    }`}
                >
                    {aiLoading ? <div className="w-4 h-4 border-2 border-t-transparent border-blue-400 rounded-full animate-spin"/> : <Sparkles className="w-4 h-4" />}
                </button>
            </div>
         </div>

         {/* AI Reasoning Box */}
         {aiReasoning && (
             <div className="px-4 pt-4 pb-0 shrink-0">
                <div className="bg-blue-900/20 border border-blue-500/20 p-3 rounded-lg flex items-start gap-3">
                    <Sparkles className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-blue-200">{aiReasoning}</p>
                </div>
             </div>
         )}

         {/* Channel List */}
         <div className="flex-1 overflow-y-auto p-4 scrollbar-hide">
            {finalFilteredChannels.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-500">
                    <AlertCircle className="w-10 h-10 mb-3 opacity-30" />
                    <p>No channels found</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-2">
                    {/* Only render the first 100 for immediate responsiveness if list is huge, 
                        or render all if reasonable. 
                        For now, React 18 handles large lists okay-ish, but keeping DOM light is better.
                    */}
                    {finalFilteredChannels.slice(0, 500).map((channel) => (
                        <button
                            key={channel.id}
                            onClick={() => onSelectChannel(channel)}
                            className={`w-full group flex items-center gap-4 p-3 rounded-lg transition-all text-left border border-transparent ${
                                currentChannelId === channel.id 
                                ? 'bg-blue-600 text-white shadow-lg active-item scale-[1.01]' 
                                : 'hover:bg-white/10 text-slate-300 hover:border-white/5'
                            }`}
                        >
                            <div className="w-10 h-10 rounded-md bg-black/40 flex items-center justify-center overflow-hidden shrink-0">
                                {channel.logo ? (
                                    <img src={channel.logo} alt="" className="w-full h-full object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />
                                ) : (
                                    <span className="text-xs font-bold text-slate-600">{channel.name.substring(0,2)}</span>
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className={`font-medium truncate text-sm ${currentChannelId === channel.id ? 'text-white' : 'group-hover:text-white'}`}>{channel.name}</h3>
                                <p className={`text-[10px] truncate ${currentChannelId === channel.id ? 'text-blue-200' : 'text-slate-500 group-hover:text-slate-400'}`}>
                                    {channel.group}
                                </p>
                            </div>
                            {currentChannelId === channel.id && <div className="w-2 h-2 rounded-full bg-white animate-pulse" />}
                        </button>
                    ))}
                    {finalFilteredChannels.length > 500 && (
                         <div className="text-center py-4 text-xs text-slate-500">
                             And {finalFilteredChannels.length - 500} more channels... (Refine search to see them)
                         </div>
                    )}
                </div>
            )}
         </div>

         <div className="p-3 border-t border-white/5 text-right text-[10px] text-slate-600 uppercase shrink-0">
             {finalFilteredChannels.length} Channels Loaded
         </div>
      </div>

    </div>
  );
};

export default ChannelList;