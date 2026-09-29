// Sound for the 3D campus, all made in code with Web Audio: there are no audio files, so there is
// nothing to license. (Ethan asked about Minecraft's music: it's copyrighted, so no.)
//
//   Rain   layered filtered noise (a hiss and a low rumble) plus scattered droplets. It follows the
//          Weather toggle, and is quieter the higher you fly.
//   Music  an original generative piece: sparse, soft piano-like notes over a long reverb, with a
//          low note under each phrase and long rests between. A brighter key by day, a lower and
//          slower one at night. Nothing is copied: the notes are picked at random from a scale.
//
// Both start off, because browsers only allow sound after a click or key press, and the choice is
// remembered. A remembered "on" starts on the first click or key press of the visit.

const KEY = 'wilcox-campus-sound';
const hz = (n) => 440 * 2 ** ((n - 69) / 12);                 // MIDI note to frequency
// day: D major pentatonic; night: A minor pentatonic, an octave lower and slower
const MOODS = {
  day: { notes: [62, 64, 66, 69, 71, 74, 76, 78, 81], roots: [50, 47, 43, 45], gap: [0.8, 2.0], len: 3.2 },
  night: { notes: [57, 60, 62, 64, 67, 69, 72, 74], roots: [45, 41, 36, 43], gap: [1.3, 3.0], len: 4.2 },
};

