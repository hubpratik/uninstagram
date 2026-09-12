#!/usr/bin/env python3
"""
Uninstagram deployer.

Puts your own copy of Uninstagram into your own Azure subscription: a storage
account for your photos and records, and a Container App running the public
image from GitHub Container Registry. Nothing is shared with any other copy,
including the maintainer's.

    python uninstagram.py deploy       set up a new site
    python uninstagram.py status       where it is and whether it is up
    python uninstagram.py upgrade      move to a newer release
    python uninstagram.py configure    change the watermark or photo frame
    python uninstagram.py admin-code   set a new admin code

Needs Python 3.9+ and the Azure CLI, signed in with `az login`. Standard
library only: nothing to install with pip.

Full guide: https://github.com/hubpratik/uninstagram/blob/main/docs/deploy.md
"""

from __future__ import annotations

import argparse
import getpass
import json
import os
import re
import secrets
import shlex
import shutil
import string
import subprocess
import sys
import time
import urllib.error
import urllib.request
from dataclasses import asdict, dataclass, fields
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple

# ------------------------------------------------------------------ settings --

IMAGE_REPOSITORY = "ghcr.io/hubpratik/uninstagram"
# Only used when GHCR cannot be reached to look up the newest release.
FALLBACK_VERSION = "v1.0.0"

STATE_FILE = "uninstagram-deploy.json"
DOCS_URL = "https://github.com/hubpratik/uninstagram/blob/main/docs/deploy.md"
CHANGELOG_URL = "https://github.com/hubpratik/uninstagram/blob/main/CHANGELOG.md"

# Sized on the maintainer's own site, where a personal page uses about 3% of
# the Container Apps monthly free grant.
CPU = "0.5"
MEMORY = "1.0Gi"
PORT = "3000"
MIN_REPLICAS = "0"  # sleeps when nobody is visiting, and bills nothing then
# Exactly one. The app keeps its sign-in throttles in memory, so a second copy
# would hand anyone guessing codes twice the attempts.
MAX_REPLICAS = "1"

# The image does not throttle admin sign-in, so the code itself has to be
# unguessable. A generated code is 16 characters from a 31-letter alphabet.
MIN_ADMIN_CODE_LENGTH = 16
PROVIDERS = ("Microsoft.App", "Microsoft.OperationalInsights", "Microsoft.Storage")
STORAGE_TAG = ("uninstagram", "media")

SEMVER = re.compile(r"^v(\d+)\.(\d+)\.(\d+)$")

# Error text that means "that resource does not exist", as opposed to "the
# lookup itself failed". Deliberately specific: treating an auth or network
# failure as "not found" would lead straight to creating a duplicate.
NOT_FOUND = ("resourcenotfound", "resourcegroupnotfound", "was not found", "could not be found")

# Characters cmd.exe would reinterpret if az.cmd ever has to be run through it.
CMD_UNSAFE = set('&|<>^%!"\r\n')


# -------------------------------------------------------------------- output --


def say(message: str = "") -> None:
    print(message, flush=True)


def step(message: str) -> None:
    say(f"\n==> {message}")


def detail(message: str) -> None:
    say(f"    {message}")


def warn(message: str) -> None:
    say(f"\n !  {message}")


class DeployError(Exception):
    """A problem to explain to a person, rather than a stack trace."""


# ----------------------------------------------------------------- Azure CLI --


@dataclass
class Result:
    code: int
    out: str
    err: str


class Az:
    """Runs the Azure CLI.

    Every call names the subscription explicitly, so your default subscription
    (the one `az account set` chooses) is never changed.
    """

    def __init__(self, dry_run: bool = False, verbose: bool = False) -> None:
        self.dry_run = dry_run
        self.verbose = verbose
        self.subscription: Optional[str] = None
        self._hidden: List[str] = []
        self._launcher, self._through_cmd = self._locate()

    @staticmethod
    def _locate() -> Tuple[List[str], bool]:
        path = shutil.which("az")
        if not path:
            raise DeployError(
                "The Azure CLI (az) is not installed, or is not on your PATH.\n"
                "    Install it from https://learn.microsoft.com/cli/azure/install-azure-cli\n"
                "    and then run:  az login"
            )
        if os.name == "nt" and path.lower().endswith((".cmd", ".bat")):
            # On Windows, `az` is a batch file that starts the Python bundled with
            # the CLI. Running it through cmd.exe would reinterpret characters such
            # as & | ^ % inside your values - a watermark like "Tom & Jerry", or an
            # admin code. Starting the bundled Python directly keeps cmd out of it.
            bundled = Path(path).resolve().parent.parent / "python.exe"
            if bundled.is_file():
                return [str(bundled), "-IBm", "azure.cli"], False
            return [path], True
        return [path], False

    def hide(self, value: str) -> str:
        """Register a secret so it never appears in printed commands or errors."""
        if value:
            self._hidden.append(value)
        return value

    def _scrub(self, text: str) -> str:
        for value in self._hidden:
            text = text.replace(value, "********")
        return text

    def call(
        self,
        args: Sequence[str],
        *,
        mutates: bool = False,
        check: bool = True,
        scoped: bool = True,
    ) -> Result:
        argv = list(args)
        if scoped and self.subscription:
            argv += ["--subscription", self.subscription]
        shown = self._scrub(" ".join(shlex.quote(a) for a in ["az", *argv]))

        if self._through_cmd and any(CMD_UNSAFE & set(a) for a in argv):
            raise DeployError(
                "A value contains a character (& | < > ^ % ! or a double quote) that cannot be\n"
                "    passed safely through az.cmd on this machine. Reinstall the Azure CLI with the\n"
                "    official Windows installer, or leave that character out."
            )

        if mutates and self.dry_run:
            say(f"    [dry run] {shown}")
            return Result(0, "", "")
        if self.verbose:
            say(f"    $ {shown}")

        env = dict(os.environ)
        env.update(
            PYTHONIOENCODING="utf-8",
            AZURE_CORE_ONLY_SHOW_ERRORS="true",
            AZURE_CORE_NO_COLOR="true",
        )
        try:
            proc = subprocess.run(
                [*self._launcher, *argv],
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                env=env,
                stdin=subprocess.DEVNULL,
            )
        except OSError as error:
            raise DeployError(f"Could not start the Azure CLI: {error}") from error

        # The Windows CLI ends lines with CRLF. A stray carriage return once made
        # its way into a stored connection string and broke a site at runtime.
        out = proc.stdout.replace("\r", "").strip()
        err = self._scrub(proc.stderr.replace("\r", "").strip())
        if check and proc.returncode != 0:
            raise DeployError(
                f"This Azure CLI command failed:\n    {shown}\n\n    {err or '(no error text)'}"
            )
        return Result(proc.returncode, out, err)

    def json(self, args: Sequence[str], **kwargs: Any) -> Any:
        result = self.call([*args, "-o", "json"], **kwargs)
        if result.code != 0 or not result.out:
            return None
        try:
            return json.loads(result.out)
        except json.JSONDecodeError as error:
            raise DeployError(f"Unexpected output from: az {' '.join(args)}") from error

    def text(self, args: Sequence[str], **kwargs: Any) -> str:
        result = self.call([*args, "-o", "tsv"], **kwargs)
        return result.out if result.code == 0 else ""

    def exists(self, args: Sequence[str]) -> bool:
        result = self.call([*args, "-o", "none"], check=False)
        if result.code == 0:
            return True
        if any(marker in result.err.lower() for marker in NOT_FOUND):
            return False
        raise DeployError(
            f"Could not check whether this exists:\n    az {' '.join(args)}\n\n    {result.err}"
        )


