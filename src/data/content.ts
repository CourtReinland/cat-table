// ─────────────────────────────────────────────────────────────────────────────
// Cat Top Sim — Suki's Jealous Reign
// Content: characters, levels, dialogue, props. All paths resolve under /assets.
// ─────────────────────────────────────────────────────────────────────────────

export interface Line {
  speaker: 'boy' | 'suki' | 'narrator';
  text: string;
  voice?: string; // audio file, optional (suki speaks in meows)
}

export interface BoyDef {
  id: string;
  name: string;
  title: string; // otome archetype
  description: string; // intro card blurb
  verdict: string; // Suki's judgement, shown on intro card
  portrait: string;
  cutsceneImg: string;
  accent: number; // theme color for UI + character tint
  hairColor: number;
  outfitColor: number;
  lines: {
    intro: Line; // spoken as he arrives
    barks: Line[]; // mid-level reactions at 25 / 50 / 75% chaos
    cutscene: Line[]; // cuddle cinematic dialogue
  };
  completeBody: string;
}

export type PropKind =
  | 'mug'
  | 'glass'
  | 'wineglass'
  | 'plate'
  | 'plant'
  | 'book'
  | 'phone'
  | 'candle'
  | 'bottle'
  | 'remote'
  | 'frame'
  | 'bowl'
  | 'jar'
  | 'vase'
  | 'perfume'
  | 'jewelrybox'
  | 'candelabra'
  | 'teapot'
  | 'laptop';

export type ShatterKind = 'glass' | 'ceramic' | 'soft' | 'metal' | 'grand';

export interface PropDef {
  color: number;
  accentColor?: number;
  // footprint size in meters (w, h, d)
  size: [number, number, number];
  mass: number;
  shatter: ShatterKind;
  points: number;
}

export type SurfaceKind = 'kitchen' | 'coffee' | 'desk' | 'dresser' | 'dining';

export interface LevelDef {
  id: string;
  name: string;
  subtitle: string;
  surface: SurfaceKind;
  boyfriendId: string;
  // counter top size (x width, z depth) and height
  counterSize: [number, number];
  counterHeight: number;
  // mood
  sky: number; // window sky color
  keyColor: number; // key light
  fillColor: number; // fill / rim
  lampColor: number; // practical lamp light
  fogColor: number;
  wallColor: number;
  counterColor: number;
  props: PropKind[];
  rankScores: [number, number, number]; // A, S, S+ thresholds
}

export const SUKI = {
  name: 'Suki',
  portrait: 'assets/characters/suki-portrait.jpg',
};

export const NARRATOR = {
  title: 'assets/audio/voice/narrator-title.mp3',
  ending: 'assets/audio/voice/narrator-ending.mp3',
};