export function makeSound() {
  const prefs = { sfx: false, music: false };
  try { Object.assign(prefs, JSON.parse(localStorage.getItem(KEY)) || {}); } catch { /* defaults */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* ok */ } };
  let ctx = null, master, rainGain, musicBus, hiss, rumble;
  let nextNote = 0, nextDrop = 0, idx = 4, count = 0, rest = 0, lastNight = null;

  function noise(seconds, brown) {
    const b = ctx.createBuffer(2, ctx.sampleRate * seconds, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      let last = 0;
      for (let i = 0; i < d.length; i++) {
        const w = Math.random() * 2 - 1;
        d[i] = brown ? (last = (last + 0.02 * w) / 1.02) * 3.5 : w;
      }
    }
    return b;
  }
  function start() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
    // a long, soft reverb from decaying noise
    const verb = ctx.createConvolver();
    const ir = ctx.createBuffer(2, ctx.sampleRate * 3.2, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2.6;
    }
    verb.buffer = ir;
    musicBus = ctx.createGain(); musicBus.gain.value = 0;
    const dry = ctx.createGain(); dry.gain.value = 0.45;
    const wet = ctx.createGain(); wet.gain.value = 0.6;
    musicBus.connect(dry).connect(master);
    musicBus.connect(verb).connect(wet).connect(master);
    // rain: a bright hiss and a low rumble, looping
    rainGain = ctx.createGain(); rainGain.gain.value = 0; rainGain.connect(master);
    const loop = (buf, type, freq, q, level) => {
      const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true;
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain(); g.gain.value = level;
      s.connect(f).connect(g).connect(rainGain); s.start();
      return f;
    };
    hiss = loop(noise(3, false), 'bandpass', 2600, 0.5, 0.16);
    rumble = loop(noise(4, true), 'lowpass', 420, 0.7, 0.55);
    nextNote = ctx.currentTime + 1.2;
    apply();
  }
  function apply() {
    if (!ctx) return;
    const t = ctx.currentTime;
    musicBus.gain.setTargetAtTime(prefs.music ? 0.5 : 0, t, 0.8);
    if (!prefs.sfx) rainGain.gain.setTargetAtTime(0, t, 0.4);
    if (!prefs.sfx && !prefs.music) setTimeout(() => { if (!prefs.sfx && !prefs.music) ctx.suspend(); }, 1500);
    else if (!document.hidden) ctx.resume();
  }
  // one soft piano-ish note: a sine with a quiet octave above, a quick attack and a long fade
  function note(n, at, vel, len) {
    const f = hz(n);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vel, at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0008, at + len);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(Math.min(5200, f * 6), at);
    lp.frequency.exponentialRampToValueAtTime(Math.max(300, f * 1.5), at + len * 0.7);
    lp.connect(g).connect(musicBus);
    for (const [mult, lvl, type] of [[1, 1, 'sine'], [2, 0.22, 'triangle'], [3, 0.05, 'sine']]) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f * mult;
      o.detune.value = (Math.random() - 0.5) * 6;
      const og = ctx.createGain(); og.gain.value = lvl;
      o.connect(og).connect(lp); o.start(at); o.stop(at + len + 0.1);
    }
  }
  // a raindrop: a short tap of filtered noise, somewhere left or right
  let dropBuf = null;
  function drop(at, level) {
    dropBuf ??= noise(0.05, false);
    const s = ctx.createBufferSource(); s.buffer = dropBuf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800 + Math.random() * 4200; f.Q.value = 6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(level * (0.25 + Math.random() * 0.75), at);
    g.gain.exponentialRampToValueAtTime(0.0005, at + 0.045);
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (p) { p.pan.value = Math.random() * 2 - 1; s.connect(f).connect(g).connect(p).connect(rainGain); }
    else s.connect(f).connect(g).connect(rainGain);
    s.start(at);
  }

  // called every frame by main.js
  function update(dt, { rain, walking, height, night }) {
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const rainLevel = prefs.sfx && rain ? (walking ? 1 : Math.max(0.22, Math.min(0.8, 1 - height / 600))) : 0;
    rainGain.gain.setTargetAtTime(rainLevel, t, 0.6);
    hiss.frequency.setTargetAtTime(walking ? 2600 : 1700, t, 0.5);           // from high up, softer and duller
    rumble.frequency.setTargetAtTime(walking ? 420 : 300, t, 0.5);
    if (rainLevel > 0.05) {
      while (nextDrop < t + 0.12) { nextDrop = Math.max(nextDrop, t) + (0.03 + Math.random() * 0.1) / rainLevel; drop(nextDrop, 0.22 * rainLevel); }
    } else nextDrop = t;
    if (!prefs.music) { nextNote = Math.max(nextNote, t + 0.5); return; }
    const mood = MOODS[night ? 'night' : 'day'];
    if (lastNight !== night) { lastNight = night; idx = Math.floor(mood.notes.length / 2); }
    while (nextNote < t + 0.25) {
      const at = Math.max(nextNote, t + 0.02);
      if (count > 0 && count % 16 === 0 && rest === 0) {                     // a long rest between phrases
        rest = 1; nextNote = at + 7 + Math.random() * 8; continue;
      }
      rest = 0; count++;
      if (count % 8 === 1) note(mood.roots[Math.floor(count / 8) % mood.roots.length], at, 0.16, mood.len * 2.2);   // a low note under the phrase
      if (Math.random() < 0.82) {                                             // a gentle random walk through the scale
        idx = Math.max(0, Math.min(mood.notes.length - 1, idx + [-2, -1, -1, 0, 1, 1, 2][Math.floor(Math.random() * 7)]));
        note(mood.notes[idx], at, 0.11 + Math.random() * 0.06, mood.len);
        if (Math.random() < 0.18) note(mood.notes[Math.max(0, idx - 2)], at + 0.02, 0.07, mood.len);
      }
      nextNote = at + mood.gap[0] + Math.random() * (mood.gap[1] - mood.gap[0]);
    }
  }

  // a remembered "on" starts at the first click or key press (browsers need one first)
  const firstGesture = () => { if (prefs.sfx || prefs.music) start(); removeEventListener('pointerdown', firstGesture); removeEventListener('keydown', firstGesture); };
  addEventListener('pointerdown', firstGesture);
  addEventListener('keydown', firstGesture);
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend(); else if (prefs.sfx || prefs.music) ctx.resume();
  });

  return {
    prefs,
    // call these from a click or key handler, so the browser lets the sound start
    setSfx(on) { prefs.sfx = !!on; save(); if (on) start(); apply(); },
    setMusic(on) { prefs.music = !!on; save(); if (on) start(); apply(); },
    update,
  };
}
