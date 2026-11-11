# ============================================================================
#  Football match-outcome trainer  —  for the Odds-APP training_data.csv
#  Paste this whole file into one Kaggle notebook cell and run it.
#  Switch what you predict by changing TARGET below.
# ============================================================================
import numpy as np, pandas as pd
from xgboost import XGBClassifier, XGBRegressor
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import (roc_auc_score, accuracy_score, log_loss,
                             mean_absolute_error, mean_squared_error, classification_report)

# ----------------------------------------------------------------------------
# 0) Config — pick ONE target to predict.
#    binary : y_btts  y_over_1_5  y_over_2_5  y_over_3_5  y_home_win  y_draw  y_away_win  y_ht_btts
#    3-class: y_result  y_1h_result
#    number : y_total_goals  y_home_goals  y_away_goals  y_goal_diff  y_2h_total
TARGET = "y_over_2_5"

# On Kaggle the file lands under /kaggle/input/<your-dataset-slug>/. Auto-find it:
import glob, os
path = next(iter(glob.glob("/kaggle/input/**/training_data.csv", recursive=True)
                 + glob.glob("training_data.csv")), "training_data.csv")
print("Loading:", path)
df = pd.read_csv(path)
print("Rows:", len(df), "Cols:", df.shape[1])

# ----------------------------------------------------------------------------
# 1) Build X (features) and y (label). Drop identifiers and EVERY other target.
IDS = ["fixture_id","date","competition_id","competition","season",
       "home_id","home_team","away_id","away_team"]
TARGETS = [c for c in df.columns if c.startswith("y_")]

data = df.dropna(subset=[TARGET]).reset_index(drop=True)          # some targets are blank (no HT score)
X = data.drop(columns=IDS + TARGETS).apply(pd.to_numeric, errors="coerce").fillna(0)
y_raw = data[TARGET]

kind = ("multiclass" if y_raw.dtype == object
        else "binary" if set(pd.unique(y_raw)) <= {0, 1}
        else "regression")
print("Target:", TARGET, "| type:", kind, "| usable rows:", len(data))

# ----------------------------------------------------------------------------
# 2) TIME-BASED split — train on the past, test on the most recent 20%.
#    (Never shuffle football: a random split leaks future form into training.)
order = np.argsort(data["date"].values)     # chronological order
cut = int(len(order) * 0.8)
tr, te = order[:cut], order[cut:]            # oldest 80% train, newest 20% test
Xtr, Xte = X.iloc[tr], X.iloc[te]

# ----------------------------------------------------------------------------
# 3) Train + evaluate.
if kind == "regression":
    model = XGBRegressor(n_estimators=500, max_depth=4, learning_rate=0.04,
                         subsample=0.9, colsample_bytree=0.8, n_jobs=-1)
    model.fit(Xtr, y_raw.iloc[tr])
    pred = model.predict(Xte)
    print(f"MAE  {mean_absolute_error(y_raw.iloc[te], pred):.3f}")
    print(f"RMSE {mean_squared_error(y_raw.iloc[te], pred) ** 0.5:.3f}")

else:
    enc = LabelEncoder().fit(y_raw)
    y = enc.transform(y_raw)
    objective = "multi:softprob" if kind == "multiclass" else "binary:logistic"
    model = XGBClassifier(n_estimators=500, max_depth=4, learning_rate=0.04,
                          subsample=0.9, colsample_bytree=0.8, n_jobs=-1,
                          objective=objective, eval_metric="mlogloss" if kind=="multiclass" else "logloss")
    model.fit(Xtr, y[tr])
    proba = model.predict_proba(Xte)
    pred = proba.argmax(1)
    print(f"Accuracy {accuracy_score(y[te], pred):.3f}")
    print(f"LogLoss  {log_loss(y[te], proba):.3f}")
    if kind == "binary":
        print(f"ROC-AUC  {roc_auc_score(y[te], proba[:,1]):.3f}")
        base = max(y[te].mean(), 1 - y[te].mean())
        print(f"(base rate to beat: {base:.3f})")
    print("\nClasses:", list(enc.classes_))
    print(classification_report(y[te], pred, target_names=[str(c) for c in enc.classes_]))

# ----------------------------------------------------------------------------
# 4) What's driving it — top 20 features.
imp = pd.Series(model.feature_importances_, index=X.columns).sort_values(ascending=False)
print("\nTop features:\n", imp.head(20).round(4).to_string())

# ----------------------------------------------------------------------------
# 5) Save the model + the exact feature order (reuse both to predict new fixtures).
model.save_model(f"model_{TARGET}.json")
pd.Series(list(X.columns)).to_csv("feature_order.csv", index=False, header=False)
print(f"\nSaved model_{TARGET}.json and feature_order.csv (in the notebook output).")

# ----------------------------------------------------------------------------
# 6) Predict an upcoming fixture:
#    build a 1-row DataFrame with the SAME feature columns (each team's pre-match
#    form, same stat names), then:
#
#    feats = pd.read_csv("feature_order.csv", header=None)[0].tolist()
#    new = pd.DataFrame([{ ...your features... }]).reindex(columns=feats).fillna(0)
#    p = model.predict_proba(new)[0]        # classifier → probabilities
#    print(dict(zip(enc.classes_, p.round(3))))
