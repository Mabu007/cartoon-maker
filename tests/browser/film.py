"""Run the release journey on a disposable local studio with a real Rhubarb gateway."""

import argparse
import base64
import json
import os
import re
import subprocess
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright, expect
from director_fixture import test_direction
from media import check_media

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("url")
parser.add_argument("output", type=Path)
parser.add_argument("--chromium")
parser.add_argument("--recorder", action="store_true")
options = parser.parse_args()
if urlparse(options.url).hostname not in {"127.0.0.1", "localhost"}:
    parser.error("Run against the local QA server with a disposable browser profile")
out = options.output
out.mkdir(exist_ok=True, parents=True)
with sync_playwright() as p:
    b = p.chromium.launch(
        executable_path=options.chromium,
        args=json.loads(os.getenv("QA_CHROMIUM_ARGS", "[]")),
    )
    ctx = b.new_context(viewport={"width": 1536, "height": 960}, accept_downloads=True)
    t = ctx.new_page()
    t.set_default_timeout(30000)
    t.on("pageerror", lambda e: print("PAGE ERROR:", str(e), flush=True))
    t.on(
        "console",
        lambda m: (
            print("CONSOLE:", m.text[:200], flush=True) if m.type == "error" else None
        ),
    )
    base = options.url
    t.goto(base)
    btn = lambda name: t.get_by_role("button", name=name, exact=True)

    def click(name):
        try:
            btn(name).click()
        except Exception:
            print(
                "Click failed:",
                name,
                "dialogs:",
                t.locator("dialog[open]").all_inner_texts(),
                flush=True,
            )
            t.screenshot(path=out / "failed.png", timeout=5000)
            raise

    def movie():
        click("Code")
        t.get_by_role("tab", name="Entire movie").click()
        return json.loads(t.get_by_label("Editable timeline JSON").input_value())

    def status(message):
        print(message, flush=True)

    theme = t.get_by_role("button", name=re.compile("Switch to .* theme"))
    theme.click()
    theme.click()
    click("Get started")
    t.get_by_role("button", name=re.compile("Build with AI")).click()
    t.get_by_label("What happens in your movie?").fill(
        "A lunch inspector eats all the evidence."
    )
    click("Develop my movie")
    expect(btn("Create")).to_have_attribute("aria-current", "page")
    click("Projects")
    t.get_by_label("Main navigation").get_by_role("button", name="New movie").click()
    t.get_by_role("button", name=re.compile("Start Blank")).click()
    expect(btn("Write")).to_have_attribute("aria-current", "page")
    click("Direct")
    data = movie()
    film = data["project"]
    scenes = json.loads(
        subprocess.check_output(
            [
                "node",
                "--experimental-strip-types",
                str(Path(__file__).with_name("film-scenes.mjs")),
            ]
        )
    )
    scenes[0]["id"] = film["scenes"][0]["id"]
    film["name"] = "The Lunch Inspector"
    film["production"]["bible"]["profile"]["title"] = film["name"]
    outline = film["production"]["bible"]["scenes"][0]
    script = film["production"]["screenplay"]["scenes"][0]
    film["production"]["bible"]["scenes"] = []
    film["production"]["screenplay"]["scenes"] = []
    for i, scene in enumerate(scenes):
        line = scene["clips"][0]
        film["production"]["bible"]["scenes"].append(
            {
                **outline,
                "id": scene["id"],
                "title": scene["name"],
                "environment": scene["environment"],
                "location": scene["environment"],
                "seconds": 4,
            }
        )
        film["production"]["screenplay"]["scenes"].append(
            {
                **script,
                "id": scene["id"],
                "title": scene["name"],
                "environment": scene["environment"],
                "elements": [
                    {
                        "id": f"heading-{i}",
                        "type": "scene-heading",
                        "text": ("EXT. " if i == 1 else "INT. ")
                        + scene["environment"].upper()
                        + " - DAY",
                        "directions": [],
                    },
                    {
                        "id": f"line-{i}",
                        "type": "dialogue",
                        "characterId": line["actor"].removeprefix("actor-"),
                        "text": line["text"] if i else "Hey! Who ate the evidence?",
                        "directions": [],
                    },
                ],
            }
        )
    film["scenes"] = scenes
    film["characters"][0].update(shirt="#548bb1", eyes="wide", voicePreset="deep")
    film["characters"][1].update(shirt="#ea998b", voicePreset="bright")
    t.get_by_label("Editable timeline JSON").fill(json.dumps(data))
    click("Validate JSON")
    expect(t.get_by_text(re.compile("Valid movie · 3 scenes"))).to_be_visible()
    click("Apply to timeline")
    expect(t.get_by_label("Project name")).to_have_value(film["name"])
    status("Both onboarding flows and three-scene Code Mode creation passed")
    click("Worlds")
    # A small raster supplied as a PNG fixture exercises real browser decoding and project storage.
    t.get_by_label("Upload world image", exact=True).set_input_files(
        {
            "name": "set.png",
            "mimeType": "image/png",
            "buffer": base64.b64decode(
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGTsAAAAASUVORK5CYII="
            ),
        }
    )
    expect(t.get_by_alt_text("Current custom world")).to_be_visible()
    click("Undo")
    click("Cast")
    original = movie()
    invalid = json.loads(json.dumps(original))
    shots = invalid["project"]["scenes"][0]["clips"]
    shots.append({**next(c for c in shots if c["track"] == "camera"), "id": "overlap"})
    t.get_by_label("Editable timeline JSON").fill(json.dumps(invalid))
    click("Apply to timeline")
    expect(t.get_by_role("dialog").get_by_role("alert")).to_contain_text("overlap")
    click("Cancel")
    assert movie() == original
    click("Cancel")
    for i in range(3):
        if i:
            click("Next scene")
        t.locator(".clip-dialogue").first.click()
        if (
            btn("Generate Voice").count() == 0
            and btn("Director").get_attribute("aria-pressed") == "true"
        ):
            click("Director")
        if i == 0:
            t.get_by_label("Edit spoken dialogue").fill("Hey! Who ate the evidence?")
            click("Generate Voice")
            expect(t.get_by_text("Rhubarb · Audio aligned", exact=True)).to_be_visible(
                timeout=70000
            )
            click("Regenerate Voice")
            expect(
                t.get_by_text(re.compile("Previous audio remains in version history"))
            ).to_be_visible(timeout=70000)
        else:
            click("Analyze Recording")
            expect(t.get_by_text("Rhubarb · Audio aligned", exact=True)).to_be_visible(
                timeout=55000
            )
        status("Verified recording and Rhubarb on scene " + str(i + 1))
    click("Previous scene")
    click("Previous scene")
    clip = t.locator(".clip-audio").first
    clip.click()
    n = t.locator(".clip-audio").count()
    t.keyboard.press("Control+d")
    expect(t.locator(".clip-audio")).to_have_count(n + 1)
    t.keyboard.press("Backspace")
    expect(t.locator(".clip-audio")).to_have_count(n)
    click("Undo")
    expect(t.locator(".clip-audio")).to_have_count(n + 1)
    click("Redo")
    t.get_by_label("Project name").focus()
    t.keyboard.press("End")
    t.keyboard.press("x")
    t.keyboard.press("Backspace")
    t.keyboard.press("Enter")
    expect(t.locator(".clip-audio")).to_have_count(n)
    status("Keyboard duplicate, Backspace, Undo, Redo, typing passed")
    test_direction(t, movie)
    click("Save project")
    baseline = movie()
    click("Cancel")
    click("Projects")
    with t.expect_download() as backup:
        click("Back up The Lunch Inspector")
    backup_file = out / "The-Lunch-Inspector.toonroom.json"
    backup.value.save_as(backup_file)
    assert json.loads(backup_file.read_text())["project"] == baseline["project"]
    t.reload()
    if btn("Open The Lunch Inspector").count() == 0:
        click("Projects")
    click("Open The Lunch Inspector")
    click("Direct")
    reopened = movie()
    assert reopened == baseline
    click("Cancel")
    status("Real refresh/reopen: exact canonical document retained")
    click("Stop scene")
    click("Play scene")
    expect(t.get_by_title("Manage all scenes")).to_have_text(
        "The inspection", timeout=30000
    )
    expect(t.get_by_title("Manage all scenes")).to_have_text(
        "The receipt", timeout=30000
    )
    expect(btn("Play scene")).to_be_visible(timeout=18000)
    status("Played across both scene cuts")
    t.screenshot(path=out / "desktop.png")
    if options.recorder:
        # Exercise feature detection as on a browser without a frame encoder.
        t.evaluate(
            "Object.defineProperty(window,'VideoEncoder',{value:undefined,configurable:true})"
        )
    click("Export video")
    click("Render video")
    expect(t.get_by_label("Exported video preview")).to_be_visible(timeout=180000)
    preview = t.get_by_label("Exported video preview")
    preview.evaluate("(v)=>v.play()")
    t.wait_for_function("document.querySelector('video').currentTime > 0.2")
    with t.expect_download() as d:
        t.get_by_role("link", name=re.compile("Download")).click()
    d.value.save_as(out / "The-Lunch-Inspector.webm")
    status("Downloaded playable movie")
    t.screenshot(path=out / "export.png")
    check_media(out / "The-Lunch-Inspector.webm", options.recorder)
    click("Close")
    click("Projects")
    t.set_viewport_size({"width": 390, "height": 844})
    click("Open The Lunch Inspector")
    click("Direct")
    t.screenshot(path=out / "mobile.png")
    assert t.evaluate("document.documentElement.scrollWidth <= innerWidth+1")
    status("390px mobile reopen passed")
    click("Projects")
    t.get_by_label("Import Toonroom backup").set_input_files(backup_file)
    expect(t.get_by_text("Project restored as a new copy.")).to_be_visible()
    click("Direct")
    restored = movie()["project"]
    assert (
        restored["id"] != baseline["project"]["id"]
        and restored["name"] == baseline["project"]["name"]
    )
    for old, new in zip(baseline["project"]["scenes"], restored["scenes"], strict=True):
        assert old["id"] == new["id"] and len(old["clips"]) == len(new["clips"])
        old_voice = next(c for c in old["clips"] if c["track"] == "dialogue")
        new_voice = next(c for c in new["clips"] if c["track"] == "dialogue")
        assert old_voice["visemes"] == new_voice["visemes"]
        if old_voice["asset"].startswith("asset:"):
            assert new_voice["asset"] != old_voice["asset"]
    status("Portable movie backup and audio restore passed")
    b.close()
