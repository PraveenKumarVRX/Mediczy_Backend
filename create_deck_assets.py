#!/usr/bin/env python3
"""Generate custom healthcare graphics for the Mediqzy marketing deck."""

from PIL import Image, ImageDraw, ImageFont, ImageFilter
import math, os

OUT = "/home/ubuntu/Mediczy/deck_assets"
os.makedirs(OUT, exist_ok=True)

W, H = 1920, 1080  # Standard HD

# ── Brand colors ──
TEAL       = (0, 150, 136)
TEAL_DARK  = (0, 105, 92)
TEAL_LIGHT = (77, 182, 172)
DARK_BG    = (15, 23, 42)
DARK_CARD  = (30, 41, 59)
WHITE      = (255, 255, 255)
EMERALD    = (16, 185, 129)
BLUE       = (56, 189, 248)
PURPLE     = (167, 139, 250)
ORANGE     = (245, 158, 11)
ROSE       = (251, 113, 133)
AMBER      = (251, 191, 36)
GRAY       = (148, 163, 184)

def draw_gradient(draw, x0, y0, x1, y1, color1, color2, direction='h'):
    """Draw a smooth gradient."""
    if direction == 'h':
        for x in range(x0, x1):
            t = (x - x0) / max(1, (x1 - x0))
            r = int(color1[0] + (color2[0] - color1[0]) * t)
            g = int(color1[1] + (color2[1] - color1[1]) * t)
            b = int(color1[2] + (color2[2] - color1[2]) * t)
            draw.line([(x, y0), (x, y1)], fill=(r, g, b))
    else:
        for y in range(y0, y1):
            t = (y - y0) / max(1, (y1 - y0))
            r = int(color1[0] + (color2[0] - color1[0]) * t)
            g = int(color1[1] + (color2[1] - color1[1]) * t)
            b = int(color1[2] + (color2[2] - color1[2]) * t)
            draw.line([(x0, y), (x1, y)], fill=(r, g, b))

def draw_circle(draw, cx, cy, r, color, alpha=60):
    """Draw a soft glowing circle."""
    for i in range(r, 0, -1):
        a = int(alpha * (i / r))
        c = color + (a,)
        draw.ellipse([cx-i, cy-i, cx+i, cy+i], fill=c)

def draw_rounded_rect(draw, bbox, radius, fill):
    x0, y0, x1, y1 = bbox
    draw.rounded_rectangle(bbox, radius=radius, fill=fill)

def draw_grid_dots(draw, w, h, spacing=40, color=(255,255,255,12)):
    for x in range(0, w, spacing):
        for y in range(0, h, spacing):
            draw.ellipse([x-1, y-1, x+1, y+1], fill=color)

def create_base_bg(w=W, h=H, style='dark'):
    """Create a professional dark background with subtle elements."""
    img = Image.new('RGBA', (w, h), DARK_BG + (255,))
    draw = ImageDraw.Draw(img)
    
    # Subtle gradient overlay
    overlay = Image.new('RGBA', (w, h), (0,0,0,0))
    odraw = ImageDraw.Draw(overlay)
    draw_gradient(odraw, 0, 0, w, h, (10, 20, 40), (20, 35, 60), 'v')
    img = Image.alpha_composite(img, overlay)
    
    # Grid dots
    dot_layer = Image.new('RGBA', (w, h), (0,0,0,0))
    ddraw = ImageDraw.Draw(dot_layer)
    draw_grid_dots(ddraw, w, h, spacing=50, color=(255,255,255,8))
    img = Image.alpha_composite(img, dot_layer)
    
    return img

def add_glow_circles(img, circles):
    """Add decorative glow circles. circles: list of (cx, cy, r, color, alpha)."""
    glow = Image.new('RGBA', img.size, (0,0,0,0))
    gdraw = ImageDraw.Draw(glow)
    for cx, cy, r, color, alpha in circles:
        draw_circle(gdraw, cx, cy, r, color, alpha)
    glow = glow.filter(ImageFilter.GaussianBlur(radius=40))
    return Image.alpha_composite(img, glow)


# ═══════════════════════════════════════════════════════
# 1. COVER BACKGROUND — Premium hero with glow effects
# ═══════════════════════════════════════════════════════
print("Creating cover background...")
img = create_base_bg()
img = add_glow_circles(img, [
    (1500, 200, 400, TEAL, 30),
    (200, 800, 350, EMERALD, 20),
    (960, 540, 250, TEAL_LIGHT, 15),
    (1700, 700, 300, BLUE, 15),
])
# Diagonal accent line
draw = ImageDraw.Draw(img)
for i in range(3):
    draw.line([(0, 300+i), (1920, 100+i)], fill=TEAL + (30,), width=1)
