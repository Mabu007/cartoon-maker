import json
import subprocess


def check_media(path, recorder):
    raw = subprocess.check_output(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_streams",
            "-show_format",
            "-of",
            "json",
            str(path),
        ]
    )
    media = json.loads(raw)
    video = next(s for s in media["streams"] if s["codec_type"] == "video")
    audio = next(s for s in media["streams"] if s["codec_type"] == "audio")
    assert (video["width"], video["height"]) == (1280, 720)
    assert audio["channels"] == 2 and abs(float(media["format"]["duration"]) - 12) < (
        0.6 if recorder else 0.1
    )
    decode = subprocess.run(
        ["ffmpeg", "-v", "error", "-xerror", "-i", str(path), "-f", "null", "-"],
        check=True,
        capture_output=True,
    )
    assert not decode.stderr, decode.stderr.decode(errors="replace")
