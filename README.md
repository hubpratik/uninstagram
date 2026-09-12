# Uninstagram

**A photo page that looks like Instagram and belongs only to you.**

No feed. No algorithm. No ads. No accounts to create. It runs in your own Azure subscription, and
your photos never leave it.

Uninstagram is a self-hosted photo page shaped like an Instagram profile: a grid of posts, photos
that open into a swipeable carousel, likes and comments, your picture and bio at the top. You share
a link. The people you share it with look around, leave a like or a comment, and that is all.
Nobody signs up for anything.

It began as one person's way to quit social media without losing the one part worth keeping. It is
open source so that anyone else stepping away can do the same.

- [Why this exists](#why-this-exists)
- [What it does](#what-it-does)
- [What it deliberately does not do](#what-it-deliberately-does-not-do)
- [Get your own](#get-your-own)
- [What it costs](#what-it-costs)
- [Looking after it](#looking-after-it)
- [Documentation](#documentation)
- [Contributing](#contributing)

---

## Why this exists

The big platforms bundle two very different things together:

1. **A way to share your life with people who know you.** For most people, this is what they came
   for.
2. **A machine for holding attention**: an endless feed ranked by an algorithm, suggested accounts,
   ads between your friends' posts, and public counts of followers and likes that turn every post
   into a small performance.

You cannot keep the first without the second. And leaving usually means your photos stop having
anywhere to live, while the people who liked seeing them lose the thread.

Uninstagram keeps the first and drops the second.

| On the big platforms | On Uninstagram |
| --- | --- |
| A feed pulls you from post to post | There is no feed — just your page |
| An algorithm decides who sees what | Everyone with the link sees everything, in the order you choose |
| Ads and suggested content | Nothing but your photos |
| Followers, following, discovery | No followers, no search, no way to be found — only a link you choose to share |
| Everyone needs an account | Visitors leave a nickname. No sign-up, no password |
| Your archive lives in their account | Your archive lives in your storage account, in your Azure subscription |

It looks like Instagram on purpose. The people you share with already know how to use it: tap a
photo, swipe, double-tap to like. There is nothing to learn and nothing to install.

## What it does

**For you, the owner**

- Post a single photo or a carousel of up to ten, with a caption, a location, and the date the
  moment actually happened — separate from the upload date, so a photo from 2019 lands in 2019
- Every photo gets your watermark and a white frame burned in on upload
- Edit or delete posts; delete any comment
- See everyone who has visited, which of them asked to hear about new posts, and copy all their
  email addresses in one go
- Remove a visitor, or issue a new access code to someone who lost theirs

**For your visitors**

- Browse your grid without being asked anything
- Leave a nickname — and an email address, only if they want updates — to open a photo, like or
  comment
- Get a 5-digit code to come back as themselves on any device
- Get a randomly assigned cartoon animal as their picture, or upload their own
- See who else has visited: nicknames only, never email addresses

## What it deliberately does not do

- **It is not a network.** Every Uninstagram is its own island: no feed of other people's pages, no
  following, no search.
- **No tracking.** No analytics, no telemetry, no ads. The app talks to nothing but your own storage
  account.
- **No search engines.** Pages ask not to be indexed. It is meant to be handed out, not discovered.
- **No email is sent.** Visitors who leave an address are asking to hear from *you*, so you write to
  them yourself.
- **No private posts.** Anyone with your link can see everything on your page.

## Get your own

You need:

- An **Azure subscription** — a [free account](https://azure.microsoft.com/free) is enough
- The **[Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli)**, signed in with `az login`
- **Python 3.9** or newer

Download the deployer. It is one file with no dependencies:

```bash
curl -O https://raw.githubusercontent.com/hubpratik/uninstagram/main/deploy/uninstagram.py
```

On Windows PowerShell:

```powershell
Invoke-WebRequest https://raw.githubusercontent.com/hubpratik/uninstagram/main/deploy/uninstagram.py -OutFile uninstagram.py
```

Then run it:

```bash
python uninstagram.py deploy
```

It asks a handful of questions — which subscription and region, your name, what to write in the
corner of your photos, and an admin code — shows you exactly what it will create, and waits for
your yes. About ten minutes later you have your page:

```
Your Uninstagram is live.

    Your page   https://uninstagram.happyfield-1a2b3c4d.westeurope.azurecontainerapps.io
    Admin       https://uninstagram.happyfield-1a2b3c4d.westeurope.azurecontainerapps.io/admin
```

Open the admin link, sign in with your code, add your photo and bio, and post.

**Want to look before you leap?** `python uninstagram.py deploy --dry-run` checks everything, prints
every command it would run, and changes nothing.

The full walkthrough — every question, what gets created, and what to do if something goes
wrong — is in **[Deploying](docs/deploy.md)**.

## What it costs

For a personal page: **nothing to a few dollars a month.**

The app sleeps when nobody is around, and costs nothing while it sleeps. Each visit wakes it for at
least five minutes. Azure's monthly free grant covers about **100 hours of awake time**; after that,
each awake hour costs about two to five cents.

Real numbers from the maintainer's own site over September 2026 — a few dozen visitors a day, plus
the automated scanners that probe every public web address around the clock:

| | Used, per month | Free each month | Cost |
| --- | --- | --- | --- |
| App awake | about a third of the time, ~220 hours | ~100 hours | **$2–6** |
| Requests | ~14,000 | 2,000,000 | $0 |
| Photos and records | 18 MB | — | under a cent |
| Logs | ~8 MB | 5 GB | $0 |

A quieter site stays inside the free grant. Keeping it awake around the clock, to avoid the
20-second wake-up, costs about $10 a month. The details are in
[Deploying](docs/deploy.md#what-it-costs).

## Looking after it

```bash
python uninstagram.py status
python uninstagram.py upgrade
python uninstagram.py configure --watermark "© Jane, 2026"
python uninstagram.py admin-code
```

In order: where your site is and whether it is up; move to the newest release; change a setting;
set a new admin code if you lose yours.

Upgrades never touch your photos, visitors or settings, and the previous version stays available to
roll back to. Every release is listed in the [changelog](CHANGELOG.md).

Your photos live in one storage account that the deployer creates. Keep the
`uninstagram-deploy.json` file it writes: that is how it finds your site again.

## Documentation

- **[Deploying](docs/deploy.md)** — before you start, every question explained, what gets created,
  costs, upgrading, backups, removing it, troubleshooting
- **[How it works](docs/how-it-works.md)** — the pieces, who sees what, visitor codes, photos,
  security and its limits, privacy
- **[Configuration](docs/configuration.md)** — every setting, the container's size, always-on
- **[Development](docs/development.md)** — running it locally, the code layout, building the image

## Contributing

Issues and pull requests are welcome. For anything bigger than a fix, please open an issue first to
talk it through.

Uninstagram is deliberately small. Changes that pull it towards being a social network — feeds,
following, discovery, engagement features — work against what it is for.

Built with Next.js, React, Tailwind CSS and sharp. Runs on Azure Container Apps, with Blob and
Table Storage.

## License

[MIT](LICENSE)