draw.line([(0, 900), (1920, 700)], fill=TEAL_LIGHT + (15,), width=1)
img.convert('RGB').save(os.path.join(OUT, "bg_cover.png"))


# ═══════════════════════════════════════════════════════
# 2. SECTION BACKGROUNDS (multiple variants)
# ═══════════════════════════════════════════════════════
print("Creating section backgrounds...")

# Dark with left accent
img = create_base_bg()
img = add_glow_circles(img, [
    (100, 540, 400, TEAL, 25),
    (1800, 300, 300, EMERALD, 15),
])
# Left accent stripe
draw = ImageDraw.Draw(img)
draw_rounded_rect(draw, (0, 0, 8, 1080), 0, TEAL + (180,))
img.convert('RGB').save(os.path.join(OUT, "bg_section_1.png"))

# Dark with right glow
img = create_base_bg()
img = add_glow_circles(img, [
    (1600, 400, 500, BLUE, 20),
    (300, 700, 300, PURPLE, 15),
])
img.convert('RGB').save(os.path.join(OUT, "bg_section_2.png"))

# Dark with top accent
img = create_base_bg()
img = add_glow_circles(img, [
    (960, 100, 400, TEAL, 25),
    (200, 900, 300, ORANGE, 10),
    (1700, 800, 300, EMERALD, 12),
])
draw = ImageDraw.Draw(img)
draw_rounded_rect(draw, (0, 0, 1920, 5), 0, TEAL + (200,))
img.convert('RGB').save(os.path.join(OUT, "bg_section_3.png"))

# Warm accent (for CTA/pricing)
img = create_base_bg()
img = add_glow_circles(img, [
    (960, 540, 600, TEAL, 18),
    (400, 200, 300, EMERALD, 15),
    (1500, 800, 350, TEAL_LIGHT, 15),
])
img.convert('RGB').save(os.path.join(OUT, "bg_cta.png"))


# ═══════════════════════════════════════════════════════
# 3. CUSTOM ICON GRAPHICS (healthcare-themed shapes)
# ═══════════════════════════════════════════════════════
print("Creating icon graphics...")

