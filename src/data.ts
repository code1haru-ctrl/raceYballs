export type TrackId = 'neon-circuit' | 'chaos-canyon' | 'gravity-gauntlet'

export interface Track {
  id: TrackId
  name: string
  tagline: string
  accent: string
}

export const TRACKS: Track[] = [
  {
    id: 'neon-circuit',
    name: 'Neon Circuit',
    tagline: 'Sweeping neon loops and long open straights.',
    accent: '#2ce9ff',
  },
  {
    id: 'chaos-canyon',
    name: 'Chaos Canyon',
    tagline: 'Jagged walls, split lines, and surprise drops.',
    accent: '#ff3fbf',
  },
  {
    id: 'gravity-gauntlet',
    name: 'Gravity Gauntlet',
    tagline: 'Warped gravity and near-vertical plunges.',
    accent: '#a97bff',
  },
]

export interface Marble {
  id: string
  name: string
  color: string
}

export const MARBLES: Marble[] = [
  { id: 'cyan-comet', name: 'Cyan Comet', color: '#2ce9ff' },
  { id: 'magenta-mirage', name: 'Magenta Mirage', color: '#ff3fbf' },
  { id: 'violet-vortex', name: 'Violet Vortex', color: '#a97bff' },
  { id: 'lime-lightning', name: 'Lime Lightning', color: '#8df25c' },
  { id: 'solar-flare', name: 'Solar Flare', color: '#ffd23f' },
  { id: 'orange-overdrive', name: 'Orange Overdrive', color: '#ff7a3d' },
  { id: 'coral-crash', name: 'Coral Crash', color: '#ff5c7a' },
  { id: 'blue-bolt', name: 'Blue Bolt', color: '#4d7cff' },
  { id: 'teal-torpedo', name: 'Teal Torpedo', color: '#3dffc8' },
  { id: 'chrome-ghost', name: 'Chrome Ghost', color: '#e6ebf7' },
]
