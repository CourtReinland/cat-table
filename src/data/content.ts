export interface DialogueLine {
  speaker: string;
  portrait: string;
  text: string;
  voice?: string;
}

export interface Boyfriend {
  id: string;
  name: string;
  title: string;
  description: string;
  sukiLine: string;
  sukiVoice?: string;
  portrait: string;
  cutscene: string;
  dialogue: DialogueLine[];
  completeBody: string;
  accent: number;
  noticeVoice?: string;
}

export interface PropDef {
  kind: 'mug' | 'glass' | 'plant' | 'book' | 'phone' | 'candle' | 'bottle' | 'remote' | 'frame' | 'bowl';
  color: number;
  scale: [number, number, number];
  mass: number;
  shatter: 'glass' | 'ceramic' | 'soft' | 'metal';
}

export interface LevelDef {
  id: string;
  name: string;
  surface: 'kitchen' | 'desk' | 'vanity' | 'bookshelf' | 'coffee';
  boyfriendId: string;
  counterSize: [number, number];
  propCount: number;
  ambientColor: number;
  keyColor: number;
  fillColor: number;
  fogColor: number;
  wallColor: number;
  counterColor: number;
  props: PropDef['kind'][];
}

export const SUKI = {
  name: 'Suki',
  portrait: '/assets/characters/suki-portrait.jpg',
};

export const BOYFRIENDS: Boyfriend[] = [
  {
    id: 'eli',
    name: 'Eli Moreau',
    title: 'The Soft-Spoken Neighbor',
    description:
      'Heather brought home the quiet guy from 4B. He smells like cedar and has the kind of voice that makes plants grow.',
    sukiLine: '"Excuse me. Those hands were scheduled for ear scritches."',
    sukiVoice: '/assets/audio/suki-jealous.mp3',
    portrait: '/assets/characters/boy-eli.jpg',
    cutscene: '/assets/cutscenes/cuddle-eli.jpg',
    noticeVoice: '/assets/audio/eli-notice.mp3',
    dialogue: [
      {
        speaker: 'Eli',
        portrait: '/assets/characters/boy-eli.jpg',
        text: '…Did something just explode in the kitchen?',
      },
      {
        speaker: 'Suki',
        portrait: '/assets/characters/suki-portrait.jpg',
        text: 'Meow. (Translation: Notice me, sweater boy.)',
        voice: '/assets/audio/suki-jealous.mp3',
      },
      {
        speaker: 'Eli',
        portrait: '/assets/characters/boy-eli.jpg',
        text: "Oh—hi, little one. You're much more interesting than the documentary, aren't you?",
        voice: '/assets/audio/eli-notice.mp3',
      },
      {
        speaker: 'Suki',
        portrait: '/assets/characters/suki-portrait.jpg',
        text: 'Purr. Mission complete. Chaos was simply… necessary.',
      },
    ],
    completeBody: 'Eli abandoned the couch documentary and surrendered to the true star of the apartment.',
    accent: 0xc4a484,
  },
  {
    id: 'kai',
    name: 'Kai Voss',
    title: 'The Midnight Artist',
    description:
      'Silver hair, tragic jacket, too many opinions about lighting. Heather thinks he\'s mysterious. Suki thinks he\'s furniture.',
    sukiLine: '"Pretty boy. Sit. Pet. Obey."',
    sukiVoice: '/assets/audio/suki-jealous.mp3',
    portrait: '/assets/characters/boy-kai.jpg',
    cutscene: '/assets/cutscenes/cuddle-kai.jpg',
    noticeVoice: '/assets/audio/kai-notice.mp3',
    dialogue: [
      {
        speaker: 'Kai',
        portrait: '/assets/characters/boy-kai.jpg',
        text: 'That was… a statement piece. Abstract glass on hardwood.',
      },
      {
        speaker: 'Suki',
        portrait: '/assets/characters/suki-portrait.jpg',
        text: 'Mrrrow. (Your attention, please. Criticize me later.)',
      },
      {
        speaker: 'Kai',
        portrait: '/assets/characters/boy-kai.jpg',
        text: "Alright, diva. Come here. You're the only gallery worth visiting tonight.",
        voice: '/assets/audio/kai-notice.mp3',
      },
    ],
    completeBody: 'Kai laughed, called the wreckage "installation art," and made room on his lap for royalty.',
    accent: 0x7ec8e3,
  },
  {
    id: 'jasper',
    name: 'Jasper Hale',
    title: 'The Golden Retriever Energy',
    description:
      'Freckles, sunshine, and zero indoor voice. He high-fived Heather. Suki will high-five his face with a paw.',
    sukiLine: '"Too cheerful. Must fix with exclusive cuddles."',
    sukiVoice: '/assets/audio/suki-jealous.mp3',
    portrait: '/assets/characters/boy-jasper.jpg',
    cutscene: '/assets/cutscenes/cuddle-jasper.jpg',
    noticeVoice: '/assets/audio/jasper-notice.mp3',
    dialogue: [
      {
        speaker: 'Jasper',
        portrait: '/assets/characters/boy-jasper.jpg',
        text: 'WHOA! Cat tornado! That was awesome—are you okay, buddy?!',
      },
      {
        speaker: 'Suki',
        portrait: '/assets/characters/suki-portrait.jpg',
        text: 'Mew. (I am a lady. Lift me like the prize I am.)',
      },
      {
        speaker: 'Jasper',
        portrait: '/assets/characters/boy-jasper.jpg',
        text: "Haha, okay okay! Up you go, chaos queen. You're the MVP tonight!",
        voice: '/assets/audio/jasper-notice.mp3',
      },
    ],
    completeBody: 'Jasper scooped Suki skyward like a trophy. Heather\'s trinkets never stood a chance.',
    accent: 0xf0c675,
  },
];

