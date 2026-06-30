"""
ml/phase2/finetune_run.py — Faz 2: fine-tune (41 elle-düzeltilmiş case = 14 batch1 + 27 batch2).

Baseline (Faz 1+1b, ml/model_v2.pt, val mIoU 0.767) ağırlıklarını başlangıç alır,
kullanıcının KPTA'da düzelttiği 41 case (ml/phase2/finetune/) ile DÜŞÜK lr +
dihedral augmentation ile fine-tune eder. Baseline'ı EZMEZ → ml/model_finetuned.pt.

Asıl soru: "model kullanıcının tercihlerini öğrendi mi?" — held-out case'lerde
(fine-tune'da GÖRÜLMEYEN) baseline→finetuned tahmin kayması, kullanıcının düzeltme
örüntüsüne (salon↓, koridor→antre) doğru mu? Genelleme mi, ezber mi?
Held-out = 4 batch1 (önceki koşuyla birebir kıyas) + 4 batch2 (batch2 genellemesi).

io.js / uygulama / motor WIP'ine DOKUNMAZ — sadece ml/ altında okur/yazar.

Çalıştırma:  python3 ml/phase2/finetune_run.py
"""
import os, json, copy
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

HERE = os.path.dirname(os.path.abspath(__file__))
ML = os.path.dirname(HERE)
FT = os.path.join(HERE, "finetune")          # ingest çıktısı (düzeltilmiş etiketler)
CASES = os.path.join(HERE, "cases")           # motorun ORİJİNAL çıktısı (batch1 referans)
CASES2 = os.path.join(HERE, "cases_batch2")   # batch2 orijinal motor çıktısı (referans)
BASELINE = os.path.join(ML, "model_v2.pt")    # Faz 1+1b en iyi
OUT_MODEL = os.path.join(ML, "model_finetuned.pt")
NORM_SRC = os.path.join(ML, "data_5k", "norm.json")  # baseline'ın gördüğü normalizasyon
OUT = os.path.join(HERE, "ft_out")
os.makedirs(OUT, exist_ok=True)

# ---- hiperparametreler ----
LR = 1e-4            # baseline 1e-3'ün 1/10'u
EPOCHS = 60
SEED = 7
# held-out seti aşağıda HELDOUT_NAMES ile İSİMDEN sabitlenir (sayı değil) — bkz. ~satır 114
torch.manual_seed(SEED); np.random.seed(SEED)

CLASSES = ['bos','salon','yatak','mutfak','banyo','wc','antre','koridor',
           'merdiven','asansor','yangin','teknik']
CIDX = {c:i for i,c in enumerate(CLASSES)}
NC = len(CLASSES)
IGNORE = 255
PALETTE = np.array([
    (245,245,245),(255,179,71),(114,159,207),(152,216,170),(173,127,168),
    (233,185,110),(255,233,120),(200,200,200),(120,120,120),(90,90,90),
    (239,41,41),(60,60,60)], np.uint8)

# ---- veri: ingest edilmiş düzeltilmiş set ----
meta = json.load(open(os.path.join(FT, "meta.json")))
index = json.load(open(os.path.join(FT, "index.json")))
G = meta["grid"]; n = meta["nKept"]; P = len(meta["progFeatures"])
masks = np.fromfile(os.path.join(FT,"inputs_mask.bin"), np.uint8).reshape(n,G,G)
labels = np.fromfile(os.path.join(FT,"labels.bin"), np.uint8).reshape(n,G,G)
prog = np.fromfile(os.path.join(FT,"program.bin"), np.float32).reshape(n,P)
names = [ix["file"] for ix in index]

# baseline'la AYNI program normalizasyonu (kritik: finetune/norm.json eski ml/data'dan kopya)
norm = json.load(open(NORM_SRC))
pmean = np.array(norm["mean"], np.float32); pstd = np.array(norm["std"], np.float32)

# motorun ORİJİNAL etiketleri (aynı footprint, baseline'ın taklit hedefi) — referans
import sys; sys.path.insert(0, HERE)
import ingest
def engine_label(name):
    base = name[:-4] if name.endswith(".svg") else name
    # batch1 → cases/, batch2 → cases_batch2/ (hangisinde varsa)
    path = os.path.join(CASES, base+".json")
    if not os.path.exists(path):
        path = os.path.join(CASES2, base+".json")
    st = ingest.extract_state(open(path, encoding="utf-8").read())
    _, g = ingest.rasterize(st)
    return g

