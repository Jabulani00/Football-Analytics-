# ============================================================================
#  Trainer v2 — feature engineering + LightGBM + calibration + edge analysis
#  Paste into one Kaggle cell. Same CSV. Change TARGET to pick the market.
# ============================================================================
import glob, numpy as np, pandas as pd
from lightgbm import LGBMClassifier
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import roc_auc_score, accuracy_score, log_loss, brier_score_loss

TARGET = "y_over_2_5"     # try also: y_btts, y_over_1_5, y_over_3_5, y_home_win

path = next(iter(glob.glob("/kaggle/input/**/training_data.csv", recursive=True)
                 + glob.glob("training_data.csv")), "training_data.csv")
df = pd.read_csv(path)

IDS = ["fixture_id","date","competition_id","competition","season",
       "home_id","home_team","away_id","away_team"]
TARGETS = [c for c in df.columns if c.startswith("y_")]
d = df.dropna(subset=[TARGET]).reset_index(drop=True)
X = d.drop(columns=IDS + TARGETS).apply(pd.to_numeric, errors="coerce").fillna(0)

# ---- feature engineering: the signals a human handicapper actually uses ------
def g(c): return X[c] if c in X else 0
# expected goals each way: home attack vs away defence, and vice-versa.
X["xg_home"]      = (g("h_ovr_gf_avg") + g("a_ovr_ga_avg")) / 2
X["xg_away"]      = (g("a_ovr_gf_avg") + g("h_ovr_ga_avg")) / 2
X["xg_total"]     = X["xg_home"] + X["xg_away"]                 # expected total goals
X["xg_total_ven"] = (g("h_home_gf_avg") + g("a_away_ga_avg")
                     + g("a_away_gf_avg") + g("h_home_ga_avg")) / 2
X["xg_diff"]      = X["xg_home"] - X["xg_away"]                 # expected supremacy
# both-sides agreement on the market itself.
X["over25_both"]  = (g("h_ovr_over_2_5_pct") + g("a_ovr_over_2_5_pct")) / 2
X["btts_both"]    = (g("h_ovr_btts_pct")     + g("a_ovr_btts_pct"))     / 2
X["goals_both"]   = (g("h_ovr_goals_avg")    + g("a_ovr_goals_avg"))    / 2
X["attack_sum"]   = g("h_ovr_gf_avg") + g("a_ovr_gf_avg")
X["defence_leak"] = g("h_ovr_ga_avg") + g("a_ovr_ga_avg")
X["ppg_gap"]      = g("h_ovr_ppg") - g("a_ovr_ppg")

y = d[TARGET].astype(int).values

# ---- time split: train 0-70% · calibrate 70-80% · test 80-100% --------------
order = np.argsort(d["date"].values)
n = len(order); a, b = int(n*0.70), int(n*0.80)
tr, ca, te = order[:a], order[a:b], order[b:]

base = LGBMClassifier(n_estimators=700, learning_rate=0.03, num_leaves=48,
                      subsample=0.9, colsample_bytree=0.8, min_child_samples=80, n_jobs=-1)
base.fit(X.iloc[tr], y[tr])
# calibrate probabilities on the held-out slice so 0.70 really means ~70%.
model = CalibratedClassifierCV(base, cv="prefit", method="isotonic")
model.fit(X.iloc[ca], y[ca])

p = model.predict_proba(X.iloc[te])[:, 1]
yt = y[te]
bse = max(yt.mean(), 1 - yt.mean())
print(f"Test rows {len(yt)} | base rate {bse:.3f}")
print(f"AUC      {roc_auc_score(yt, p):.3f}")
print(f"Accuracy {accuracy_score(yt, p > 0.5):.3f}")
print(f"LogLoss  {log_loss(yt, p):.3f}")
print(f"Brier    {brier_score_loss(yt, p):.3f}  (lower = better calibrated)")

# ---- calibration check: predicted prob vs actual hit-rate, by decile --------
dec = pd.DataFrame({"p": p, "y": yt})
dec["bucket"] = pd.qcut(dec["p"], 10, duplicates="drop")
print("\nReliability (predicted vs actual):")
print(dec.groupby("bucket", observed=True).agg(pred=("p","mean"), actual=("y","mean"), n=("y","size")).round(3).to_string())

# ---- where is the edge? hit-rate when the model is confident ----------------
print("\nEdge by confidence threshold (predict YES when p ≥ t):")
for t in [0.55, 0.60, 0.65, 0.70, 0.75]:
    m = p >= t
    if m.sum():
        print(f"  p≥{t:.2f}:  bets {m.sum():5d}  hit-rate {yt[m].mean():.3f}  (vs base {yt.mean():.3f})")

imp = pd.Series(base.feature_importances_, index=X.columns).sort_values(ascending=False)
print("\nTop features:\n", imp.head(15).to_string())

base.booster_.save_model(f"model_{TARGET}.txt")
pd.Series(list(X.columns)).to_csv("feature_order.csv", index=False, header=False)
print(f"\nSaved model_{TARGET}.txt + feature_order.csv")
