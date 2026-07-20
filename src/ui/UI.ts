import { LEVELS, SUKI, getBoyfriend, type BoyDef, type LevelDef, type Line } from '../data/content';
import type { Save } from '../core/Save';

type UIEvent =
  | 'start'
  | 'introGo'
  | 'dialogueNext'
  | 'nextLevel'
  | 'replay'
  | 'resume'
  | 'restart'
  | 'quitTitle'
  | 'settingsBack'
  | 'wipe'
  | 'selectLevel'
  | 'openLevels'
  | 'openSettings';

const SCREENS = ['loading', 'title', 'levels', 'intro', 'complete', 'pause', 'settings', 'ending'];

const $ = (id: string) => document.getElementById(id) as HTMLElement;
const $img = (id: string) => document.getElementById(id) as HTMLImageElement;
const $input = (id: string) => document.getElementById(id) as HTMLInputElement;

export class UI {
  private handlers = new Map<string, ((arg?: any) => void)[]>();
  private barkTimer = 0;
  private typeTimer: number | null = null;
  private settingsReturnTo: 'title' | 'pause' = 'title';
  save: Save | null = null;

  on(ev: UIEvent, fn: (arg?: any) => void) {
    if (!this.handlers.has(ev)) this.handlers.set(ev, []);
    this.handlers.get(ev)!.push(fn);
  }

  private emit(ev: UIEvent, arg?: any) {
    for (const fn of this.handlers.get(ev) ?? []) fn(arg);
  }

  init(save: Save) {
    this.save = save;

    $('btn-start').onclick = () => this.emit('start');
    $('btn-levels').onclick = () => {
      this.buildLevelCards();
      this.show('levels');
      this.emit('openLevels');
    };
    $('btn-settings').onclick = () => {
      this.settingsReturnTo = 'title';
      this.show('settings');
      this.emit('openSettings');
    };
    $('btn-levels-back').onclick = () => this.show('title');
    $('btn-intro-go').onclick = () => this.emit('introGo');
    $('btn-next-level').onclick = () => this.emit('nextLevel');
    $('btn-replay-level').onclick = () => this.emit('replay');
    $('btn-complete-title').onclick = () => this.emit('quitTitle');
    $('btn-resume').onclick = () => this.emit('resume');
    $('btn-restart').onclick = () => this.emit('restart');
    $('btn-pause-settings').onclick = () => {
      this.settingsReturnTo = 'pause';
      this.show('settings');
    };
    $('btn-quit-title').onclick = () => this.emit('quitTitle');
    $('btn-settings-back').onclick = () => {
      this.emit('settingsBack');
      this.show(this.settingsReturnTo);
    };
    $('btn-wipe').onclick = () => this.emit('wipe');
    $('btn-ending-title').onclick = () => this.emit('quitTitle');
    $('dialogue').addEventListener('click', () => this.emit('dialogueNext'));

    // settings inputs
    const s = save.data.settings;
    const bind = (id: string, key: 'master' | 'music' | 'sfx' | 'voice') => {
      const el = $input(id);
      el.value = String(s[key]);
      el.oninput = () => {
        s[key] = parseFloat(el.value);
        save.write();
        this.emit('settingsBack');
      };
    };
    bind('set-master', 'master');
    bind('set-music', 'music');
    bind('set-sfx', 'sfx');
    bind('set-voice', 'voice');
    const q = $('set-quality') as HTMLSelectElement;
    q.value = s.quality;
    q.onchange = () => {
      s.quality = q.value as Save['data']['settings']['quality'];
      save.write();
      this.emit('settingsBack');
    };
  }

  show(name: string) {
    for (const sc of SCREENS) {
      $(`screen-${sc}`).classList.toggle('visible', sc === name);
    }
  }

  showHud(visible = true) {
    $('hud').classList.toggle('visible', visible);
  }

  private setImg(img: HTMLImageElement, src: string, letter: string) {
    img.classList.remove('img-fallback');
    img.style.removeProperty('--fallback-letter');
    img.onerror = () => {
      img.classList.add('img-fallback');
      img.style.setProperty('--fallback-letter', `'${letter}'`);
      img.removeAttribute('src');
    };
    img.src = src;
  }

  // ── title / levels ──

  buildLevelCards() {
    const wrap = $('level-cards');
    wrap.innerHTML = '';
    const unlocked = this.save?.data.unlocked ?? 0;
    LEVELS.forEach((level, i) => {
      const boy = getBoyfriend(level.boyfriendId);
      const locked = i > unlocked;
      const best = this.save?.data.best[level.id];
      const card = document.createElement('button');
      card.className = `level-card${locked ? ' locked' : ''}`;
      card.innerHTML = `
        <span class="lc-img-wrap"><img alt=""/><span class="lc-lock">🔒</span></span>
        <span class="lc-name">${boy.name}</span>
        <span class="lc-title">${boy.title}</span>
        <span class="lc-level">${level.name}</span>
        ${best ? `<span class="lc-best">best: ${best.score} · rank ${best.rank}</span>` : '<span class="lc-best dim">unconquered</span>'}
      `;
      const img = card.querySelector('img')!;
      this.setImg(img, boy.portrait, boy.name[0]);
      if (!locked) card.onclick = () => this.emit('selectLevel', i);
      wrap.appendChild(card);
    });
  }

  // ── intro ──

