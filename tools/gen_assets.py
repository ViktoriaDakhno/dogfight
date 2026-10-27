"""Генератор ассетів для Dogfight (запускати не обов'язково — готові файли вже в public/assets).

    python tools/gen_assets.py

Спрайтшити малюються в 4 рази більшими й зменшуються (згладжування),
звуки синтезуються з синусоїд і шуму. Seed фіксований — результат завжди однаковий.
"""

import math
import random
import wave
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "public" / "assets"
SS = 4  # supersampling


def hex_rgba(color, alpha=255):
    color = color.lstrip("#")
    return tuple(int(color[i : i + 2], 16) for i in (0, 2, 4)) + (alpha,)


def scaled(points, ox=0):
    return [((x + ox) * SS, y * SS) for x, y in points]


# ---------- кораблі: 4 кадри 64x64, ніс дивиться праворуч ----------
def ship_frame(draw, ox, hull, outline, cockpit, thrust):
    if thrust:
        draw.polygon(scaled([(20, 24), (0, 32), (20, 40)], ox), fill=hex_rgba("#ff8c42"))
        draw.polygon(scaled([(20, 28), (8, 32), (20, 36)], ox), fill=hex_rgba("#ffe08a"))
    body = [(60, 32), (12, 12), (22, 32), (12, 52)]
    draw.polygon(scaled(body, ox), fill=hex_rgba(hull))
    draw.line(scaled(body + [body[0]], ox), fill=hex_rgba(outline), width=3 * SS, joint="curve")
    draw.polygon(scaled([(46, 32), (32, 27), (32, 37)], ox), fill=hex_rgba(cockpit))


def make_ships():
    w, h = 64, 64
    img = Image.new("RGBA", (w * 4 * SS, h * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    skins = [
        ("#1d2b4a", "#e8f1ff", "#5ec8ff"),  # player
        ("#4a1d22", "#ff6b6b", "#ffd166"),  # drone
    ]
    for i, (hull, outline, cockpit) in enumerate(skins):
        for thrust in (False, True):
            frame = i * 2 + int(thrust)
            ship_frame(d, frame * w, hull, outline, cockpit, thrust)
    img.resize((w * 4, h), Image.LANCZOS).save(OUT / "sprites" / "ships.png")


# ---------- астероїди: 3 варіанти 128x128 ----------
def make_asteroids():
    size = 128
    rng = random.Random(7)
    img = Image.new("RGBA", (size * 3 * SS, size * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for v in range(3):
        cx, cy = v * size + size / 2, size / 2
        pts = []
        n = 14
        for k in range(n):
            a = k / n * math.tau
            r = 56 * rng.uniform(0.78, 1.0)
            pts.append((cx + math.cos(a) * r, cy + math.sin(a) * r))
        d.polygon([(x * SS, y * SS) for x, y in pts], fill=hex_rgba("#3a4255"))
        for _ in range(4):
            a = rng.uniform(0, math.tau)
            dist = rng.uniform(5, 30)
            rr = rng.uniform(6, 13)
            x, y = cx + math.cos(a) * dist, cy + math.sin(a) * dist
            d.ellipse([(x - rr) * SS, (y - rr) * SS, (x + rr) * SS, (y + rr) * SS], fill=hex_rgba("#2b3243"))
            d.arc(
                [(x - rr) * SS, (y - rr) * SS, (x + rr) * SS, (y + rr) * SS],
                200, 340, fill=hex_rgba("#56607a"), width=2 * SS,
            )
        d.line([(x * SS, y * SS) for x, y in pts + [pts[0]]], fill=hex_rgba("#9aa7bd"), width=3 * SS, joint="curve")
    img.resize((size * 3, size), Image.LANCZOS).save(OUT / "sprites" / "asteroids.png")


# ---------- кулі: 2 кадри 16x16, радіальне сяйво ----------
def make_bullets():
    size = 16
    yy, xx = np.mgrid[0:size, 0:size] + 0.5
    r = np.hypot(xx - size / 2, yy - size / 2) / (size / 2)
    glow = np.clip(1 - r, 0, 1) ** 1.6
    core = (r < 0.35).astype(float)
    frames = []
    for color in ("#ffe08a", "#c792ea"):
        rgb = np.array(hex_rgba(color)[:3], dtype=float)
        pix = np.zeros((size, size, 4))
        pix[..., :3] = rgb * (1 - core[..., None]) + 255 * core[..., None]
        pix[..., 3] = np.clip(glow * 255 + core * 255, 0, 255)
        frames.append(pix)
    Image.fromarray(np.concatenate(frames, axis=1).astype(np.uint8), "RGBA").save(OUT / "sprites" / "bullets.png")


# ---------- звуки: моно 16 біт 22050 Гц ----------
RATE = 22050


def save_wav(name, samples):
    samples = samples / max(1e-9, np.max(np.abs(samples))) * 0.8
    data = (samples * 32767).astype("<i2").tobytes()
    with wave.open(str(OUT / "sounds" / name), "wb") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(RATE)
        f.writeframes(data)


def t_axis(seconds):
    return np.arange(int(RATE * seconds)) / RATE


def make_sounds():
    rng = np.random.default_rng(3)

    t = t_axis(0.13)  # постріл: «піу» — падіння частоти
    freq = 1400 * np.exp(-t * 18) + 250
    phase = np.cumsum(freq) / RATE * math.tau
    save_wav("shoot.wav", np.sign(np.sin(phase)) * 0.5 * np.exp(-t * 22))

    t = t_axis(0.1)  # влучання: клац + глухий удар
    save_wav("hit.wav", rng.normal(0, 1, t.size) * np.exp(-t * 60) + np.sin(t * math.tau * 160) * np.exp(-t * 30))

    t = t_axis(0.8)  # вибух: «коричневий» шум, що згасає
    brown = np.cumsum(rng.normal(0, 1, t.size))
    brown -= np.convolve(brown, np.ones(200) / 200, mode="same")
    save_wav("explosion.wav", brown * np.exp(-t * 5) + np.sin(t * math.tau * 55) * np.exp(-t * 6) * 8)

    notes = []  # pickup: три ноти вгору
    for f in (660, 880, 1320):
        t = t_axis(0.08)
        notes.append(np.sin(t * math.tau * f) * np.sin(np.pi * t / t[-1]))
    save_wav("pickup.wav", np.concatenate(notes))


if __name__ == "__main__":
    (OUT / "sprites").mkdir(parents=True, exist_ok=True)
    (OUT / "sounds").mkdir(parents=True, exist_ok=True)
    make_ships()
    make_asteroids()
    make_bullets()
    make_sounds()
    print("assets written to", OUT)
