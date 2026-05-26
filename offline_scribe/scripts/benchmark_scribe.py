#!/usr/bin/env python3
"""Offline AI Scribe benchmark smoke runner.

Runs bundled Hindi/Tamil audio through /api/scribe/transcribe and reports latency,
model, quality score, and a simple word error rate when reference text exists.
"""

import argparse
import json
import time
from pathlib import Path
from urllib import request, error

BOUNDARY = "----mediczyscribebenchmark"


def multipart(fields, files):
    body = bytearray()
    for name, value in fields.items():
        body.extend(f"--{BOUNDARY}\r\n".encode())
        body.extend(f'Content-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode())
    for name, path in files.items():
        path = Path(path)
        body.extend(f"--{BOUNDARY}\r\n".encode())
        body.extend(f'Content-Disposition: form-data; name="{name}"; filename="{path.name}"\r\n'.encode())
        body.extend(b"Content-Type: audio/wav\r\n\r\n")
        body.extend(path.read_bytes())
        body.extend(b"\r\n")
    body.extend(f"--{BOUNDARY}--\r\n".encode())
    return bytes(body), f"multipart/form-data; boundary={BOUNDARY}"


def levenshtein(a, b):
    if len(a) < len(b):
        return levenshtein(b, a)
    previous = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        current = [i]
        for j, cb in enumerate(b, 1):
            current.append(min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (ca != cb)))
        previous = current
    return previous[-1]


def wer(reference, hypothesis):
    ref_words = reference.split()
    hyp_words = hypothesis.split()
    if not ref_words:
        return None
    return round(levenshtein(ref_words, hyp_words) / len(ref_words), 3)


def post_audio(base_url, audio, language):
    payload, content_type = multipart({"language": language}, {"file": audio})
    req = request.Request(
        f"{base_url.rstrip('/')}/api/scribe/transcribe",
        data=payload,
        headers={"Content-Type": content_type},
        method="POST",
    )
    start = time.time()
    with request.urlopen(req, timeout=240) as resp:
        data = json.loads(resp.read().decode())
    data["wall_time"] = round(time.time() - start, 2)
    return data


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:8006")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[1]
    cases = [
        ("hi", root / "bench_audio" / "hindi_fleurs.wav", root / "bench_audio" / "hindi_fleurs.ref.txt"),
        ("ta", root / "bench_audio" / "tamil_fleurs.wav", root / "bench_audio" / "tamil_fleurs.ref.txt"),
    ]
    results = []
    for language, audio, ref in cases:
        result = post_audio(args.base_url, audio, language)
        reference = ref.read_text().strip() if ref.exists() else ""
        result["reference_wer"] = wer(reference, result.get("text", "")) if reference else None
        result["case"] = {"language": language, "audio": str(audio.name)}
        results.append(result)

    if args.json:
        print(json.dumps(results, ensure_ascii=False, indent=2))
    else:
        for item in results:
            quality = item.get("quality") or {}
            print(f"{item['case']['language']} {item.get('model_used')} wall={item['wall_time']}s stt={item.get('transcription_time')}s quality={quality.get('grade')}({quality.get('score')}) wer={item.get('reference_wer')}")
            print(item.get("text", "")[:220])


if __name__ == "__main__":
    try:
        main()
    except error.URLError as exc:
        raise SystemExit(f"request failed: {exc}")
