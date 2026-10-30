"""Genera los iconos PNG de la PWA (sin dependencias externas)."""
import struct, zlib, os

def png(size, maskable):
    bg = (26, 31, 46)
    fg = (255, 200, 40)
    rows = []
    c = size / 2
    r_bulb = size * (0.20 if maskable else 0.26)
    cy = size * 0.42
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            px = bg
            if (x - c) ** 2 + (y - cy) ** 2 <= r_bulb ** 2:
                px = fg
            elif abs(x - c) <= r_bulb * 0.45 and cy + r_bulb * 0.8 <= y <= cy + r_bulb * 1.6:
                px = (200, 205, 215)
            row += bytes(px)
        rows.append(bytes(row))
    raw = b''.join(rows)

    def chunk(t, d):
        return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)

    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))

here = os.path.dirname(os.path.abspath(__file__))
for name, size, m in [('icon-192.png', 192, False), ('icon-512.png', 512, False), ('icon-maskable-512.png', 512, True)]:
    with open(os.path.join(here, name), 'wb') as f:
        f.write(png(size, m))
