"""Exercise the real Director UI with a deterministic model transport, without a provider key."""

import json

from playwright.sync_api import expect


def test_direction(page, read_movie):
    def button(name):
        return page.get_by_role("button", name=name, exact=True)

    def insert(track, **fields):
        return {
            "op": "insert",
            "clip": {"track": track, "id": "qa-cue", "start": 0, "length": 1, **fields},
        }

    def update(clip, **changes):
        return {"op": "update_clip", "clipId": clip, "changes": changes}

    movement = update("walk", toX=560)
    gaze = update("look-back", target="cup")
    expression = insert("face", actor="actor-sbu", expression="angry")
    shot = update("reaction", shot="extreme-close-up", focus="actor-zee")
    requests = [
        ("Walk Sbu to the centre of the room.", [movement]),
        (
            "Have Sbu look at Zee while he speaks, then glance at the cup.",
            [insert("gaze", actor="actor-sbu", target="cup", start=2)],
        ),
        ("Make Sbu look annoyed.", [expression]),
        (
            "Make Zee point at the plate.",
            [insert("body", actor="actor-zee", action="point", layer="gesture")],
        ),
        ("Show a close reaction on Zee.", [shot]),
        (
            "Cut from the wide shot to a medium before the reaction.",
            [
                update("establish", length=0.7),
                insert(
                    "camera", start=0.7, length=0.65, shot="medium", transition="cut"
                ),
            ],
        ),
        (
            "Put the cup in Zee's hand.",
            [insert("props", actor="actor-zee", target="cup", interaction="equip")],
        ),
        (
            "Start the spoken line a tenth of a second later.",
            [update("line", start=0.45)],
        ),
        (
            "Play a doorbell just after Sbu comes in.",
            [
                insert(
                    "audio",
                    name="Doorbell",
                    asset="builtin:ding",
                    offset=0,
                    volume=0.4,
                    muted=False,
                    start=0.6,
                    length=0.4,
                )
            ],
        ),
        (
            "Walk Sbu forward, look at the cup, frown and cut to Zee.",
            [movement, gaze, expression, shot],
        ),
    ]
    active = {}
    endpoint = "https://openrouter.ai/api/v1/chat/completions"

    def fixture(route):
        payload = json.loads(route.request.post_data_json["messages"][-1]["content"])
        assert payload["prompt"] == active["prompt"]
        assert payload["context"]["scene"]["id"] == active["scene_id"]
        assert (
            "camera" in payload["context"] and "playheadSeconds" in payload["context"]
        )
        proposal = {"message": "Review this staging change.", "edits": active["edits"]}
        route.fulfill(
            json={"choices": [{"message": {"content": json.dumps(proposal)}}]}
        )

    page.route(endpoint, fixture)
    before = read_movie()
    button("Cancel").click()
    button("AI settings").click()
    page.get_by_label("OpenRouter API key").fill("fixture-only")
    button("Use for this session").click()
    if button("Director").get_attribute("aria-pressed") != "true":
        button("Director").click()
    for index, (prompt, edits) in enumerate(requests):
        active.update(
            prompt=prompt, edits=edits, scene_id=before["project"]["scenes"][0]["id"]
        )
        for accept in (False, True):
            page.get_by_label("Ask the AI Director").fill(prompt)
            button("Propose edits").click()
            expect(
                page.get_by_role("region", name="Review AI timeline changes")
            ).to_be_visible()
            button("Apply to timeline" if accept else "Reject").click()
            after = read_movie()
            button("Cancel").click()
            if accept:
                assert after["project"]["scenes"][0] != before["project"]["scenes"][0]
                assert after["project"]["scenes"][1:] == before["project"]["scenes"][1:]
                button("Undo last edit").click()
                assert read_movie() == before
                button("Cancel").click()
            else:
                assert after == before
        print(f"Director transport fixture {index + 1} passed", flush=True)
    # Keep the final staged scene in the film used for save/reopen and export.
    page.get_by_label("Ask the AI Director").fill(requests[-1][0])
    button("Propose edits").click()
    button("Apply to timeline").click()
    button("Director").click()
    page.unroute(endpoint, fixture)
