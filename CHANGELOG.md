# Changelog

Every release is published as an image at `ghcr.io/hubpratik/uninstagram:<version>`.
Move to a newer one with `python uninstagram.py upgrade` — your photos, visitors and settings are
untouched, and the previous version stays available to roll back to.

---

## v1.0.0 — 2026-09-12

The first public release. It is the same build that runs the maintainer's own site.

### For the owner

- A profile page shaped like Instagram: grid, avatar, bio, link
- Posts of one photo or a carousel of up to ten, with caption, location, and a **memory date** —
  when it happened, separate from when it was posted, so an old photo lands in the right place
- Four sort orders for the grid: by memory date or upload date, either direction
- Your watermark and a white frame burned into every uploaded photo
- Edit or delete posts, delete any comment
- A manage page with every visitor, their optional email address, and a copy-paste email list
- Remove visitors; issue a new access code to a visitor who lost theirs, with a red badge on the
  settings icon while a request is waiting

### For visitors

- Browse the grid without being asked anything
- Leave a nickname (email optional) to open photos, like and comment — no account, no password
- A 5-digit code to come back as themselves on any device, and a "forgot code" request that goes
  to the owner
- A randomly assigned cartoon animal avatar, or their own photo
- A guest book of who else has visited — nicknames only, never email addresses

### Deployment

- `deploy/uninstagram.py`, a single-file deployer with no dependencies beyond Python and the Azure
  CLI: `deploy`, `status`, `upgrade`, `configure` and `admin-code`
- The deployer always generates the key that signs admin sign-ins, and generates a 16-character
  admin code unless you choose your own of at least that length
