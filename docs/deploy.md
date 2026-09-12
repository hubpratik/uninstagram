# Deploying your own Uninstagram

Everything you need to get your own copy running in your own Azure subscription, keep it up to
date, and take it down again.

- [Before you start](#before-you-start)
- [Deploy](#deploy)
- [What gets created](#what-gets-created)
- [What it costs](#what-it-costs)
- [After it is live](#after-it-is-live)
- [Upgrading](#upgrading)
- [Changing settings](#changing-settings)
- [If you lose your admin code](#if-you-lose-your-admin-code)
- [Checking on it](#checking-on-it)
- [Backing up](#backing-up)
- [Removing it](#removing-it)
- [Doing it by hand](#doing-it-by-hand)
- [Troubleshooting](#troubleshooting)

---

## Before you start

You need three things.

**1. An Azure subscription.** A [free account](https://azure.microsoft.com/free) works. If your
subscription belongs to an employer or a school, check that it lets you create resource groups and
storage accounts — policies sometimes forbid them (see [troubleshooting](#troubleshooting)).

**2. The Azure CLI.** [Install it](https://learn.microsoft.com/cli/azure/install-azure-cli), then
sign in:

```bash
az login
```

**3. Python 3.9 or newer.** Check with `python --version` — or `python3 --version` on macOS and
Linux, `py --version` on Windows.

That is all. The deployer uses only Python's standard library and your Azure CLI: there is nothing
to install with pip, and you do not need Docker or a GitHub account.

## Deploy

Download the deployer into a folder you will keep. It saves a small file there that remembers where
your site is.

```bash
curl -O https://raw.githubusercontent.com/hubpratik/uninstagram/main/deploy/uninstagram.py
```

On Windows PowerShell:

```powershell
Invoke-WebRequest https://raw.githubusercontent.com/hubpratik/uninstagram/main/deploy/uninstagram.py -OutFile uninstagram.py
```

Then:

```bash
python uninstagram.py deploy
```

### What it asks

| Question | What to answer |
| --- | --- |
| **Subscription** | Only asked if your account has more than one. |
| **Resource group** | A folder in Azure for everything this creates. The default, `uninstagram-rg`, is fine. |
| **App name** | The first part of your web address. Lowercase letters, digits and hyphens. Default `uninstagram`. |
| **Azure region** | Somewhere near you and the people you will share with — `westeurope`, `uksouth`, `eastus`, `centralindia`, `australiaeast`, and so on. The deployer checks that Container Apps is offered there. |
| **Your name** | Used for the watermark on your photos. Once the site is live, set the name your page shows with "Edit profile". |
| **Watermark** | Text burned into the corner of every photo. Press Enter for `© <your name>`. It becomes part of each photo file, so choose it before you start posting. |
| **Admin code** | What you will type at `/admin` to post and manage. Press Enter and a 16-character code is generated and shown to you — recommended. Or type your own of at least 16 characters. **Write it down.** |

Then it shows the plan — every resource, whether it is new or already there, the version, the size
— and waits for your yes.

### What happens next

The first deployment takes 5–10 minutes, most of it Azure creating the Container Apps environment.
The deployer prints each step as it goes. At the end it waits for your page to answer, checks that
your admin code works, and prints your address.

**Every step is safe to repeat.** If it stops half way — a network blip, Ctrl+C, a closed laptop —
run the same command again. It finds what already exists and carries on from there.

### Seeing it first

```bash
python uninstagram.py deploy --dry-run
```

Checks everything it can, prints every command it would run — with secrets masked — and changes
nothing.

### Without questions

For scripts, or to decide everything up front, every question has a flag, and the admin code can
come from the environment:

```bash
export UNINSTAGRAM_ADMIN_CODE='choose-something-long'
python uninstagram.py deploy --yes --location westeurope --name "Jane Doe"
```

The admin code is deliberately not a flag: flags end up in your shell history. Run
`python uninstagram.py deploy --help` for the full list.

## What gets created

All in one resource group, in your subscription:

| Resource | Name | What it is for |
| --- | --- | --- |
| Resource group | `uninstagram-rg` | Holds everything below. |
| Storage account | `uninsta` + 12 random characters | Your photos (Blob Storage, container `media`) and records (Table Storage). No public access. Tagged `uninstagram=media` so the deployer can always find it again. |
| Container Apps environment | `uninstagram-env` | The hosting space the app runs in. |
| Log Analytics workspace | named by Azure, `workspace-…` | The app's logs. Created automatically with the environment. |
| Container app | `uninstagram` | The app: `ghcr.io/hubpratik/uninstagram:<version>`, 0.5 vCPU, 1 GiB, between zero and one running copy. |

The storage connection string, your admin code, and the key that signs admin sign-ins are stored as
**Container App secrets**. They are never written to your disk; `uninstagram-deploy.json` holds only
names.

The deployer also registers three Azure services with your subscription if they are not registered
already — `Microsoft.App`, `Microsoft.OperationalInsights` and `Microsoft.Storage`. On a brand-new
subscription that one-time step can take a few minutes.

The image is public and pulled straight from GitHub Container Registry. Nothing about your site is
sent anywhere else.

## What it costs

Short version: **nothing to a few dollars a month** for a personal page.

### How the bill works

- **The app sleeps when nobody is visiting, and costs nothing while asleep.** It is set to scale
  between zero and one running copy.
- **Each visit wakes it for at least five minutes** — the time Azure waits after the last request
  before putting it back to sleep.
- **Azure's monthly free grant covers about 100 hours of awake time** at this size (180,000
  vCPU-seconds and 360,000 GiB-seconds, at 0.5 vCPU and 1 GiB). The grant is per subscription, and
  shared with any other Container Apps you run there.
- **After that, each awake hour costs about two to five cents.** Most awake time is the quiet wait
  before sleep, billed at the cheaper idle rate; the higher figure is time spent actively serving.
- **Photos and records** cost under a cent a month for a personal collection. **Logs** are free up to
  5 GB a month. **Requests** are free up to two million a month.

Prices from Azure's retail price list, September 2026: vCPU $0.000024 per second active and
$0.000003 idle; memory $0.000003 per GiB-second. Check the
[Container Apps pricing page](https://azure.microsoft.com/pricing/details/container-apps/) for
current figures.

### What that looks like in practice

Measured on the maintainer's own site over September 2026:

| | Measured | Per month | Free each month |
| --- | --- | --- | --- |
| App awake | 83 hours in 11 days | ~220 hours | ~100 hours |
| Requests | 5,234 in 11 days | ~14,000 | 2,000,000 |
| Photos and records | 18 MB | — | — |
| Logs | 3 MB in 11 days | ~8 MB | 5 GB |

That comes to **$2–6 for the month**, all of it awake time beyond the free grant.

**Why a site with a few dozen visitors a day is awake a third of the time:** automated scanners. Every
new HTTPS address is published in public certificate logs within minutes, and bots start probing it
for weaknesses around the clock. On that site, 44% of all requests were refused with a 4xx error —
the fingerprint of scanners — and the app was woken at every hour of the day and night. Every web
address gets this, and each probe costs a five-minute wake. A site with fewer real visitors will
still see some of it.

### Keeping it predictable

Set a budget alert in the Azure portal — **Cost Management → Budgets**, for example $5 a month, with
an email when you reach 80%. Budgets alert you; they do not stop anything.

To remove the 20-second wake-up entirely you can keep it awake all the time. That costs **about $10
a month**; see [Configuration](configuration.md#always-on).

## After it is live

1. Open `https://<your address>/admin` and enter your admin code.
2. Press **Edit profile** and set your name, photo and bio. Until you do, your page is titled
   "Uninstagram".
3. Post your first photo with the **+** at the top of the page.
4. Send your page's address to the people you want to see it.

Your address is long — `<app>.<random words>.<region>.azurecontainerapps.io` — and that is the only
address the deployer sets up. If you would like your own domain name, Container Apps supports custom
domains with free certificates:
[Microsoft's guide](https://learn.microsoft.com/azure/container-apps/custom-domains-managed-certificates).
The deployer leaves that to you.

## Upgrading

```bash
python uninstagram.py upgrade
```

It shows the version you are running and the newest release, links the [changelog](../CHANGELOG.md),
and asks before changing anything. Your photos, visitors, settings and admin code are untouched.
Afterwards it prints the exact command to go back.

To move to a particular version:

```bash
python uninstagram.py upgrade --version v1.0.0
```

## Changing settings

```bash
python uninstagram.py configure --watermark "© Jane, 2026"
```

```bash
python uninstagram.py configure --border 0
```

The watermark and the frame are burned into photos when they are uploaded, so a change affects new
photos only. Every setting is described in [Configuration](configuration.md).

## If you lose your admin code

```bash
python uninstagram.py admin-code
```

Devices already signed in as admin stay signed in. If you think someone else may have learned the
old code, sign every device out as well:

```bash
python uninstagram.py admin-code --sign-out-everywhere
```

## Checking on it

```bash
python uninstagram.py status
```

Shows your address, the version you are running and whether a newer one exists, whether the latest
revision is ready, how many copies are running (0 means asleep), and your storage account. It then
loads your page to check it answers — which wakes it up. Add `--no-wake` to skip that.

## Backing up

Photos are stored processed — resized, watermarked and framed. **The original files you upload are
not kept**, so keep your own originals.

Everything the site holds is in the storage account named in `uninstagram-deploy.json`. To download
every photo:

```bash
az storage blob download-batch --account-name <storage-account> --source media --destination ./uninstagram-photos --auth-mode key
```

And the records, one JSON file per table (each command returns up to 1,000 rows, which is plenty for
a personal site):

```bash
for table in profile posts comments likes visitors; do az storage entity query --table-name $table --account-name <storage-account> --auth-mode key -o json > $table.json; done
```

## Removing it

Everything lives in one resource group, so one command removes all of it — **including every photo,
which cannot be recovered afterwards.** Back up first.

```bash
az group delete --name uninstagram-rg
```

It asks you to confirm. Delete `uninstagram-deploy.json` afterwards.

## Doing it by hand

The deployer is a convenience, not a requirement. The same result with the Azure CLI directly:

```bash
az group create -n uninstagram-rg -l westeurope
az storage account create -g uninstagram-rg -n <storage-account> -l westeurope --sku Standard_LRS --kind StorageV2 --min-tls-version TLS1_2 --allow-blob-public-access false
az containerapp env create -g uninstagram-rg -n uninstagram-env -l westeurope
az containerapp create -g uninstagram-rg -n uninstagram --environment uninstagram-env \
  --image ghcr.io/hubpratik/uninstagram:v1.0.0 --target-port 3000 --ingress external \
  --cpu 0.5 --memory 1.0Gi --min-replicas 0 --max-replicas 1 \
  --secrets storage-connection="<connection string>" admin-code="<your code>" app-secret="<long random string>" \
  --env-vars UNINSTAGRAM_STORE=azure AZURE_STORAGE_CONNECTION_STRING=secretref:storage-connection \
    UNINSTAGRAM_ADMIN_CODE=secretref:admin-code UNINSTAGRAM_SECRET=secretref:app-secret \
    AZURE_BLOB_CONTAINER=media "UNINSTAGRAM_WATERMARK=© Jane Doe"
```

**`app-secret` must be a long random string** — for example the output of
`python -c "import secrets; print(secrets.token_hex(32))"`. Without it, anyone could make
themselves admin; see [Configuration](configuration.md). Get the connection string with
`az storage account show-connection-string -g uninstagram-rg -n <storage-account> --query connectionString -o tsv`.
Every setting is explained in [Configuration](configuration.md). Keep the maximum at one copy; the
reason is there too.

## Troubleshooting

**"You are not signed in to Azure."** Run `az login`. If your account belongs to several
directories, `az login --tenant <tenant-id>`.

**"Container Apps is not offered in …"** Pick another region; the message lists some that work.

**`RequestDisallowedByPolicy`.** Your subscription has a policy that forbids something the deployer
creates — common on work and school subscriptions. Use a personal subscription, or ask whoever
manages yours.

**`MaxNumberOfRegionalEnvironmentsInSubExceeded`.** Azure limits how many Container Apps environments
one subscription can have in a region. Choose another region, or remove an environment you no longer
use.

**The environment step takes a long time.** 3–8 minutes is normal and the deployer waits up to 20.
If it gives up, run the same command again: it picks up where it stopped.

**The site does not answer at the end.** The very first start downloads the image (about 480 MB),
which can take a few minutes. Wait, then run `python uninstagram.py status`. If it still does not
answer, look at the logs:

```bash
az containerapp logs show -g uninstagram-rg -n uninstagram --type system
```

```bash
az containerapp logs show -g uninstagram-rg -n uninstagram --type console --tail 50
```

**The first visit after a quiet spell takes about 20 seconds.** It was asleep. That is normal, and
it is why it costs so little. See [Configuration](configuration.md#always-on) to change it.

**Your admin code is refused.** Codes are case-sensitive, and a generated one includes its hyphens.
If you have lost it, set a new one with `python uninstagram.py admin-code`.

**Photos fail to upload.** Check the console logs above. Some organisations disable storage account
keys by policy, and the app signs in to storage with its key:
`az storage account show -n <storage-account> --query allowSharedKeyAccess` should say `true`.

**On Windows: "cannot be passed safely through az.cmd".** Your Azure CLI was not installed with the
official Windows installer. Reinstall it from
[Microsoft's page](https://learn.microsoft.com/cli/azure/install-azure-cli-windows), or leave the
character out of the value.

**"There is no Uninstagram app called …".** Run the command from the folder that holds
`uninstagram-deploy.json`, or say where the site is with `-g <resource-group> -n <app-name>`.
