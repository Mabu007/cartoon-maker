"""Exercise cast, prop, world and project controls inside a fresh Chromium profile."""

import argparse
import json
import os
import re
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("url")
parser.add_argument("--chromium")
args = parser.parse_args()
if urlparse(args.url).hostname not in {"127.0.0.1", "localhost"}:
    parser.error("Use a loopback studio")
with sync_playwright() as pw:
    browser = pw.chromium.launch(
        executable_path=args.chromium,
        args=json.loads(os.getenv("QA_CHROMIUM_ARGS", "[]")),
    )
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    page.goto(args.url)

    def button(name):
        return page.get_by_role("button", name=name, exact=True)

    def click(name):
        button(name).click()

    click("Get started")
    page.get_by_role("button", name=re.compile("Start Blank")).click()
    click("Direct")
    for name, preset, voice in [
        ("Dumi", "Bra Sbu", "deep"),
        ("Zinzi", "Zee", "bright"),
    ]:
        button("Create character").last.click()
        click("Use " + preset + " preset")
        page.get_by_label("Character name").fill(name)
        page.get_by_label("Character voice preset").select_option(voice)
        for view in ["Front", "¾ Front", "Side", "¾ Back", "Back"]:
            click(view)
        for opt in page.get_by_label("Preview expression").locator("option").all():
            page.get_by_label("Preview expression").select_option(
                opt.get_attribute("value")
            )
        click("Front")
        for shape in [
            "closed",
            "bite",
            "wide",
            "open",
            "round",
            "pucker",
            "tongue",
            "rest",
        ]:
            page.get_by_label("Preview mouth shape").select_option(shape)
        click("Face")
        click("Tooth 2")
        page.get_by_label("Mouth width", exact=True).press("ArrowRight")
        click("Save character")
        click("Place " + name + " in scene")
    print("Two customized new cast members placed.", flush=True)
    click("Props")
    click("Phone")
    for field, value in [
        ("Scale", "1.3"),
        ("Rotation", "35"),
        ("X", "388"),
        ("Y", "405"),
    ]:
        el = page.get_by_label(field, exact=True)
        el.fill(value)
        el.press("Enter")
        assert float(el.input_value()) == float(value)
    click("Duplicate Phone")
    click("Delete Phone copy")
    click("Confirm")
    expect(button("Delete Phone copy")).to_have_count(0)
    print("Prop transforms, duplication and deletion verified.", flush=True)
    click("Worlds")
    click("Save current world")
    page.locator(".asset-saved-world").get_by_role(
        "button", name=re.compile("^Rename ")
    ).click()
    page.get_by_label("Rename saved world").fill("Investigation set")
    page.get_by_title("Save world name").click()
    click("Duplicate Investigation set")
    expect(button("Delete Investigation set copy")).to_be_visible()
    click("Delete Investigation set copy")
    click("Confirm")
    expect(button("Delete Investigation set copy")).to_have_count(0)
    print("Reusable world management passed.", flush=True)
    click("Projects")
    click("Star Untitled cartoon")
    page.get_by_label("Collection for Untitled cartoon").select_option("in-production")
    click("Duplicate Untitled cartoon")
    page.get_by_role("button", name=re.compile("^Rename Untitled cartoon.+")).click()
    page.get_by_label("Movie title").fill("Throwaway")
    click("Save title")
    page.get_by_label("Search movies").fill("Throwaway")
    expect(button("Open Throwaway")).to_be_visible()
    click("Delete Throwaway")
    click("Delete movie")
    expect(button("Open Throwaway")).to_have_count(0)
    page.get_by_label("Search movies").fill("")
    expect(button("Unstar Untitled cartoon")).to_be_visible()
    expect(page.get_by_label("Collection for Untitled cartoon")).to_have_value(
        "in-production"
    )
    print(
        "Gallery star, collection, duplicate, rename, search and delete passed.",
        flush=True,
    )
    browser.close()