# --------------------------------------------------------------------- state --


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


@dataclass
class Deployment:
    """Everything needed to find your site again. Holds no secrets."""

    subscription_id: str = ""
    subscription_name: str = ""
    resource_group: str = ""
    location: str = ""
    environment: str = ""
    app: str = ""
    storage_account: str = ""
    image: str = ""
    url: str = ""
    updated: str = ""

    @classmethod
    def load(cls, path: Path) -> Optional["Deployment"]:
        if not path.is_file():
            return None
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            raise DeployError(f"Could not read {path}: {error}") from error
        known = {f.name for f in fields(cls)}
        return cls(**{k: v for k, v in raw.items() if k in known and isinstance(v, str)})

    def save(self, path: Path, dry_run: bool) -> None:
        if dry_run:
            return
        self.updated = now_iso()
        data = {
            "_about": (
                "Written by uninstagram.py. Holds no secrets. storage_account is where "
                "your photos live - keep this file."
            ),
            **asdict(self),
        }
        path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


# ------------------------------------------------------------------- prompts --


def interactive() -> bool:
    return sys.stdin.isatty()


def ask(
    question: str,
    *,
    default: str = "",
    check: Optional[Callable[[str], Optional[str]]] = None,
    flag: str = "",
) -> str:
    """Ask for a value. With no terminal, the default is used if it is valid."""
    if not interactive():
        if check is None or check(default) is None:
            return default
        hint = f" Pass {flag}." if flag else ""
        raise DeployError(f"{question}: there is no terminal to ask in.{hint}")

    while True:
        hint = f" [{default}]" if default else ""
        try:
            raw = input(f"{question}{hint}: ")
        except EOFError as error:
            # Input ran out: piped in, or a terminal with nothing behind it. Use the
            # default when it is a valid answer, exactly as when there is no terminal.
            if check is None or check(default) is None:
                say("")
                return default
            flag_hint = f" Pass {flag}." if flag else ""
            raise DeployError(f"No answer given for: {question}.{flag_hint}") from error
        value = raw.strip() or default
        problem = check(value) if check else None
        if problem is None:
            return value
        detail(problem)


def ask_yes(question: str, *, default: bool, assume_yes: bool) -> bool:
    if assume_yes:
        return True
    if not interactive():
        raise DeployError("This needs a yes or no, and there is no terminal to ask in. Pass --yes.")
    hint = "[Y/n]" if default else "[y/N]"
    try:
        raw = input(f"\n{question} {hint}: ").strip().lower()
    except EOFError as error:
        raise DeployError("This needs a yes or no, and no answer came. Pass --yes.") from error
    return default if not raw else raw in ("y", "yes")


def choose(question: str, options: List[str], default_index: int = 0) -> int:
    for number, label in enumerate(options, 1):
        detail(f"{number}. {label}")
    value = ask(
        question,
        default=str(default_index + 1),
        check=lambda v: None
        if v.isdigit() and 1 <= int(v) <= len(options)
        else f"Enter a number from 1 to {len(options)}.",
    )
    return int(value) - 1


# ---------------------------------------------------------------- validation --


def check_app_name(value: str) -> Optional[str]:
    if re.fullmatch(r"[a-z][a-z0-9-]{0,30}[a-z0-9]", value) and "--" not in value:
        return None
    return (
        "Use 2-32 lowercase letters, digits and single hyphens, starting with a letter "
        "and not ending with a hyphen."
    )


def check_resource_group(value: str) -> Optional[str]:
    if re.fullmatch(r"[A-Za-z0-9_\-.()]{1,90}", value) and not value.endswith("."):
        return None
    return "Use up to 90 letters, digits, and - _ . ( ), not ending with a full stop."


