#!/usr/bin/env python3
"""Every sound in Folio, synthesized from scratch (no samples).

    python3 tools/synth.py    (needs numpy; Blender's bundled Python has it)

Writes assets/sfx/*.wav (mono 16-bit). Effects at 44.1 kHz, loops at 22.05 kHz.
"""
import math
import os
import wave

import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
OUT = os.path.join(ROOT, 'assets', 'sfx')
os.makedirs(OUT, exist_ok=True)


def write(name, x, sr, peak=0.89):
    x = np.asarray(x, dtype=np.float64)
    m = np.max(np.abs(x)) or 1.0
    x = x / m * peak
    pcm = np.clip(np.round(x * 32767), -32768, 32767).astype('<i2')
    with wave.open(os.path.join(OUT, name), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(pcm.tobytes())
    print(f'{name:18s} {len(x) / sr:5.2f}s  {os.path.getsize(os.path.join(OUT, name)) / 1024:6.0f} KB')


def t_axis(sec, sr):
    return np.arange(int(sec * sr)) / sr


def noise(n, seed):
    return np.random.default_rng(seed).standard_normal(n)


def band(x, sr, lo, hi, soft=0.15):
    """Zero-phase band-pass by spectral masking (smooth edges)."""
    n = len(x)
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(n, 1 / sr)
    def ramp(a, b):
        return np.clip((f - a) / max(b - a, 1e-6), 0, 1)
    m = np.ones_like(f)
    if lo > 0:
        m *= ramp(lo * (1 - soft), lo * (1 + soft)) ** 2
    if hi < sr / 2:
        m *= 1 - ramp(hi * (1 - soft), hi * (1 + soft)) ** 2
    return np.fft.irfft(X * m, n)


def onepole_lp(x, sr, fc):
    """Time-varying one-pole low-pass (fc may be an array)."""
    fc = np.broadcast_to(np.asarray(fc, dtype=np.float64), x.shape)
    a = np.exp(-2 * math.pi * fc / sr)
    y = np.empty_like(x)
    s = 0.0
    for i in range(len(x)):
        s = (1 - a[i]) * x[i] + a[i] * s
        y[i] = s
    return y


def env_ad(t, a, d):
    return np.where(t < a, t / max(a, 1e-6), np.exp(-(t - a) / max(d, 1e-6)))


def reverb(x, sr, seconds=2.2, wet=0.3, seed=9, damp=6000.0, predelay=0.012):
    n = int(seconds * sr)
    tt = np.arange(n) / sr
    ir = noise(n, seed) * np.exp(-tt * 6.9 / seconds)
    ir = band(ir, sr, 120, damp)
    ir[: int(predelay * sr)] = 0
    ir /= np.sqrt(np.sum(ir ** 2)) + 1e-9
    m = len(x) + n
    size = 1 << (m - 1).bit_length()
    y = np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size), size)[:m]
    out = np.zeros(m)
    out[: len(x)] += x * (1 - wet)
    out += y * wet * 2.2
    return out


def place(dst, src, at, sr, g=1.0):
    i = max(0, int(at * sr))
    j = min(len(dst), i + len(src))
    if i < len(dst):
        dst[i:j] += src[: j - i] * g


def loopify(x, sr, fade=1.5):
    """Fold the tail onto the head so the loop is seamless."""
    k = int(fade * sr)
    body = x[:-k].copy()
    tail = x[-k:]
    ramp = np.linspace(0, 1, k)
    body[:k] = body[:k] * ramp + tail * (1 - ramp)
    return body


# ---------------------------------------------------------------- effects (44.1 kHz)

SR = 44100


def pop(seed, pitch):
    t = t_axis(0.34, SR)
    x = np.zeros_like(t)
    # The cut edge flicking past the page: a bright fwip.
    n = noise(len(t), seed)
    fw = band(n, SR, 1400 * pitch, 5200 * pitch) * env_ad(t, 0.004, 0.035)
    x += fw * 0.9
    # The fold snapping straight: a short click.
    click = band(noise(len(t), seed + 1), SR, 2500, 9000) * env_ad(t, 0.0005, 0.004)
    x += click * 0.7
    # The paper settling: a soft low thup with a falling pitch.
    f = 210 * pitch * np.exp(-t * 9)
    th = np.sin(2 * math.pi * np.cumsum(f) / SR) * env_ad(t - 0.006, 0.003, 0.05) * (t > 0.006)
    x += th * 0.55
    return reverb(x, SR, 0.6, 0.18, seed)


