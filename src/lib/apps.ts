/**
 * The apps people actually put in these slideshows.
 *
 * Deliberately a list of names and domains, not a folder of PNGs. Picking from
 * this list and pasting a url are then the SAME code path (lib/appicon.ts
 * resolves the domain either way), so there is one thing to debug and no binary
 * assets to keep current when a company rebrands.
 *
 * Its own module because the composer's picker is a client component and
 * lib/appicon.ts reaches sharp, the filesystem and the database.
 */
export type KnownApp = {
  name: string;
  domain: string;
  /**
   * An App Store listing, for the sites whose homepage 403s every bot (claude.ai,
   * perplexity.ai, linkedin.com and friends - measured, not guessed). The
   * listing's artwork is a real app icon, already square and 512px, and it is
   * LINKED rather than downloaded, so these cost no storage at all.
   *
   * Every id here was looked up against the iTunes API and checked to be the
   * brand's own listing, not a lookalike. Do not add one from memory.
   */
  listing?: string;
};

const appStore = (id: string) => `https://apps.apple.com/us/app/id${id}`;

export const APPS: KnownApp[] = [
  // AI
  { name: "Claude", domain: "claude.ai", listing: appStore("6473753684") },
  { name: "ChatGPT", domain: "chatgpt.com" },
  { name: "Perplexity", domain: "perplexity.ai", listing: appStore("1668000334") },
  { name: "Gemini", domain: "gemini.google.com", listing: appStore("6477489729") },
  { name: "ElevenLabs", domain: "elevenlabs.io" },
  { name: "Runway", domain: "runwayml.com" },
  { name: "Suno", domain: "suno.com" },
  { name: "Hugging Face", domain: "huggingface.co" },
  { name: "Replicate", domain: "replicate.com" },
  { name: "Grammarly", domain: "grammarly.com" },
  { name: "Otter", domain: "otter.ai" },
  { name: "Gamma", domain: "gamma.app", listing: appStore("6768404578") },
  { name: "Synthesia", domain: "synthesia.io" },

  // Design
  { name: "Figma", domain: "figma.com" },
  { name: "Canva", domain: "canva.com" },
  { name: "Framer", domain: "framer.com" },
  { name: "Webflow", domain: "webflow.com" },
  { name: "Adobe", domain: "adobe.com" },
  { name: "Photoshop", domain: "adobe.com/products/photoshop.html" },
  { name: "Sketch", domain: "sketch.com" },
  { name: "Spline", domain: "spline.design" },
  { name: "Unsplash", domain: "unsplash.com", listing: appStore("1290631746") },
  { name: "Behance", domain: "behance.net" },

  // Work and notes
  { name: "Notion", domain: "notion.com" },
  { name: "Obsidian", domain: "obsidian.md" },
  { name: "Linear", domain: "linear.app" },
  { name: "Slack", domain: "slack.com" },
  { name: "Airtable", domain: "airtable.com" },
  { name: "Asana", domain: "asana.com" },
  { name: "Trello", domain: "trello.com" },
  { name: "ClickUp", domain: "clickup.com" },
  { name: "Monday", domain: "monday.com" },
  { name: "Miro", domain: "miro.com" },
  { name: "Todoist", domain: "todoist.com" },
  { name: "Superhuman", domain: "superhuman.com" },
  { name: "Calendly", domain: "calendly.com" },
  { name: "Zoom", domain: "zoom.us" },
  { name: "Loom", domain: "loom.com" },
  { name: "Raycast", domain: "raycast.com" },
  { name: "1Password", domain: "1password.com" },
  { name: "Dropbox", domain: "dropbox.com" },

  // Build and ship
  { name: "GitHub", domain: "github.com" },
  { name: "Cursor", domain: "cursor.com" },
  { name: "Vercel", domain: "vercel.com" },
  { name: "Supabase", domain: "supabase.com" },
  { name: "Netlify", domain: "netlify.com" },
  { name: "Railway", domain: "railway.com" },
  { name: "Render", domain: "render.com" },
  { name: "Cloudflare", domain: "cloudflare.com" },
  { name: "Fly.io", domain: "fly.io" },
  { name: "Neon", domain: "neon.com" },
  { name: "Planetscale", domain: "planetscale.com" },
  { name: "Sentry", domain: "sentry.io" },
  { name: "Posthog", domain: "posthog.com" },
  { name: "Postman", domain: "postman.com" },
  { name: "Docker", domain: "docker.com" },
  { name: "Replit", domain: "replit.com" },

  // Money
  { name: "Stripe", domain: "stripe.com" },
  { name: "Shopify", domain: "shopify.com" },
  { name: "Gumroad", domain: "gumroad.com" },
  { name: "Lemon Squeezy", domain: "lemonsqueezy.com" },
  { name: "Paddle", domain: "paddle.com" },
  { name: "PayPal", domain: "paypal.com" },
  { name: "Wise", domain: "wise.com" },
  { name: "Revolut", domain: "revolut.com", listing: appStore("932493382") },
  { name: "QuickBooks", domain: "quickbooks.intuit.com" },
  { name: "Xero", domain: "xero.com" },

  // Marketing and growth
  { name: "Zapier", domain: "zapier.com" },
  { name: "Make", domain: "make.com" },
  { name: "HubSpot", domain: "hubspot.com" },
  { name: "Mailchimp", domain: "mailchimp.com" },
  { name: "Klaviyo", domain: "klaviyo.com" },
  { name: "ConvertKit", domain: "kit.com" },
  { name: "Substack", domain: "substack.com" },
  { name: "Beehiiv", domain: "beehiiv.com" },
  { name: "Buffer", domain: "buffer.com" },
  { name: "Ahrefs", domain: "ahrefs.com" },
  { name: "Semrush", domain: "semrush.com" },
  { name: "Typeform", domain: "typeform.com" },
  { name: "Intercom", domain: "intercom.com", listing: appStore("739927601") },

  // Social and media
  { name: "TikTok", domain: "tiktok.com" },
  { name: "Instagram", domain: "instagram.com" },
  { name: "YouTube", domain: "youtube.com" },
  { name: "Pinterest", domain: "pinterest.com" },
  { name: "LinkedIn", domain: "linkedin.com", listing: appStore("288429040") },
  { name: "Reddit", domain: "reddit.com" },
  { name: "Discord", domain: "discord.com" },
  { name: "Twitch", domain: "twitch.tv" },
  { name: "Spotify", domain: "spotify.com" },
  { name: "CapCut", domain: "capcut.com" },
  { name: "Descript", domain: "descript.com" },
  { name: "Riverside", domain: "riverside.fm" },
  { name: "Patreon", domain: "patreon.com" },

  // Life
  { name: "Duolingo", domain: "duolingo.com" },
  { name: "Strava", domain: "strava.com" },
  { name: "Headspace", domain: "headspace.com" },
  { name: "Calm", domain: "calm.com" },
  { name: "MyFitnessPal", domain: "myfitnesspal.com" },
  { name: "Airbnb", domain: "airbnb.com" },
  { name: "Uber", domain: "uber.com", listing: appStore("368677368") },
  { name: "Netflix", domain: "netflix.com" },
  { name: "Audible", domain: "audible.com" },
  { name: "Goodreads", domain: "goodreads.com" },

  // Communication
  { name: "Microsoft Teams", domain: "microsoft.com/microsoft-teams" },
  { name: "Google Meet", domain: "meet.google.com" },
  { name: "Cisco Webex", domain: "webex.com" },
  { name: "Telegram", domain: "telegram.org" },
  { name: "WhatsApp", domain: "whatsapp.com" },
  { name: "Signal", domain: "signal.org" },
  { name: "Messenger", domain: "messenger.com" },
  { name: "Viber", domain: "viber.com" },
  { name: "Google Chat", domain: "chat.google.com" },
  { name: "Mattermost", domain: "mattermost.com" },
  { name: "Circle", domain: "circle.so" },
  { name: "Geneva", domain: "geneva.com" },

  // Docs and productivity
  { name: "Google Docs", domain: "docs.google.com" },
  { name: "Google Sheets", domain: "sheets.google.com" },
  { name: "Google Slides", domain: "slides.google.com" },
  { name: "Microsoft Word", domain: "microsoft.com/microsoft-365/word" },
  { name: "Microsoft Excel", domain: "microsoft.com/microsoft-365/excel" },
  { name: "Microsoft PowerPoint", domain: "microsoft.com/microsoft-365/powerpoint" },
  { name: "Coda", domain: "coda.io" },
  { name: "Craft", domain: "craft.do" },
  { name: "Evernote", domain: "evernote.com" },
  { name: "OneNote", domain: "microsoft.com/microsoft-365/onenote" },
  { name: "Apple Notes", domain: "apple.com/ios/notes" },
  { name: "Roam Research", domain: "roamresearch.com" },
  { name: "Anytype", domain: "anytype.io" },
  { name: "Tana", domain: "tana.inc" },
  { name: "Heptabase", domain: "heptabase.com" },
  { name: "Fibery", domain: "fibery.io" },
  { name: "Basecamp", domain: "basecamp.com" },
  { name: "Height", domain: "height.app" },
  { name: "Wrike", domain: "wrike.com" },
  { name: "Smartsheet", domain: "smartsheet.com" },
  { name: "Teamwork", domain: "teamwork.com" },

  // Developer tools
  { name: "GitLab", domain: "gitlab.com" },
  { name: "Bitbucket", domain: "bitbucket.org" },
  { name: "Azure DevOps", domain: "azure.microsoft.com/products/devops" },
  { name: "Jira", domain: "atlassian.com/software/jira" },
  { name: "Confluence", domain: "atlassian.com/software/confluence" },
  { name: "Atlassian", domain: "atlassian.com" },
  { name: "VS Code", domain: "code.visualstudio.com" },
  { name: "Windsurf", domain: "windsurf.com" },
  { name: "Zed", domain: "zed.dev" },
  { name: "IntelliJ IDEA", domain: "jetbrains.com/idea" },
  { name: "PyCharm", domain: "jetbrains.com/pycharm" },
  { name: "CodeSandbox", domain: "codesandbox.io" },
  { name: "StackBlitz", domain: "stackblitz.com" },
  { name: "Glitch", domain: "glitch.com" },
  { name: "CodePen", domain: "codepen.io" },
  { name: "JSFiddle", domain: "jsfiddle.net" },
  { name: "npm", domain: "npmjs.com" },
  { name: "Yarn", domain: "yarnpkg.com" },
  { name: "Bun", domain: "bun.sh" },
  { name: "Deno", domain: "deno.com" },
  { name: "Node.js", domain: "nodejs.org" },
  { name: "Python", domain: "python.org" },
  { name: "Rust", domain: "rust-lang.org" },
  { name: "Go", domain: "go.dev" },
  { name: "Kubernetes", domain: "kubernetes.io" },
  { name: "Terraform", domain: "terraform.io" },
  { name: "Datadog", domain: "datadoghq.com" },
  { name: "New Relic", domain: "newrelic.com" },
  { name: "Grafana", domain: "grafana.com" },
  { name: "PagerDuty", domain: "pagerduty.com" },
  { name: "LaunchDarkly", domain: "launchdarkly.com" },

  // AI and data
  { name: "Microsoft Copilot", domain: "copilot.microsoft.com" },
  { name: "Grok", domain: "grok.com" },
  { name: "Mistral", domain: "mistral.ai" },
  { name: "Poe", domain: "poe.com" },
  { name: "You.com", domain: "you.com" },
  { name: "Midjourney", domain: "midjourney.com" },
  { name: "Leonardo AI", domain: "leonardo.ai" },
  { name: "Ideogram", domain: "ideogram.ai" },
  { name: "Luma AI", domain: "lumalabs.ai" },
  { name: "Pika", domain: "pika.art" },
  { name: "HeyGen", domain: "heygen.com" },
  { name: "VEED", domain: "veed.io" },
  { name: "OpusClip", domain: "opus.pro" },
  { name: "Jasper", domain: "jasper.ai" },
  { name: "Writesonic", domain: "writesonic.com" },
  { name: "Copy.ai", domain: "copy.ai" },
  { name: "DeepL", domain: "deepl.com" },
  { name: "Loom AI", domain: "loom.com/ai" },
  { name: "Tableau", domain: "tableau.com" },
  { name: "Power BI", domain: "powerbi.microsoft.com" },
  { name: "Looker Studio", domain: "lookerstudio.google.com" },
  { name: "Mixpanel", domain: "mixpanel.com" },
  { name: "Amplitude", domain: "amplitude.com" },
  { name: "Metabase", domain: "metabase.com" },

  // Sales, support and commerce
  { name: "Salesforce", domain: "salesforce.com" },
  { name: "Pipedrive", domain: "pipedrive.com" },
  { name: "Close", domain: "close.com" },
  { name: "Freshsales", domain: "freshworks.com/freshsales-crm" },
  { name: "Zendesk", domain: "zendesk.com" },
  { name: "Freshdesk", domain: "freshworks.com/freshdesk" },
  { name: "Gorgias", domain: "gorgias.com" },
  { name: "Help Scout", domain: "helpscout.com" },
  { name: "Tidio", domain: "tidio.com" },
  { name: "Drift", domain: "drift.com" },
  { name: "ActiveCampaign", domain: "activecampaign.com" },
  { name: "Brevo", domain: "brevo.com" },
  { name: "GetResponse", domain: "getresponse.com" },
  { name: "Hootsuite", domain: "hootsuite.com" },
  { name: "Later", domain: "later.com" },
  { name: "Sprout Social", domain: "sproutsocial.com" },
  { name: "Metricool", domain: "metricool.com" },
  { name: "WordPress", domain: "wordpress.com" },
  { name: "Wix", domain: "wix.com" },
  { name: "Squarespace", domain: "squarespace.com" },
  { name: "BigCommerce", domain: "bigcommerce.com" },
  { name: "WooCommerce", domain: "woocommerce.com" },
  { name: "Etsy", domain: "etsy.com" },
  { name: "Amazon", domain: "amazon.com" },
  { name: "eBay", domain: "ebay.com" },
  { name: "Square", domain: "squareup.com" },
  { name: "Klarna", domain: "klarna.com" },
  { name: "Venmo", domain: "venmo.com" },
  { name: "Monzo", domain: "monzo.com" },
  { name: "N26", domain: "n26.com" },

  // Content, learning and lifestyle
  { name: "Medium", domain: "medium.com" },
  { name: "Ghost", domain: "ghost.org" },
  { name: "Teachable", domain: "teachable.com" },
  { name: "Kajabi", domain: "kajabi.com" },
  { name: "Podia", domain: "podia.com" },
  { name: "Thinkific", domain: "thinkific.com" },
  { name: "Udemy", domain: "udemy.com" },
  { name: "Coursera", domain: "coursera.org" },
  { name: "Skillshare", domain: "skillshare.com" },
  { name: "MasterClass", domain: "masterclass.com" },
  { name: "Khan Academy", domain: "khanacademy.org" },
  { name: "Memrise", domain: "memrise.com" },
  { name: "Babbel", domain: "babbel.com" },
  { name: "Blinkist", domain: "blinkist.com" },
  { name: "Kindle", domain: "amazon.com/kindle-dbs/fd/kcp" },
  { name: "Apple Music", domain: "music.apple.com" },
  { name: "SoundCloud", domain: "soundcloud.com" },
  { name: "Bandcamp", domain: "bandcamp.com" },
  { name: "Apple Podcasts", domain: "podcasts.apple.com" },
  { name: "Google Maps", domain: "maps.google.com" },
  { name: "Waze", domain: "waze.com" },
  { name: "Booking.com", domain: "booking.com" },
  { name: "Expedia", domain: "expedia.com" },
  { name: "Tripadvisor", domain: "tripadvisor.com" },
  { name: "Lyft", domain: "lyft.com" },
  { name: "DoorDash", domain: "doordash.com" },
  { name: "Instacart", domain: "instacart.com" },
  { name: "Nike Run Club", domain: "nike.com/nrc-app" },
  { name: "Peloton", domain: "onepeloton.com" },
  { name: "Fitbit", domain: "fitbit.com" },
  { name: "Garmin", domain: "garmin.com" },
];