export const PROP_LIBRARY: Record<PropDef['kind'], Omit<PropDef, 'kind'>> = {
  mug: { color: 0xe8d5c4, scale: [0.22, 0.26, 0.22], mass: 0.4, shatter: 'ceramic' },
  glass: { color: 0xa8d8ea, scale: [0.14, 0.32, 0.14], mass: 0.25, shatter: 'glass' },
  plant: { color: 0x6b9b6e, scale: [0.28, 0.35, 0.28], mass: 0.6, shatter: 'ceramic' },
  book: { color: 0x8b5a4a, scale: [0.3, 0.08, 0.22], mass: 0.5, shatter: 'soft' },
  phone: { color: 0x2a2a32, scale: [0.16, 0.02, 0.3], mass: 0.2, shatter: 'metal' },
  candle: { color: 0xf5e6c8, scale: [0.12, 0.28, 0.12], mass: 0.3, shatter: 'soft' },
  bottle: { color: 0xd4a5c9, scale: [0.12, 0.36, 0.12], mass: 0.35, shatter: 'glass' },
  remote: { color: 0x3a3a44, scale: [0.12, 0.04, 0.28], mass: 0.22, shatter: 'metal' },
  frame: { color: 0xd4c4a8, scale: [0.28, 0.32, 0.04], mass: 0.45, shatter: 'glass' },
  bowl: { color: 0xc9b8a8, scale: [0.28, 0.1, 0.28], mass: 0.4, shatter: 'ceramic' },
};

export const LEVELS: LevelDef[] = [
  {
    id: 'kitchen',
    name: 'Kitchen Island',
    surface: 'kitchen',
    boyfriendId: 'eli',
    counterSize: [5.2, 2.4],
    propCount: 10,
    ambientColor: 0x1a1028,
    keyColor: 0xffd4a8,
    fillColor: 0x8b6cff,
    fogColor: 0x12081c,
    wallColor: 0x2a1f38,
    counterColor: 0x3d2f28,
    props: ['mug', 'glass', 'plant', 'book', 'phone', 'bowl', 'candle', 'remote', 'glass', 'mug'],
  },
  {
    id: 'desk',
    name: 'Heather\'s Desk',
    surface: 'desk',
    boyfriendId: 'kai',
    counterSize: [4.6, 2.1],
    propCount: 12,
    ambientColor: 0x0c1420,
    keyColor: 0xa8e0ff,
    fillColor: 0xc48cff,
    fogColor: 0x080e18,
    wallColor: 0x1a2230,
    counterColor: 0x2a2420,
    props: ['book', 'book', 'phone', 'mug', 'frame', 'bottle', 'candle', 'remote', 'glass', 'plant', 'bowl', 'phone'],
  },
  {
    id: 'vanity',
    name: 'Bathroom Vanity',
    surface: 'vanity',
    boyfriendId: 'jasper',
    counterSize: [4.0, 1.8],
    propCount: 11,
    ambientColor: 0x201018,
    keyColor: 0xffc8d8,
    fillColor: 0xffe0a0,
    fogColor: 0x160c12,
    wallColor: 0x2e2230,
    counterColor: 0x4a4540,
    props: ['bottle', 'bottle', 'candle', 'bowl', 'glass', 'frame', 'mug', 'phone', 'plant', 'remote', 'glass'],
  },
];

export function getBoyfriend(id: string): Boyfriend {
  const b = BOYFRIENDS.find((x) => x.id === id);
  if (!b) throw new Error(`Unknown boyfriend: ${id}`);
  return b;
}