def book_open():
    t = t_axis(2.0, SR)
    n = noise(len(t), 3)
    # Paper sliding: band noise swelling, with page flutter slowing down.
    slide = band(n, SR, 700, 4800) * np.clip(t / 0.5, 0, 1) * np.exp(-np.maximum(t - 0.55, 0) * 3.5)
    flutter_rate = 26 - 16 * np.clip(t / 1.0, 0, 1)
    flutter = 0.55 + 0.45 * np.sin(2 * math.pi * np.cumsum(flutter_rate) / SR) ** 2
    x = slide * flutter * 0.8
    # The spine creaks a little.
    creak = band(noise(len(t), 4), SR, 300, 900) * np.exp(-((t - 0.25) / 0.12) ** 2) * (0.5 + 0.5 * np.sin(2 * math.pi * 47 * t))
    x += creak * 0.4
    # The board lands on the table.
    f = 95 * np.exp(-np.maximum(t - 1.05, 0) * 6)
    thump = np.sin(2 * math.pi * np.cumsum(f) / SR) * env_ad(t - 1.05, 0.004, 0.12) * (t > 1.05)
    x += thump * 0.9 + band(noise(len(t), 5), SR, 150, 1200) * env_ad(t - 1.05, 0.002, 0.05) * (t > 1.05) * 0.4
    return reverb(x, SR, 1.4, 0.22)


def book_close():
    t = t_axis(1.2, SR)
    flut = band(noise(len(t), 6), SR, 900, 5000) * np.clip(t / 0.2, 0, 1) * np.exp(-np.maximum(t - 0.3, 0) * 8)
    x = flut * (0.6 + 0.4 * np.sin(2 * math.pi * 34 * t) ** 2) * 0.7
    f = 85 * np.exp(-np.maximum(t - 0.38, 0) * 5)
    x += np.sin(2 * math.pi * np.cumsum(f) / SR) * env_ad(t - 0.38, 0.003, 0.16) * (t > 0.38)
    x += band(noise(len(t), 7), SR, 120, 900) * env_ad(t - 0.38, 0.002, 0.06) * (t > 0.38) * 0.6
    return reverb(x, SR, 1.0, 0.2)


def bell(t, f, decay, g=1.0):
    parts = [(1.0, 1.0), (2.76, 0.45), (5.40, 0.25), (8.93, 0.12), (2.0, 0.2)]
    y = np.zeros_like(t)
    for r, a in parts:
        y += a * np.sin(2 * math.pi * f * r * t) * np.exp(-t * (1 + r * 0.8) / decay)
    return y * (t >= 0) * np.clip(t / 0.002, 0, 1) * g


def dive():
    t = t_axis(2.6, SR)
    n = noise(len(t), 11)
    # Rising whoosh: low-pass opens as the camera accelerates into the portal.
    u = np.clip(t / 1.9, 0, 1)
    fc = 250 + 7000 * u ** 2.2
    w = onepole_lp(n, SR, fc)
    w = w - onepole_lp(w, SR, 120)
    amp = np.sin(math.pi * np.clip(t / 2.1, 0, 1)) ** 1.5
    x = w * amp * 1.3
    # Sparkles falling in: random bell pings, denser towards the end.
    rng = np.random.default_rng(12)
    for k in range(26):
        at = 1.9 * (k / 26) ** 0.7 + rng.uniform(-0.05, 0.05)
        f = rng.choice([1318.5, 1567.98, 1975.53, 2349.32, 2637.0]) * rng.choice([1, 0.5])
        place(x, bell(t_axis(0.8, SR), f, 0.25, 0.06 + 0.12 * (k / 26)), at, SR)
    # A soft swell of the arrival chord under it.
    for f in (261.63, 329.63, 392.0):
        x += np.sin(2 * math.pi * f * t) * np.clip((t - 1.2) / 0.8, 0, 1) * np.exp(-np.maximum(t - 2.0, 0) * 4) * 0.05
    return reverb(x, SR, 2.0, 0.3)


def arrive():
    t = t_axis(3.6, SR)
    x = np.zeros_like(t)
    for i, f in enumerate([659.25, 783.99, 987.77, 1318.51]):
        place(x, bell(t_axis(3.0, SR), f, 1.1, 0.5 - i * 0.06), 0.09 * i, SR)
    return reverb(x, SR, 2.6, 0.35)


def back():
    w = dive()[: int(1.6 * SR)]
    w = w[::-1] * np.linspace(0.2, 1, len(w)) ** 2
    return reverb(w, SR, 1.0, 0.2)


def tap():
    t = t_axis(0.12, SR)
    x = band(noise(len(t), 21), SR, 1800, 7000) * env_ad(t, 0.001, 0.012)
    return x


# ---------------------------------------------------------------- loops (22.05 kHz)

LR = 22050


