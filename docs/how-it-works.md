# How it works

What happens behind the page: the pieces, who can do what, where your data lives, and what the
security does and does not protect.

- [The pieces](#the-pieces)
- [Two kinds of people](#two-kinds-of-people)
- [Who sees what](#who-sees-what)
- [Visitor codes](#visitor-codes)
- [Photos](#photos)
- [Where your data lives](#where-your-data-lives)
- [Sleeping and waking](#sleeping-and-waking)
- [Security, and its limits](#security-and-its-limits)
- [Privacy](#privacy)

---

## The pieces

```
                      your Azure subscription
                    ┌──────────────────────────────────────────────────────┐
  a visitor ──────► │  Container App  (the Uninstagram image, 0–1 copies)  │
  you (admin) ────► │       │                                              │
     https          │       ├──► Table Storage   profile, posts, comments, │
                    │       │                    likes, visitors           │
                    │       └──► Blob Storage    your photos (private)     │
                    │                                                      │
                    │  Log Analytics workspace   the app's logs            │
                    └──────────────────────────────────────────────────────┘
```

One Container App runs the image. It serves the pages, handles uploads, and reads and writes a
single storage account. That is the whole system: there is no database server, no queue, and no
connection to anyone else's Uninstagram.

The same image runs every copy of Uninstagram, including the maintainer's own. Everything that
makes a site yours — your name, your photos, your admin code — is in your settings and your storage
account, never in the image.

## Two kinds of people

**You, the owner.** You unlock admin at `/admin` with your admin code. That sets a signed,
HTTP-only cookie that lasts 30 days, and the same site grows owner controls: a `+` to post, a gear
to manage, an edit menu on every post, and comment deletion. "Lock admin" on the manage page signs
that device out.

**Visitors.** Anyone with the link can browse the grid without being asked anything. The moment
they try to open a photo, like or comment, a dialog asks for:

- a **nickname** — so you can put a face to the person, and
- an **email address, optional** — only if they want to hear when you post something new.

That is stored once in a cookie, so they are not asked again on that browser. Backing out of the
dialog leaves them on the grid; nothing is blocked except the interactions themselves.

There are no visitor accounts and no passwords, by design.

## Who sees what

| | A stranger | A visitor who left a nickname | You |
| --- | --- | --- | --- |
| The photo grid | yes | yes | yes |
| Open a photo, like, comment | asked for a nickname first | yes | yes |
| How many visitors there have been | yes | yes | yes |
| The guest book (nicknames) | asked for a nickname first | yes | yes |
| Visitors' email addresses | never | never | yes |
| Visitors' codes | never | their own only | yes, all of them |
| Delete a comment | — | their own only | any |

Email addresses and codes are withheld by the server itself, not hidden in the page: the visitor
list is built per request and only includes those fields when the caller is you. There is nothing
a visitor could inspect to find someone else's.

## Visitor codes

When someone first leaves a nickname they are shown a **5-digit code**, once, with a clear warning
to keep it. With their nickname and that code they can come back as themselves on another phone,
or after clearing their browser — their likes, comments and place in the guest book follow them.

Be clear-eyed about what the code is: **a convenience, not a password.** Five digits is 100,000
possibilities. It stops a nickname being borrowed casually, not by someone determined.

- Codes are random (`crypto.randomInt`) and unique across all visitors.
- Wrong guesses are limited: ten per caller per ten minutes.
- Codes are never shown to anyone but their owner and you.

### When a visitor loses their code

Under the code box is **"Forgot code? Request a new one"**. It asks for their nickname and an email
address (required here, so you can reply). That request grants nothing by itself. It:

1. puts a red count on the settings icon in your top bar, and a red badge on the Visitors tab;
2. highlights that visitor on the manage page, with the address to reply to;
3. waits for you to press **New code**, which shows you a fresh code to send them. The old code
   stops working immediately.

Uninstagram does not send email. You copy the new code and send it yourself, which also means a
stranger cannot make your site email anyone.

Anyone can type anyone's nickname into that form. So the address given with a request is kept
**separately** from the address on the visitor's record, and if the two differ, the manage page
says so in red before you send anything. If the visitor had no address on file, the one they gave
is saved to their record for next time.

## Photos

Every upload goes through the same steps, in this order:

1. **Rotated** according to the phone's orientation data, so nothing arrives sideways
2. **Resized**: a display copy up to 1440 px, and a 720 px thumbnail for the grid
3. **Watermarked** in the bottom-right corner — both copies, so there is no clean version to lift
4. **Framed** with a white border around the display copy (not the thumbnail: the grid crops tiles
   square, which would slice a baked-in frame unevenly)
5. **Converted to WebP**

**The originals are not kept.** What you upload is converted and the source file is discarded. If
you want an archive of untouched originals, keep your own copy before uploading.

Because the watermark and frame are burned into the file, changing their settings later affects new
uploads only.

Visitors' own profile pictures are cropped square and **not** watermarked — it is their face, not
your work.

## Where your data lives

Everything is in one storage account in your subscription.

| Where | What |
| --- | --- |
| Table `profile` | your name, username, bio, link, avatar |
| Table `posts` | each post, its caption, dates, and references to its photos |
| Table `comments` | one row per comment |
| Table `likes` | one row per post and visitor |
| Table `visitors` | nicknames, optional email addresses, codes, avatars, reset requests |
| Blob container `media` | every photo and avatar, as WebP |

The tables and the container are created automatically the first time they are needed.

The storage account does **not** allow public access. Photos are served through the app at
`/api/media/…`, never straight from storage.

Removing a visitor from the manage page deletes their record, their comments, their likes and
their avatar picture together.

## Sleeping and waking

The Container App is set to scale between zero and one copy. When nobody has visited for a few
minutes it stops, and **nothing is billed while it is stopped**. The next visit starts it again,
which takes about 20 seconds; after that it is instant until it goes quiet again.

That wait is the price of costing nothing. To remove it, keep one copy running all the time — see
[Configuration](configuration.md#always-on).

## Security, and its limits

What is protected, and how:

- **Admin sign-in needs your admin code**, compared in constant time. The code is what keeps
  people out, so it has to be long and random: the deployer generates a 16-character one, roughly
  10²³ possibilities.
- **The admin cookie is signed** with `UNINSTAGRAM_SECRET`, a random key the deployer generates.
  **Never run the app without it.** If it is missing, the app falls back to a development key that
  is published in this source code, and anyone could make themselves admin.
- **Every write is checked on the server**, against the admin cookie or the visitor cookie. The page
  hiding a button is never the only thing stopping an action.
- **Your secrets are stored as Container App secrets**, not in the image and not in plain settings.
- **Pages are marked `noindex`**, so search engines are asked not to list your site. It is meant to be
  handed out, not found.

What to know:

- **Visitor codes are a convenience**, as described above.
- **The limit on code guesses lives in memory.** It resets when the app restarts, and only works
  because there is exactly one copy of the app — which is why the deployer caps it at one. If you ever
  run more, move it to shared storage first (`src/lib/rateLimit.ts` is small and self-contained).
- **Anyone can claim any nickname** when first signing the guest book, the same way anyone can sign
  a paper guest book with any name. The code is what stops them *returning* as someone else.
- **The app authenticates to storage with the account key**, held as a secret. Managed identity would
  be tighter, and would need a change to the storage drivers.
- **Your page is public to anyone with the link.** There are no private posts.

If any of this ever needs to be real security rather than a friendly convenience, the answer is
proper sign-in (Microsoft Entra ID, or a magic link by email), not a longer code. Owner sign-in is
isolated in `isAdmin()` in `src/lib/admin.ts` precisely so it can be swapped.

To report a security problem, open an issue without details and ask for a private channel, or use
GitHub's private vulnerability reporting on the repository.

## Privacy

- **The app talks to nothing but your storage account.** No analytics, no tracking, no telemetry to
  the maintainer or anyone else. Fonts are bundled into the image rather than loaded from a font
  service.
- **The maintainer cannot see your site.** Each copy runs in its owner's own subscription. There is no
  central server, no account system, and no connection between copies.
- **Logs go to a Log Analytics workspace in your own subscription**, created alongside the app.
- **Visitor email addresses are seen only by you**, and are only ever used by you, by hand.
