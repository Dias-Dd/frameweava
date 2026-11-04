"""Explicit experiment only; run in outputs/dx1b/mediapipe-env, with the existing model and verified PNGs."""
import json, sys, time, platform, statistics, math
from pathlib import Path
t = time.perf_counter()
import mediapipe as mp
import numpy as np
from PIL import Image
import_ms = (time.perf_counter() - t) * 1000
inputs = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
images = [mp.Image(image_format=mp.ImageFormat.SRGB, data=np.array(Image.open(s["path"]).convert("RGB"))) for s in inputs["samples"]]
config = inputs["config"]
runs = []
for run in range(3):
    options = mp.tasks.vision.FaceLandmarkerOptions(
        base_options=mp.tasks.BaseOptions(model_asset_path=inputs["model"], delegate=mp.tasks.BaseOptions.Delegate.CPU),
        running_mode=mp.tasks.vision.RunningMode.VIDEO, num_faces=1,
        min_face_detection_confidence=config["minFaceDetectionConfidence"],
        min_face_presence_confidence=config["minFacePresenceConfidence"],
        min_tracking_confidence=config["minTrackingConfidence"])
    t = time.perf_counter()
    task = mp.tasks.vision.FaceLandmarker.create_from_options(options)
    initialize_ms = (time.perf_counter() - t) * 1000
    times, anchors = [], []
    try:
        for image, sample in zip(images, inputs["samples"]):
            t = time.perf_counter()
            result = task.detect_for_video(image, round(sample["timestampUs"] / 1000))
            times.append((time.perf_counter() - t) * 1000)
            pts = result.face_landmarks[0] if result.face_landmarks else []
            anchors.append({"x": (min(p.x for p in pts)+max(p.x for p in pts))/2, "y": min(p.y for p in pts)} if len(pts) == 478 else None)
    finally:
        task.close()
    differences = [max(abs(a["x"]-s["anchor"]["x"]),abs(a["y"]-s["anchor"]["y"])) for a,s in zip(anchors,inputs["samples"]) if a and s["valid"]]
    runs.append({"run":run,"initializeMs":initialize_ms,"firstInferenceMs":times[0],"medianMs":statistics.median(times[1:]),"p95Ms":sorted(times[1:])[math.ceil(len(times[1:])*.95)-1],"quantileScope":"frames-after-first","total64Ms":sum(times),"validSamples":sum(a is not None for a in anchors),"validityDisagreements":sum(bool(a)!=s["valid"] for a,s in zip(anchors,inputs["samples"])),"maxAnchorDifferenceFromFrozen":max(differences,default=0),"anchors":anchors,"inferenceMs":times})
print(json.dumps({"experimentalOnly":True,"python":platform.python_version(),"platform":platform.platform(),"mediapipe":mp.__version__,"importMs":import_ms,"runs":runs},indent=2))
