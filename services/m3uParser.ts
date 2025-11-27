import { Channel, ContentType } from '../types';

const detectType = (group: string = '', name: string = '', url: string = ''): ContentType => {
    const lowerGroup = group.toLowerCase();
    const lowerUrl = url.toLowerCase();

    // Series Detection
    if (
        lowerGroup.includes('series') || 
        lowerGroup.includes('season') || 
        lowerGroup.includes('episodes') ||
        lowerGroup.includes('tv show')
    ) {
        return 'SERIES';
    }

    // Movie Detection
    if (
        lowerGroup.includes('movie') || 
        lowerGroup.includes('vod') || 
        lowerGroup.includes('film') || 
        lowerGroup.includes('cinema') || 
        lowerGroup.includes('4k') ||
        lowerUrl.endsWith('.mp4') ||
        lowerUrl.endsWith('.mkv') ||
        lowerUrl.endsWith('.avi')
    ) {
        return 'MOVIE';
    }

    // Default to Live TV
    return 'LIVE';
};

export const parseM3U = (content: string): Channel[] => {
  const lines = content.split('\n');
  const channels: Channel[] = [];
  let currentChannel: Partial<Channel> = {};

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('#EXTINF:')) {
      // Parse metadata
      const info = trimmed.substring(8);
      const parts = info.split(',');
      const name = parts[parts.length - 1]?.trim() || 'Unknown Channel';
      
      // Extract attributes like tvg-logo, group-title
      const logoMatch = info.match(/tvg-logo="([^"]*)"/);
      const groupMatch = info.match(/group-title="([^"]*)"/);
      
      currentChannel = {
        id: crypto.randomUUID(),
        name: name,
        logo: logoMatch ? logoMatch[1] : undefined,
        group: groupMatch ? groupMatch[1] : 'Uncategorized',
      };
    } else if (trimmed.startsWith('http')) {
      // It's a URL
      if (currentChannel.name) {
        const type = detectType(currentChannel.group, currentChannel.name, trimmed);
        
        channels.push({
          ...currentChannel,
          url: trimmed,
          type: type
        } as Channel);
        currentChannel = {};
      }
    }
  });

  return channels;
};

// A sample playlist for demo purposes (Legal, free streams)
export const DEMO_PLAYLIST = `#EXTM3U
#EXTINF:-1 group-title="Movies" tvg-logo="https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Big_buck_bunny_poster_big.jpg/800px-Big_buck_bunny_poster_big.jpg",Big Buck Bunny
http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4
#EXTINF:-1 group-title="Movies" tvg-logo="https://upload.wikimedia.org/wikipedia/commons/thumb/d/dc/Sintel_poster.jpg/800px-Sintel_poster.jpg",Sintel
http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4
#EXTINF:-1 group-title="Movies" tvg-logo="https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/Tears_of_Steel_poster.jpg/800px-Tears_of_Steel_poster.jpg",Tears of Steel
http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4
#EXTINF:-1 group-title="News" tvg-logo="https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/NASA_Worm_logo_black.svg/1200px-NASA_Worm_logo_black.svg.png",NASA TV
https://ntv1.akamaized.net/hls/live/2013530/NASA-NTV1-HLS/master.m3u8
`;