def check_name(value: str) -> Optional[str]:
    return None if 1 <= len(value) <= 60 else "Enter between 1 and 60 characters."


def check_watermark(value: str) -> Optional[str]:
    return None if len(value) <= 60 else "Keep it to 60 characters or fewer."


def check_border(value: str) -> Optional[str]:
    if value == "":
        return None
    try:
        number = float(value)
    except ValueError:
        return "Enter a number such as 2.2, or 0 for no frame."
    return None if 0 <= number <= 20 else "Enter a number from 0 to 20."


def check_admin_code(value: str) -> Optional[str]:
    if len(value) < MIN_ADMIN_CODE_LENGTH:
        return f"Use at least {MIN_ADMIN_CODE_LENGTH} characters."
    if value != value.strip():
        return "Spaces at the start or end are too easy to get wrong later. Leave them out."
    return None


def require(value: Optional[str], check: Callable[[str], Optional[str]], flag: str) -> None:
    """Validate a value given on the command line before touching Azure."""
    if value is None:
        return
    problem = check(value)
    if problem:
        raise DeployError(f"{flag} {value!r}: {problem}")


def generate_admin_code() -> str:
    # No 0/o or 1/l/i: this gets read off a screen and typed on a phone.
    alphabet = "abcdefghjkmnpqrstuvwxyz23456789"
    return "-".join("".join(secrets.choice(alphabet) for _ in range(4)) for _ in range(4))


def obtain_admin_code() -> Tuple[str, bool]:
    """Return (code, whether it was generated)."""
    from_env = os.environ.get("UNINSTAGRAM_ADMIN_CODE", "")
    if from_env:
        problem = check_admin_code(from_env)
        if problem:
            raise DeployError(f"UNINSTAGRAM_ADMIN_CODE: {problem}")
        detail("using the admin code from the UNINSTAGRAM_ADMIN_CODE environment variable")
        return from_env, False

    if not interactive():
        raise DeployError(
            "An admin code is needed and there is no terminal to ask in.\n"
            "    Set the UNINSTAGRAM_ADMIN_CODE environment variable and run again."
        )

    detail("Your admin code unlocks posting and managing, at /admin on your site.")
    detail(
        f"Press Enter to generate one (recommended), or type your own of at least "
        f"{MIN_ADMIN_CODE_LENGTH} characters."
    )
    while True:
        first = getpass.getpass("Admin code (typing is hidden): ")
        if not first:
            return generate_admin_code(), True
        problem = check_admin_code(first)
        if problem:
            detail(problem)
            continue
        if getpass.getpass("Type it again: ") != first:
            detail("Those did not match. Try again.")
            continue
        return first, False


def show_generated_code(code: str) -> None:
    say("")
    say("    +--------------------------------------------------------------+")
    say(f"    |  Your admin code:  {code:<42}|")
    say("    |  Write it down now. It unlocks posting and managing.         |")
    say("    +--------------------------------------------------------------+")


# ------------------------------------------------------------------- lookups --


def pick_subscription(az: Az, requested: str, remembered: str) -> Tuple[str, str]:
    subs = (
        az.json(
            [
                "account",
                "list",
                "--query",
                "[?state=='Enabled'].{id:id, name:name, isDefault:isDefault}",
            ],
            scoped=False,
        )
        or []
    )
    if not subs:
        raise DeployError(
            "Your Azure account has no enabled subscriptions.\n"
            "    Create one at https://azure.microsoft.com/free and try again."
        )

    wanted = requested or remembered
    if wanted:
        for sub in subs:
            if wanted in (sub["id"], sub["name"]):
                chosen = sub
                break
        else:
            raise DeployError(f"Subscription {wanted!r} is not one of this account's enabled subscriptions.")
    elif len(subs) == 1:
        chosen = subs[0]
    else:
        say("\nWhich Azure subscription should this go in?")
        default = next((i for i, s in enumerate(subs) if s.get("isDefault")), 0)
        chosen = subs[choose("Subscription", [f"{s['name']}  ({s['id']})" for s in subs], default)]

    az.subscription = chosen["id"]
    detail(f"subscription: {chosen['name']}")
    return chosen["id"], chosen["name"]


def container_app_regions(az: Az) -> List[str]:
    names = (
        az.json(
            [
                "provider",
                "show",
                "--namespace",
                "Microsoft.App",
                "--query",
                "resourceTypes[?resourceType=='managedEnvironments'] | [0].locations",
            ],
            check=False,
        )
        or []
    )
    # "Central India" -> "centralindia", the form every az command expects.
    return sorted({name.lower().replace(" ", "") for name in names})


def find_storage(az: Az, resource_group: str) -> str:
    key, value = STORAGE_TAG
    names = (
        az.json(
            [
                "storage",
                "account",
                "list",
                "-g",
                resource_group,
                "--query",
                f"[?tags.{key}=='{value}'].name",
            ],
            check=False,
        )
        or []
    )
    return names[0] if names else ""


def new_storage_name(az: Az) -> str:
    alphabet = string.ascii_lowercase + string.digits
    for _ in range(10):
        candidate = "uninsta" + "".join(secrets.choice(alphabet) for _ in range(12))
        available = az.text(
            ["storage", "account", "check-name", "--name", candidate, "--query", "nameAvailable"]
        )
        if available == "true":
            return candidate
    raise DeployError("Could not find a free storage account name. Please try again.")


