#!/usr/bin/env python3
"""Backs up the Wilkipedia database (everything students have added) to this Mac.

    python3 tools/backup.py --setup   once: paste the database connection string
    python3 tools/backup.py           make a backup
    python3 tools/backup.py --list    see the backups you have

Each backup is one file in ~/Wilkipedia-backups/, OUTSIDE the repo, so it can
never be pushed to GitHub: it holds members' email addresses. The folder and
files are readable only by you.

The connection string contains the database password. --setup keeps it in the
macOS Keychain (service "wilkipedia-db"), never in a file and never in the repo.
Get it from Supabase → your project → Connect → Direct → Session pooler. Paste it as
shown and --setup asks for the password separately. (Forgot it? Project Settings →
Database → Reset database password. The website doesn't use it, so resetting is
safe.)

Backups are pg_dump "custom" files of the public schema (profiles, submissions,
comments, calendar edits…) and the auth schema (sign-in accounts, which profiles
point at). To restore into a fresh Supabase project:
    pg_restore --no-owner --no-privileges --clean --if-exists -d "<new connection string>" <file>
Look inside one without restoring: pg_restore --list <file>

Needs the Postgres client tools: brew install libpq
"""

import getpass
import os
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from urllib.parse import quote, unquote, urlsplit, urlunsplit

OUT = Path.home() / "Wilkipedia-backups"
KEYCHAIN = ["-a", "wilkipedia", "-s", "wilkipedia-db"]
BIN = Path("/opt/homebrew/opt/libpq/bin")
# What the summary counts after each backup: (label, query)
COUNTS = [("members", "select count(*) from public.profiles"),
          ("published posts", "select count(*) from public.submissions where status = 'approved'"),
          ("posts waiting for review", "select count(*) from public.submissions where status = 'pending'"),
          ("comments", "select count(*) from public.comments")]


def tool(name):
    path = shutil.which(name) or (str(BIN / name) if (BIN / name).exists() else None)
    if not path:
        sys.exit(f"Can't find {name}. Install the Postgres tools first:  brew install libpq")
    return path


def split(url):
    """The URL without its password, and an environment carrying the password,
    so the password never shows up in the process list."""
    parts = urlsplit(url)
    if parts.scheme not in ("postgres", "postgresql") or not parts.hostname:
        sys.exit("That doesn't look like a connection string. It should start with postgresql://")
    if not parts.password or parts.password == "[YOUR-PASSWORD]":
        sys.exit("The connection string has no password in it. Replace [YOUR-PASSWORD] with the database password.")
    netloc = parts.username + "@" + parts.hostname + (f":{parts.port}" if parts.port else "")
    env = {**os.environ, "PGPASSWORD": unquote(parts.password), "PGSSLMODE": "require", "PGCONNECT_TIMEOUT": "15"}
    return urlunsplit(parts._replace(netloc=netloc)), env


def saved_url():
    url = os.environ.get("WILKIPEDIA_DB_URL")
    if url:
        return url
    r = subprocess.run(["security", "find-generic-password", *KEYCHAIN, "-w"], capture_output=True, text=True)
    if r.returncode:
        sys.exit("No connection string saved yet. Run:  python3 tools/backup.py --setup")
    return r.stdout.strip()


def query(url, sql):
    safe, env = split(url)
    r = subprocess.run([tool("psql"), safe, "-Atc", sql], capture_output=True, text=True, env=env)
    if r.returncode:
        raise RuntimeError(r.stderr.strip())
    return r.stdout.strip()


def setup():
    print("Get the connection string from Supabase: your project → Connect (at the top) → Direct → Session pooler.\n"
          "Copy it as shown. You'll type the database password next.\n"
          "Forgot the password? Project Settings → Database → Reset database password. The website\n"
          "doesn't use it, so resetting it is safe.\n")
    url = input("Paste the connection string just as Supabase shows it, with [YOUR-PASSWORD] still in it:\n> ").strip()
    if "[YOUR-PASSWORD]" in url:
        pw = getpass.getpass("Database password (it won't show on screen): ")
        url = url.replace("[YOUR-PASSWORD]", quote(pw, safe=""))
    try:
        query(url, "select 1")
    except RuntimeError as e:
        sys.exit(f"Couldn't connect, so nothing was saved:\n  {e}\n"
                 "Check the password, and that you copied the Session pooler string.")
    subprocess.run(["security", "add-generic-password", *KEYCHAIN, "-U", "-l", "Wilkipedia database", "-w", url],
                   check=True, capture_output=True)
    print("Connected, and saved in your Keychain as \"Wilkipedia database\".\n"
          "Make your first backup with:  python3 tools/backup.py")


def backup():
    url = saved_url()
    safe, env = split(url)
    OUT.mkdir(mode=0o700, exist_ok=True)
    os.chmod(OUT, 0o700)
    file = OUT / f"wilkipedia-{datetime.now():%Y-%m-%d-%H%M}.dump"
    part = file.with_suffix(".partial")
    print("Backing up the database…")
    r = subprocess.run([tool("pg_dump"), "--format=custom", "--no-owner", "--no-privileges",
                        "--schema=public", "--schema=auth", f"--file={part}", safe],
                       capture_output=True, text=True, env=env)
    if r.returncode:
        part.unlink(missing_ok=True)
        sys.exit(f"The backup failed, and nothing was saved:\n{r.stderr.strip()}")
    os.chmod(part, 0o600)
    # Check the file reads back before calling it a backup
    listing = subprocess.run([tool("pg_restore"), "--list", str(part)], capture_output=True, text=True)
    tables = sum(1 for line in listing.stdout.splitlines() if " TABLE DATA " in line)
    if listing.returncode or not tables:
        part.unlink(missing_ok=True)
        sys.exit("The backup file didn't read back correctly, so it was thrown away. Try again.")
    part.rename(file)
    print(f"Saved {file}  ({file.stat().st_size / 1024:.0f} KB, {tables} tables)")
    for label, sql in COUNTS:
        try:
            print(f"  {query(url, sql):>5}  {label}")
        except RuntimeError:
            pass
    print("Keep it private: it has members' email addresses.")


def listing():
    files = sorted(OUT.glob("wilkipedia-*.dump")) if OUT.exists() else []
    if not files:
        print("No backups yet. Make one with:  python3 tools/backup.py")
    for f in files:
        print(f"{f.name}  {f.stat().st_size / 1024:>7.0f} KB")
    if files:
        print(f"\n{len(files)} backup{'s' * (len(files) != 1)} in {OUT}")


if __name__ == "__main__":
    arg = sys.argv[1] if len(sys.argv) > 1 else ""
    {"--setup": setup, "--list": listing, "": backup}.get(arg, lambda: sys.exit(__doc__))()
