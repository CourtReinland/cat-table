export interface LevelBest {
  score: number;
  rank: string;
}

export interface SaveData {
  unlocked: number; // highest unlocked level index
  best: Record<string, LevelBest>;
  settings: {
    master: number;
    music: number;
    sfx: number;
    voice: number;
    quality: 'auto' | 'high' | 'medium' | 'low';
  };
}

const KEY = 'cat-top-sim.save.v2';

const DEFAULTS: SaveData = {
  unlocked: 0,
  best: {},
  settings: { master: 0.9, music: 0.7, sfx: 0.9, voice: 1.0, quality: 'auto' },
};

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

export class Save {
  data: SaveData;

  constructor() {
    this.data = clone(DEFAULTS);
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        this.data = { ...clone(DEFAULTS), ...parsed, settings: { ...DEFAULTS.settings, ...parsed.settings } };
      }
    } catch {
      /* corrupt or unavailable storage — run with defaults */
    }
  }

  write() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* private mode etc. */
    }
  }

  recordScore(levelId: string, levelIndex: number, score: number, rank: string) {
    const prev = this.data.best[levelId];
    if (!prev || score > prev.score) this.data.best[levelId] = { score, rank };
    this.data.unlocked = Math.max(this.data.unlocked, Math.min(levelIndex + 1, 4));
    this.write();
  }

  wipe() {
    this.data = clone(DEFAULTS);
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* noop */
    }
  }
}
