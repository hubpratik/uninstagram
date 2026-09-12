# Development

How to run Uninstagram on your own machine, how the code is laid out, and how the container image
is built. You do not need any of this to *use* Uninstagram — see [Deploying](deploy.md) for that.

- [Running it locally](#running-it-locally)
- [How the code is laid out](#how-the-code-is-laid-out)
- [Local data](#local-data)
- [Building the image](#building-the-image)
- [Features worth knowing about](#features-worth-knowing-about)
- [Things that will bite you](#things-that-will-bite-you)

---

## Running it locally

Needs Node.js 20 or newer.

```bash
npm install
```

```bash
cp .env.example .env.local
```

```bash
npm run dev
```

Then open http://localhost:3000. Unlock admin at http://localhost:3000/admin with the
`UNINSTAGRAM_ADMIN_CODE` from `.env.local`.

Locally, everything is stored in files under `data/` — no Azure needed. A fixed fallback signs the
admin cookie if `UNINSTAGRAM_SECRET` is unset. That key is public, so never put the app anywhere
reachable without setting a real secret.

## How the code is laid out

```
src/
  app/                  pages and API routes (Next.js App Router)
    api/                every write checks admin or visitor identity on the server
    @modal/(.)p/[id]    the photo overlay above the grid, via an intercepting route
  components/           the user interface
  lib/
    store/              persistence behind one interface; jsonStore.ts is the local driver
    media/              where image bytes go; localMedia.ts is the local driver
    admin.ts            admin cookie signing and checking
    visitor.ts          the visitor cookie
    rateLimit.ts        in-memory throttles for codes
    feed.ts             assembles posts, likes and comments for the pages
container_deployment/
  Dockerfile            the production image
  overlay/              the Azure drivers, layered over src/ inside the image only
deploy/
  uninstagram.py        the deployer
scripts/
  frame-existing.mjs    adds the white frame to photos posted before framing existed
```

`Store` (in `src/lib/store/index.ts`) and `MediaStore` (in `src/lib/media/index.ts`) are plain
interfaces. Nothing above them knows where the data actually lives, which is what lets the same app
run on local files or on Azure.

## Local data

```
data/
  profile.json     your name, bio, avatar
  posts.json       posts and their photo references
  comments.json    one row per comment
  likes.json       one row per post and visitor
  visitors.json    nicknames, optional emails, codes, avatars
  uploads/         the processed images
```

`data/` is ignored by Git and never enters the image. It holds photos and visitors' email
addresses: keep it out of anything you push.

## Building the image

The image is built from the project root:

```bash
docker buildx build -f container_deployment/Dockerfile -t uninstagram .
```

Use `docker buildx` (BuildKit). The build relies on `container_deployment/Dockerfile.dockerignore`,
which only BuildKit reads; the legacy builder ignores it and would copy `data/` — your photos and
visitors' emails — into the image. Check the build output: the context should be a few hundred
kilobytes, not megabytes.

### The overlay

The Azure drivers live in `container_deployment/overlay/`, mirroring the source layout:

```
overlay/
  next.config.ts                 adds output: "standalone"
  src/lib/store/index.ts         the driver switch, with the "azure" case added
  src/lib/store/tableStore.ts    Table Storage driver
  src/lib/media/index.ts         the driver switch, with the blob case added
  src/lib/media/blobMedia.ts     Blob Storage driver
```

The Dockerfile copies the source in and then copies `overlay/` on top. The Azure code — and the
Azure SDK packages, installed with `--no-save` — only ever exist inside the image. That keeps local
development free of Azure entirely.

The cost of that separation is duplication, and it has bitten this project twice:

- **`store/index.ts` exists twice.** Adding a method to the `Store` interface means adding it to
  `src/lib/store/index.ts` **and** `container_deployment/overlay/src/lib/store/index.ts`, and
  implementing it in **both** `jsonStore.ts` and `tableStore.ts`. The local type check passes
  without the overlay copy; only the image build fails.
- **The photo pipeline exists twice**, in `localMedia.ts` and `blobMedia.ts`. Changing how uploaded
  photos look means changing both.

### Trying the image locally

Local-JSON mode needs no Azure. Its data vanishes when the container stops:

```bash
docker run --rm -p 3000:3000 -e UNINSTAGRAM_STORE=json -e UNINSTAGRAM_ADMIN_CODE=local-test-code -e UNINSTAGRAM_SECRET=local-test-secret uninstagram
```

### Deploying your build

Push the image somewhere public, then:

```bash
python deploy/uninstagram.py deploy --image ghcr.io/you/uninstagram:my-build
```

## Features worth knowing about

### Two dates on every post

- **`takenAt`** — when the memory happened. Entered when posting; required; cannot be in the future.
  Shown under the caption as "Memory captured on 7 December 2025".
- **`createdAt`** — when it was posted. Shown as "Uploaded 2 days ago".

The memory date can be edited from the post's `···` menu. Posts from before memory dates existed
fall back to their upload date.

### Sorting

Anyone can reorder the grid: memory date or upload date, newest or oldest first. The choice is
kept per browser in `localStorage`, and sorting happens in the browser, so it costs no server work.

### Visitor avatars

Each visitor is given one of twelve cartoon animals at random, and can swap to another or upload a
photo. The animals are not image files: `src/lib/animals.ts` holds twelve small specs and
`AnimalAvatar.tsx` draws them all from one SVG template. They blink, slowly and out of step with
one another, and hold still for anyone with `prefers-reduced-motion` set.

### Framing older photos

New uploads are framed automatically. For photos posted before framing existed:

```bash
npm run frame-existing -- --dry-run
```

```bash
npm run frame-existing
```

It backs up every file it touches into `data/backup-<timestamp>/` first — the originals are not
kept anywhere else — and writes each framed photo under a **new** key. That second part matters:
`/api/media` tells browsers to cache photos for a year, so a photo rewritten under its old key
would keep showing the unframed version to anyone who had seen it. It skips photos already framed.
This script works on local data only.

## Things that will bite you

- **Do not run `npm run build` while `npm run dev` is running.** It rewrites `.next/` and kills the
  dev server.
- **Dates are formatted by hand** (`src/lib/format.ts`), not with `toLocaleDateString`. The server
  and the browser can have different locales, and React will refuse to hydrate a page whose dates
  differ between the two.
- **Never import from `src/lib/media` in a client component.** It pulls `sharp` into the browser
  bundle. Use `src/lib/mediaUrl.ts` for building image URLs.
- **`node:*-slim` images ship no fonts.** The Dockerfile installs DejaVu; without it the watermark
  renders as empty boxes.
- **A flex item with `height: 100%` against a parent of indefinite height loses flexbox's default
  stretch.** This once put all of a landscape photo's letterbox space below it on phones.