def create_icon(filename, shapes_fn, bg_color=DARK_CARD, size=120):
    """Create a rounded icon image."""
    s = size * 3  # 3x for quality
    img = Image.new('RGBA', (s, s), (0,0,0,0))
    draw = ImageDraw.Draw(img)
    draw_rounded_rect(draw, (0, 0, s, s), s//6, bg_color + (230,))
    shapes_fn(draw, s)
    img = img.resize((size, size), Image.LANCZOS)
    img.save(os.path.join(OUT, filename))

def icon_heartbeat(draw, s):
    # Heart shape + pulse line
    cx, cy = s//2, s//2 - s//10
    r = s//4
    # Simple heart with two circles
    draw.ellipse([cx-r, cy-r//2, cx, cy+r//2], fill=ROSE + (200,))
    draw.ellipse([cx, cy-r//2, cx+r, cy+r//2], fill=ROSE + (200,))
    draw.polygon([(cx-r, cy), (cx+r, cy), (cx, cy+r)], fill=ROSE + (200,))
    # Pulse line
    pts = []
    mid = s//2 + s//4
    pts = [(s//6, mid), (s//3, mid), (s//3+s//12, mid-s//6), 
           (s//3+s//6, mid+s//8), (s//2, mid-s//4), (s//2+s//8, mid), 
           (5*s//6, mid)]
    draw.line(pts, fill=WHITE + (200,), width=max(3, s//40))

def icon_ai_brain(draw, s):
    cx, cy = s//2, s//2
    r = s//3
    # Brain shape (two halves)
    draw.ellipse([cx-r, cy-r+s//10, cx, cy+r//2], fill=PURPLE + (180,))
    draw.ellipse([cx, cy-r+s//10, cx+r, cy+r//2], fill=PURPLE + (150,))
    # Neural network dots
    for angle in range(0, 360, 45):
        rad = math.radians(angle)
        dx = int(cx + (r-20) * math.cos(rad))
        dy = int(cy + (r-20) * math.sin(rad))
        draw.ellipse([dx-8, dy-8, dx+8, dy+8], fill=TEAL_LIGHT + (200,))
    # Center
    draw.ellipse([cx-12, cy-12, cx+12, cy+12], fill=WHITE + (200,))

def icon_hospital(draw, s):
    cx, cy = s//2, s//2
    w, h = s//2, s*2//3
    x0 = cx - w//2
    y0 = cy - h//2 + s//8
    draw_rounded_rect(draw, (x0, y0, x0+w, y0+h), 15, TEAL + (180,))
    # Cross
    cw = w//4
    ch = h//3
    draw_rounded_rect(draw, (cx-cw//2, y0+h//6, cx+cw//2, y0+h//6+ch), 5, WHITE + (220,))
    draw_rounded_rect(draw, (cx-ch//2, y0+h//6+ch//2-cw//2, cx+ch//2, y0+h//6+ch//2+cw//2), 5, WHITE + (220,))

def icon_shield(draw, s):
    cx, cy = s//2, s//2
    w = s//2
    # Shield shape
    pts = [(cx, cy-w+s//10), (cx+w//2, cy-w//3+s//10), 
           (cx+w//2, cy+s//10), (cx, cy+w//2+s//10), 
           (cx-w//2, cy+s//10), (cx-w//2, cy-w//3+s//10)]
    draw.polygon(pts, fill=EMERALD + (180,))
    # Lock icon
    draw.ellipse([cx-20, cy-20, cx+20, cy+20], fill=WHITE + (200,))
    draw.rectangle([cx-8, cy, cx+8, cy+15], fill=EMERALD + (200,))

def icon_chart(draw, s):
    cx, cy = s//2, s//2
    # Bar chart
    bars = [(s//4, s*3//4, s//3, TEAL),
            (s//4+s//5, s*3//4, s//2, EMERALD),
            (s//4+2*s//5, s*3//4, s*2//5, BLUE),
            (s//4+3*s//5, s*3//4, s*3//5, TEAL_LIGHT)]
    for x, bottom, height, color in bars:
        draw_rounded_rect(draw, (x, bottom-height, x+s//7, bottom), 8, color + (200,))
    # Trend line
    draw.line([(s//5, s*2//3), (s//3, s//2), (s//2, s*3//5), (2*s//3, s//4), (4*s//5, s//3)], 
              fill=AMBER + (200,), width=max(3, s//50))

def icon_globe(draw, s):
    cx, cy = s//2, s//2
    r = s//3
    draw.ellipse([cx-r, cy-r, cx+r, cy+r], outline=BLUE + (180,), width=max(3, s//40))
    draw.ellipse([cx-r//2, cy-r, cx+r//2, cy+r], outline=BLUE + (130,), width=max(2, s//60))
    draw.line([(cx-r, cy), (cx+r, cy)], fill=BLUE + (130,), width=max(2, s//60))

def icon_stethoscope(draw, s):
    cx, cy = s//2, s//2
    # Tube
    draw.arc([cx-s//4, cy-s//3, cx+s//4, cy+s//6], 0, 180, fill=TEAL + (200,), width=max(4, s//30))
    # Earpieces
    draw.ellipse([cx-s//4-10, cy-s//3-10, cx-s//4+10, cy-s//3+10], fill=WHITE + (200,))
    draw.ellipse([cx+s//4-10, cy-s//3-10, cx+s//4+10, cy-s//3+10], fill=WHITE + (200,))
    # Chest piece
    draw.ellipse([cx-15, cy+s//6-5, cx+15, cy+s//6+25], fill=TEAL + (220,))
    draw.ellipse([cx-8, cy+s//6+2, cx+8, cy+s//6+18], fill=WHITE + (200,))

def icon_iot(draw, s):
    cx, cy = s//2, s//2
    # Central device
    draw.ellipse([cx-20, cy-20, cx+20, cy+20], fill=EMERALD + (200,))
    # Signal waves
    for i, r in enumerate([60, 100, 140]):
        alpha = 200 - i * 50
        draw.arc([cx-r, cy-r, cx+r, cy+r], 220, 320, fill=TEAL_LIGHT + (alpha,), width=max(3, s//50))
        draw.arc([cx-r, cy-r, cx+r, cy+r], 40, 140, fill=TEAL_LIGHT + (alpha,), width=max(3, s//50))
    # Small dots (connected devices)
    for angle in [45, 135, 225, 315]:
        rad = math.radians(angle)
        dx = int(cx + 130 * math.cos(rad))
        dy = int(cy + 130 * math.sin(rad))
        draw.ellipse([dx-10, dy-10, dx+10, dy+10], fill=BLUE + (180,))

def icon_radiology(draw, s):
    cx, cy = s//2, s//2
    # X-ray/scan frame
    draw_rounded_rect(draw, (cx-s//3, cy-s//3, cx+s//3, cy+s//3), 15, BLUE + (40,))
    draw_rounded_rect(draw, (cx-s//3, cy-s//3, cx+s//3, cy-s//3+20), 15, BLUE + (150,))
    # Bone/body shape (simplified)
    draw.ellipse([cx-25, cy-s//6, cx+25, cy+s//12], fill=WHITE + (100,))
    draw.rectangle([cx-8, cy+s//12, cx+8, cy+s//4], fill=WHITE + (80,))
    # Scan lines
    for y in range(cy-s//4, cy+s//4, 20):
        draw.line([(cx-s//3+10, y), (cx+s//3-10, y)], fill=BLUE + (30,), width=1)

# Create all icons
icons = [
    ("icon_heart.png", icon_heartbeat),
    ("icon_ai.png", icon_ai_brain),
    ("icon_hospital.png", icon_hospital),
    ("icon_shield.png", icon_shield),
    ("icon_chart.png", icon_chart),
    ("icon_globe.png", icon_globe),
    ("icon_stethoscope.png", icon_stethoscope),
    ("icon_iot.png", icon_iot),
    ("icon_radiology.png", icon_radiology),
]
for fname, fn in icons:
    create_icon(fname, fn, size=120)


# ═══════════════════════════════════════════════════════
# 4. FEATURE SECTION IMAGES (mockup-style panels)
# ═══════════════════════════════════════════════════════
print("Creating feature panels...")

def create_dashboard_mockup(filename, title, accent_color, elements='basic'):
    """Create a fake dashboard/app screenshot mockup."""
    w, h = 800, 500
    img = Image.new('RGBA', (w, h), (0,0,0,0))
    draw = ImageDraw.Draw(img)
    
    # Window frame
    draw_rounded_rect(draw, (0, 0, w, h), 16, DARK_CARD + (240,))
    # Title bar
    draw_rounded_rect(draw, (0, 0, w, 40), 16, (20, 30, 50, 240))
    # Window dots
    for i, c in enumerate([(255,95,87), (255,189,46), (39,201,63)]):
        draw.ellipse([15+i*22, 13, 27+i*22, 25], fill=c + (200,))
    
    # Title
    draw.text((w//2-60, 10), title, fill=WHITE + (200,))
    
    # Content based on type
    if elements == 'basic':
        # Sidebar
        draw_rounded_rect(draw, (10, 50, 180, h-10), 8, (15, 25, 45, 200))
        for i in range(6):
            y = 70 + i * 55
            draw_rounded_rect(draw, (20, y, 170, y+35), 6, accent_color + (40 + i*10,))
        # Main content cards
        for row in range(2):
            for col in range(3):
                x = 195 + col * 202
                y = 55 + row * 220
                draw_rounded_rect(draw, (x, y, x+192, y+200), 10, (25, 36, 55, 200))
                # Mini chart inside
                draw_rounded_rect(draw, (x+10, y+10, x+182, y+30), 6, accent_color + (60,))
                for bar in range(4):
                    bh = 30 + (bar * 20) % 80
                    bx = x + 20 + bar * 42
                    draw_rounded_rect(draw, (bx, y+180-bh, bx+30, y+180), 4, accent_color + (100 + bar*20,))
    
    elif elements == 'medical':
        # Vitals panel
        draw_rounded_rect(draw, (10, 50, w//2-5, h//2), 10, (25, 36, 55, 200))
        # ECG-like wave
        pts = []
        for x in range(30, w//2-25, 5):
            y_val = h//4 + int(30 * math.sin((x-30) * 0.08)) 
            if 200 < x < 220:
                y_val += int(60 * math.sin((x-200) * 0.3))
            pts.append((x, y_val))
        if len(pts) > 1:
            draw.line(pts, fill=EMERALD + (200,), width=2)
        
        # Stats cards
        for i in range(3):
            x = 10 + i * (w//2-20)//3
            draw_rounded_rect(draw, (x+5, h//2+10, x+(w//2-20)//3, h-15), 8, (25,36,55,200))
        
        # Right side - patient list
        draw_rounded_rect(draw, (w//2+5, 50, w-10, h-10), 10, (25, 36, 55, 200))
        for i in range(7):
            y = 65 + i * 60
            draw_rounded_rect(draw, (w//2+15, y, w-20, y+45), 6, (30, 42, 62, 180))
            draw.ellipse([w//2+20, y+5, w//2+55, y+40], fill=accent_color + (60,))
    
    elif elements == 'radiology':
        # DICOM viewer area
        draw_rounded_rect(draw, (10, 50, w*2//3-5, h-10), 10, (5, 10, 20, 220))
        # Scan image mockup (concentric circles for CT-like)
        cx, cy = (w*2//3-5)//2, (h+50)//2
        for r in range(120, 20, -15):
            alpha = 40 + (120-r)
            draw.ellipse([cx-r, cy-r, cx+r, cy+r], outline=WHITE + (alpha,), width=1)
        draw.ellipse([cx-30, cy-30, cx+30, cy+30], fill=WHITE + (40,))
        # Tools panel
        draw_rounded_rect(draw, (w*2//3+5, 50, w-10, h//2), 10, (25, 36, 55, 200))
        for i in range(4):
            y = 65 + i * 55
            draw_rounded_rect(draw, (w*2//3+15, y, w-20, y+40), 6, BLUE + (50,))
        # Info panel  
        draw_rounded_rect(draw, (w*2//3+5, h//2+10, w-10, h-10), 10, (25, 36, 55, 200))
        for i in range(4):
            y = h//2 + 25 + i * 45
            draw_rounded_rect(draw, (w*2//3+15, y, w-20, y+30), 4, (35, 46, 65, 180))

    elif elements == 'iot':
        # Central hub
        cx, cy = w//2, h//2 + 20
        draw.ellipse([cx-60, cy-60, cx+60, cy+60], fill=accent_color + (100,))
        draw.ellipse([cx-40, cy-40, cx+40, cy+40], fill=accent_color + (160,))
        # Connected devices around
        device_positions = [(150, 120), (650, 120), (100, 400), (700, 400), (400, 80), (400, 440)]
        for dx, dy in device_positions:
            draw.line([(cx, cy), (dx, dy)], fill=accent_color + (60,), width=2)
            draw_rounded_rect(draw, (dx-35, dy-25, dx+35, dy+25), 8, DARK_CARD + (220,))
            draw.ellipse([dx-8, dy-8, dx+8, dy+8], fill=accent_color + (180,))
        # Signal waves around hub
        for r in [90, 120, 150]:
            draw.ellipse([cx-r, cy-r, cx+r, cy+r], outline=accent_color + (40,), width=1)
    
    img.save(os.path.join(OUT, filename))

create_dashboard_mockup("mockup_dashboard.png", "Mediqzy Dashboard", TEAL, 'basic')
create_dashboard_mockup("mockup_clinical.png", "Clinical Workspace", EMERALD, 'medical')
create_dashboard_mockup("mockup_radiology.png", "RIS/PACS Viewer", BLUE, 'radiology')
create_dashboard_mockup("mockup_iot.png", "IoT Monitoring Hub", TEAL_LIGHT, 'iot')


# ═══════════════════════════════════════════════════════
# 5. ECOSYSTEM DIAGRAM
# ═══════════════════════════════════════════════════════
print("Creating ecosystem diagram...")
w, h = 1200, 800
img = Image.new('RGBA', (w, h), (0,0,0,0))
draw = ImageDraw.Draw(img)

# Central hub
cx, cy = w//2, h//2
draw.ellipse([cx-80, cy-80, cx+80, cy+80], fill=TEAL + (200,))
draw.ellipse([cx-55, cy-55, cx+55, cy+55], fill=DARK_BG + (240,))
# Cross in center
draw_rounded_rect(draw, (cx-4, cy-25, cx+4, cy+25), 3, TEAL + (220,))
draw_rounded_rect(draw, (cx-25, cy-4, cx+25, cy+4), 3, TEAL + (220,))

# Stakeholder nodes
nodes = [
    ("Patient", TEAL, 0), ("Doctor", EMERALD, 45), ("Hospital", BLUE, 90),
    ("Lab", PURPLE, 135), ("Pharmacy", ORANGE, 180), ("Corporate", ROSE, 225),
    ("Insurance", AMBER, 270), ("Admin", TEAL_LIGHT, 315),
]
radius = 280
for label, color, angle_deg in nodes:
    rad = math.radians(angle_deg - 90)
    nx = int(cx + radius * math.cos(rad))
    ny = int(cy + radius * math.sin(rad))
    # Connection line
    draw.line([(cx, cy), (nx, ny)], fill=color + (80,), width=2)
    # Node
    draw.ellipse([nx-45, ny-45, nx+45, ny+45], fill=color + (180,))
    draw.ellipse([nx-35, ny-35, nx+35, ny+35], fill=DARK_BG + (200,))

# Outer ring
draw.ellipse([cx-radius-20, cy-radius-20, cx+radius+20, cy+radius+20], 
             outline=TEAL + (30,), width=2)

img.save(os.path.join(OUT, "ecosystem_diagram.png"))


# ═══════════════════════════════════════════════════════
# 6. TECHNOLOGY ARCHITECTURE DIAGRAM 
# ═══════════════════════════════════════════════════════
print("Creating architecture diagram...")
w, h = 1100, 700
img = Image.new('RGBA', (w, h), (0,0,0,0))
draw = ImageDraw.Draw(img)

layers = [
    ("Apps & Portals", TEAL, 0),
    ("API Gateway & Security", EMERALD, 1),
    ("Microservice Layer", BLUE, 2),
    ("Event Bus / Cache / Queue", PURPLE, 3),
    ("Data Layer (PostgreSQL + Redis)", ORANGE, 4),
    ("AI / ML / Analytics Engine", ROSE, 5),
]

for label, color, idx in layers:
    y = 20 + idx * 105
    draw_rounded_rect(draw, (40, y, w-40, y+85), 12, color + (35,))
    draw_rounded_rect(draw, (40, y, 48, y+85), 12, color + (180,))
    draw.text((70, y+30), label, fill=WHITE + (220,))

img.save(os.path.join(OUT, "architecture_diagram.png"))


# ═══════════════════════════════════════════════════════
# 7. IMPACT/STATS BACKGROUND
# ═══════════════════════════════════════════════════════
print("Creating stats background...")
img = create_base_bg()
img = add_glow_circles(img, [
    (300, 400, 300, TEAL, 30),
    (960, 300, 400, EMERALD, 20),
    (1600, 500, 350, BLUE, 25),
])
# Hexagon pattern
hex_layer = Image.new('RGBA', (W, H), (0,0,0,0))
hdraw = ImageDraw.Draw(hex_layer)
for hx in range(0, W, 100):
    for hy in range(0, H, 87):
        offset = 50 if (hy // 87) % 2 else 0
        for i in range(6):
            angle = math.radians(60 * i + 30)
            next_angle = math.radians(60 * (i+1) + 30)
            x1 = int(hx + offset + 30 * math.cos(angle))
            y1 = int(hy + 30 * math.sin(angle))
            x2 = int(hx + offset + 30 * math.cos(next_angle))
            y2 = int(hy + 30 * math.sin(next_angle))
            hdraw.line([(x1, y1), (x2, y2)], fill=(255, 255, 255, 5), width=1)
img = Image.alpha_composite(img, hex_layer)
img.convert('RGB').save(os.path.join(OUT, "bg_stats.png"))


# ═══════════════════════════════════════════════════════
# 8. PROBLEM SLIDE BACKGROUND (warm/urgent tone)
# ═══════════════════════════════════════════════════════
print("Creating problem slide background...")
img = create_base_bg()
img = add_glow_circles(img, [
    (300, 300, 400, (180, 40, 40), 18),  # Red glow
    (1600, 700, 350, (200, 80, 20), 15),  # Orange glow
    (960, 500, 300, (150, 50, 50), 12),
])
img.convert('RGB').save(os.path.join(OUT, "bg_problem.png"))

# ═══════════════════════════════════════════════════════
# 9. CASE STUDY / IMPACT TEMPLATE
# ═══════════════════════════════════════════════════════
print("Creating case study background...")
img = create_base_bg()
img = add_glow_circles(img, [
    (200, 200, 300, TEAL, 25),
    (1700, 800, 350, EMERALD, 20),
    (960, 540, 500, TEAL_DARK, 10),
])
# Subtle bar at bottom
draw = ImageDraw.Draw(img)
draw_rounded_rect(draw, (0, H-6, W, H), 0, TEAL + (150,))
img.convert('RGB').save(os.path.join(OUT, "bg_impact.png"))


print(f"\n✅ All custom assets created in: {OUT}")
print(f"   Files: {sorted(os.listdir(OUT))}")
