from pathlib import Path
import json, sys
ROOT = Path(__file__).resolve().parents[1]
if sys.stdin.isatty():
    import termios
    mode = termios.tcgetattr(sys.stdin.fileno())
    mode[3] &= ~(termios.ECHO | termios.ICANON)
    termios.tcsetattr(sys.stdin.fileno(), termios.TCSANOW, mode)
payload = json.loads(sys.stdin.readline())
files = payload.get("files", {})
edits = payload.get("edits", [])
if not isinstance(files, dict) or not isinstance(edits, list) or not (files or edits):
    raise ValueError("Expected files or edits")
def target(name):
    if not isinstance(name, str):
        raise ValueError("File name must be a string")
    path = (ROOT / name).resolve()
    if ROOT not in path.parents:
        raise ValueError("File must stay inside Spendable")
    if path.name.startswith(".env") and path.name != ".env.example":
        raise ValueError("Use private setup for secrets")
    return path
for edit in edits:
    path = target(edit["path"])
    old, new = edit["old"], edit["new"]
    text = files.get(edit["path"], path.read_text())
    if not isinstance(old, str) or not isinstance(new, str) or not old or text.count(old) != 1:
        raise ValueError("Exact edit must match once")
    files[edit["path"]] = text.replace(old, new, 1)
for name, content in files.items():
    path = target(name)
    if not isinstance(content, str):
        raise ValueError("File content must be a string")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)
print(json.dumps({"written": list(files)}))
