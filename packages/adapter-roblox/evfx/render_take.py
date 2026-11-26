import io
import json
import multiprocessing
import os
import sys
import time

_WORKER = {}

_FRAMES = {}


def _setup(easyvfx):
    sys.path.insert(0, os.path.join(easyvfx, "tools"))
    from evfx import core, render

    _WORKER["core"] = core
    _WORKER["render"] = render


def _timeline(path, empty):
    if _WORKER.get("path") != path:
        with open(path, encoding="utf-8") as f:
            _WORKER["timeline"] = json.load(f)
        _WORKER["path"] = path
    timeline = _WORKER["timeline"]
    return {**timeline, "frames": [], "bursts": [], "emitters": []} if empty else timeline


def _frame(args):
    path, empty, camera, t = args
    began = time.perf_counter()
    core, render = _WORKER["core"], _WORKER["render"]
    timeline = _timeline(path, empty)
    cam = core.Camera(camera["eye"], camera["target"], camera["fov"], camera["size"])
    rgb = render.draw(timeline, t, cam, body=False)[0]
    image = render.to_image(rgb)
    still = io.BytesIO()
    image.save(still, "PNG")
    frame = image.quantize(colors=255, method=2)
    return {
        "png": still.getvalue(),
        "mode": frame.mode,
        "size": frame.size,
        "pixels": frame.tobytes(),
        "palette": frame.getpalette(),
        "mean": float(rgb.mean()),
        "ms": (time.perf_counter() - began) * 1000,
    }


def _weight(timeline, t):
    dt = timeline["frameTime"]
    return sum(int(b["count"]) for b in timeline["bursts"] if 0 <= t - b["frame"] * dt <= max(b["lifetime"]))


def _frame_blank(pool, path, camera):
    return pool.apply(_frame, ((path, True, camera, 0.0),))


def _image(Image, frame):
    image = Image.frombytes(frame["mode"], tuple(frame["size"]), frame["pixels"])
    image.putpalette(frame["palette"])
    return image


def render_job(pool, job):
    from evfx import beats, core, variants
    from PIL import Image

    started = time.perf_counter()
    kit, layer, take = job["kit"], job["layer"], job["take"]
    picks = dict(job["picks"])
    picks[layer] = take
    tid = f"kit__{kit}__{layer}__{take}__in"
    folder = os.path.join(job["work"], "timeline")
    timeline = core.load(tid, folder=folder, fresh=True, fps=60, env={"EVFX_KIT_PICKS": json.dumps({kit: picks})})
    exported = time.perf_counter()

    width, height = job.get("size", [360, 240])
    framed = framing(core, variants, job, (width, height))
    cam = framed[0] if framed else core.views(timeline, (width, height))["ground"]
    camera = {"eye": cam.eye, "target": cam.target, "fov": 30, "size": (width, height)}
    step = 1 / 25
    span = max(variants.span(timeline), framed[1] if framed else 0, 0.5)
    times = [k * step for k in range(int(span / step) + 1)]
    path = os.path.join(folder, tid + ".json")
    order = sorted(times, key=lambda t: -_weight(timeline, t))
    frames = dict(zip(order, pool.map(_frame, [(path, False, camera, t) for t in order], chunksize=1)))
    drawn = [frames[t] for t in times]
    blank = _frame_blank(pool, path, camera)
    painted = time.perf_counter()

    beat = sync_beat(beats, job, drawn, step)
    held = beat["t"] / step
    if framed:
        held = max(range(len(drawn)), key=lambda k: drawn[k]["mean"])
    still = min(len(drawn) - 1, max(0, round(held)))
    with open(job["still"], "wb") as f:
        f.write(drawn[still]["png"])
    loop = [_image(Image, frame) for frame in drawn] + [_image(Image, blank)] * 8
    loop[0].save(job["gif"], save_all=True, append_images=loop[1:], duration=40, loop=0)
    done = time.perf_counter()
    return {
        "beat": beat,
        "frames": len(loop),
        "exportMs": round((exported - started) * 1000),
        "drawMs": round((painted - exported) * 1000),
        "slowestFrameMs": round(max(frame["ms"] for frame in drawn)),
        "saveMs": round((done - painted) * 1000),
        "ms": round((done - started) * 1000),
    }


def framing(core, variants, job, size):
    frame = job.get("frame")
    if not frame:
        return None
    key = json.dumps([job["kit"], frame, list(size)], sort_keys=True)
    if key not in _FRAMES:
        kit = job["kit"]
        tid = f"kit__{kit}__{frame['layer']}__{frame['take']}__in"
        folder = os.path.join(job["work"], "frame")
        timeline = core.load(tid, folder=folder, fresh=True, fps=60, env={"EVFX_KIT_PICKS": json.dumps({kit: frame["picks"]})})
        _FRAMES[key] = (core.views(timeline, size)["ground"], variants.span(timeline))
    return _FRAMES[key]


def sync_beat(beats, job, drawn, step):
    wanted = job.get("beat")
    try:
        sheet = beats.sheet(job["preset"])
    except (SystemExit, Exception):
        sheet = None
    if sheet:
        named = [b for b in sheet["beats"] if wanted and b["name"].lower() == wanted.lower()]
        if named:
            return {"name": named[0]["name"], "from": "sheet", "t": named[0]["from"] / 60}
        flashes = [b for b in sheet["beats"] if b.get("flash")]
        if flashes:
            return {"name": flashes[0]["name"], "from": "sheet flash", "t": flashes[0]["from"] / 60}
    brightest = max(range(len(drawn)), key=lambda k: drawn[k]["mean"])
    return {"name": "brightest frame", "from": "measured", "t": brightest * step}


def main():
    easyvfx = sys.argv[1]
    os.environ["EVFX_KITS"] = os.pathsep.join(sys.argv[2:])
    _setup(easyvfx)
    workers = max(1, int(os.environ.get("GDS_EVFX_WORKERS", "8")))
    with multiprocessing.get_context("spawn").Pool(workers, _setup, (easyvfx,)) as pool:
        print(json.dumps({"ready": True}), flush=True)
        for line in sys.stdin:
            if not line.strip():
                continue
            job = json.loads(line)
            try:
                reply = {"id": job["id"], "ok": render_job(pool, job)}
            except SystemExit as e:
                reply = {"id": job["id"], "error": str(e.code)}
            except Exception as e:
                reply = {"id": job["id"], "error": repr(e)}
            print(json.dumps(reply), flush=True)


if __name__ == "__main__":
    main()
