# Configuration

Uninstagram is configured entirely through settings on the container. The deployer sets all of
them for you. This page is the reference: what each one does, how to change it, and why the
container is sized the way it is.

- [Settings](#settings)
- [Changing a setting later](#changing-a-setting-later)
- [The container's size](#the-containers-size)
- [Always on](#always-on)
- [Running your own build](#running-your-own-build)

---

## Settings

| Setting | Set by the deployer to | What it does |
| --- | --- | --- |
| `UNINSTAGRAM_STORE` | `azure` | Which storage drivers run. `azure` uses Blob and Table Storage. The image also supports `json`, which keeps everything on the container's own disk — useful for a quick local try-out, but **everything is lost when the container restarts**. |
| `AZURE_STORAGE_CONNECTION_STRING` | your storage account, **as a secret** | Where your photos and records live. It grants full access to the storage account: treat it like a password. |
| `UNINSTAGRAM_ADMIN_CODE` | the code you chose or were given, **as a secret** | Unlocks posting and managing at `/admin`. It is the only thing keeping people out of admin, so make it long and random. If it is empty, admin sign-in is switched off. |
| `UNINSTAGRAM_SECRET` | a random key, **as a secret** | Signs the admin cookie. **It must be set to a long random value.** If it is missing, the app falls back to a development key that is published in this source code, and anyone could make themselves admin. Changing it signs out every device signed in as admin. |
| `AZURE_BLOB_CONTAINER` | `media` | The blob container for photos. Created automatically the first time it is needed. |
| `UNINSTAGRAM_WATERMARK` | `© <your name>`, or what you typed | Text burned into the bottom-right corner of every uploaded photo. Unset or blank means `© <your profile name>`. |
| `UNINSTAGRAM_BORDER_PERCENT` | unset | Width of the white frame burned around each photo, as a percentage of its longest side. Unset or blank means `2.2` (about 32 px on a 1440 px photo). `0` means no frame. |

Rarely needed — only if two sites share one storage account:

| Setting | Default |
| --- | --- |
| `AZURE_TABLE_PROFILE` | `profile` |
| `AZURE_TABLE_POSTS` | `posts` |
| `AZURE_TABLE_COMMENTS` | `comments` |
| `AZURE_TABLE_LIKES` | `likes` |
| `AZURE_TABLE_VISITORS` | `visitors` |

**The watermark and the frame are burned into each photo when it is uploaded.** Changing either
setting affects new uploads only; photos already posted keep what they were uploaded with.

## Changing a setting later

With the deployer, from the folder holding `uninstagram-deploy.json`:

```bash
python uninstagram.py configure --watermark "© Jane, 2026"
```

```bash
python uninstagram.py configure --border 0
```

```bash
python uninstagram.py admin-code
```

Pass `""` to put a setting back to its default, for example `--watermark ""`.

By hand, with the Azure CLI. A new revision suffix makes the change take effect at once:

```bash
az containerapp update -g uninstagram-rg -n uninstagram --set-env-vars "UNINSTAGRAM_WATERMARK=© Jane" --revision-suffix r$(date +%s)
```

Secrets are changed with `az containerapp secret set`, and are only read when a copy of the app
starts — so roll a new revision afterwards, as above. `python uninstagram.py admin-code` does both.

## The container's size

| | Value | Why |
| --- | --- | --- |
| CPU and memory | 0.5 vCPU, 1 GiB | Enough to resize and watermark a ten-photo carousel on upload. It has not been tuned any smaller. |
| Fewest copies | 0 | The app stops when nobody is visiting, and nothing is billed while it is stopped. The first visit after that waits about 20 seconds. |
| Most copies | 1 | The limit on visitor-code guesses lives in the app's memory. A second copy would keep its own count, doubling the guesses anyone gets. |

Please keep the maximum at one unless you first move that limit to shared storage.

## Always on

To remove the 20-second wake-up entirely, keep one copy running:

```bash
az containerapp update -g uninstagram-rg -n uninstagram --min-replicas 1
```

This is no longer free. An always-running copy of this size is awake about 720 hours a month
against a free grant of about 100, and a copy that is running but not serving anyone is billed at
the idle rate — so it comes to **about $10 a month**, a little more for a busy site. Check the
[Container Apps pricing page](https://azure.microsoft.com/pricing/details/container-apps/) for your
region. To go back to sleeping when idle:

```bash
az containerapp update -g uninstagram-rg -n uninstagram --min-replicas 0
```

## Running your own build

If you have changed the code and built your own image, point the deployer at it:

```bash
python uninstagram.py deploy --image ghcr.io/you/uninstagram:my-build
```

```bash
python uninstagram.py upgrade --image ghcr.io/you/uninstagram:my-build
```

The image must be public, or Azure will not be able to pull it. See
[Development](development.md#building-the-image) for how the image is built.