def published_versions() -> List[str]:
    host, _, name = IMAGE_REPOSITORY.partition("/")
    if host != "ghcr.io":
        return []
    with urllib.request.urlopen(
        f"https://ghcr.io/token?scope=repository:{name}:pull", timeout=20
    ) as response:
        token = json.load(response)["token"]
    request = urllib.request.Request(
        f"https://ghcr.io/v2/{name}/tags/list?n=1000",
        headers={"Authorization": f"Bearer {token}"},
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        tags = json.load(response).get("tags") or []
    releases = [tag for tag in tags if SEMVER.match(tag)]
    return sorted(releases, key=lambda tag: tuple(int(p) for p in SEMVER.match(tag).groups()))


def try_published_versions() -> Optional[List[str]]:
    try:
        return published_versions()
    except (urllib.error.URLError, OSError, ValueError, KeyError):
        return None


def resolve_image(image_flag: Optional[str], version_flag: Optional[str]) -> str:
    if image_flag:
        return image_flag

    versions = try_published_versions()
    if version_flag:
        version = version_flag if version_flag.startswith("v") else f"v{version_flag}"
        if not SEMVER.match(version):
            raise DeployError(f"{version_flag!r} is not a release version like v1.2.3.")
        if versions is not None and version not in versions:
            listed = ", ".join(versions[-8:]) or "none yet"
            raise DeployError(f"{version} has not been published. Available: {listed}")
        return f"{IMAGE_REPOSITORY}:{version}"

    if versions:
        return f"{IMAGE_REPOSITORY}:{versions[-1]}"
    if versions is None:
        warn(f"Could not reach GHCR to find the newest release, so using {FALLBACK_VERSION}.")
    return f"{IMAGE_REPOSITORY}:{FALLBACK_VERSION}"


def describe(az: Az, resource_group: str, app: str, sub_id: str, sub_name: str) -> Deployment:
    info = (
        az.json(
            [
                "containerapp",
                "show",
                "-g",
                resource_group,
                "-n",
                app,
                "--query",
                "{fqdn:properties.configuration.ingress.fqdn, "
                "image:properties.template.containers[0].image, "
                "environment:properties.environmentId, location:location}",
            ]
        )
        or {}
    )
    return Deployment(
        subscription_id=sub_id,
        subscription_name=sub_name,
        resource_group=resource_group,
        location=(info.get("location") or "").lower().replace(" ", ""),
        environment=(info.get("environment") or "").rsplit("/", 1)[-1],
        app=app,
        storage_account=find_storage(az, resource_group),
        image=info.get("image") or "",
        url=f"https://{info['fqdn']}" if info.get("fqdn") else "",
    )


# ------------------------------------------------------------------- waiting --


def revision_suffix() -> str:
    # Container Apps only starts a new revision when its template changes, and
    # redeploying an unchanged image changes nothing - so the "update" would
    # quietly do nothing. A unique suffix always counts as a change, and leaves a
    # real revision behind that you can roll back to.
    return "r" + datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")


def wait_for_environment(az: Az, resource_group: str, name: str, *, minutes: int = 20) -> None:
    started = time.monotonic()
    next_note = 60.0
    while time.monotonic() - started < minutes * 60:
        state = az.text(
            [
                "containerapp",
                "env",
                "show",
                "-g",
                resource_group,
                "-n",
                name,
                "--query",
                "properties.provisioningState",
            ],
            check=False,
        )
        if state == "Succeeded":
            return
        if state == "Failed":
            raise DeployError(
                f"Azure could not create the Container Apps environment {name!r}.\n"
                f"    See the troubleshooting section of {DOCS_URL}"
            )
        elapsed = time.monotonic() - started
        if elapsed >= next_note:
            detail(f"still being created ({int(elapsed // 60)} min so far; 3-8 minutes is normal)")
            next_note += 60
        time.sleep(15)
    raise DeployError(
        f"The Container Apps environment is still being created after {minutes} minutes.\n"
        "    Run the same command again later; it carries on from where it stopped."
    )


def wait_for_revision(az: Az, resource_group: str, app: str, *, minutes: int = 10) -> Dict[str, Any]:
    query = (
        "{latest:properties.latestRevisionName, ready:properties.latestReadyRevisionName, "
        "state:properties.provisioningState, fqdn:properties.configuration.ingress.fqdn}"
    )
    started = time.monotonic()
    info: Dict[str, Any] = {}
    while time.monotonic() - started < minutes * 60:
        info = az.json(["containerapp", "show", "-g", resource_group, "-n", app, "--query", query]) or {}
        if info.get("state") == "Failed":
            raise DeployError(
                "Azure reports the container app as Failed. The system log usually says why:\n"
                f"    az containerapp logs show -g {resource_group} -n {app} --type system"
            )
        if info.get("latest") and info.get("latest") == info.get("ready"):
            detail(f"revision {info['latest']} is ready")
            return info
        time.sleep(10)
    warn("The new revision has not reported ready yet. Checking the site anyway.")
    return info


def fetch(url: str, *, body: Optional[bytes] = None, timeout: int = 60) -> int:
    headers = {"User-Agent": "uninstagram-deployer"}
    if body is not None:
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(
        url, data=body, headers=headers, method="POST" if body is not None else "GET"
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status
    except urllib.error.HTTPError as error:
        return error.code


def wait_for_site(url: str, *, minutes: int = 8) -> bool:
    started = time.monotonic()
    last = "no answer yet"
    while time.monotonic() - started < minutes * 60:
        try:
            status = fetch(url)
            if status == 200:
                detail(f"answered after {int(time.monotonic() - started)}s")
                return True
            last = f"HTTP {status}"
        except (urllib.error.URLError, OSError) as error:
            last = str(getattr(error, "reason", error))
        time.sleep(10)
    warn(f"{url} has not answered yet (last result: {last}).")
    return False


def admin_sign_in_status(url: str, code: str) -> Optional[int]:
    try:
        return fetch(f"{url}/api/admin/session", body=json.dumps({"code": code}).encode())
    except (urllib.error.URLError, OSError):
        return None


def report_admin_check(url: str, code: str) -> None:
    status = admin_sign_in_status(url, code)
    if status == 200:
        detail("admin code accepted")
    elif status == 429:
        warn("The admin check was refused because of too many wrong codes recently. Wait ten minutes.")
    else:
        warn(
            f"The site is up, but signing in with the admin code returned {status}.\n"
            f"    See the troubleshooting section of {DOCS_URL}"
        )


# ------------------------------------------------------------------ commands --


def open_existing(args: argparse.Namespace, *, update_extension: bool) -> Tuple[Az, Deployment, Path]:
    state_path = Path(args.state)
    remembered = Deployment.load(state_path)
    az = Az(dry_run=args.dry_run, verbose=args.verbose)
    preflight(az, update_extension=update_extension)

    sub_id, sub_name = pick_subscription(
        az, args.subscription or "", remembered.subscription_id if remembered else ""
    )
    resource_group = (
        args.resource_group
        or (remembered.resource_group if remembered else "")
        or ask("Resource group", default="uninstagram-rg", check=check_resource_group, flag="--resource-group")
    )
    app = (
        args.app
        or (remembered.app if remembered else "")
        or ask("App name", default="uninstagram", check=check_app_name, flag="--app")
    )

    if not az.exists(["containerapp", "show", "-g", resource_group, "-n", app]):
        raise DeployError(
            f"There is no Uninstagram app called {app!r} in resource group {resource_group!r}.\n"
            "    Set one up with:  python uninstagram.py deploy"
        )

    deployment = describe(az, resource_group, app, sub_id, sub_name)
    if remembered is None and not az.dry_run:
        deployment.save(state_path, az.dry_run)
        detail(f"recorded this deployment in {state_path}")
    return az, deployment, state_path


def preflight(az: Az, *, update_extension: bool) -> None:
    step("Checking your Azure CLI")
    version = az.json(["version"], scoped=False, check=False) or {}
    detail(f"Azure CLI {version.get('azure-cli', '(version unknown)')}")

    account = az.json(["account", "show"], scoped=False, check=False)
    if not account:
        raise DeployError("You are not signed in to Azure. Run:  az login")
    detail(f"signed in as {account.get('user', {}).get('name', 'unknown')}")

    installed = az.json(["extension", "show", "--name", "containerapp"], scoped=False, check=False)
    if az.dry_run:
        if not installed:
            raise DeployError(
                "The Azure CLI's containerapp extension is not installed, so a dry run cannot look\n"
                "    for an existing site. Install it with:  az extension add --name containerapp"
            )
        return
    if not installed or update_extension:
        detail("updating the containerapp extension" if installed else "installing the containerapp extension")
        az.call(["extension", "add", "--name", "containerapp", "--upgrade", "--only-show-errors"], scoped=False)


def register_providers(az: Az) -> None:
    for namespace in PROVIDERS:
        state = az.text(
            ["provider", "show", "--namespace", namespace, "--query", "registrationState"], check=False
        )
        if state == "Registered":
            continue
        detail(f"registering {namespace} with your subscription (first time only; can take a few minutes)")
        az.call(["provider", "register", "--namespace", namespace, "--wait"], mutates=True)


def cmd_deploy(args: argparse.Namespace) -> int:
    # Validate everything given on the command line before touching Azure.
    require(args.resource_group, check_resource_group, "--resource-group")
    require(args.app, check_app_name, "--app")
    require(args.name, check_name, "--name")
    require(args.watermark, check_watermark, "--watermark")
    require(args.border, check_border, "--border")

    state_path = Path(args.state)
    remembered = Deployment.load(state_path)
    az = Az(dry_run=args.dry_run, verbose=args.verbose)
    preflight(az, update_extension=True)

    step("Where it goes")
    sub_id, sub_name = pick_subscription(
        az, args.subscription or "", remembered.subscription_id if remembered else ""
    )
    resource_group = (
        args.resource_group
        or (remembered.resource_group if remembered else "")
        or ask(
            "Resource group (a folder in Azure for everything this creates)",
            default="uninstagram-rg",
            check=check_resource_group,
            flag="--resource-group",
        )
    )
    app = (
        args.app
        or (remembered.app if remembered else "")
        or ask(
            "App name (becomes the start of your web address)",
            default="uninstagram",
            check=check_app_name,
            flag="--app",
        )
    )

    group_exists = bool(az.json(["group", "exists", "-n", resource_group]))
    if group_exists and az.exists(["containerapp", "show", "-g", resource_group, "-n", app]):
        deployment = describe(az, resource_group, app, sub_id, sub_name)
        deployment.save(state_path, az.dry_run)
        say(f"\nYou already have Uninstagram here: {deployment.url}")
        say("Nothing was changed.")
        say("  Move to a newer release:   python uninstagram.py upgrade")
        say('  Change the watermark:      python uninstagram.py configure --watermark "..."')
        say("  See how it is doing:       python uninstagram.py status")
        return 0

    regions = container_app_regions(az)
    group_location = (
        az.text(["group", "show", "-n", resource_group, "--query", "location"]) if group_exists else ""
    )

    def check_location(value: str) -> Optional[str]:
        if not re.fullmatch(r"[a-z0-9]+", value):
            return "Use the short region name, such as eastus, westeurope or centralindia."
        if regions and value not in regions:
            return f"Container Apps is not offered in {value!r}. Some that are: {', '.join(regions[:10])} ..."
        return None

    require(args.location, check_location, "--location")
    default_location = group_location if group_location and (not regions or group_location in regions) else "eastus"
    location = args.location or ask(
        "Azure region - pick one near you and your visitors",
        default=default_location,
        check=check_location,
        flag="--location",
    )

    step("Your photos")
    owner = args.name or ask("Your name, for the watermark on your photos", check=check_name, flag="--name")
    # Set explicitly rather than left to the app's "© <profile name>" default:
    # until the owner saves a profile that name is "Uninstagram", and a watermark
    # is burned into each photo for good.
    watermark = (
        args.watermark
        if args.watermark is not None
        else ask("Text burned into the corner of every photo", default=f"© {owner}", check=check_watermark)
    ) or f"© {owner}"
    border = args.border if args.border is not None else ""

    step("Admin code")
    code, generated = obtain_admin_code()
    az.hide(code)
    if generated:
        show_generated_code(code)
    app_secret = az.hide(secrets.token_hex(32))

    image = resolve_image(args.image, args.version)
    environment = f"{app}-env"
    storage = find_storage(az, resource_group) if group_exists else ""
    storage_exists = bool(storage)
    if not storage:
        storage = new_storage_name(az)
    environment_exists = group_exists and az.exists(
        ["containerapp", "env", "show", "-g", resource_group, "-n", environment]
    )

    def state_of(exists: bool) -> str:
        return "already there, reused" if exists else "new"

    step(f'The plan, in subscription "{sub_name}"')
    detail(f"Resource group   {resource_group}  ({state_of(group_exists)})")
    detail(f"Storage account  {storage}  ({state_of(storage_exists)}) - your photos and records")
    detail(f"Environment      {environment}  ({state_of(environment_exists)}) - includes a log workspace")
    detail(f"Container app    {app}  (new) in {location}")
    detail(f"Image            {image}")
    detail(f"Size             {CPU} vCPU, {MEMORY.replace('Gi', ' GiB')}, sleeps when idle")
    detail(f"Watermark        {watermark}")
    say("")
    detail("What it costs: from nothing to a few dollars a month. It sleeps when nobody is")
    detail("visiting and costs nothing while asleep; Azure's free grant covers about 100 awake")
    detail("hours a month. The first visit after a sleep takes about 20 seconds.")
    detail(f"Details: {DOCS_URL}#what-it-costs")

    if not ask_yes("Create it?", default=True, assume_yes=args.yes):
        say("Nothing was created.")
        return 1

    step("Registering Azure services with your subscription")
    register_providers(az)

    step("Resource group")
    if not group_exists:
        az.call(
            ["group", "create", "-n", resource_group, "-l", location, "--tags", "app=uninstagram"],
            mutates=True,
        )
    detail(resource_group)

    step("Storage account")
    if not storage_exists:
        az.call(
            [
                "storage", "account", "create",
                "-g", resource_group,
                "-n", storage,
                "-l", location,
                "--sku", "Standard_LRS",
                "--kind", "StorageV2",
                "--access-tier", "Hot",
                "--min-tls-version", "TLS1_2",
                "--https-only", "true",
                # Photos are served through the app, never straight from storage.
                "--allow-blob-public-access", "false",
                "--tags", f"{STORAGE_TAG[0]}={STORAGE_TAG[1]}", "app=uninstagram",
            ],
            mutates=True,
        )
    if az.dry_run:
        connection = "<connection string>"
    else:
        connection = az.text(
            [
                "storage", "account", "show-connection-string",
                "-g", resource_group, "-n", storage,
                "--query", "connectionString",
            ]
        )
        if not connection.startswith("DefaultEndpointsProtocol="):
            raise DeployError(f"Could not read the connection string for storage account {storage}.")
    az.hide(connection)
    detail(storage)

    step("Container Apps environment")
    if not environment_exists:
        # This call regularly reports a transient error while Azure carries on
        # creating the environment in the background. The wait below decides
        # whether it worked, not the exit code.
        az.call(
            [
                "containerapp", "env", "create",
                "-g", resource_group, "-n", environment, "-l", location,
                "--tags", "app=uninstagram",
            ],
            mutates=True,
            check=False,
        )
    if not az.dry_run:
        wait_for_environment(az, resource_group, environment)
    detail(environment)

    step("Container app")
    settings = [
        "UNINSTAGRAM_STORE=azure",
        "AZURE_STORAGE_CONNECTION_STRING=secretref:storage-connection",
        "UNINSTAGRAM_ADMIN_CODE=secretref:admin-code",
        "UNINSTAGRAM_SECRET=secretref:app-secret",
        "AZURE_BLOB_CONTAINER=media",
        f"UNINSTAGRAM_WATERMARK={watermark}",
    ]
    if border:
        settings.append(f"UNINSTAGRAM_BORDER_PERCENT={border}")

    az.call(
        [
            "containerapp", "create",
            "-g", resource_group, "-n", app,
            "--environment", environment,
            "--image", image,
            "--target-port", PORT,
            "--ingress", "external",
            "--cpu", CPU, "--memory", MEMORY,
            "--min-replicas", MIN_REPLICAS, "--max-replicas", MAX_REPLICAS,
            "--revision-suffix", revision_suffix(),
            "--tags", "app=uninstagram",
            "--secrets",
            f"storage-connection={connection}",
            f"admin-code={code}",
            f"app-secret={app_secret}",
            "--env-vars", *settings,
        ],
        mutates=True,
    )

    if az.dry_run:
        say("\nDry run finished. Nothing was created or changed.")
        return 0

    info = wait_for_revision(az, resource_group, app)
    if not info.get("fqdn"):
        raise DeployError("The container app has no web address. The deployment did not complete.")
    url = f"https://{info['fqdn']}"

    step("Waiting for your site to answer (the first start downloads the image; allow a few minutes)")
    if wait_for_site(url):
        report_admin_check(url, code)

    deployment = Deployment(
        subscription_id=sub_id,
        subscription_name=sub_name,
        resource_group=resource_group,
        location=location,
        environment=environment,
        app=app,
        storage_account=storage,
        image=image,
        url=url,
    )
    deployment.save(state_path, az.dry_run)

    say("\nYour Uninstagram is live.\n")
    detail(f"Your page   {url}")
    detail(f"Admin       {url}/admin")
    if generated:
        show_generated_code(code)
    say("\nNext:")
    detail("1. Open the admin link and enter your admin code.")
    detail('2. Press "Edit profile" to set your name, photo and bio. Until you do, the page')
    detail('   is titled "Uninstagram".')
    detail("3. Post your first photo with the + at the top of the page.")
    detail("4. Send the page link to the people you want to see it.")
    say(f"\nKeep {state_path.name}: it records which storage account holds your photos.")
    return 0


def finish_rollout(az: Az, deployment: Deployment, state_path: Path) -> bool:
    if az.dry_run:
        say("\nDry run finished. Nothing was changed.")
        return False
    wait_for_revision(az, deployment.resource_group, deployment.app)
    step("Checking your site")
    wait_for_site(deployment.url)
    deployment.save(state_path, az.dry_run)
    return True


def cmd_upgrade(args: argparse.Namespace) -> int:
    az, deployment, state_path = open_existing(args, update_extension=True)
    target = resolve_image(args.image, args.version)
    previous = deployment.image

    step("Upgrade")
    detail(f"running now   {previous}")
    detail(f"moving to     {target}")
    if target == previous and not args.force:
        say("\nAlready on that version. Nothing to do. (--force restarts on it anyway.)")
        return 0
    detail(f"what changed  {CHANGELOG_URL}")
    detail("Your photos, visitors, settings and admin code are not touched.")
    if not ask_yes("Upgrade now?", default=True, assume_yes=args.yes):
        say("Nothing was changed.")
        return 1

    az.call(
        [
            "containerapp", "update",
            "-g", deployment.resource_group, "-n", deployment.app,
            "--image", target,
            "--revision-suffix", revision_suffix(),
        ],
        mutates=True,
    )
    deployment.image = target
    if finish_rollout(az, deployment, state_path):
        say(f"\nDone. Now running {target}.")
        say(f"To go back:  python uninstagram.py upgrade --image {previous}")
    return 0


def cmd_configure(args: argparse.Namespace) -> int:
    changes: Dict[str, str] = {}
    for value, check, flag, variable in (
        (args.watermark, check_watermark, "--watermark", "UNINSTAGRAM_WATERMARK"),
        (args.border, check_border, "--border", "UNINSTAGRAM_BORDER_PERCENT"),
    ):
        require(value, check, flag)
        if value is not None:
            changes[variable] = value
    if not changes:
        raise DeployError("Nothing to change. Pass --watermark or --border.")

    az, deployment, state_path = open_existing(args, update_extension=False)

    step("Changes")
    for variable, value in changes.items():
        detail(f"{variable} = {value!r}" if value else f"{variable} = (back to the default)")
    if "UNINSTAGRAM_WATERMARK" in changes or "UNINSTAGRAM_BORDER_PERCENT" in changes:
        detail("Photos already posted keep the mark and frame they were uploaded with.")
    if not ask_yes("Apply?", default=True, assume_yes=args.yes):
        say("Nothing was changed.")
        return 1

    az.call(
        [
            "containerapp", "update",
            "-g", deployment.resource_group, "-n", deployment.app,
            "--set-env-vars", *[f"{k}={v}" for k, v in changes.items()],
            "--revision-suffix", revision_suffix(),
        ],
        mutates=True,
    )
    if finish_rollout(az, deployment, state_path):
        say("\nDone.")
    return 0


def cmd_admin_code(args: argparse.Namespace) -> int:
    az, deployment, state_path = open_existing(args, update_extension=False)

    step("New admin code")
    code, generated = obtain_admin_code()
    az.hide(code)
    if generated:
        show_generated_code(code)

    # Changing the code alone keeps every device that is already signed in as
    # admin signed in: their cookies are signed with a separate key. If the old
    # code might have leaked, that key has to change too.
    sign_out = args.sign_out_everywhere or (
        interactive()
        and not args.yes
        and ask_yes(
            "Also sign out every device currently signed in as admin?\n"
            "    (Say yes if someone else may know the old code.)",
            default=False,
            assume_yes=False,
        )
    )
    new_secrets = [f"admin-code={code}"]
    if sign_out:
        new_secrets.append(f"app-secret={az.hide(secrets.token_hex(32))}")

    az.call(
        [
            "containerapp", "secret", "set",
            "-g", deployment.resource_group, "-n", deployment.app,
            "--secrets", *new_secrets,
        ],
        mutates=True,
    )
    # A running copy read its secrets when it started. A new revision reads them again.
    az.call(
        [
            "containerapp", "update",
            "-g", deployment.resource_group, "-n", deployment.app,
            "--revision-suffix", revision_suffix(),
        ],
        mutates=True,
    )
    if finish_rollout(az, deployment, state_path):
        report_admin_check(deployment.url, code)
        say("\nDone. Sign in at " + deployment.url + "/admin with the new code.")
        if sign_out:
            detail("Every device that was signed in as admin will need the new code.")
    return 0


def cmd_status(args: argparse.Namespace) -> int:
    az, deployment, _ = open_existing(args, update_extension=False)
    info = (
        az.json(
            [
                "containerapp", "show",
                "-g", deployment.resource_group, "-n", deployment.app,
                "--query",
                "{state:properties.provisioningState, latest:properties.latestRevisionName, "
                "ready:properties.latestReadyRevisionName}",
            ]
        )
        or {}
    )
    replicas = az.json(
        ["containerapp", "replica", "list", "-g", deployment.resource_group, "-n", deployment.app,
         "--query", "length(@)"],
        check=False,
    )
    versions = try_published_versions() or []
    running_tag = deployment.image.rsplit(":", 1)[-1]

    step("Your Uninstagram")
    detail(f"Page            {deployment.url}")
    detail(f"Admin           {deployment.url}/admin")
    version_note = ""
    if versions and running_tag in versions and versions[-1] != running_tag:
        version_note = f"   (newer: {versions[-1]} - run: python uninstagram.py upgrade)"
    elif versions and versions[-1] == running_tag:
        version_note = "   (the newest release)"
    detail(f"Image           {deployment.image}{version_note}")
    revision_state = "ready" if info.get("latest") and info.get("latest") == info.get("ready") else "starting"
    detail(f"Revision        {info.get('latest', '-')} ({revision_state})")
    if replicas == 0:
        detail("Running copies  0 - asleep; the next visit wakes it")
    elif isinstance(replicas, int):
        detail(f"Running copies  {replicas}")
    detail(f"Storage         {deployment.storage_account or '(not tagged - see docs)'}")
    detail(f"Where           {deployment.resource_group} in {deployment.location}, {deployment.subscription_name}")

    if not args.no_wake and deployment.url:
        step("Checking the page (this wakes it if it was asleep)")
        started = time.monotonic()
        try:
            status = fetch(deployment.url, timeout=120)
            detail(f"HTTP {status} after {time.monotonic() - started:.1f}s")
        except (urllib.error.URLError, OSError) as error:
            detail(f"no answer: {getattr(error, 'reason', error)}")
    return 0


# ---------------------------------------------------------------------- main --


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="uninstagram.py",
        description="Deploy and look after your own Uninstagram on Azure.",
        epilog=f"Full guide: {DOCS_URL}",
    )
    commands = parser.add_subparsers(dest="command", metavar="command")
    commands.required = True

    common = argparse.ArgumentParser(add_help=False)
    where = common.add_argument_group("which deployment")
    where.add_argument("--subscription", help="subscription name or ID (default: ask, or the one used before)")
    where.add_argument("--resource-group", "-g", help="resource group (default: uninstagram-rg)")
    where.add_argument("--app", "-n", help="container app name (default: uninstagram)")
    where.add_argument("--state", default=STATE_FILE, help=f"file that remembers your deployment (default: {STATE_FILE})")
    how = common.add_argument_group("behaviour")
    how.add_argument("--dry-run", action="store_true", help="show what would change without changing anything")
    how.add_argument("--yes", "-y", action="store_true", help="do not stop to ask for confirmation")
    how.add_argument("--verbose", "-v", action="store_true", help="print every Azure CLI command as it runs")

    deploy = commands.add_parser("deploy", parents=[common], help="set up a new site")
    deploy.add_argument("--location", help="Azure region, e.g. eastus, westeurope, centralindia")
    deploy.add_argument("--name", help="your name, for the watermark on your photos")
    deploy.add_argument("--watermark", help="text burned into every photo (default: a copyright sign and your name)")
    deploy.add_argument("--border", help="white frame width, %% of a photo's longest side (default 2.2, 0 = none)")
    deploy.add_argument("--version", help="release to run, e.g. v1.0.0 (default: the newest)")
    deploy.add_argument("--image", help="a full image reference, to run your own build")
    deploy.set_defaults(func=cmd_deploy)

    status = commands.add_parser("status", parents=[common], help="where your site is and whether it is up")
    status.add_argument("--no-wake", action="store_true", help="do not load the page (which wakes it up)")
    status.set_defaults(func=cmd_status)

    upgrade = commands.add_parser("upgrade", parents=[common], help="move to a newer (or older) release")
    upgrade.add_argument("--version", help="release to move to (default: the newest)")
    upgrade.add_argument("--image", help="a full image reference, to run your own build")
    upgrade.add_argument("--force", action="store_true", help="roll a new revision even if already on that version")
    upgrade.set_defaults(func=cmd_upgrade)

    configure = commands.add_parser("configure", parents=[common], help="change the watermark or photo frame")
    configure.add_argument("--watermark", help='text burned into new photos ("" for the default)')
    configure.add_argument("--border", help='frame width, %% of the longest side ("" for the default, 0 = none)')
    configure.set_defaults(func=cmd_configure)

    admin = commands.add_parser("admin-code", parents=[common], help="set a new admin code")
    admin.add_argument(
        "--sign-out-everywhere",
        action="store_true",
        help="also sign out every device currently signed in as admin",
    )
    admin.set_defaults(func=cmd_admin_code)

    return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
    if sys.version_info < (3, 9):
        print("uninstagram.py needs Python 3.9 or newer.")
        return 1
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(errors="replace")  # type: ignore[attr-defined]
        except (AttributeError, ValueError):
            pass

    args = build_parser().parse_args(argv)
    try:
        return args.func(args) or 0
    except DeployError as error:
        print(f"\n !  {error}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print(
            "\n\nStopped. Every step is safe to repeat: run the same command again to carry on.",
            file=sys.stderr,
        )
        return 130


if __name__ == "__main__":
    sys.exit(main())
