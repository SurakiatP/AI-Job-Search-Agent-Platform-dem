"""Builds data/gold.holdout.v1.json: 20 personas the prompts were never tuned on (different names, employers,
schools, numbers and skill rotation, same families). Run: python3 evals/gold/build_holdout.py"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import build_dataset as b

OUT = Path(__file__).parent / "data" / "gold.holdout.v1.json"
VARIANTS = [
    dict(pfx="h", jpfx="k", shift=3, rot=2,
         orgs=["Quartz Labs", "Jade Retail", "Ember Bank", "Tidal Logistics", "Maple Foods", "Helix Health", "Nova Telecom", "Crest Insurance", "Loom Studio", "Ridge Energy"],
         prev=["Alder Co.", "Fable Systems", "Granite Group", "Hazel Trading", "Ivy Software", "Juno Media", "Kestrel Partners", "Lark Works", "Moss Digital", "Nectar Finance"],
         names=["Chai Montri", "Dao Rungrot", "Fah Saeng", "Gun Thep", "Hom Ploy", "Itt Wan", "Jaew Noi", "Kla Boon", "Lek Dee", "Mook Sri"],
         schools=["Naresuan University", "Mae Fah Luang University", "Rangsit University", "Burapha University", "Walailak University", "SIIT", "Suranaree University", "Srinakharinwirot University", "Ubon Ratchathani University", "Mahasarakham University"]),
    dict(pfx="g", jpfx="m", shift=6, rot=4,
         orgs=["Onyx Labs", "Pearl Retail", "Quill Bank", "Raven Logistics", "Sage Foods", "Thyme Health", "Umber Telecom", "Vale Insurance", "Wren Studio", "Yarrow Energy"],
         prev=["Basil Co.", "Cobalt Systems", "Dune Group", "Elm Trading", "Fern Software", "Gale Media", "Heron Partners", "Iris Works", "Jasper Digital", "Kelp Finance"],
         names=["Nok Aree", "Ong Pran", "Pun Suda", "Rung Kiat", "Sai Mee", "Tan Chok", "Um Vara", "Wan Lada", "Yok Dara", "Zen Pimon"],
         schools=["Payap University", "Rajamangala University", "Nakhon Phanom University", "Thaksin University", "Phayao University", "Lampang Rajabhat", "Udon Thani Rajabhat", "Songkhla Rajabhat", "Phuket Rajabhat", "Krirk University"]),
]


def main():
    merged = {"version": 1, "note": "Synthetic holdout; every name, employer and number is invented.", "personas": [], "jobs": [],
              "cases": {}}
    base = [(f[0], list(f[1]), f[2], f[3]) for f in b.FAMILIES]
    for v in VARIANTS:
        b.PFX, b.JPFX, b.SHIFT = v["pfx"], v["jpfx"], v["shift"]
        b.ORGS, b.PREV, b.NAMES, b.SCHOOLS = v["orgs"], v["prev"], v["names"], v["schools"]
        # rotate each family's six skills so a different pair is the supportable and the trap skill
        b.FAMILIES = [(t, r[v["rot"] % 6:] + r[: v["rot"] % 6], en, th) for t, r, en, th in base]
        tmp = Path("/tmp") / f"holdout-{v['pfx']}.json"
        b.main(tmp)
        part = json.loads(tmp.read_text())
        merged["personas"] += part["personas"]
        merged["jobs"] += part["jobs"]
        for task, cases in part["cases"].items():
            for c in cases:
                c["id"] = v["pfx"] + c["id"]
            merged["cases"].setdefault(task, []).extend(cases)
    OUT.write_text(json.dumps(merged, ensure_ascii=False, indent=1) + "\n")
    print("wrote", OUT, {k: len(v) for k, v in merged["cases"].items()})


if __name__ == "__main__":
    main()