export const BOYFRIENDS: BoyDef[] = [
  {
    id: 'eli',
    name: 'Eli Moreau',
    title: 'The Soft-Spoken Neighbor',
    description:
      'Heather brought home the quiet guy from 4B. He smells like cedar, alphabetizes spice racks, and has the kind of voice that makes plants lean in.',
    verdict: '"Acceptable hands. Currently misapplied to a mug that is not me."',
    portrait: 'assets/characters/boy-eli.jpg',
    cutsceneImg: 'assets/cutscenes/cuddle-eli.jpg',
    accent: 0xd8a878,
    hairColor: 0x6b4a32,
    outfitColor: 0x5f6a4a,
    lines: {
      intro: {
        speaker: 'boy',
        text: 'Wow, Heather, your kitchen is so— wait. Is that cat… staring at me?',
        voice: 'assets/audio/voice/eli-intro.mp3',
      },
      barks: [
        {
          speaker: 'boy',
          text: '…Did something just explode in the kitchen?',
          voice: 'assets/audio/voice/eli-bark1.mp3',
        },
        {
          speaker: 'boy',
          text: 'That is the fourth mug. Should we… should we stop her? She looks so calm about it.',
          voice: 'assets/audio/voice/eli-bark2.mp3',
        },
        {
          speaker: 'boy',
          text: "I can't look away. It's like a tiny, furry avalanche with eye contact.",
          voice: 'assets/audio/voice/eli-bark3.mp3',
        },
      ],
      cutscene: [
        {
          speaker: 'boy',
          text: "Oh—hi, little one. You're much more interesting than the documentary, aren't you?",
          voice: 'assets/audio/voice/eli-cuddle1.mp3',
        },
        { speaker: 'suki', text: 'Meow. (Translation: Notice me, sweater boy.)' },
        {
          speaker: 'boy',
          text: 'Was this whole thing… for attention? Honestly? Respect.',
          voice: 'assets/audio/voice/eli-cuddle2.mp3',
        },
        { speaker: 'suki', text: 'Purr. Mission complete. Chaos was simply… necessary.' },
      ],
    },
    completeBody:
      'Eli abandoned the couch documentary and surrendered to the true star of the apartment.',
  },
  {
    id: 'jasper',
    name: 'Jasper Hale',
    title: 'The Golden Retriever Energy',
    description:
      'Freckles, sunshine, zero indoor voice. He high-fived Heather at the door. Suki will high-five his face with a paw.',
    verdict: '"Too cheerful. Must fix with exclusive cuddles."',
    portrait: 'assets/characters/boy-jasper.jpg',
    cutsceneImg: 'assets/cutscenes/cuddle-jasper.jpg',
    accent: 0xf0c675,
    hairColor: 0xd9a45b,
    outfitColor: 0x4a7ba6,
    lines: {
      intro: {
        speaker: 'boy',
        text: 'Movie night! I brought popcorn, I brought candy, I— oh my gosh, HI KITTY!',
        voice: 'assets/audio/voice/jasper-intro.mp3',
      },
      barks: [
        {
          speaker: 'boy',
          text: 'WHOA! Cat tornado! That was awesome— are you okay, buddy?!',
          voice: 'assets/audio/voice/jasper-bark1.mp3',
        },
        {
          speaker: 'boy',
          text: 'She is SPEED-RUNNING your coffee table! Should I be filming this? I am filming this.',
          voice: 'assets/audio/voice/jasper-bark2.mp3',
        },
        {
          speaker: 'boy',
          text: 'That candle had a family, man! …Do it again.',
          voice: 'assets/audio/voice/jasper-bark3.mp3',
        },
      ],
      cutscene: [
        { speaker: 'suki', text: 'Mew. (I am a lady. Lift me like the prize I am.)' },
        {
          speaker: 'boy',
          text: "Haha, okay okay! Up you go, chaos queen. You're the MVP tonight!",
          voice: 'assets/audio/voice/jasper-cuddle1.mp3',
        },
        {
          speaker: 'boy',
          text: 'You are SO much better than the movie. No offense to the movie.',
          voice: 'assets/audio/voice/jasper-cuddle2.mp3',
        },
      ],
    },
    completeBody:
      "Jasper scooped Suki skyward like a trophy. Heather's trinkets never stood a chance.",
  },
  {
    id: 'kai',
    name: 'Kai Voss',
    title: 'The Midnight Artist',
    description:
      "Silver hair, tragic jacket, too many opinions about lighting. Heather thinks he's mysterious. Suki thinks he's furniture.",
    verdict: '"Pretty boy. Sit. Pet. Obey."',
    portrait: 'assets/characters/boy-kai.jpg',
    cutsceneImg: 'assets/cutscenes/cuddle-kai.jpg',
    accent: 0x7ec8e3,
    hairColor: 0xc8ccd4,
    outfitColor: 0x2a2a34,
    lines: {
      intro: {
        speaker: 'boy',
        text: "I only work at night, when the light is honest. …Your cat is judging my posture.",
        voice: 'assets/audio/voice/kai-intro.mp3',
      },
      barks: [
        {
          speaker: 'boy',
          text: 'That was… a statement piece. Abstract glass on hardwood.',
          voice: 'assets/audio/voice/kai-bark1.mp3',
        },
        {
          speaker: 'boy',
          text: 'Destruction as critique. She hates my sketchbook. She might be my best critic.',
          voice: 'assets/audio/voice/kai-bark2.mp3',
        },
        {
          speaker: 'boy',
          text: 'The laptop too? Brutal. Brave. Devastatingly curated.',
          voice: 'assets/audio/voice/kai-bark3.mp3',
        },
      ],
      cutscene: [
        {
          speaker: 'boy',
          text: "Alright, diva. Come here. You're the only gallery worth visiting tonight.",
          voice: 'assets/audio/voice/kai-cuddle1.mp3',
        },
        { speaker: 'suki', text: 'Mrrrow. (Your attention, please. Criticize me later.)' },
        {
          speaker: 'boy',
          text: 'I shall title this evening: "Jealousy, with Fur." My masterpiece.',
          voice: 'assets/audio/voice/kai-cuddle2.mp3',
        },
      ],
    },
    completeBody:
      'Kai laughed, called the wreckage "installation art," and made room on his lap for royalty.',
  },
  {
    id: 'theo',
    name: 'Theo Lamb',
    title: 'The Pastry Prince',
    description:
      'He arrived with a box of éclairs and an apron that says "Kiss the Cook." Suki kissed no one. Suki chose violence.',
    verdict: '"Smells of vanilla. Distracts Heather. Guilty on all counts."',
    portrait: 'assets/characters/boy-theo.jpg',
    cutsceneImg: 'assets/cutscenes/cuddle-theo.jpg',
    accent: 0xe8a0b8,
    hairColor: 0x3a2a20,
    outfitColor: 0xf0e6da,
    lines: {
      intro: {
        speaker: 'boy',
        text: 'I made choux pastry from scratch! It only took nine hours— oh! Hello, your majesty.',
        voice: 'assets/audio/voice/theo-intro.mp3',
      },
      barks: [
        {
          speaker: 'boy',
          text: 'The perfume! That was a gift! …Please not the jewelry box.',
          voice: 'assets/audio/voice/theo-bark1.mp3',
        },
        {
          speaker: 'boy',
          text: 'She looked me in the eye while she did that one. IN THE EYE, Heather.',
          voice: 'assets/audio/voice/theo-bark2.mp3',
        },
        {
          speaker: 'boy',
          text: "I can't compete with this. She's magnificent. I bake for a living and I'm the side dish.",
          voice: 'assets/audio/voice/theo-bark3.mp3',
        },
      ],
      cutscene: [
        {
          speaker: 'boy',
          text: "Okay, I understand now. It's your apartment. We're just baking in it.",
          voice: 'assets/audio/voice/theo-cuddle1.mp3',
        },
        { speaker: 'suki', text: 'Mrrp. (Correct. Also: the éclairs stay.)' },
        {
          speaker: 'boy',
          text: "You're softer than my brioche. Don't tell my brioche.",
          voice: 'assets/audio/voice/theo-cuddle2.mp3',
        },
      ],
    },
    completeBody:
      'Theo admitted defeat, offered an éclair tribute, and was granted cuddle privileges.',
  },
  {
    id: 'ren',
    name: 'Ren Ishikawa',
    title: 'The Aloof Cellist',
    description:
      'Candlelit dinner. Tailored coat. Speaks in complete paragraphs. Rumor says he has never laughed. Suki accepts the challenge.',
    verdict: '"Final boss. Will require the good wine glasses. All of them."',
    portrait: 'assets/characters/boy-ren.jpg',
    cutsceneImg: 'assets/cutscenes/cuddle-ren.jpg',
    accent: 0xb084f5,
    hairColor: 0x1a1a22,
    outfitColor: 0x3c2a4a,
    lines: {
      intro: {
        speaker: 'boy',
        text: 'A table is an instrument. Tonight we dine in D minor. …The cat has already begun.',
        voice: 'assets/audio/voice/ren-intro.mp3',
      },
      barks: [
        {
          speaker: 'boy',
          text: 'The first violin of glassware has fallen. Fascinating. Continue.',
          voice: 'assets/audio/voice/ren-bark1.mp3',
        },
        {
          speaker: 'boy',
          text: 'Four glasses, one candelabra. She composes in percussion.',
          voice: 'assets/audio/voice/ren-bark2.mp3',
        },
        {
          speaker: 'boy',
          text: 'I was told this would be a quiet dinner. I have never been so… moved.',
          voice: 'assets/audio/voice/ren-bark3.mp3',
        },
      ],
      cutscene: [
        {
          speaker: 'boy',
          text: 'Encore finished. Come here, maestro. You conducted the whole evening.',
          voice: 'assets/audio/voice/ren-cuddle1.mp3',
        },
        { speaker: 'suki', text: 'Meow. (The aloof ones always break first. So did the vase.)' },
        {
          speaker: 'boy',
          text: 'Is this… laughter? Ah. So that is what it feels like. Thank you, small tyrant.',
          voice: 'assets/audio/voice/ren-cuddle2.mp3',
        },
      ],
    },
    completeBody:
      'Ren laughed for the first time in recorded history. Suki rates the evening: acceptable.',
  },
];

