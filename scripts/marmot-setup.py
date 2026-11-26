#!/usr/bin/env python3
"""Install the exact reviewed MarmotKit native cohort; never mix generated/JNI versions."""
import hashlib
import pathlib
import urllib.request
import zipfile

VERSION = "0.19.0"
SHA256 = "9f4dd11478265a24a98f1f0c40768b7e8eba8f1fbd4fe7b129b2f09198e3a8e4"
root = pathlib.Path(__file__).resolve().parent.parent / ".android-local" / "marmot"
root.mkdir(parents=True, exist_ok=True)
archive = root / f"marmotkit-android-{VERSION}.zip"
if not archive.exists():
    urllib.request.urlretrieve(
        f"https://github.com/marmot-protocol/mdk/releases/download/marmotkit-v{VERSION}/{archive.name}", archive
    )
if hashlib.sha256(archive.read_bytes()).hexdigest() != SHA256:
    raise SystemExit("MarmotKit checksum mismatch. Remove the invalid archive and retry.")
with zipfile.ZipFile(archive) as bundle:
    for item in bundle.infolist():
        if not (root / item.filename).resolve().is_relative_to(root.resolve()):
            raise SystemExit("Unsafe archive entry")
    bundle.extractall(root)
print(f"MarmotKit {VERSION}: SHA-256 verified")
