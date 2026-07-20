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

export type PropKind =
  | 'mug'
  | 'glass'
  | 'plant'
  | 'book'
  | 'phone'
  | 'candle'
  | 'bottle'
  | 'remote'
  | 'frame'
  | 'bowl'
  | 'laptop'
  | 'kettle'
  | 'lamp'
  | 'vase'
  | 'stack';

export type WeightClass = 'feather' | 'light' | 'medium' | 'heavy' | 'anchor';

export interface PropDef {
  kind: PropKind;
  color: number;
  scale: [number, number, number];
  mass: number;
  shatter: 'glass' | 'ceramic' | 'soft' | 'metal';
  weight: WeightClass;
  /** Swat hits needed before it will slide freely (anchors/heavies) */
  toughness: number;
  friction: number;
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
  props: PropKind[];
  /** Optional fixed blockers that must be toppled with sustained swats */
  blockers?: PropKind[];
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
      "Silver hair, tragic jacket, too many opinions about lighting. Heather thinks he's mysterious. Suki thinks he's furniture.",
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
    completeBody: "Jasper scooped Suki skyward like a trophy. Heather's trinkets never stood a chance.",
    accent: 0xf0c675,
  },
];

export const PROP_LIBRARY: Record<PropKind, Omit<PropDef, 'kind'>> = {
  mug: {
    color: 0xe8d5c4,
    scale: [0.22, 0.26, 0.22],
    mass: 0.45,
    shatter: 'ceramic',
    weight: 'light',
    toughness: 1,
    friction: 0.35,
  },
  glass: {
    color: 0xa8d8ea,
    scale: [0.14, 0.32, 0.14],
    mass: 0.22,
    shatter: 'glass',
    weight: 'feather',
    toughness: 1,
    friction: 0.2,
  },
  plant: {
    color: 0x6b9b6e,
    scale: [0.32, 0.4, 0.32],
    mass: 1.8,
    shatter: 'ceramic',
    weight: 'heavy',
    toughness: 3,
    friction: 0.55,
  },
  book: {
    color: 0x8b5a4a,
    scale: [0.3, 0.08, 0.22],
    mass: 0.55,
    shatter: 'soft',
    weight: 'light',
    toughness: 1,
    friction: 0.4,
  },
  phone: {
    color: 0x2a2a32,
    scale: [0.16, 0.02, 0.3],
    mass: 0.18,
    shatter: 'metal',
    weight: 'feather',
    toughness: 1,
    friction: 0.25,
  },
  candle: {
    color: 0xf5e6c8,
    scale: [0.12, 0.28, 0.12],
    mass: 0.3,
    shatter: 'soft',
    weight: 'light',
    toughness: 1,
    friction: 0.35,
  },
  bottle: {
    color: 0xd4a5c9,
    scale: [0.12, 0.36, 0.12],
    mass: 0.4,
    shatter: 'glass',
    weight: 'light',
    toughness: 1,
    friction: 0.28,
  },
  remote: {
    color: 0x3a3a44,
    scale: [0.12, 0.04, 0.28],
    mass: 0.2,
    shatter: 'metal',
    weight: 'feather',
    toughness: 1,
    friction: 0.3,
  },
  frame: {
    color: 0xd4c4a8,
    scale: [0.28, 0.32, 0.04],
    mass: 0.5,
    shatter: 'glass',
    weight: 'light',
    toughness: 1,
    friction: 0.35,
  },
  bowl: {
    color: 0xc9b8a8,
    scale: [0.28, 0.1, 0.28],
    mass: 0.5,
    shatter: 'ceramic',
    weight: 'light',
    toughness: 1,
    friction: 0.4,
  },
  laptop: {
    color: 0x3a3a42,
    scale: [0.45, 0.04, 0.32],
    mass: 2.4,
    shatter: 'metal',
    weight: 'heavy',
    toughness: 4,
    friction: 0.6,
  },
  kettle: {
    color: 0xc0c8d0,
    scale: [0.28, 0.32, 0.22],
    mass: 2.1,
    shatter: 'metal',
    weight: 'heavy',
    toughness: 3,
    friction: 0.5,
  },
  lamp: {
    color: 0xf0e8d8,
    scale: [0.22, 0.48, 0.22],
    mass: 3.2,
    shatter: 'ceramic',
    weight: 'anchor',
    toughness: 5,
    friction: 0.7,
  },
  vase: {
    color: 0x88aacc,
    scale: [0.16, 0.42, 0.16],
    mass: 1.1,
    shatter: 'glass',
    weight: 'medium',
    toughness: 2,
    friction: 0.4,
  },
  stack: {
    color: 0x6a4a3a,
    scale: [0.32, 0.28, 0.24],
    mass: 2.6,
    shatter: 'soft',
    weight: 'heavy',
    toughness: 4,
    friction: 0.65,
  },
};

export const LEVELS: LevelDef[] = [
  {
    id: 'kitchen',
    name: 'Kitchen Island',
    surface: 'kitchen',
    boyfriendId: 'eli',
    counterSize: [5.4, 2.5],
    propCount: 12,
    ambientColor: 0x1a1028,
    keyColor: 0xffd4a8,
    fillColor: 0x8b6cff,
    fogColor: 0x12081c,
    wallColor: 0x2a1f38,
    counterColor: 0x4a3830,
    props: [
      'mug',
      'glass',
      'phone',
      'bowl',
      'candle',
      'remote',
      'glass',
      'mug',
      'bottle',
      'plant',
      'kettle',
      'vase',
    ],
    blockers: ['kettle'],
  },
  {
    id: 'desk',
    name: "Heather's Desk",
    surface: 'desk',
    boyfriendId: 'kai',
    counterSize: [4.8, 2.2],
    propCount: 14,
    ambientColor: 0x0c1420,
    keyColor: 0xa8e0ff,
    fillColor: 0xc48cff,
    fogColor: 0x080e18,
    wallColor: 0x1a2230,
    counterColor: 0x2a2420,
    props: [
      'book',
      'book',
      'phone',
      'mug',
      'frame',
      'bottle',
      'candle',
      'remote',
      'glass',
      'plant',
      'bowl',
      'laptop',
      'stack',
      'vase',
    ],
    blockers: ['laptop', 'stack'],
  },
  {
    id: 'vanity',
    name: 'Bathroom Vanity',
    surface: 'vanity',
    boyfriendId: 'jasper',
    counterSize: [4.2, 1.9],
    propCount: 13,
    ambientColor: 0x201018,
    keyColor: 0xffc8d8,
    fillColor: 0xffe0a0,
    fogColor: 0x160c12,
    wallColor: 0x2e2230,
    counterColor: 0x5a5550,
    props: [
      'bottle',
      'bottle',
      'candle',
      'bowl',
      'glass',
      'frame',
      'mug',
      'phone',
      'plant',
      'remote',
      'glass',
      'lamp',
      'vase',
    ],
    blockers: ['lamp'],
  },
];

export function getBoyfriend(id: string): Boyfriend {
  const b = BOYFRIENDS.find((x) => x.id === id);
  if (!b) throw new Error(`Unknown boyfriend: ${id}`);
  return b;
}

export function weightLabel(w: WeightClass): string {
  switch (w) {
    case 'feather':
      return 'featherweight';
    case 'light':
      return 'light';
    case 'medium':
      return 'sturdy';
    case 'heavy':
      return 'heavy';
    case 'anchor':
      return 'immovable… almost';
  }
}