export const PROP_LIBRARY: Record<PropKind, PropDef> = {
  mug: { color: 0xe8d5c4, size: [0.16, 0.18, 0.16], mass: 0.4, shatter: 'ceramic', points: 50 },
  glass: { color: 0xa8d8ea, size: [0.1, 0.22, 0.1], mass: 0.25, shatter: 'glass', points: 60 },
  wineglass: { color: 0xd8ecf4, size: [0.11, 0.26, 0.11], mass: 0.2, shatter: 'glass', points: 90 },
  plate: { color: 0xf0ece2, size: [0.3, 0.04, 0.3], mass: 0.5, shatter: 'ceramic', points: 70 },
  plant: { color: 0x6b9b6e, size: [0.22, 0.32, 0.22], mass: 0.7, shatter: 'ceramic', points: 60 },
  book: { color: 0x8b5a4a, size: [0.26, 0.06, 0.2], mass: 0.5, shatter: 'soft', points: 40 },
  phone: { color: 0x2a2a32, size: [0.1, 0.02, 0.2], mass: 0.2, shatter: 'metal', points: 80 },
  candle: { color: 0xf5e6c8, size: [0.09, 0.2, 0.09], mass: 0.3, shatter: 'soft', points: 40 },
  bottle: { color: 0x7a9a6a, size: [0.1, 0.32, 0.1], mass: 0.4, shatter: 'glass', points: 70 },
  remote: { color: 0x3a3a44, size: [0.08, 0.03, 0.22], mass: 0.22, shatter: 'metal', points: 50 },
  frame: { color: 0xd4c4a8, size: [0.24, 0.28, 0.03], mass: 0.45, shatter: 'glass', points: 70 },
  bowl: { color: 0xc9b8a8, size: [0.24, 0.09, 0.24], mass: 0.4, shatter: 'ceramic', points: 60 },
  jar: { color: 0xb8cfd8, size: [0.14, 0.24, 0.14], mass: 0.5, shatter: 'glass', points: 60 },
  vase: { color: 0x9a7ab8, size: [0.14, 0.34, 0.14], mass: 0.5, shatter: 'ceramic', points: 80 },
  perfume: { color: 0xe8a0c8, size: [0.08, 0.16, 0.08], mass: 0.15, shatter: 'glass', points: 90 },
  jewelrybox: { color: 0x7a4a5a, size: [0.2, 0.1, 0.14], mass: 0.6, shatter: 'metal', points: 100 },
  candelabra: { color: 0xd8b25a, size: [0.3, 0.36, 0.12], mass: 0.9, shatter: 'grand', points: 150 },
  teapot: { color: 0xd86a5a, size: [0.22, 0.18, 0.16], mass: 0.6, shatter: 'ceramic', points: 80 },
  laptop: { color: 0x4a4e58, size: [0.34, 0.03, 0.24], mass: 0.8, shatter: 'metal', points: 120 },
};

