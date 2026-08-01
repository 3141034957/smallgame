export interface Character {
  id: string
  name: string
  desc: string
  price: number
  image: string
  colors: {
    head: string
    body: string
    eye: string
    foot: string
    antenna: string
    glow: string
  }
}

const CHARACTER_CATALOG: Character[] = [
  {
    id: 'default',
    name: 'HUG',
    desc: '最初的机械核心',
    price: 1,
    image: '/assets/Pasted-20260730-103104_pixian_ai.png',
    colors: {
      head: 'linear-gradient(145deg, #8cb8ce, #5f83ad 66%, #4b6791)',
      body: 'linear-gradient(145deg, #688eb9, #435d91)',
      eye: '#a8fff0',
      foot: '#4c6497',
      antenna: '#a8fff0',
      glow: 'rgba(168, 255, 240, 0.6)',
    },
  },
  {
    id: 'steampunk',
    name: 'Oscar',
    desc: '黄铜与蒸汽的艺术',
    price: 1,
    image: '/assets/Pasted-20260730-104554_pixian_ai.png',
    colors: {
      head: 'linear-gradient(145deg, #d4a54a, #b8862d 66%, #8b6914)',
      body: 'linear-gradient(145deg, #c49a3c, #9a7628)',
      eye: '#ffd700',
      foot: '#a0762a',
      antenna: '#ffd700',
      glow: 'rgba(255, 215, 0, 0.6)',
    },
  },
  {
    id: 'penguin',
    name: '超能MM',
    desc: '披风与快刀的流浪侠客',
    price: 1,
    image: '/assets/Pasted-20260730-112045_pixian_ai.png',
    colors: {
      head: 'linear-gradient(145deg, #34333f, #14151c 66%, #090a0f)',
      body: 'linear-gradient(145deg, #f5f4ec, #cfd8dc)',
      eye: '#80d8ff',
      foot: '#f4a62a',
      antenna: '#b86fe8',
      glow: 'rgba(128, 216, 255, 0.62)',
    },
  },
  {
    id: 'neon',
    name: '咕咕嘎嘎',
    desc: '未来之光的化身',
    price: 1,
    image: '/assets/Pasted-20260730-104808_pixian_ai.png',
    colors: {
      head: 'linear-gradient(145deg, #a855f7, #7c3aed 66%, #5b21b6)',
      body: 'linear-gradient(145deg, #8b5cf6, #6d28d9)',
      eye: '#f472b6',
      foot: '#7c3aed',
      antenna: '#f472b6',
      glow: 'rgba(244, 114, 182, 0.6)',
    },
  },
  {
    id: 'golden',
    name: '我的刀盾',
    desc: '不灭的耀眼光辉',
    price: 1,
    image: '/assets/Pasted-20260730-105451_pixian_ai.png',
    colors: {
      head: 'linear-gradient(145deg, #fbbf24, #f59e0b 66%, #d97706)',
      body: 'linear-gradient(145deg, #fbbf24, #f59e0b)',
      eye: '#fef3c7',
      foot: '#d97706',
      antenna: '#fef3c7',
      glow: 'rgba(253, 230, 138, 0.7)',
    },
  },
  {
    id: 'shadow',
    name: '超能GG',
    desc: '来自深渊的注视',
    price: 1,
    image: '/assets/Pasted-20260730-110958_pixian_ai.png',
    colors: {
      head: 'linear-gradient(145deg, #374151, #1f2937 66%, #111827)',
      body: 'linear-gradient(145deg, #4b5563, #1f2937)',
      eye: '#ef4444',
      foot: '#374151',
      antenna: '#ef4444',
      glow: 'rgba(239, 68, 68, 0.5)',
    },
  },
  {
    id: 'burger-dog',
    name: '汉堡小狗',
    desc: '把美味和好运一起带来',
    price: 1,
    image: '/assets/Pasted-20260730-115541_pixian_ai.png',
    colors: {
      head: 'linear-gradient(145deg, #ffb13b, #f07c25 66%, #d95d17)',
      body: 'linear-gradient(145deg, #9ed84f, #5eaa3f)',
      eye: '#5b241c',
      foot: '#ff9b38',
      antenna: '#8ed34c',
      glow: 'rgba(255, 171, 67, 0.62)',
    },
  },
]

const CHARACTER_DISPLAY_ORDER = [
  'burger-dog',
  'golden',
  'neon',
  'shadow',
  'penguin',
  'steampunk',
  'default',
]

export const CHARACTERS = CHARACTER_DISPLAY_ORDER.map(
  (id) => CHARACTER_CATALOG.find((character) => character.id === id) as Character,
)

export const DEFAULT_CHARACTER_ID = 'steampunk'

