"""Generate the 64x37 static lunar surface texture used by the ASCII mark."""

from __future__ import annotations

import base64
import math


WIDTH = 64
HEIGHT = 37
CENTER_X = 31.53
CENTER_Y = 17.91
RADIUS_X = 24.84
RADIUS_Y = 14.64

# Projected near-side maria: x, y, radius-x, radius-y, darkness.
MARIA = (
    (-0.45, -0.02, 0.30, 0.48, 0.24),  # Oceanus Procellarum
    (-0.23, -0.34, 0.27, 0.20, 0.30),  # Mare Imbrium
    (0.16, -0.30, 0.18, 0.15, 0.23),   # Mare Serenitatis
    (0.30, -0.07, 0.22, 0.18, 0.28),   # Mare Tranquillitatis
    (0.56, -0.15, 0.13, 0.13, 0.25),   # Mare Crisium
    (0.40, 0.20, 0.18, 0.15, 0.19),    # Mare Fecunditatis
    (-0.14, 0.35, 0.20, 0.15, 0.18),   # Mare Nubium
    (-0.38, 0.34, 0.11, 0.11, 0.21),   # Mare Humorum
)

# Projected crater basins: x, y, radius, center darkness, rim brightness.
CRATERS = (
    (0.00, 0.57, 0.095, 0.30, 0.22),   # Tycho
    (-0.24, 0.05, 0.078, 0.25, 0.20),  # Copernicus
    (-0.47, 0.10, 0.050, 0.22, 0.18),  # Kepler
    (-0.53, -0.18, 0.042, 0.18, 0.20), # Aristarchus
    (-0.18, -0.56, 0.060, 0.24, 0.16), # Plato
    (0.28, 0.43, 0.055, 0.18, 0.16),
    (0.53, 0.35, 0.045, 0.18, 0.15),
)


def generate_surface() -> bytes:
    values: list[int] = []

    for row in range(HEIGHT):
        y = (row - CENTER_Y) / RADIUS_Y
        for column in range(WIDTH):
            x = (column - CENTER_X) / RADIUS_X
            distance = math.hypot(x, y)

            if distance > 1.04:
                values.append(255)
                continue

            value = 0.96 + 0.018 * math.sin(column * 1.71 + row * 0.83)

            for mare_x, mare_y, radius_x, radius_y, darkness in MARIA:
                basin = ((x - mare_x) / radius_x) ** 2 + ((y - mare_y) / radius_y) ** 2
                value -= darkness * math.exp(-1.7 * basin)

            for crater_x, crater_y, radius, center_darkness, rim_brightness in CRATERS:
                crater_distance = math.hypot(x - crater_x, y - crater_y) / radius
                center = math.exp(-2.8 * crater_distance * crater_distance)
                rim = math.exp(-((crater_distance - 1.0) / 0.22) ** 2)
                value += rim_brightness * rim - center_darkness * center

            # Eight subtle rays centered on Tycho.
            tycho_x, tycho_y = x, y - 0.57
            tycho_distance = math.hypot(tycho_x, tycho_y)
            if 0.10 < tycho_distance < 0.72:
                angle = math.atan2(tycho_y, tycho_x)
                ray = max(0.0, math.cos(angle * 8)) ** 18
                value += 0.10 * ray * (1 - tycho_distance / 0.72)

            values.append(round(max(0.38, min(1.0, value)) * 255))

    return bytes(values)


if __name__ == "__main__":
    print(base64.b64encode(generate_surface()).decode("ascii"))
