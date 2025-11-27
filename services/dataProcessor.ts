import { Channel, Series, SortOption } from '../types';

// Regex to extract Series Name, Season, and Episode
// Matches: "Show Name S01 E05", "Show Name - S1E5", "Show Name 1x05"
const SERIES_REGEX = /^(.*?)\s?[-_]?\s?S(\d+)\s?E(\d+)/i;
const ALT_SERIES_REGEX = /^(.*?)\s?[-_]?\s?(\d+)x(\d+)/i;

export const processSeries = (channels: Channel[]): Series[] => {
    const seriesMap = new Map<string, Series>();

    channels.forEach(channel => {
        let showName = channel.name;
        let season = "1";
        
        // Try standard S01E01 format
        let match = channel.name.match(SERIES_REGEX);
        
        // Try 1x01 format if failed
        if (!match) {
            match = channel.name.match(ALT_SERIES_REGEX);
        }

        if (match) {
            showName = match[1].trim().replace(/[-_]$/, '').trim();
            season = parseInt(match[2], 10).toString(); // Normalize "01" to "1"
        }

        const seriesId = `${channel.group}-${showName}`;

        if (!seriesMap.has(seriesId)) {
            seriesMap.set(seriesId, {
                id: seriesId,
                name: showName,
                group: channel.group || 'Uncategorized',
                cover: channel.logo,
                seasons: {},
                episodeCount: 0
            });
        }

        const series = seriesMap.get(seriesId)!;
        
        if (!series.seasons[season]) {
            series.seasons[season] = [];
        }
        
        series.seasons[season].push(channel);
        series.episodeCount++;

        // Update cover if missing
        if (!series.cover && channel.logo) {
            series.cover = channel.logo;
        }
    });

    return Array.from(seriesMap.values());
};

export const sortChannels = (items: Channel[], sort: SortOption): Channel[] => {
    const sorted = [...items];
    switch (sort) {
        case 'A_Z':
            return sorted.sort((a, b) => a.name.localeCompare(b.name));
        case 'Z_A':
            return sorted.sort((a, b) => b.name.localeCompare(a.name));
        case 'RECENT':
             // Assuming the list coming in was in playlist order, reverse it to show bottom (newest) first
             return sorted.reverse();
        case 'OLD':
             // Default playlist order usually starts with older items or strict file order
             return sorted;
        default: // 'DEFAULT'
            return sorted;
    }
};

export const sortSeries = (items: Series[], sort: SortOption): Series[] => {
    const sorted = [...items];
    switch (sort) {
        case 'A_Z':
            return sorted.sort((a, b) => a.name.localeCompare(b.name));
        case 'Z_A':
            return sorted.sort((a, b) => b.name.localeCompare(a.name));
        case 'RECENT':
             // Newest added series likely at bottom of M3U
             return sorted.reverse();
        case 'OLD':
             return sorted;
        default:
            return sorted;
    }
};