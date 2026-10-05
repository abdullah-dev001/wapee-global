#!/usr/bin/env python3
"""Synthesize every sound in the showreel into public/sfx/*.wav.

Nothing is sampled or downloaded: additive/FM synthesis, filtered noise and a
generated reverb impulse response. 48 kHz, 16-bit stereo, deterministic seeds
(re-running produces identical files).

    python3 -m venv .venv && .venv/bin/pip install numpy scipy
    .venv/bin/python scripts/make-sfx.py      # or: npm run sfx

Pan is baked into variants (`.l` / `.c` / `.r`) because Remotion's <Audio> has
no pan control; src/audio/cues.ts picks the variant that matches the on-screen
position. Everything is in D major so the bed, chimes and arpeggios agree.
"""

from __future__ import annotations

import wave
from pathlib import Path

import numpy as np
from scipy.signal import butter, fftconvolve, sosfilt

SR = 48_000
OUT = Path(__file__).resolve().parent.parent / "public" / "sfx"
PEAK = 10 ** (-3 / 20)  # one-shots peak at -3 dBFS; the mix sets their level
PANS = {"l": -0.4, "c": 0.0, "r": 0.4}

# D major
NOTE = {"D2": 73.42, "A2": 110.0, "D3": 146.83, "F#3": 185.0, "A3": 220.0, "E4": 329.63, "D5": 587.33, "E5": 659.26,
        "F#5": 739.99, "A5": 880.0, "B5": 987.77, "D6": 1174.66, "E6": 1318.51, "F#6": 1479.98, "G6": 1567.98,
        "A6": 1760.0, "B6": 1975.53}


def rng(seed: int) -> np.random.Generator:
    return np.random.default_rng(seed)


def t_axis(seconds: float) -> np.ndarray:
    return np.arange(int(SR * seconds)) / SR


def sos(kind: str, freq, order: int = 2):
    return butter(order, freq, btype=kind, fs=SR, output="sos")


def filt(x: np.ndarray, kind: str, freq, order: int = 2) -> np.ndarray:
    return sosfilt(sos(kind, freq, order), x)


def svf(x: np.ndarray, cutoff: np.ndarray, q: float, mode: str = "bp") -> np.ndarray:
    """State-variable filter (TPT) with a per-sample cutoff, for sweeps."""
    g = np.tan(np.pi * np.clip(cutoff, 20, SR * 0.45) / SR)
    k = 1.0 / q
    a1 = 1 / (1 + g * (g + k))
    a2 = g * a1
    a3 = g * a2
    ic1 = ic2 = 0.0
    out = np.empty_like(x)
    for n in range(len(x)):
        v3 = x[n] - ic2
        v1 = a1[n] * ic1 + a2[n] * v3
        v2 = ic2 + a2[n] * ic1 + a3[n] * v3
        ic1 = 2 * v1 - ic1
        ic2 = 2 * v2 - ic2
        out[n] = v1 if mode == "bp" else v2
    return out


def env_ar(n: int, attack: float, decay: float) -> np.ndarray:
    t = np.arange(n) / SR
    return np.minimum(1, t / max(attack, 1e-4)) * np.exp(-np.maximum(0, t - attack) / decay)


def pan(x: np.ndarray, p: float | np.ndarray) -> np.ndarray:
    """Equal-power pan of a mono signal (-1 left … 1 right)."""
    a = (np.asarray(p) + 1) * np.pi / 4
    return np.stack([x * np.cos(a), x * np.sin(a)], axis=1) * np.sqrt(2)


def place(total: float, *parts: tuple[float, np.ndarray]) -> np.ndarray:
    """Mix (start_seconds, signal) parts into one buffer; works for mono or stereo parts."""
    stereo = any(p.ndim == 2 for _, p in parts)
    out = np.zeros((int(SR * total), 2)) if stereo else np.zeros(int(SR * total))
    for start, part in parts:
        if stereo and part.ndim == 1:
            part = np.stack([part, part], axis=1)
        i = int(SR * start)
        j = min(len(out), i + len(part))
        out[i:j] += part[: j - i]
    return out


# ---------- space ----------

