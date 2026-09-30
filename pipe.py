import sys, io, base64, urllib.request
import numpy as np
from PIL import Image, ImageEnhance
CW, CH, TH = 40, 24, 23
LIFT = 0.36

def keybg(im):
    """opaque 배경이면 테두리 색으로 배경 제거"""
    a = np.asarray(im.convert('RGBA')).copy()
    if (a[..., 3] < 30).mean() > 0.2: return Image.fromarray(a)
    rgb = a[..., :3].astype(np.int32)
    edge = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
    bg = np.median(edge, 0)
    d = np.abs(rgb - bg).sum(-1)
    a[..., 3] = np.where(d < 40, 0, 255).astype(np.uint8)
    return Image.fromarray(a)

def dil(m):
    o = m.copy()
    o[1:] |= m[:-1]; o[:-1] |= m[1:]; o[:, 1:] |= m[:, :-1]; o[:, :-1] |= m[:, 1:]
    return o

def label(m):
    h, w = m.shape; lab = np.zeros((h, w), np.int32); n = 0; sizes = []
    for y in range(h):
        for x in range(w):
            if m[y, x] and not lab[y, x]:
                n += 1; st = [(y, x)]; lab[y, x] = n; c = 0
                while st:
                    cy, cx = st.pop(); c += 1
                    for ny, nx in ((cy+1, cx), (cy-1, cx), (cy, cx+1), (cy, cx-1)):
                        if 0 <= ny < h and 0 <= nx < w and m[ny, nx] and not lab[ny, nx]:
                            lab[ny, nx] = n; st.append((ny, nx))
                sizes.append(c)
    return lab, sizes

def premul_resize(im, w, h):
    a = np.asarray(im.convert('RGBA')).astype(np.float32) / 255
    rgb = a[..., :3] * a[..., 3:4]
    big = np.concatenate([rgb, a[..., 3:4]], -1)
    ch = [np.asarray(Image.fromarray((big[..., i] * 255).astype(np.uint8)).resize((w, h), Image.BOX)).astype(np.float32) / 255 for i in range(4)]
    s = np.stack(ch, -1); al = s[..., 3:4]
    rgb = np.where(al > 0.01, s[..., :3] / np.maximum(al, 1e-3), 0)
    return np.concatenate([np.clip(rgb, 0, 1), al], -1)

def pixelize(im, w, h, colors=40, thr=0.45, sat=1.1, con=1.06):
    s = premul_resize(im, w, h)
    mask = s[..., 3] > thr
    lum = (s[..., :3] @ np.array([0.299, 0.587, 0.114]))[mask]
    if lum.size and lum.mean() < LIFT:
        g = np.log(LIFT) / np.log(max(lum.mean(), 0.05)); s[..., :3] = s[..., :3] ** g
    rgb = (s[..., :3] * 255).astype(np.uint8)
    img = ImageEnhance.Contrast(ImageEnhance.Color(Image.fromarray(rgb)).enhance(sat)).enhance(con)
    q = np.asarray(img.quantize(colors=colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert('RGB'))
    # 떨어진 1~2픽셀 부스러기 제거
    lab, sz = label(mask)
    if sz:
        big = max(sz)
        for i, z in enumerate(sz, 1):
            if z < max(3, big * 0.04): mask[lab == i] = False
    out = np.zeros((h, w, 4), np.uint8); out[..., :3] = q; out[..., 3] = mask * 255
    edge = dil(mask) & ~mask; out[edge] = [12, 10, 14, 255]
    return Image.fromarray(out, 'RGBA')

def frames(im):
    a = np.asarray(im)[..., 3] > 30; col = a.any(0)
    segs = []; x = 0; n = len(col)
    while x < n:
        if col[x]:
            s = x; gap = 0
            while x < n and (col[x] or gap < 8):
                gap = 0 if col[x] else gap + 1; x += 1
            e = x - gap
            if e - s >= 20: segs.append((s, e))
        else: x += 1
    segs = sorted(sorted(segs, key=lambda s: -(s[1] - s[0]))[:4])
    cov = a.sum(0)
    while 0 < len(segs) < 4:
        segs.sort(key=lambda s: -(s[1] - s[0])); s, e = segs.pop(0); L = e - s
        k = max(1, round(L / (sum(t[1]-t[0] for t in segs + [(s, e)]) / 4)))
        k = min(k, 4 - len(segs))
        if k < 2: k = 2
        cuts = [s]
        for j in range(1, k):
            c = s + L * j // k; lo, hi = c - L // (3 * k), c + L // (3 * k)
            cuts.append(lo + int(np.argmin(cov[lo:hi])))
        cuts.append(e)
        segs += [(cuts[j], cuts[j + 1]) for j in range(k)]
        segs = sorted(segs)
    if len(segs) != 4: raise Exception('segs=%d' % len(segs))
    out = []
    for s, e in segs:
        sub = a[:, s:e]; ys = np.nonzero(sub.any(1))[0]
        out.append((im.crop((s, ys.min(), e, ys.max() + 1)), ys.min(), ys.max() + 1))
    top = min(f[1] for f in out); bot = max(f[2] for f in out)
    # 모든 프레임 발끝 기준, 같은 배율
    return [(im.crop((s, top, e, bot))) for (s, e) in segs], bot - top

def row(im, th=TH):
    fr, H0 = frames(im); sc = th / H0; res = Image.new('RGBA', (CW * 4, CH))
    for k, f in enumerate(fr):
        a = np.asarray(f)[..., 3] > 30; xs = np.nonzero(a.any(0))[0]
        f = f.crop((xs.min(), 0, xs.max() + 1, f.size[1]))
        w = max(1, round(f.size[0] * sc)); h = max(1, round(f.size[1] * sc))
        px = pixelize(f, w, h)
        m = (np.asarray(px)[..., 3] > 0).sum(0); cs = np.cumsum(m)
        if k < 3: anc = int(np.searchsorted(cs, cs[-1] / 2)); ox = CW // 2 - anc
        else: anc = int(np.searchsorted(cs, cs[-1] * 0.35)); ox = CW // 2 - 2 - anc
        ox = max(0, min(CW - w, ox)) if w <= CW else (CW - w) // 2
        cell = Image.new('RGBA', (CW, CH)); cell.paste(px, (ox, CH - h), px)
        res.alpha_composite(cell, (k * CW, 0))
    return res

if __name__ == '__main__':
    for arg in sys.argv[1:]:
        name, srcs = arg.split('=', 1); srcs = srcs.split(',')
        blk = Image.new('RGBA', (CW * 4, CH * len(srcs)))
        for i, src in enumerate(srcs):
            if src == '-': continue
            try:
                data = urllib.request.urlopen(src, timeout=60).read(); im = keybg(Image.open(io.BytesIO(data)).convert('RGBA'))
                blk.alpha_composite(row(im), (0, i * CH))
            except Exception as ex:
                print('ERR', name, i, repr(ex))
        q = blk.quantize(colors=128, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
        b = io.BytesIO(); q.save(b, 'PNG', optimize=True)
        print('ROW', name, base64.b64encode(b.getvalue()).decode())
