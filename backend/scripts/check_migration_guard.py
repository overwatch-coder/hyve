from __future__ import annotations

import os
import subprocess
import sys
from typing import List


MIGRATIONS_PREFIX = "backend/alembic/versions/"
MIGRATIONS_SUFFIX = ".py"
MODEL_FILES = {
    "backend/models.py",
}


def run_git(args: List[str]) -> str:
    result = subprocess.run(
        ["git", *args],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or f"git {' '.join(args)} failed")
    return result.stdout.strip()


def get_changed_files() -> List[str]:
    event = os.getenv("GITHUB_EVENT_NAME", "")

    if event == "pull_request":
        base_ref = os.getenv("GITHUB_BASE_REF", "")
        if not base_ref:
            raise RuntimeError("GITHUB_BASE_REF is required for pull_request events")

        # Ensure base branch is available for three-dot diff.
        subprocess.run(
            ["git", "fetch", "origin", base_ref, "--depth", "1"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            check=False,
        )
        diff_target = f"origin/{base_ref}...HEAD"
    else:
        # Push/manual fallback: compare against previous commit if possible.
        has_parent = subprocess.run(
            ["git", "rev-parse", "--verify", "HEAD~1"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            check=False,
        ).returncode == 0
        if not has_parent:
            return []
        diff_target = "HEAD~1..HEAD"

    output = run_git(["diff", "--name-only", diff_target])
    if not output:
        return []
    return [line.strip() for line in output.splitlines() if line.strip()]


def has_model_change(files: List[str]) -> bool:
    return any(path in MODEL_FILES for path in files)


def has_migration_change(files: List[str]) -> bool:
    return any(
        path.startswith(MIGRATIONS_PREFIX) and path.endswith(MIGRATIONS_SUFFIX)
        for path in files
    )


def main() -> int:
    try:
        changed_files = get_changed_files()
    except Exception as exc:
        print(f"[migration-guard] ERROR: {exc}")
        return 1

    model_changed = has_model_change(changed_files)
    migration_changed = has_migration_change(changed_files)

    if model_changed and not migration_changed:
        print("[migration-guard] FAIL: backend/models.py changed without a migration file.")
        print("[migration-guard] Add a migration in backend/alembic/versions/ with:")
        print('  cd backend && alembic revision --autogenerate -m "describe change"')
        return 1

    print("[migration-guard] PASS")
    if model_changed:
        print("[migration-guard] Model changes detected and migration file present.")
    else:
        print("[migration-guard] No model schema changes detected.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