  showIntro(boy: BoyDef, level: LevelDef, index: number) {
    this.setImg($img('intro-img'), boy.portrait, boy.name[0]);
    $('intro-kicker').textContent = level.subtitle;
    $('intro-name').textContent = boy.name;
    $('intro-title').textContent = boy.title;
    $('intro-desc').textContent = boy.description;
    $('intro-verdict').textContent = `Suki's verdict: ${boy.verdict}`;
    $('intro-level').textContent = `Tonight's stage: ${level.name} — ${level.props.length} breakables`;
    $('screen-intro').style.setProperty('--accent', `#${boy.accent.toString(16).padStart(6, '0')}`);
    this.show('intro');
    void index;
  }

  // ── HUD ──

  hudLevel(name: string) {
    $('hud-level').textContent = name;
  }

  buildHearts(count: number) {
    const wrap = $('hud-hearts');
    wrap.innerHTML = '';
    for (let i = 0; i < count; i++) {
      const h = document.createElement('span');
      h.className = 'heart';
      h.textContent = '♥';
      wrap.appendChild(h);
    }
  }

  updateAttention(pct: number) {
    const hearts = document.querySelectorAll('#hud-hearts .heart');
    hearts.forEach((h, i) => {
      h.classList.toggle('filled', i / hearts.length < pct);
    });
  }

  score(v: number) {
    $('hud-score').textContent = String(Math.round(v));
  }

  combo(mult: number) {
    const el = $('hud-combo');
    if (mult <= 1) {
      el.textContent = '';
      return;
    }
    el.textContent = `×${mult}`;
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
  }

  comboPop(points: number, mult: number) {
    const el = $('combo-pop');
    el.textContent = `+${points}${mult > 1 ? ` ×${mult}` : ''}`;
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
  }

  hint(text: string) {
    const el = $('hud-hint');
    el.textContent = text;
    el.classList.add('visible');
  }

  hideHint() {
    $('hud-hint').classList.remove('visible');
  }

  bark(boy: BoyDef, text: string, seconds = 4) {
    this.setImg($img('bark-img'), boy.portrait, boy.name[0]);
    $('bark-name').textContent = boy.name.split(' ')[0];
    $('bark-text').textContent = text;
    $('bark').classList.add('visible');
    this.barkTimer = seconds;
  }

  update(dt: number) {
    if (this.barkTimer > 0) {
      this.barkTimer -= dt;
      if (this.barkTimer <= 0) $('bark').classList.remove('visible');
    }
  }

  // ── dialogue (cutscene) ──

  showDialogue(line: Line, boy: BoyDef, instant = false) {
    $('dialogue').classList.add('visible');
    const isSuki = line.speaker === 'suki';
    const isNarrator = line.speaker === 'narrator';
    const img = $img('dlg-img');
    this.setImg(img, isSuki ? SUKI.portrait : boy.portrait, isSuki ? 'S' : boy.name[0]);
    img.classList.toggle('hidden', isNarrator);
    const nameEl = $('dlg-name');
    nameEl.textContent = isSuki ? 'Suki 🐾' : isNarrator ? '' : boy.name;
    nameEl.style.color = isSuki ? '#f08bb0' : `#${boy.accent.toString(16).padStart(6, '0')}`;
    const textEl = $('dlg-text');
    textEl.textContent = '';
    if (this.typeTimer) window.clearInterval(this.typeTimer);
    if (instant) {
      textEl.textContent = line.text;
      return;
    }
    let i = 0;
    this.typeTimer = window.setInterval(() => {
      i += 2;
      textEl.textContent = line.text.slice(0, i);
      if (i >= line.text.length && this.typeTimer) {
        window.clearInterval(this.typeTimer);
        this.typeTimer = null;
      }
    }, 24);
  }

  finishTypewriter(line: Line) {
    if (this.typeTimer) {
      window.clearInterval(this.typeTimer);
      this.typeTimer = null;
      $('dlg-text').textContent = line.text;
      return true;
    }
    return false;
  }

  hideDialogue() {
    $('dialogue').classList.remove('visible');
  }

  // ── complete / ending ──

  showComplete(boy: BoyDef, level: LevelDef, score: number, rank: string, broken: number, secs: number, isFinal: boolean) {
    const rankEl = $('complete-rank');
    rankEl.textContent = rank;
    rankEl.className = `complete-rank rank-${rank.replace('+', 'plus')}`;
    $('complete-title').textContent = `${level.name} — cleared`;
    $('complete-body').textContent = boy.completeBody;
    $('complete-stats').innerHTML = `
      <span>${broken} trinkets shattered</span>
      <span>${secs}s of chaos</span>
      <span class="stat-score">${score} pts</span>
    `;
    ($('btn-next-level') as HTMLButtonElement).textContent = isFinal ? 'The Finale Awaits →' : 'Next Suitor →';
    const cgUrl = new URL(boy.cutsceneImg, document.baseURI).href;
    $('screen-complete').style.setProperty('--cg', `url('${cgUrl}')`);
    this.show('complete');
  }

  showEnding(lines: { speaker: string; text: string }[]) {
    const wrap = $('ending-lines');
    wrap.innerHTML = '';
    for (const l of lines) {
      const p = document.createElement('p');
      p.className = l.speaker === 'suki' ? 'ending-suki' : 'ending-narr';
      p.textContent = l.text;
      wrap.appendChild(p);
    }
    this.show('ending');
  }

  refreshTitleStartButton(hasSave: boolean) {
    ($('btn-start') as HTMLButtonElement).textContent = hasSave ? 'Continue the Chaos' : 'Begin the Chaos';
  }
}