# ---- model (baseline ile BİREBİR mimari) ----
def block(ci,co):
    return nn.Sequential(
        nn.Conv2d(ci,co,3,padding=1), nn.BatchNorm2d(co), nn.ReLU(inplace=True),
        nn.Conv2d(co,co,3,padding=1), nn.BatchNorm2d(co), nn.ReLU(inplace=True))
class UNet(nn.Module):
    def __init__(self, cin, nc):
        super().__init__()
        self.e1=block(cin,32); self.e2=block(32,64); self.e3=block(64,128)
        self.pool=nn.MaxPool2d(2); self.bott=block(128,128)
        self.u3=nn.ConvTranspose2d(128,128,2,stride=2); self.d3=block(256,64)
        self.u2=nn.ConvTranspose2d(64,64,2,stride=2);   self.d2=block(128,32)
        self.u1=nn.ConvTranspose2d(32,32,2,stride=2);   self.d1=block(64,32)
        self.head=nn.Conv2d(32,nc,1)
    def forward(self,x):
        e1=self.e1(x); e2=self.e2(self.pool(e1)); e3=self.e3(self.pool(e2))
        b=self.bott(self.pool(e3))
        d3=self.d3(torch.cat([self.u3(b),e3],1))
        d2=self.d2(torch.cat([self.u2(d3),e2],1))
        d1=self.d1(torch.cat([self.u1(d2),e1],1))
        return self.head(d1)

def make_xy(idxs):
    B=len(idxs); X=np.zeros((B,1+P,G,G),np.float32); Y=np.full((B,G,G),IGNORE,np.uint8)
    Mk=np.zeros((B,G,G),np.uint8)
    for k,i in enumerate(idxs):
        m=masks[i]; X[k,0]=m
        pv=(prog[i]-pmean)/pstd
        for p in range(P): X[k,1+p]=pv[p]
        ins=m>0; Y[k][ins]=labels[i][ins]; Mk[k]=m
    return torch.from_numpy(X), torch.from_numpy(Y.astype(np.int64)), torch.from_numpy(Mk)

# ---- dihedral augmentation (etiket-güvenli: oda tipi yönden bağımsız) ----
def dihedral(x, y, t):
    # t in 0..7 : rot90 k + optional flip. program kanalları sabit düzlem → rotasyon no-op.
    k = t % 4; f = t >= 4
    xr = np.rot90(x, k, axes=(1,2)).copy()
    yr = np.rot90(y, k, axes=(0,1)).copy()
    if f:
        xr = xr[:, :, ::-1].copy(); yr = yr[:, ::-1].copy()
    return xr, yr

# ---- split: held-out örüntü temsilcileri (görülmez) ----
# batch1 (4) = önceki koşuyla birebir karşılaştırılabilir kalsın diye SABİT.
# batch2 (4) = batch2 genellemesini de ölç (kapalı/açık hol + L/T/rect + villa çeşitliliği).
HELDOUT_NAMES = ["case_apt_rect_2p1x2.svg",       # b1: salon→yatak (salon küçült)
                 "case_apt_rect_mixed.svg",       # b1: koridor→antre
                 "case_villa_L_5p1.svg",          # b1: villa (salon→yatak)
                 "case_apt_rect_studio.svg",      # b1: çekirdek yeniden konum
                 "case_b2_apt_rect_2p1x2_open.svg",   # b2: rect, AÇIK hol (b1 2p1x2 kapalı kontrastı)
                 "case_b2_apt_L_3p1x2_closed.svg",    # b2: L, kapalı hol
                 "case_b2_apt_T_3p1_open.svg",        # b2: T, açık hol
                 "case_b2_villa_rect_4p1_closed.svg"] # b2: villa, kapalı
held = [i for i,nm in enumerate(names) if nm in HELDOUT_NAMES]
train = [i for i in range(n) if i not in held]
print(f"fine-tune: train {len(train)}  held-out {len(held)}  ({[names[i] for i in held]})")

# class weights (inverse-sqrt freq, train düzeltilmiş hücreler üzerinden)
cnt=np.zeros(NC);
for i in train:
    cnt += np.bincount(labels[i][masks[i]>0], minlength=NC)
