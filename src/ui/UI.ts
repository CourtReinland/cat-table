import type { Boyfriend, LevelDef } from '../data/content';
import { SUKI } from '../data/content';

type ScreenId =
  | 'title'
  | 'intro'
  | 'cutscene'
  | 'complete'
  | 'ending'
  | 'pause'
  | 'loading'
  | 'none';

type Handler = () => void;

export class UI {
  private handlers = new Map<string, Handler>();

  constructor() {
    this.bind('btn-start', 'start');
    this.bind('btn-intro-go', 'introGo');
    this.bind('btn-dialogue-next', 'dialogueNext');
    this.bind('btn-next-level', 'nextLevel');
    this.bind('btn-replay', 'replay');
    this.bind('btn-resume', 'resume');
    this.bind('btn-quit-title', 'quitTitle');
  }

  private bind(id: string, event: string) {
    const el = document.getElementById(id);
    el?.addEventListener('click', () => this.handlers.get(event)?.());
  }

  on(event: string, fn: Handler) {
    this.handlers.set(event, fn);
  }

  show(id: ScreenId) {
    const screens = [
      'screen-title',
      'screen-intro',
      'screen-cutscene',
      'screen-complete',
      'screen-ending',
      'screen-pause',
      'screen-loading',
    ];
    for (const s of screens) {
      document.getElementById(s)?.classList.remove('active');
    }
    if (id !== 'none') {
      document.getElementById(`screen-${id}`)?.classList.add('active');
    }
  }

  showHud(level: LevelDef, boy: Boyfriend) {
    const hud = document.getElementById('hud');
    hud?.classList.remove('hidden');
    const name = document.getElementById('hud-level-name');
    if (name) name.textContent = level.name;
    const img = document.getElementById('hud-boy-img') as HTMLImageElement | null;
    if (img) img.src = boy.portrait;
    const bn = document.getElementById('hud-boy-name');
    if (bn) bn.textContent = boy.name;
    const hint = document.getElementById('hud-hint');
    if (hint) {
      hint.style.opacity = '1';
      hint.textContent = 'Nudge every trinket off the edge… Space / click to push';
    }
  }

  hideHud() {
    document.getElementById('hud')?.classList.add('hidden');
  }

  updateChaos(broken: number, total: number) {
    const fill = document.getElementById('chaos-fill');
    const text = document.getElementById('chaos-text');
    const pct = total > 0 ? (broken / total) * 100 : 0;
    if (fill) fill.style.width = `${pct}%`;
    if (text) text.textContent = `${broken} / ${total}`;
  }

  flashHint(msg: string) {
    const hint = document.getElementById('hud-hint');
    if (!hint) return;
    hint.textContent = msg;
    hint.style.opacity = '1';
  }

  hideHint() {
    const hint = document.getElementById('hud-hint');
    if (hint) hint.style.opacity = '0.35';
  }

  showIntro(boy: Boyfriend, level: LevelDef) {
    this.show('intro');
    const boyImg = document.getElementById('intro-boy') as HTMLImageElement | null;
    if (boyImg) boyImg.src = boy.portrait;
    const name = document.getElementById('intro-name');
    if (name) name.textContent = boy.name;
    const desc = document.getElementById('intro-desc');
    if (desc) desc.textContent = `${boy.title} · ${level.name}. ${boy.description}`;
    const line = document.getElementById('intro-suki-line');
    if (line) line.textContent = boy.sukiLine;
  }

  showCutscene(boy: Boyfriend, index: number) {
    this.show('cutscene');
    const line = boy.dialogue[index];
    const img = document.getElementById('cutscene-img') as HTMLImageElement | null;
    if (img) img.src = boy.cutscene;
    const portrait = document.getElementById('dialogue-portrait') as HTMLImageElement | null;
    if (portrait) portrait.src = line.portrait;
    const speaker = document.getElementById('dialogue-speaker');
    if (speaker) speaker.textContent = line.speaker;
    const text = document.getElementById('dialogue-text');
    if (text) text.textContent = line.text;
  }

  showComplete(boy: Boyfriend, broken: number, seconds: number, isLast: boolean) {
    this.show('complete');
    const title = document.getElementById('complete-title');
    if (title) title.textContent = `${boy.name} came for you.`;
    const body = document.getElementById('complete-body');
    if (body) body.textContent = boy.completeBody;
    const sb = document.getElementById('stat-broken');
    if (sb) sb.textContent = String(broken);
    const st = document.getElementById('stat-time');
    if (st) st.textContent = `${seconds}s`;
    const btn = document.getElementById('btn-next-level');
    if (btn) btn.textContent = isLast ? 'Claim the Throne' : 'Next Boyfriend';
  }
}
