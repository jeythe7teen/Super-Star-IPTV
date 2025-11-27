
export type ContentType = 'LIVE' | 'MOVIE' | 'SERIES';

export interface Channel {
  id: string;
  name: string;
  logo?: string;
  group?: string;
  url: string;
  type: ContentType;
}

export interface Playlist {
  name: string;
  channels: Channel[];
}

export enum AppState {
  SETUP = 'SETUP',
  DASHBOARD = 'DASHBOARD',
  PLAYER = 'PLAYER',
}

export interface AIResponse {
  suggestedChannels: string[];
  reasoning: string;
}

// New Types for Series Hierarchy
export interface Series {
    id: string;
    name: string; // The show name (e.g. "Breaking Bad")
    cover?: string;
    group: string;
    seasons: Record<string, Channel[]>; // Key is season number ("1", "2"), Value is list of episodes
    episodeCount: number;
}

export type SortOption = 'DEFAULT' | 'A_Z' | 'Z_A' | 'RECENT' | 'OLD';
