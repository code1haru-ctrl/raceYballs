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

/**
 * Twenty marble slots. A race uses the first `marbleCount` (2..20); the rest
 * stay available in the garage as reserves. Names are 1..12 characters and
 * colors are unique and readable on the dark track.
 */
export const MARBLES: Marble[] = [
  { id: 'cyan-comet', name: 'Cyan Comet', color: '#2ce9ff' },
  { id: 'magenta-mirage', name: 'Magenta Mist', color: '#ff3fbf' },
  { id: 'violet-vortex', name: 'Violet Vex', color: '#a97bff' },
  { id: 'lime-lightning', name: 'Lime Bolt', color: '#8df25c' },
  { id: 'solar-flare', name: 'Solar Flare', color: '#ffd23f' },
  { id: 'orange-overdrive', name: 'Orange Rush', color: '#ff7a3d' },
  { id: 'coral-crash', name: 'Coral Crash', color: '#ff5c7a' },
  { id: 'blue-bolt', name: 'Blue Bolt', color: '#4d7cff' },
  { id: 'teal-torpedo', name: 'Teal Torpedo', color: '#3dffc8' },
  { id: 'chrome-ghost', name: 'Chrome Ghost', color: '#e6ebf7' },
  { id: 'ruby-rush', name: 'Ruby Rush', color: '#ff4d6d' },
  { id: 'emerald-dash', name: 'Emerald Dash', color: '#00e676' },
  { id: 'amber-alert', name: 'Amber Alert', color: '#ffb300' },
  { id: 'neon-nova', name: 'Neon Nova', color: '#7cff00' },
  { id: 'sky-surge', name: 'Sky Surge', color: '#00b0ff' },
  { id: 'plum-pulse', name: 'Plum Pulse', color: '#e040fb' },
  { id: 'rose-rocket', name: 'Rose Rocket', color: '#ff8a80' },
  { id: 'mint-meteor', name: 'Mint Meteor', color: '#64ffda' },
  { id: 'gold-glide', name: 'Gold Glide', color: '#ffd700' },
  { id: 'pink-phantom', name: 'Pink Phantom', color: '#ff9ecd' },
]