def tine(t, f, g=1.0):
    """A music-box tine: bright attack, slightly inharmonic overtones, long ring."""
    d = 2.6 * (440 / f) ** 0.35
    y = np.sin(2 * math.pi * f * t) * np.exp(-t / d)
    y += 0.25 * np.sin(2 * math.pi * f * 3.01 * t) * np.exp(-t / (d * 0.35))
    y += 0.10 * np.sin(2 * math.pi * f * 5.83 * t) * np.exp(-t / (d * 0.15))
    y += 0.06 * np.sin(2 * math.pi * f * 8.9 * t) * np.exp(-t / 0.04)
    return y * np.clip(t / 0.0015, 0, 1) * g


def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def music_box():
    """An original lullaby in 3/4, F major, 66 bpm, 16 bars."""
    bpm = 66
    beat = 60 / bpm
    bars = 16
    total = bars * 3 * beat
    melody = [
        # bar, beat, midi, (one bar = 3 beats)
        (0, 0, 77), (0, 1, 76), (0, 2, 77),
        (1, 0, 81), (1, 2, 79),
        (2, 0, 77), (2, 1, 74), (2, 2, 72),
        (3, 0, 74),
        (4, 0, 76), (4, 1, 77), (4, 2, 79),
        (5, 0, 81), (5, 1.5, 84),
        (6, 0, 82), (6, 1, 81), (6, 2, 79),
        (7, 0, 81),
        (8, 0, 77), (8, 1, 76), (8, 2, 77),
        (9, 0, 81), (9, 2, 84),
        (10, 0, 86), (10, 1, 84), (10, 2, 81),
        (11, 0, 79), (11, 2, 77),
        (12, 0, 76), (12, 1, 74), (12, 2, 76),
        (13, 0, 79), (13, 2, 77),
        (14, 0, 76), (14, 1, 72), (14, 2, 74),
        (15, 0, 77),
    ]
    chords = [(53, 60, 65), (53, 60, 65), (58, 62, 65), (55, 60, 64), (57, 60, 64), (53, 57, 65), (58, 62, 67), (60, 64, 67),
              (53, 60, 65), (57, 60, 65), (58, 62, 65), (60, 64, 67), (57, 60, 64), (58, 62, 65), (55, 60, 64), (53, 60, 65)]
    t_note = t_axis(5.0, LR)
    x = np.zeros(int((total + 6) * LR))
    rng = np.random.default_rng(3)
    for bar, b, m in melody:
        at = (bar * 3 + b) * beat + rng.uniform(-0.008, 0.008)
        place(x, tine(t_note, midi(m) * (1 + rng.uniform(-0.0015, 0.0015)), 0.55), at, LR)
    for bar, ch in enumerate(chords):
        base = bar * 3 * beat
        place(x, tine(t_note, midi(ch[0] - 12), 0.32), base, LR)
        place(x, tine(t_note, midi(ch[1]), 0.16), base + beat, LR)
        place(x, tine(t_note, midi(ch[2]), 0.16), base + beat * 2, LR)
    # A soft string pad under the box, following the chords.
    pad = np.zeros_like(x)
    tt = np.arange(len(x)) / LR
    for bar, ch in enumerate(chords):
        s = int(bar * 3 * beat * LR)
        e = int((bar + 1) * 3 * beat * LR)
        seg = tt[s:e] - tt[s]
        envp = np.clip(seg / 0.6, 0, 1) * np.clip((3 * beat - seg) / 0.6, 0, 1)
        for m in ch:
            for det in (-0.12, 0.12):
                f = midi(m) * 2 ** (det / 12)
                pad[s:e] += np.sin(2 * math.pi * f * tt[s:e] + 0.3 * np.sin(2 * math.pi * 0.2 * tt[s:e])) * envp * 0.035
    x += band(pad, LR, 100, 2500)
    x = reverb(x, LR, 3.2, 0.38)
    # Wrap the reverb tail onto the start so the loop is seamless.
    n = int(total * LR)
    out = x[:n].copy()
    tail = x[n:n + n]
    out[: len(tail)] += tail
    return out


def crickets():
    sec = 24
    t = t_axis(sec + 2, LR)
    x = np.zeros_like(t)
    rng = np.random.default_rng(31)
    for voice, (f, rate, gain) in enumerate([(4300, 0.9, 0.22), (4700, 1.3, 0.16), (3900, 1.7, 0.12), (5200, 2.2, 0.07)]):
        at = rng.uniform(0, 1)
        while at < sec + 1:
            n_pulses = rng.integers(2, 4)
            for k in range(n_pulses):
                pt = t_axis(0.035, LR)
                pulse = np.sin(2 * math.pi * f * pt) * np.sin(math.pi * pt / 0.035) ** 2
                place(x, pulse, at + k * 0.045, LR, gain * rng.uniform(0.7, 1.0))
            at += rate * rng.uniform(0.8, 1.3)
    wind = band(noise(len(t), 32), LR, 80, 700)
    wind *= 0.5 + 0.5 * np.sin(2 * math.pi * t / 9.0) ** 2
    x += wind * 0.18
    return loopify(reverb(x, LR, 1.8, 0.35), LR, 2.0)