export const LEVELS: LevelDef[] = [
  {
    id: 'kitchen',
    name: 'The Kitchen Island',
    subtitle: 'Level 1 — Date: tea & small talk',
    surface: 'kitchen',
    boyfriendId: 'eli',
    counterSize: [4.2, 1.9],
    counterHeight: 1.0,
    sky: 0x1a1030,
    keyColor: 0xffd4a8,
    fillColor: 0x8b6cff,
    lampColor: 0xffb46a,
    fogColor: 0x0e0818,
    wallColor: 0x241a30,
    counterColor: 0x4a3a30,
    props: ['mug', 'plate', 'teapot', 'glass', 'bottle', 'jar', 'bowl', 'plant', 'mug', 'phone'],
    rankScores: [550, 750, 950],
  },
  {
    id: 'coffee',
    name: 'The Coffee Table',
    subtitle: 'Level 2 — Date: movie night',
    surface: 'coffee',
    boyfriendId: 'jasper',
    counterSize: [3.6, 1.6],
    counterHeight: 0.55,
    sky: 0x0c1028,
    keyColor: 0xffc890,
    fillColor: 0x4a90d8,
    lampColor: 0xff9860,
    fogColor: 0x080a16,
    wallColor: 0x1c1826,
    counterColor: 0x3a2c22,
    props: ['remote', 'candle', 'book', 'mug', 'wineglass', 'wineglass', 'frame', 'bowl', 'bottle', 'book'],
    rankScores: [560, 760, 980],
  },
  {
    id: 'desk',
    name: "Heather's Desk",
    subtitle: 'Level 3 — Date: "networking"',
    surface: 'desk',
    boyfriendId: 'kai',
    counterSize: [3.4, 1.5],
    counterHeight: 0.85,
    sky: 0x08101e,
    keyColor: 0xa8e0ff,
    fillColor: 0xc48cff,
    lampColor: 0x7ac8ff,
    fogColor: 0x060a12,
    wallColor: 0x141c28,
    counterColor: 0x2e2620,
    props: ['laptop', 'book', 'phone', 'mug', 'frame', 'bottle', 'jar', 'plant', 'book', 'candle', 'glass'],
    rankScores: [620, 840, 1080],
  },
  {
    id: 'dresser',
    name: 'The Bedroom Dresser',
    subtitle: 'Level 4 — Date: he brought flowers',
    surface: 'dresser',
    boyfriendId: 'theo',
    counterSize: [3.0, 1.3],
    counterHeight: 1.15,
    sky: 0x1c0e1a,
    keyColor: 0xffc8d8,
    fillColor: 0xffe0a0,
    lampColor: 0xff9ec0,
    fogColor: 0x120810,
    wallColor: 0x2a1c26,
    counterColor: 0x503a3a,
    props: ['perfume', 'perfume', 'perfume', 'jewelrybox', 'frame', 'candle', 'vase', 'glass', 'book', 'jar'],
    rankScores: [620, 850, 1100],
  },
  {
    id: 'dining',
    name: 'The Date-Night Table',
    subtitle: 'Final Level — Date: candlelit dinner in D minor',
    surface: 'dining',
    boyfriendId: 'ren',
    counterSize: [4.4, 1.7],
    counterHeight: 0.9,
    sky: 0x140a20,
    keyColor: 0xffb060,
    fillColor: 0x9a5aff,
    lampColor: 0xff8a50,
    fogColor: 0x0c0614,
    wallColor: 0x201426,
    counterColor: 0x3c2430,
    props: ['wineglass', 'wineglass', 'wineglass', 'wineglass', 'plate', 'plate', 'candelabra', 'vase', 'bottle', 'bowl', 'candle'],
    rankScores: [760, 1020, 1300],
  },
];

export const ENDING = {
  art: 'assets/ui/ending.jpg',
  lines: [
    {
      speaker: 'narrator' as const,
      text: 'Five boyfriends. Five spotless floors of evidence. One very smug cat.',
      voice: 'assets/audio/voice/narrator-ending.mp3',
    },
    {
      speaker: 'suki' as const,
      text: 'Meow. (Translation: They may date Heather. But they worship me.)',
    },
    {
      speaker: 'narrator' as const,
      text: 'Heather will buy more trinkets. Suki will be waiting. ♥',
      voice: 'assets/audio/voice/narrator-ending2.mp3',
    },
  ],
};

export const PUSH_HINTS = [
  'Yes… more chaos…',
  'He almost looked over.',
  'ASMR: expensive regrets.',
  'Heather is going to notice… eventually.',
  'Gravity is your love language.',
  'One more for the soundtrack.',
  'The floor accepts your offering.',
  'Interior design: finished.',
];

export function getBoyfriend(id: string): BoyDef {
  const b = BOYFRIENDS.find((x) => x.id === id);
  if (!b) throw new Error(`Unknown boyfriend: ${id}`);
  return b;
}