def make_ir(seconds: float, t60: float, seed: int, predelay: float = 0.012) -> np.ndarray:
    """Stereo room: sparse early reflections + decorrelated tail that darkens as it decays."""
    r = rng(seed)
    n = int(SR * seconds)
    t = np.arange(n) / SR
    ir = np.zeros((n, 2))
    for ch in range(2):
        w = r.standard_normal(n)
        low = filt(w, "lowpass", 2800)
        tail = low * 10 ** (-3 * t / t60) + (w - low) * 10 ** (-3 * t / (t60 * 0.35)) * 0.5
        tail *= np.minimum(1, t / 0.03)
        early = np.zeros(n)
        for k in range(9):
            early[int(SR * r.uniform(0.006, 0.05))] += 0.55 * 0.82 ** k * r.choice([-1, 1])
        sig = np.concatenate([np.zeros(int(SR * predelay)), (tail * 0.25 + early)])[:n]
        ir[:, ch] = sig
    return ir / np.sqrt(np.sum(ir ** 2) / 2)


IR_ROOM = make_ir(1.6, 1.0, seed=11)
IR_HALL = make_ir(2.8, 2.0, seed=12, predelay=0.02)


def reverb(dry: np.ndarray, wet: float, ir: np.ndarray = IR_ROOM, tail: float = 1.0) -> np.ndarray:
    """Dry (mono or stereo) + convolved wet; adds `tail` seconds for the decay."""
    st = dry if dry.ndim == 2 else np.stack([dry, dry], axis=1)
    st = np.concatenate([st, np.zeros((int(SR * tail), 2))])
    w = np.stack([fftconvolve(st[:, ch], ir[:, ch])[: len(st)] for ch in range(2)], axis=1)
    return st + wet * w * (np.max(np.abs(st)) / max(np.max(np.abs(w)), 1e-9))


# ---------- output ----------

REPORT: list[tuple[str, float, float, float]] = []


def finish(name: str, x: np.ndarray, peak: float = PEAK, fade_in: float = 0.002, fade_out: float = 0.03) -> None:
    st = x if x.ndim == 2 else np.stack([x, x], axis=1)
    st = st - st.mean(axis=0)
    n = len(st)
    fi, fo = max(1, int(SR * fade_in)), max(1, int(SR * fade_out))
    env = np.ones(n)
    env[:fi] = np.sin(np.linspace(0, np.pi / 2, fi)) ** 2
    env[-fo:] = np.minimum(env[-fo:], np.cos(np.linspace(0, np.pi / 2, fo)) ** 2)
    st = st * env[:, None]
    st = st / np.max(np.abs(st)) * peak
    write(name, st)


