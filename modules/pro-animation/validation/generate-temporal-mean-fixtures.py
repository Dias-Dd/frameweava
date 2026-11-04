"""Standard-library-only independent exact rational oracle; no rendering or inference."""
import hashlib
import json
import struct
from fractions import Fraction as Q
from pathlib import Path

here = Path(__file__).resolve().parent
target = here / "temporal-mean-reference.json"


def f32(value):
    return struct.unpack("<f", struct.pack("<f", value))[0]


def sample(rgba, weight=1, alpha="premultiplied"):
    return {"pixel": [f32(x) for x in rgba], "weight": weight, "alpha": alpha}


cases = [
    ("identity-pm", [sample([-.25, 3, 5, .5])]),
    ("straight-pm-equivalence", [sample([-4, 12, 2, .25], alpha="straight"), sample([-1, 3, .5, .25])]),
    ("straight-hidden-zero-alpha", [sample([65000, -65000, 1, 0], alpha="straight"), sample([2, 4, 8, 1], alpha="opaque")]),
    ("native-pm-emission", [sample([2, -4, 6, 0]), sample([4, 8, 2, 1], alpha="opaque")]),
    ("native-pm-only-emission", [sample([2, -4, 6, 0]), sample([4, 8, 2, 0])]),
    ("transparent-in-denominator", [sample([8, -2, 4, 1]), sample([0, 0, 0, 0])]),
    ("unequal-weights", [sample([-4, 12, 2, .25], alpha="straight"), sample([2, -2, 8, .75], 3)]),
    ("large-common-weights", [sample([-1, 2, 4, 1], 1e308), sample([3, 4, 8, 1], 1e308)]),
    ("small-common-weights", [sample([-1, 2, 4, 1], 1e-300), sample([3, 4, 8, 1], 1e-300)]),
    ("max-f64-weights", [sample([-1, 2, 4, 1], float.fromhex("0x1.fffffffffffffp+1023")), sample([3, 4, 8, 1], float.fromhex("0x1.fffffffffffffp+1023"))]),
    ("zero-weight-does-not-paint", [sample([65000, -65000, 1, 1], 0), sample([-.125, .25, 2, .5], 5)]),
    ("rgb-cancellation", [sample([1e20, -1e20, 8, 1]), sample([1, 3, 4, 1]), sample([-1e20, 1e20, 0, 1])]),
    ("alpha-box", [sample([0, 0, 0, x / 64]) for x in range(65)]),
    ("signed-hdr-256", [sample([(-1 if i % 2 else 1) * (i + 1) * 32, i / 8, -i / 16, (i % 17) / 16], (i % 7) + 1) for i in range(256)]),
]

result = []
for name, samples in cases:
    denominator = sum(Q(s["weight"]) for s in samples)
    channels = []
    for c in range(4):
        numerator = Q(0)
        for s in samples:
            rgba, a = s["pixel"], Q(s["pixel"][3])
            value = a if c == 3 else Q(rgba[c]) * (a if s["alpha"] == "straight" else 1)
            numerator += Q(s["weight"]) * value
        channels.append(numerator / denominator)
    result.append({"id": name, "samples": samples,
                   "exactMean": [str(v) for v in channels],
                   "roundedBinary64": [float(v) for v in channels]})

payload = {"schema": "frameweave.pa3-temporal-mean-reference/1", "scope": "TEST ONLY: exact rational mean of finite F32 inputs, ideal association, F64 weights; not a GPU result or Surface fallback",
           "generatorSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), "cases": result}
target.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"caseCount": len(result), "path": str(target), "sha256": hashlib.sha256(target.read_bytes()).hexdigest()}))
