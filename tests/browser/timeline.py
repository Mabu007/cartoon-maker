"""Check real timeline pointer capture, trimming and locking, then test touch onboarding."""

import argparse
import json
import os
import re
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("url")
parser.add_argument("backup", type=Path)
parser.add_argument("--chromium")
args = parser.parse_args()
if urlparse(args.url).hostname not in {"localhost", "127.0.0.1"}:
    parser.error("Use a loopback studio")
with sync_playwright() as pw:
    launch = {
        "executable_path": args.chromium,
        "args": json.loads(os.getenv("QA_CHROMIUM_ARGS", "[]")),
    }
    mobile_browser = pw.chromium.launch(**launch)
    mobile = mobile_browser.new_page(
        viewport={"width": 390, "height": 844}, has_touch=True, is_mobile=True
    )
    mobile.goto(args.url)
    mobile.get_by_role("button", name="Get started").tap()
    mobile.get_by_role("button", name=re.compile("Start Blank")).tap()
    expect(mobile.get_by_label("Project name")).to_be_visible()
    mobile.get_by_role("button", name="Direct", exact=True).tap()
    assert mobile.evaluate("document.documentElement.scrollWidth <= innerWidth+1")
    mobile_browser.close()
    print("Touch landing, movie creation and directing at 390px passed.", flush=True)
    launch["args"] += [
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
    ]
    browser = pw.chromium.launch(**launch)
    page = browser.new_page(viewport={"width": 1536, "height": 960})
    page.context.grant_permissions(["microphone"], origin=args.url)
    page.goto(args.url)

    def button(name):
        return page.get_by_role("button", name=name, exact=True)

    button("Projects").click()
    page.get_by_label("Import Toonroom backup").set_input_files(args.backup)
    expect(page.get_by_text("Project restored as a new copy.")).to_be_visible()
    button("Direct").click()
    button("+5s").click()
    expect(page.get_by_label("Scene duration in seconds")).to_have_value("9")
    button("Disable snapping").click()
    sfx = page.locator(".clip-audio")
    sfx.first.click()
    page.keyboard.press("Control+d")
    expect(sfx).to_have_count(2)
    sfx.first.click()
    sfx.last.click(modifiers=["Control"])
    expect(page.locator(".clip-audio.clip-selected")).to_have_count(2)

    def starts():
        return [float(el.evaluate("e=>parseFloat(e.style.left)")) for el in sfx.all()]

    def drag(locator, dx):
        locator.scroll_into_view_if_needed()
        rect = locator.bounding_box()
        x, y = rect["x"] + rect["width"] / 2, rect["y"] + rect["height"] / 2
        page.mouse.move(x, y)
        page.mouse.down()
        page.mouse.move(x + dx, y, steps=12)
        page.mouse.up()

    prior = starts()
    drag(sfx.first, 75)
    moved = starts()
    assert (
        min(b - a for a, b in zip(prior, moved)) > 0
        and abs((moved[0] - prior[0]) - (moved[1] - prior[1])) < 0.05
    ), (prior, moved)
    button("Undo").click()
    assert starts() == prior
    handle = sfx.first.locator("[data-edge=out]")
    width = lambda: float(sfx.first.evaluate("e=>parseFloat(e.style.width)"))
    w = width()
    drag(handle, 25)
    assert width() > w
    button("Undo").click()
    assert width() == w
    button("Lock SFX").click()
    drag(sfx.first, 40)
    assert starts() == prior
    button("Unlock SFX").click()
    button("Mute SFX").click()
    expect(button("Unmute SFX")).to_be_visible()
    button("Unmute SFX").click()
    button("Zoom in around playhead").click()
    expect(page.locator(".zoom-label")).to_have_text("140%")
    button("Fit entire movie to timeline width").click()
    expect(page.locator(".zoom-label")).to_have_text("100%")
    sfx.first.click()
    page.keyboard.press("Control+c")
    page.keyboard.press("Control+v")
    expect(sfx).to_have_count(3)
    button("Undo").click()
    expect(sfx).to_have_count(2)
    print(
        "Group pointer drag, trim, Undo, lock/mute, zoom, clipboard passed.", flush=True
    )
    button("Add Music clip").click()
    button("Record voice").click()
    expect(button("Stop recording")).to_be_visible()
    # Collect enough real MediaRecorder data from Chromium's virtual microphone to decode.
    page.wait_for_timeout(1500)
    button("Stop recording").click()
    expect(page.get_by_label("Preview audio")).to_be_visible()
    button("Add to timeline").click()
    expect(page.locator(".clip-music")).to_have_count(2)
    button("Add Music clip").click()
    page.get_by_label("Upload audio").set_input_files(
        Path(__file__).resolve().parents[2] / "public/audio/zee-safe.mp3"
    )
    expect(page.get_by_label("Preview audio")).to_be_visible()
    button("Add to timeline").click()
    expect(page.locator(".clip-music")).to_have_count(3)
    print(
        "Virtual microphone and uploaded MP3 both added as playable clips.", flush=True
    )
    button("Code").click()
    page.get_by_role("tab", name="Entire movie").click()
    editor = page.get_by_label("Editable timeline JSON")
    doc = json.loads(editor.input_value())
    scene = doc["project"]["scenes"][0]
    scene["duration"] = 180
    sample = next(c for c in scene["clips"] if c["track"] == "audio")
    scene["clips"] = [c for c in scene["clips"] if c["track"] != "audio"] + [
        {**sample, "id": f"load-{i}", "start": round(i * 0.35, 2), "length": 0.3}
        for i in range(500)
    ]
    editor.fill(json.dumps(doc))
    button("Apply to timeline").click()
    expect(page.locator(".clip-audio")).to_have_count(500)
    button("Zoom in around playhead").click()
    button("Zoom in around playhead").click()
    assert page.locator(".clip-audio").count() == 500
    frame_times = page.evaluate("""() => new Promise(resolve => {
      const intervals = []; let prior;
      function read(now) {
        if (prior !== undefined) intervals.push(now-prior);
        prior=now;
        if (intervals.length===50) resolve(intervals.sort((a,b)=>a-b));
        else requestAnimationFrame(read);
      }
      requestAnimationFrame(read);
    })""")
    print(
        f"500 mounted SFX clips, idle rAF median {frame_times[25]:.1f} ms, p95 {frame_times[47]:.1f} ms.",
        flush=True,
    )
    browser.close()
