"""Fetch Edinburgh Castle's building footprints and walls from OpenStreetMap (Overpass API) and write
world/edinburgh_plan.json: polygons in metres (x east, z south) around a fixed origin. The castle model in
src/castles/castles.js is laid out from this plan, so the buildings stand and face as they really do.
Map data (c) OpenStreetMap contributors, ODbL.  Usage: python tools/osm_edinburgh.py"""
import json, math, os, requests

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LAT0, LON0 = 55.9486, -3.2008
BBOX = (55.9475, -3.2035, 55.9502, -3.1975)
QUERY = f"""[out:json][timeout:60];
(way["building"]({BBOX[0]},{BBOX[1]},{BBOX[2]},{BBOX[3]});
 way["historic"="castle"]({BBOX[0]},{BBOX[1]},{BBOX[2]},{BBOX[3]}););
out tags geom;"""


def xy(p):
    return [round((p["lon"] - LON0) * 111320 * math.cos(math.radians(LAT0)), 2), round(-(p["lat"] - LAT0) * 110540, 2)]


def main():
    r = requests.post("https://overpass-api.de/api/interpreter", data={"data": QUERY}, timeout=90,
                      headers={"User-Agent": "tapestry-castle-model/1.0"})
    r.raise_for_status()
    plan = {"source": "OpenStreetMap contributors (ODbL)", "origin": [LAT0, LON0], "outline": None, "buildings": []}
    for e in r.json()["elements"]:
        t = e.get("tags", {})
        pts = [xy(p) for p in e.get("geometry", [])]
        if len(pts) > 1 and pts[0] == pts[-1]:
            pts = pts[:-1]
        if t.get("historic") == "castle":
            plan["outline"] = pts
            continue
        # keep only buildings on the rock (inside the castle bounds), not the town round it
        cx = sum(p[0] for p in pts) / len(pts); cz = sum(p[1] for p in pts) / len(pts)
        if not (-115 < cx < 160 and -95 < cz < 80):
            continue
        plan["buildings"].append({"id": e["id"], "name": t.get("name"), "kind": t.get("building"), "poly": pts})
    out = os.path.join(ROOT, "world", "edinburgh_plan.json")
    json.dump(plan, open(out, "w"), indent=1)
    print(f"{len(plan['buildings'])} buildings, outline {len(plan['outline'] or [])} pts -> {out}")


if __name__ == "__main__":
    main()