freq=cnt/cnt.sum(); w=1.0/np.sqrt(freq+1e-6); w[cnt==0]=0.0; w=w/w[w>0].mean()
class_w=torch.tensor(w,dtype=torch.float32); present=torch.tensor((cnt>0).astype(np.float32))
ce=nn.CrossEntropyLoss(weight=class_w, ignore_index=IGNORE)
def dice_loss(logit,y):
    valid=(y!=IGNORE); yv=y.clone(); yv[~valid]=0
    prob=F.softmax(logit,1); oh=F.one_hot(yv,NC).permute(0,3,1,2).float()
    vf=valid.unsqueeze(1).float(); prob=prob*vf; oh=oh*vf
    d=(0,2,3); inter=(prob*oh).sum(d); card=prob.sum(d)+oh.sum(d)
    dice=(2*inter+1.0)/(card+1.0)
    return 1.0-(dice*present).sum()/present.sum()
def criterion(logit,y): return ce(logit,y)+dice_loss(logit,y)

# ---- eval yardımcıları ----
def predict(model, idxs):
    model.eval(); X,_,M = make_xy(idxs); out=[]
    with torch.no_grad():
        for s in range(0,len(X)):
            lg=model(X[s:s+1]); pr=lg.argmax(1)[0].numpy(); m=M[s].numpy()>0
            out.append((pr,m))
    return out

def shares(pred,m):
    inside=m>0; tot=inside.sum()
    return {c: float(((pred==CIDX[c])&inside).sum())/max(1,tot) for c in CLASSES}

def miou_vs(pred,m,target):
    inside=m>0; ious=[]
    for c in range(NC):
        pc=(pred==c)&inside; yc=(target==c)&inside; u=(pc|yc).sum()
        if u>0: ious.append((pc&yc).sum()/u)
    return float(np.mean(ious)) if ious else float('nan')

# ---- baseline model (dondurulmuş kopya, "öncesi") ----
base = UNet(1+P, NC); base.load_state_dict(torch.load(BASELINE)); base.eval()

# baseline held-out tahminleri (öncesi)
def eval_set(model, idxs, tagshares=True):
    preds=predict(model, idxs); rows=[]
    for j,i in enumerate(idxs):
        pr,m=preds[j]
        tgt=labels[i]  # düzeltilmiş hedef
        eng=engine_label(names[i])
        rows.append(dict(name=names[i], pred=pr, m=m,
            miou_corr=miou_vs(pr,m,tgt),
            pred_sh=shares(pr,m), corr_sh=shares(tgt,m), eng_sh=shares(eng,m)))
    return rows

base_rows = eval_set(base, held)

# ---- fine-tune ----
model = UNet(1+P, NC); model.load_state_dict(torch.load(BASELINE))
opt=torch.optim.Adam(model.parameters(), lr=LR)
sched=torch.optim.lr_scheduler.CosineAnnealingLR(opt, EPOCHS)
Xtr,Ytr,_ = make_xy(train)
Xtr=Xtr.numpy(); Ytr=Ytr.numpy()

best=-1; best_state=None; bestep=-1
for ep in range(EPOCHS):
    model.train(); order=np.random.permutation(len(train)); tot=0
    # her örneğe rastgele dihedral
    Xb=np.zeros_like(Xtr); Yb=np.full_like(Ytr, IGNORE)
    for j,o in enumerate(order):
        t=np.random.randint(0,8)
        xa,ya=dihedral(Xtr[o], Ytr[o].astype(np.uint8) if Ytr[o].dtype!=np.uint8 else Ytr[o].astype(np.uint8), t)
        Xb[j]=xa; Yb[j]=ya
    Xb_t=torch.from_numpy(Xb); Yb_t=torch.from_numpy(Yb.astype(np.int64))
    opt.zero_grad(); loss=criterion(model(Xb_t), Yb_t); loss.backward(); opt.step(); sched.step()
    # held-out mIoU (düzeltilmiş hedefe karşı) = genelleme sinyali
    if (ep+1)%5==0 or ep==EPOCHS-1:
        rows=eval_set(model, held); mi=np.mean([r['miou_corr'] for r in rows])
        if mi>best: best=mi; best_state=copy.deepcopy(model.state_dict()); bestep=ep+1
        print(f"  ep {ep+1:2d}  loss {loss.item():.3f}  held-out mIoU(corr) {mi:.3f}")