def room():
    sec = 20
    t = t_axis(sec + 2, LR)
    rng = np.random.default_rng(41)
    # Lantern flame: soft crackles.
    x = np.zeros_like(t)
    for _ in range(140):
        at = rng.uniform(0, sec + 1)
        c = band(noise(int(0.02 * LR), int(rng.integers(1e6))), LR, 900, 6000) * np.exp(-np.arange(int(0.02 * LR)) / (0.003 * LR))
        place(x, c, at, LR, rng.uniform(0.05, 0.25))
    # A clock: tick ... tock.
    for k in range(int(sec)):
        tk = t_axis(0.05, LR)
        tone = np.sin(2 * math.pi * (2100 if k % 2 == 0 else 1800) * tk) * np.exp(-tk / 0.006)
        place(x, tone, k + 0.5, LR, 0.18)
    # Warm room tone.
    x += band(noise(len(t), 42), LR, 60, 400) * 0.12
    return loopify(reverb(x, LR, 1.2, 0.3), LR, 2.0)


def sea():
    sec = 24
    t = t_axis(sec + 3, LR)
    n = noise(len(t), 51)
    swell = np.zeros_like(t)
    for at in np.arange(0, sec + 3, 6.0):
        swell += np.exp(-((t - at - 2.2) / 1.4) ** 2) * 0.9 + np.exp(-((t - at - 3.6) / 0.6) ** 2) * 0.5
    fc = 300 + 2600 * swell / (swell.max() + 1e-9)
    x = onepole_lp(n, LR, fc) * (0.25 + swell)
    x = x - onepole_lp(x, LR, 60)
    # A far buoy bell now and then.
    for at in (4.0, 15.5):
        place(x, bell(t_axis(4, LR), 392, 1.8, 0.25), at, LR)
    return loopify(reverb(x, LR, 2.2, 0.3), LR, 2.5)


def deep():
    sec = 26
    t = t_axis(sec + 3, LR)
    x = band(noise(len(t), 61), LR, 40, 260) * (0.6 + 0.4 * np.sin(2 * math.pi * t / 13) ** 2) * 0.5
    x += np.sin(2 * math.pi * 55 * t + 0.4 * np.sin(2 * math.pi * 0.1 * t)) * 0.06
    rng = np.random.default_rng(62)
    # Bubbles.
    for _ in range(40):
        at = rng.uniform(0, sec + 1)
        d = rng.uniform(0.04, 0.09)
        bt = t_axis(d, LR)
        f = rng.uniform(500, 900) * np.exp(bt / d * rng.uniform(0.6, 1.2))
        b = np.sin(2 * math.pi * np.cumsum(f) / LR) * np.sin(math.pi * bt / d)
        place(x, b, at, LR, rng.uniform(0.04, 0.12))
    # The whale: a long sung glide.
    for at, f0, f1 in ((5.0, 210, 135), (16.0, 180, 240)):
        d = 3.8
        wt = t_axis(d, LR)
        f = (f0 + (f1 - f0) * (wt / d) ** 1.4) * (1 + 0.012 * np.sin(2 * math.pi * 5.5 * wt))
        ph = 2 * math.pi * np.cumsum(f) / LR
        voice = np.sin(ph) + 0.5 * np.sin(2 * ph) + 0.25 * np.sin(3 * ph)
        voice = band(voice, LR, 90, 1400) * np.sin(math.pi * wt / d) ** 1.5
        place(x, voice, at, LR, 0.35)
    return loopify(reverb(x, LR, 3.5, 0.45, damp=2500), LR, 2.5)


if __name__ == '__main__':
    for i, p in enumerate((1.0, 1.18, 0.86)):
        write(f'pop{i + 1}.wav', pop(100 + i, p), SR)
    write('open.wav', book_open(), SR)
    write('close.wav', book_close(), SR)
    write('dive.wav', dive(), SR)
    write('arrive.wav', arrive(), SR)
    write('back.wav', back(), SR)
    write('tap.wav', tap(), SR)
    write('music.wav', music_box(), LR, 0.8)
    write('amb_woods.wav', crickets(), LR, 0.6)
    write('amb_attic.wav', room(), LR, 0.6)
    write('amb_lantern.wav', sea(), LR, 0.6)
    write('amb_deep.wav', deep(), LR, 0.6)
