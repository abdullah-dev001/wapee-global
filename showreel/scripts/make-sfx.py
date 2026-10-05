#!/usr/bin/env python3
"""Synthesize the showreel's sound effects into public/sfx/*.wav.

Everything is generated from scratch (numpy + the standard wave module):
no downloads, no samples. 44.1 kHz, 16-bit stereo, peak about -3 dBFS.

    python3 -m venv .venv && .venv/bin/pip install numpy
    .venv/bin/python scripts/make-sfx.py
"""

from __future__ import annotations

import wave
from pathlib import Path

import numpy as np

SR = 44_100
PEAK = 10 ** (-3 / 20)  # -3 dBFS
OUT = Path(__file__).resolve().parent.parent / "public" / "sfx"
rng = np.random.default_rng(7)


def t_axis(seconds: float) -> np.ndarray:
    return np.arange(int(SR * seconds)) / SR


def noise(seconds: float) -> np.ndarray:
    return rng.standard_normal(int(SR * seconds))


def lowpass(x: np.ndarray, cutoff: np.ndarray | float) -> np.ndarray:
    """One-pole low-pass; `cutoff` may vary per sample."""
    c = np.broadcast_to(np.asarray(cutoff, dtype=float), x.shape)
    a = 1 - np.exp(-2 * np.pi * c / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc += a[i] * (x[i] - acc)
        y[i] = acc
    return y


def highpass(x: np.ndarray, cutoff: np.ndarray | float) -> np.ndarray:
    return x - lowpass(x, cutoff)


def bandpass(x: np.ndarray, low: float, high: float, passes: int = 2) -> np.ndarray:
    for _ in range(passes):
        x = lowpass(highpass(x, low), high)
    return x


def bell(freq: float, seconds: float, decay: float, partials=((1, 1.0), (2.0, 0.18), (3.01, 0.08), (4.2, 0.03))):
    """Soft, glassy bell built from a few sine partials with exponential decay."""
    t = t_axis(seconds)
    out = np.zeros_like(t)
    for ratio, amp in partials:
        out += amp * np.sin(2 * np.pi * freq * ratio * t) * np.exp(-t * ratio / decay)
    attack = np.minimum(1, t / 0.004)
    return out * attack


def pad(x: np.ndarray, seconds: float) -> np.ndarray:
    n = int(SR * seconds)
    return np.concatenate([x, np.zeros(max(0, n - len(x)))])[: max(n, len(x))]


def place(total: float, *parts: tuple[float, np.ndarray]) -> np.ndarray:
    out = np.zeros(int(SR * total))
    for start, part in parts:
        i = int(SR * start)
        j = min(len(out), i + len(part))
        out[i:j] += part[: j - i]
    return out


def stereo(x: np.ndarray, pan: np.ndarray | float = 0.0, width: float = 0.0) -> np.ndarray:
    """Equal-power pan (-1..1) plus an optional tiny decorrelated width."""
    p = np.broadcast_to(np.asarray(pan, dtype=float), x.shape)
    angle = (p + 1) * np.pi / 4
    left, right = x * np.cos(angle), x * np.sin(angle)
    if width:
        d = int(SR * 0.0007)
        right = right * (1 - width) + np.concatenate([np.zeros(d), right[:-d]]) * width
    return np.stack([left, right], axis=1)


def finish(name: str, st: np.ndarray, fade_in: float = 0.003, fade_out: float = 0.012) -> None:
    n = len(st)
    env = np.ones(n)
    fi, fo = max(1, int(SR * fade_in)), max(1, int(SR * fade_out))
    env[:fi] = np.linspace(0, 1, fi)
    env[-fo:] = np.minimum(env[-fo:], np.linspace(1, 0, fo))
    st = st * env[:, None]
    st = st - st.mean(axis=0)  # remove DC
    st = st / np.max(np.abs(st)) * PEAK
    pcm = np.round(st * 32767).astype("<i2")
    OUT.mkdir(parents=True, exist_ok=True)
    with wave.open(str(OUT / f"{name}.wav"), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print(f"{name:9s} {n / SR:5.2f}s")


def whoosh() -> None:
    d = 0.55
    t = t_axis(d)
    shape = np.sin(np.pi * np.clip(t / d, 0, 1)) ** 2
    cutoff = 300 + 2600 * shape
    x = lowpass(highpass(noise(d), 120), cutoff) * shape
    finish("whoosh", stereo(x, pan=np.linspace(-0.35, 0.35, len(t)), width=0.3), fade_out=0.05)


def tick() -> None:
    d = 0.045
    t = t_axis(d)
    body = np.sin(2 * np.pi * 1900 * t) * np.exp(-t / 0.006)
    click = bandpass(noise(d), 2000, 6000, 1) * np.exp(-t / 0.002) * 0.4
    finish("tick", stereo(body + click), fade_in=0.0005, fade_out=0.008)


def key() -> None:
    d = 0.025
    t = t_axis(d)
    x = bandpass(noise(d), 1500, 5000, 1) * np.exp(-t / 0.003)
    x += 0.3 * np.sin(2 * np.pi * 3200 * t) * np.exp(-t / 0.002)
    finish("key", stereo(x), fade_in=0.0005, fade_out=0.006)


def pop() -> None:
    d = 0.16
    t = t_axis(d)
    freq = 520 + 260 * np.exp(-t / 0.02)
    phase = 2 * np.pi * np.cumsum(freq) / SR
    x = np.sin(phase) * np.exp(-t / 0.045) + 0.15 * np.sin(2 * phase) * np.exp(-t / 0.02)
    finish("pop", stereo(x, width=0.2), fade_in=0.002, fade_out=0.03)


def chimes() -> None:
    # Three distinct, soft notification tones: email (one note),
    # SMS (two quick notes), push (gentle two-note chord).
    c1 = pad(bell(1046.5, 0.9, 0.35), 0.9)
    finish("chime-1", stereo(c1, width=0.3), fade_out=0.08)
    c2 = place(0.9, (0.0, bell(880.0, 0.8, 0.22) * 0.8), (0.11, bell(1318.5, 0.8, 0.3)))
    finish("chime-2", stereo(c2, width=0.3), fade_out=0.08)
    c3 = place(1.0, (0.0, bell(783.99, 1.0, 0.4)), (0.0, bell(1174.66, 1.0, 0.32) * 0.6))
    finish("chime-3", stereo(c3, width=0.3), fade_out=0.1)


def success() -> None:
    soft = ((1, 1.0), (2.0, 0.1), (3.0, 0.04))
    x = place(1.0, (0.0, bell(659.25, 0.9, 0.3, soft) * 0.75), (0.13, bell(987.77, 0.9, 0.4, soft)))
    finish("success", stereo(x, width=0.35), fade_out=0.12)


def paid() -> None:
    click = bandpass(noise(0.03), 1500, 7000, 1) * np.exp(-t_axis(0.03) / 0.004) * 0.25
    ding = bell(1567.98, 1.1, 0.45, ((1, 1.0), (2.76, 0.12), (5.4, 0.04)))
    finish("paid", stereo(place(1.15, (0.0, click), (0.02, ding)), width=0.3), fade_out=0.12)


def sig() -> None:
    d = 1.3
    t = t_axis(d)
    strokes = 0.55 + 0.45 * np.abs(np.sin(2 * np.pi * 4.2 * t + 1.3 * np.sin(2 * np.pi * 1.1 * t)))
    grain = bandpass(noise(d), 2200, 6500, 1) * strokes
    swell = np.minimum(1, t / 0.06) * np.minimum(1, (d - t) / 0.15)
    finish("sig", stereo(grain * swell, pan=0.1), fade_out=0.06)


def hit() -> None:
    d = 0.9
    t = t_axis(d)
    freq = 52 + 48 * np.exp(-t / 0.04)
    body = np.sin(2 * np.pi * np.cumsum(freq) / SR) * np.exp(-t / 0.22)
    air = lowpass(noise(d), 500) * np.exp(-t / 0.03) * 0.5
    finish("hit", stereo(body + air, width=0.15), fade_in=0.002, fade_out=0.1)


def riser() -> None:
    d = 2.0
    t = t_axis(d)
    grow = (t / d) ** 2.2
    air = lowpass(highpass(noise(d), 200), 300 + 5000 * grow) * grow
    f = 196 * 2 ** (t / d)  # one octave up
    tone = sum(a * np.sin(2 * np.pi * np.cumsum(f * r) / SR) for r, a in ((1, 0.5), (1.5, 0.25), (2, 0.2)))
    x = air * 0.9 + tone * grow * 0.12
    finish("riser", stereo(x, pan=np.sin(2 * np.pi * 0.4 * t) * 0.2, width=0.4), fade_in=0.2, fade_out=0.04)


if __name__ == "__main__":
    whoosh()
    tick()
    key()
    pop()
    chimes()
    success()
    paid()
    sig()
    hit()
    riser()