def write(name: str, st: np.ndarray) -> None:
    pcm = np.round(np.clip(st, -1, 1) * 32767).astype("<i2")
    with wave.open(str(OUT / f"{name}.wav"), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    rms = np.sqrt(np.mean(st ** 2))
    REPORT.append((name, len(st) / SR, 20 * np.log10(np.max(np.abs(st)) + 1e-12), 20 * np.log10(rms + 1e-12)))


# ---------- sources ----------

def fm_bell(freq: float, seconds: float, decay: float, ratio: float = 1.4, index: float = 2.0, attack: float = 0.004) -> np.ndarray:
    """FM bell: brightness (index) decays faster than the tone, soft attack, natural tail."""
    t = t_axis(seconds)
    i_env = index * np.exp(-t / (decay * 0.35))
    tone = np.sin(2 * np.pi * freq * t + i_env * np.sin(2 * np.pi * freq * ratio * t))
    return tone * env_ar(len(t), attack, decay)


def mallet(freq: float, seconds: float, decay: float) -> np.ndarray:
    """Marimba-like additive tone (partials near 1, 4, 10)."""
    t = t_axis(seconds)
    out = np.zeros_like(t)
    for ratio, amp, d in ((1, 1.0, decay), (3.93, 0.18, decay * 0.35), (9.2, 0.05, decay * 0.15)):
        out += amp * np.sin(2 * np.pi * freq * ratio * t) * np.exp(-t / d)
    return out * np.minimum(1, t / 0.003)


def modal(freqs: list[float], decays: list[float], amps: list[float], seconds: float, seed: int) -> np.ndarray:
    """Struck object (wood/glass): damped modes excited by a tiny noise burst."""
    t = t_axis(seconds)
    out = sum(a * np.sin(2 * np.pi * f * t) * np.exp(-t / d) for f, d, a in zip(freqs, decays, amps))
    burst = filt(rng(seed).standard_normal(len(t)), "highpass", 2500) * np.exp(-t / 0.0007) * 0.6
    return (out + burst) * np.minimum(1, t / 0.0004)


# ---------- sounds ----------

def impacts() -> None:
    # Opening hit: sub thud with a pitch drop, a soft click and a short low body.
    t = t_axis(1.0)
    sub = np.sin(2 * np.pi * np.cumsum(42 + 46 * np.exp(-t / 0.05)) / SR) * env_ar(len(t), 0.002, 0.32)
    click = filt(rng(1).standard_normal(len(t)), "bandpass", [1500, 6000]) * np.exp(-t / 0.002) * 0.35
    body = filt(rng(2).standard_normal(len(t)), "lowpass", 220) * np.exp(-t / 0.06) * 0.9
    finish("hit", reverb(sub + click + body, 0.22, IR_HALL, tail=1.2), fade_out=0.3)

    # Logo impact: deeper, longer, with a low D/A chord bloom that sits with the bed.
    t = t_axis(1.6)
    sub = np.sin(2 * np.pi * np.cumsum(34 + 40 * np.exp(-t / 0.08)) / SR) * env_ar(len(t), 0.003, 0.7)
    click = filt(rng(3).standard_normal(len(t)), "bandpass", [1000, 4000]) * np.exp(-t / 0.003) * 0.2
    bloom = (np.sin(2 * np.pi * NOTE["D3"] * t) + 0.6 * np.sin(2 * np.pi * NOTE["A3"] * t) + 0.3 * np.sin(2 * np.pi * NOTE["D2"] * 2 * t)) * env_ar(len(t), 0.06, 0.9) * 0.18
    finish("impact", reverb(sub + click + bloom, 0.35, IR_HALL, tail=2.2), fade_out=0.5)


def riser() -> None:
    d = 3.0
    t = t_axis(d)
    grow = (t / d) ** 2.4
    air = svf(rng(4).standard_normal(len(t)), 300 * (6000 / 300) ** (t / d), 1.4, "bp") * grow
    glide = NOTE["D3"] * 2 ** (t / d)
    tone = sum(a * np.sin(2 * np.pi * np.cumsum(glide * h) / SR) for h, a in ((1, 0.5), (1.5, 0.22), (2, 0.25), (3, 0.08)))
    tone = filt(tone, "lowpass", 2500) * grow * 0.35
    st = pan(air * 0.8, np.sin(2 * np.pi * 0.35 * t) * 0.3) + pan(tone, 0.0)
    finish("riser", reverb(st, 0.25, IR_HALL, tail=0.2), fade_in=0.4, fade_out=0.04)


def whooshes() -> None:
    # Push: right-to-left sweep, peaking where the transition is fastest (~40%).
    for v, (lo, hi, seed) in enumerate(((450, 2400, 21), (380, 2100, 22)), start=1):
        d = 0.72
        t = t_axis(d)
        shape = np.sin(np.pi * np.clip(t / d, 0, 1) ** 0.8) ** 2
        x = svf(rng(seed).standard_normal(len(t)), lo + (hi - lo) * shape, 1.1, "bp") * shape
        finish(f"whoosh-push-{v}", reverb(pan(x, np.linspace(0.6, -0.6, len(t))), 0.2, tail=0.6), fade_out=0.2)
    # Scale-through: centred airy swell with a soft low "whump" at the peak.
    for v, (lo, hi, seed) in enumerate(((350, 2600, 31), (420, 3000, 32), (300, 2200, 33)), start=1):
        d = 0.66
        t = t_axis(d)
        shape = np.sin(np.pi * np.clip(t / d, 0, 1) ** 0.75) ** 2
        air = svf(rng(seed).standard_normal(len(t)), lo + (hi - lo) * shape, 0.9, "bp") * shape
        whump = np.sin(2 * np.pi * 95 * t) * np.exp(-((t - 0.26) / 0.07) ** 2) * 0.35
        st = pan(air, 0.0) * 0.8 + pan(whump, 0.0)
        st[:, 0] += 0.15 * np.roll(air, int(SR * 0.0006))
        finish(f"whoosh-scale-{v}", reverb(st, 0.25, tail=0.6), fade_out=0.2)


def ui_sounds() -> None:
    # Cursor clicks: glassy ping + crisp transient, three timbres so repeats differ.
    for v, (f, seed) in enumerate(((3300, 41), (3650, 42), (3000, 43)), start=1):
        x = modal([f, f * 2.03, 240], [0.006, 0.003, 0.008], [1.0, 0.25, 0.4], 0.06, seed)
        for p, val in PANS.items():
            finish(f"click-{v}.{p}", pan(x, val), fade_out=0.01)
    # Wooden ticks (selections, toggles, checkboxes).
    for v, (f, seed) in enumerate(((820, 51), (880, 52), (760, 53)), start=1):
        x = modal([f, f * 2.45, f * 4.1], [0.016, 0.007, 0.004], [1.0, 0.45, 0.2], 0.08, seed)
        for p, val in PANS.items():
            finish(f"tick-{v}.{p}", pan(x, val), fade_out=0.015)
    # Typing keys: very short, slightly different each.
    for v, (f, seed) in enumerate(((1900, 61), (2150, 62), (1750, 63)), start=1):
        t = t_axis(0.03)
        noise = filt(rng(seed).standard_normal(len(t)), "bandpass", [1400, 5200]) * np.exp(-t / 0.0025)
        x = noise + 0.5 * np.sin(2 * np.pi * f * t) * np.exp(-t / 0.004)
        for p in ("c", "r"):
            finish(f"key-{v}.{p}", pan(x, PANS[p]), fade_in=0.0005, fade_out=0.008)
    # Soft pluck for things that appear (no cartoon pitch drop).
    t = t_axis(0.5)
    pluck = (np.sin(2 * np.pi * NOTE["A5"] * t) + 0.25 * np.sin(2 * np.pi * NOTE["A5"] * 2 * t) * np.exp(-t / 0.03)) * env_ar(len(t), 0.002, 0.07)
    thup = np.sin(2 * np.pi * 180 * t) * np.exp(-t / 0.018) * 0.5
    for p, val in PANS.items():
        finish(f"pop.{p}", reverb(pan(pluck + thup, val), 0.15, tail=0.5), fade_out=0.2)
    # Star fills: ascending glass notes.
    for i, note in enumerate(("D6", "E6", "F#6", "A6", "B6"), start=1):
        x = fm_bell(NOTE[note], 0.45, 0.16, ratio=3.01, index=0.8)
        finish(f"sparkle-{i}", reverb(pan(x, 0.1), 0.25, tail=0.5), fade_out=0.15)
    # Count-up: decelerating micro-ticks that follow the number's easing.
    d = 1.9
    times = [d * (1 - (1 - s) ** 0.35) for s in np.linspace(0, 1, 24)]
    ticks = [(tt, modal([4200], [0.003], [1.0], 0.02, 70 + i) * (1 - 0.6 * i / 24)) for i, tt in enumerate(times)]
    finish("roll", pan(place(d + 0.05, *ticks), 0.35), fade_out=0.02)


def chimes() -> None:
    email = fm_bell(NOTE["A5"], 1.6, 0.8, ratio=1.4, index=2.2) + 0.25 * fm_bell(NOTE["A6"], 1.6, 0.45, ratio=1.4, index=1.0)
    finish("chime-email", reverb(pan(email, -0.45), 0.3, tail=1.2), fade_out=0.3)
    sms = place(1.5, (0.0, fm_bell(NOTE["F#5"], 1.2, 0.45, ratio=2.0, index=1.4) * 0.8), (0.09, fm_bell(NOTE["B5"], 1.3, 0.55, ratio=2.0, index=1.4)))
    finish("chime-sms", reverb(pan(sms, 0.0), 0.3, tail=1.2), fade_out=0.3)
    push = fm_bell(NOTE["D6"], 1.8, 0.9, ratio=3.01, index=1.1) + 0.7 * fm_bell(NOTE["A5"], 1.8, 1.0, ratio=3.01, index=0.9)
    finish("chime-push", reverb(pan(push, 0.45), 0.3, tail=1.2), fade_out=0.3)


def confirmations() -> None:
    arp = place(1.4, *[(i * 0.055, mallet(NOTE[n], 1.2, 0.5 + 0.1 * i) * (0.8 + 0.07 * i)) for i, n in enumerate(("D5", "F#5", "A5", "D6"))])
    arp = arp + 0.12 * place(1.4, (0.165, fm_bell(NOTE["D6"], 1.2, 0.6, ratio=3.01, index=0.6)))
    finish("success", reverb(pan(arp, 0.25), 0.28, tail=1.0), fade_out=0.3)
    two = place(1.0, (0.0, mallet(NOTE["D6"], 0.9, 0.35) * 0.8), (0.07, mallet(NOTE["A6"], 0.9, 0.45)))
    finish("confirm", reverb(pan(two, 0.25), 0.25, tail=0.8), fade_out=0.25)
    t = t_axis(1.6)
    ka = filt(rng(80).standard_normal(len(t)), "bandpass", [2000, 6500]) * np.exp(-t / 0.004) * 0.18
    ding = sum(a * np.sin(2 * np.pi * NOTE["G6"] * r * t) * np.exp(-t / dd) for r, a, dd in ((1, 1.0, 1.1), (2.76, 0.35, 0.5), (5.4, 0.15, 0.25), (8.93, 0.06, 0.12)))
    ding *= np.minimum(1, t / 0.003)
    finish("paid", reverb(pan(place(1.6, (0.0, ka), (0.018, ding)), -0.2), 0.25, tail=0.9), fade_out=0.3)


def signature() -> None:
    """Pen on paper for the 40-frame signature: strokes follow the in-out pen speed."""
    d = 40 / 30
    t = t_axis(d)
    u = t / d
    w = u * u * (3 - 2 * u)  # pen progress along the path (in-out)
    speed = 1.5 * u * (1 - u) * 4 / 1.5  # its derivative, peak 1
    strokes = 0.35 + 0.65 * np.abs(np.sin(np.pi * 11 * w))  # 5.5 loops = 11 strokes
    r = rng(90)
    grain = filt(r.standard_normal(len(t)), "bandpass", [2500, 7500]) * speed * strokes
    fibres = filt((r.random(len(t)) < 0.004) * r.standard_normal(len(t)), "bandpass", [2500, 6000]) * speed * 0.35
    body = filt(r.standard_normal(len(t)), "bandpass", [300, 900]) * speed * strokes * 0.35
    finish("sig", reverb(pan(grain + fibres + body, 0.25), 0.06, tail=0.15), fade_in=0.02, fade_out=0.06)


def bed() -> None:
    """Seamless 12 s D-major pad: every partial and LFO fits a whole number of cycles in the loop."""
    L = 12.0
    n = int(SR * L)
    t = np.arange(n) / SR
    q = lambda f: round(f * L) / L  # noqa: E731
    r = rng(100)
    out = np.zeros((n, 2))
    voices = (("D2", 0.9), ("A2", 0.55), ("D3", 0.5), ("F#3", 0.3), ("A3", 0.28), ("E4", 0.1))
    for vi, (note, amp) in enumerate(voices):
        for det, p in ((-1 / L, -0.55), (0.0, 0.0), (1 / L, 0.55)):
            f = q(NOTE[note]) + det
            breathe = 0.5 + 0.5 * np.sin(2 * np.pi * (vi % 3 + 1) / L * t + vi)
            sig = np.zeros(n)
            h = 1
            while f * h < 2400 and h <= 10:
                bright = 1 if h == 1 else (0.55 + 0.45 * breathe)
                sig += np.sin(2 * np.pi * f * h * t + r.uniform(0, 2 * np.pi)) * bright / h ** 2.3
                h += 1
            lfo = 0.8 + 0.2 * np.sin(2 * np.pi * (vi + 2) / L * t + 1.7 * vi)
            out += pan(sig * lfo * amp / 3, p)
    # Air: noise shaped in the frequency domain (circular, so it loops seamlessly).
    for ch in range(2):
        spec = np.fft.rfft(r.standard_normal(n))
        fr = np.fft.rfftfreq(n, 1 / SR)
        shape = np.exp(-0.5 * (np.log(np.maximum(fr, 1) / 900) / 0.7) ** 2)
        air = np.fft.irfft(spec * shape, n)
        out[:, ch] += air / np.std(air) * 0.035 * (0.7 + 0.3 * np.sin(2 * np.pi * 1 / L * t + ch))
    out -= out.mean(axis=0)
    out *= 10 ** (-20 / 20) / np.sqrt(np.mean(out ** 2))  # RMS -20 dBFS; the mix sets the level
    write("bed", out)

    # Optional pulse: 75 BPM, 6 beats = 4.8 s (144 frames), loops cleanly.
    Lp = 4.8
    tp = t_axis(Lp)
    beat = np.zeros(len(tp))
    one = np.sin(2 * np.pi * NOTE["D2"] * tp[: int(SR * 0.6)]) * env_ar(int(SR * 0.6), 0.006, 0.16)
    for k in range(6):
        i = int(SR * 0.8 * k)
        beat[i : i + len(one)] += one * (1.0 if k % 2 == 0 else 0.7)
    beat *= 10 ** (-20 / 20) / np.sqrt(np.mean(beat ** 2))
    write("bed-pulse", pan(beat, 0.0) / np.sqrt(2))


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.wav"):
        old.unlink()
    impacts()
    riser()
    whooshes()
    ui_sounds()
    chimes()
    confirmations()
    signature()
    bed()
    print(f"{'file':18s} {'sec':>5s} {'peak dB':>8s} {'rms dB':>7s}")
    for name, sec, pk, rms in REPORT:
        print(f"{name:18s} {sec:5.2f} {pk:8.1f} {rms:7.1f}")
    print(f"{len(REPORT)} files → {OUT}")
