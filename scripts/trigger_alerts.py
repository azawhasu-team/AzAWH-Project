#!/usr/bin/env python3
"""Ask the backend to evaluate fleet alerts and send notifications.

Run on a schedule (see .github/workflows/monitor.yml). The backend decides what
is new, what is a reminder, and what has cleared; calling this repeatedly is
safe. Exits non-zero only if the call itself fails, so a run that merely
*sends* an alert is not a failed run.

    AWH_ADMIN_KEY=... python3 scripts/trigger_alerts.py [--dry-run] [--url URL]
"""
import argparse
import json
import os
import sys
import urllib.error
import urllib.request

DEFAULT_URL = "https://az-awh-monitoring-system.onrender.com"


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default=os.getenv("AWH_BACKEND_URL", DEFAULT_URL))
    ap.add_argument("--dry-run", action="store_true", help="evaluate and report, send and save nothing")
    args = ap.parse_args(argv)

    key = os.getenv("AWH_ADMIN_KEY")
    if not key:
        print("AWH_ADMIN_KEY is not set", file=sys.stderr)
        return 2
    endpoint = f"{args.url.rstrip('/')}/admin/alerts/evaluate" + ("?dry_run=true" if args.dry_run else "")
    req = urllib.request.Request(endpoint, method="POST", headers={"X-Admin-Key": key})
    try:
        # Render's free tier can take ~1 minute to wake up.
        with urllib.request.urlopen(req, timeout=120) as resp:  # noqa: S310 - fixed https URL
            result = json.load(resp)
    except urllib.error.HTTPError as e:
        print(f"Backend answered {e.code}: {e.read().decode(errors='replace')[:300]}", file=sys.stderr)
        return 1
    except (urllib.error.URLError, TimeoutError) as e:
        print(f"Could not reach the backend: {e}", file=sys.stderr)
        return 1

    print(f"expected live: {', '.join(result['expected_live']) or 'none'}")
    print(f"active alerts: {len(result['active'])}")
    for n in result["notifications"]:
        print(f"  {n['kind']:<9} {n['title']}  {n.get('channels')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