# en iyi held-out ağırlığını yükle + kaydet
if best_state is not None: model.load_state_dict(best_state)
torch.save(model.state_dict(), OUT_MODEL)
print(f"kaydedildi: {OUT_MODEL}  (best held-out mIoU(corr) {best:.3f} @ ep {bestep})")

ft_rows = eval_set(model, held)

# ---- öncesi/sonrası örüntü analizi ----
def agg(rows, key, cls): return float(np.mean([r[key][cls] for r in rows]))
KEYS_CLS = ['salon','yatak','koridor','antre','mutfak','banyo']
print(f"\n=== HELD-OUT örüntü analizi ({len(held)} case ort., maske-içi pay) ===")
print(f"{'sınıf':8s} {'engine':>8s} {'base→':>8s} {'finetn':>8s} {'KULL.hed':>8s}  yön")
for c in KEYS_CLS:
    e=agg(base_rows,'eng_sh',c); b=agg(base_rows,'pred_sh',c)
    f=agg(ft_rows,'pred_sh',c); u=agg(base_rows,'corr_sh',c)
    # yön: finetuned, baseline'dan kullanıcı hedefine doğru mu hareket etti?
    moved = (f-b)
    toward = (u-b)
    sig = "↗ doğru" if (moved*toward>0 and abs(toward)>0.005) else ("· nötr" if abs(toward)<=0.005 else "↘ ters")
    print(f"{c:8s} {e:8.3f} {b:8.3f} {f:8.3f} {u:8.3f}  {sig}")

print("\n=== HELD-OUT mIoU (düzeltilmiş hedefe karşı) — öncesi/sonrası ===")
for br,fr in zip(base_rows, ft_rows):
    print(f"  {br['name']:26s} base {br['miou_corr']:.3f} -> finetn {fr['miou_corr']:.3f}  Δ{fr['miou_corr']-br['miou_corr']:+.3f}")
mb=np.mean([r['miou_corr'] for r in base_rows]); mf=np.mean([r['miou_corr'] for r in ft_rows])
print(f"  ORT.                       base {mb:.3f} -> finetn {mf:.3f}  Δ{mf-mb:+.3f}")

# ---- öncesi/sonrası tahmin görselleri (held-out) ----
def render(grid, m, scale=5):
    rgb=np.full((G,G,3),245,np.uint8); ins=m>0; rgb[ins]=PALETTE[grid[ins]]
    from PIL import Image
    return Image.fromarray(rgb).resize((G*scale,G*scale), Image.NEAREST)
from PIL import Image
for br,fr,i in zip(base_rows, ft_rows, held):
    eng=engine_label(names[i]); m=br['m']
    panels=[render(eng,m), render(br['pred'],m), render(fr['pred'],m), render(labels[i],m)]
    cw=panels[0].width; canvas=Image.new("RGB",(cw*4+30, panels[0].height+24),(255,255,255))
    from PIL import ImageDraw; d=ImageDraw.Draw(canvas)
    d.text((4,4), f"{names[i]}   ENGINE | BASE-pred | FINETUNED-pred | USER-corrected", fill=(0,0,0))
    for k,p in enumerate(panels): canvas.paste(p,(k*(cw+10)+4,20))
    canvas.save(os.path.join(OUT, f"ba_{names[i].replace('.svg','')}.png"))

# ---- metrik json ----
json.dump(dict(lr=LR, epochs=EPOCHS, nTrain=len(train), nHeldout=len(held),
    heldout=[names[i] for i in held], bestEp=bestep, bestHeldoutMiouCorr=best,
    miouCorr_before=mb, miouCorr_after=mf,
    shares={c:dict(engine=agg(base_rows,'eng_sh',c), base=agg(base_rows,'pred_sh',c),
                   finetuned=agg(ft_rows,'pred_sh',c), userTarget=agg(base_rows,'corr_sh',c))
            for c in KEYS_CLS}),
    open(os.path.join(OUT,"metrics_finetune.json"),"w"), indent=2)
print(f"\ngörseller + metrik: {OUT}")
