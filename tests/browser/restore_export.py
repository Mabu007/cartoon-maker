"""Restore a portable movie and verify its real-time MediaRecorder export independently."""

import argparse
import json
import os
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import expect, sync_playwright
from media import check_media

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("url")
parser.add_argument("backup", type=Path)
parser.add_argument("output", type=Path)
parser.add_argument("--chromium")
args = parser.parse_args()
if urlparse(args.url).hostname not in {"127.0.0.1", "localhost"}:
    parser.error("Use a loopback studio")
with sync_playwright() as engine:
    browser = engine.chromium.launch(
        executable_path=args.chromium,
        args=json.loads(os.getenv("QA_CHROMIUM_ARGS", "[]")),
    )
    page = browser.new_page(
        viewport={"width": 1536, "height": 960}, accept_downloads=True
    )
    page.add_init_script(
        "Object.defineProperty(window,'VideoEncoder',{value:undefined,configurable:true})"
    )
    page.goto(args.url)
    button = lambda label: page.get_by_role("button", name=label, exact=True)
    button("Projects").click()
    page.get_by_label("Import Toonroom backup").set_input_files(args.backup)
    expect(page.get_by_text("Project restored as a new copy.")).to_be_visible()
    button("Direct").click()
    expect(page.get_by_label("Project name")).to_have_value("The Lunch Inspector")
    button("Export video").click()
    button("Render video").click()
    video = page.get_by_label("Exported video preview")
    expect(video).to_be_visible(timeout=180000)
    video.evaluate("(video)=>video.play()")
    page.wait_for_function("document.querySelector('video').currentTime > .25")
    with page.expect_download() as result:
        page.get_by_role("link", name="Download", exact=False).click()
    result.value.save_as(args.output)
    check_media(args.output, recorder=True)
    print("Restored and decoded the real-time export.", flush=True)
    browser.close()