/** Fuzzy-ish match for the picker's search box: name or domain contains the
 *  query. Good enough for a few hundred rows; nothing here needs an index. */
export function searchApps(q: string, limit = 16, apps = APPS): KnownApp[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return apps.slice(0, limit);
  return apps.filter(
    (a) =>
      a.name.toLowerCase().includes(needle) ||
      a.domain.toLowerCase().includes(needle),
  ).slice(0, limit);
}

/** Turn untrusted model output into exact catalog rows. */
export function validateCatalogApps(
  raw: unknown,
  count: number,
  excluded: string[] = [],
): KnownApp[] {
  if (!Array.isArray(raw) || raw.length !== count)
    throw new Error(`Choose exactly ${count} apps.`);
  const byName = new Map(APPS.map((app) => [app.name.toLowerCase(), app]));
  const selected = raw.map((value) =>
    typeof value === "string" ? byName.get(value.trim().toLowerCase()) : undefined,
  );
  if (selected.some((app) => !app))
    throw new Error("Every selected app must come from the supplied catalog.");
  if (new Set(selected.map((app) => app!.name)).size !== count)
    throw new Error("Selected apps must be unique.");
  const blocked = new Set(excluded.map((name) => name.toLowerCase()));
  if (selected.some((app) => blocked.has(app!.name.toLowerCase())))
    throw new Error("Selected apps must not include a failed icon source.");
  return selected as KnownApp[];
}
