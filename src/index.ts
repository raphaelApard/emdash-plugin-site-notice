import { definePlugin, sanitizeHref } from "emdash";
import type { PageFragmentContribution, PluginContext, PluginDescriptor } from "emdash";
// EmDash types its zod schemas with Astro's zod, so the plugin uses the same instance.
import { z } from "astro/zod";

import { DEFAULT_TIME_ZONE, type Notice, assertTimeZone, isActive, parseInstant } from "./notice.js";

const ID = "site-notice";
const VERSION = "0.1.0";
const PACKAGE = "emdash-plugin-site-notice";
const NOTICE_KEY = "notice";
const ADMIN_ENTRY = `${PACKAGE}/admin`;
const ADMIN_PAGES = [{ path: "/notice", label: "Site notice", icon: "megaphone" }];

export interface SiteNoticeOptions {
	/** IANA time zone for dates entered without an offset. Defaults to Europe/Paris. */
	timeZone?: string;
}

/** Descriptor for `plugins: []` in astro.config.mjs. */
export function siteNotice(options: SiteNoticeOptions = {}): PluginDescriptor<SiteNoticeOptions> {
	return {
		id: ID,
		version: VERSION,
		format: "native",
		entrypoint: PACKAGE,
		options,
		adminEntry: ADMIN_ENTRY,
		adminPages: ADMIN_PAGES,
	};
}

// ── Storage ──

async function readNotice(ctx: PluginContext): Promise<Notice | null> {
	return ctx.kv.get<Notice>(NOTICE_KEY);
}

type SaveResult = { ok: true; notice: Notice } | { ok: false; error: string; message: string };

const INSTANT_FORMAT = "an ISO 8601 datetime with offset, or a local date (YYYY-MM-DD) or date and time";

async function saveNotice(ctx: PluginContext, input: SetNoticeInput, timeZone: string): Promise<SaveResult> {
	if (input.enabled && !input.message) {
		return { ok: false, error: "MESSAGE_REQUIRED", message: "message is required when enabled is true." };
	}
	const startsAt = input.starts_at ? parseInstant(input.starts_at, timeZone) : null;
	if (input.starts_at && !startsAt) {
		return { ok: false, error: "INVALID_STARTS_AT", message: `starts_at must be ${INSTANT_FORMAT}.` };
	}
	const endsAt = input.ends_at ? parseInstant(input.ends_at, timeZone) : null;
	if (input.ends_at && !endsAt) {
		return { ok: false, error: "INVALID_ENDS_AT", message: `ends_at must be ${INSTANT_FORMAT}.` };
	}
	if (endsAt && endsAt.getTime() <= Date.now()) {
		return { ok: false, error: "ENDS_AT_IN_PAST", message: "ends_at must be in the future." };
	}
	if (startsAt && endsAt && endsAt <= startsAt) {
		return { ok: false, error: "ENDS_BEFORE_START", message: "ends_at must be after starts_at." };
	}
	const notice: Notice = {
		message: input.message,
		starts_at: startsAt?.toISOString() ?? null,
		ends_at: endsAt?.toISOString() ?? null,
		enabled: input.enabled,
		sticky: input.sticky,
	};
	await ctx.kv.set(NOTICE_KEY, notice);
	return { ok: true, notice };
}

// ── Schemas (shared by routes and MCP tools) ──

const noticeSchema = z.object({
	message: z.string().describe("Banner text in Markdown."),
	starts_at: z.string().nullable().describe("UTC ISO 8601 instant when the banner starts showing."),
	ends_at: z.string().nullable().describe("UTC ISO 8601 instant when the banner stops showing."),
	enabled: z.boolean(),
	sticky: z.boolean(),
});

const getNoticeInput = z.object({});

const getNoticeOutput = z.object({
	notice: noticeSchema.nullable(),
	active: z.boolean().describe("True when the banner is currently shown on the site."),
	time_zone: z.string().describe("IANA time zone used for dates entered without an offset."),
});

const DATE_HELP =
	'Either an ISO 8601 datetime with offset ("2026-11-15T09:00:00+01:00") or a local date or date ' +
	'and time in the site time zone ("2026-11-15" means midnight, "2026-11-15T09:00").';

const setNoticeInput = z.object({
	message: z
		.string()
		.trim()
		.max(1000)
		.default("")
		.describe(
			"Banner text shown at the top of every page. Required when enabled is true. Markdown: " +
				"**bold**, *italic*, [link](https://…), and line breaks. Write any date visitors should " +
				'see into the text, e.g. "Our store is **closed until 15 November**. Orders ship again on the 16th."',
		),
	starts_at: z
		.string()
		.nullish()
		.describe(`When the banner starts showing. ${DATE_HELP} Omit or null to show it right away.`),
	ends_at: z
		.string()
		.nullish()
		.describe(
			`When the banner stops showing. ${DATE_HELP} Must be in the future and after starts_at. ` +
				"Omit or null to keep it until it is disabled.",
		),
	enabled: z
		.boolean()
		.default(true)
		.describe("Show the banner. Set false to keep the notice saved but hidden."),
	sticky: z
		.boolean()
		.default(false)
		.describe("Keep the banner pinned to the top of the screen while visitors scroll."),
});

type SetNoticeInput = z.infer<typeof setNoticeInput>;

const setNoticeOutput = z.object({
	ok: z.boolean(),
	notice: noticeSchema.optional(),
	error: z.string().optional(),
	message: z.string().optional(),
});

// ── Banner rendering ──

const HTML_ESCAPES: Record<string, string> = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	'"': "&quot;",
	"'": "&#39;",
};

const emphasis = (html: string) =>
	html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\*(.+?)\*/g, "<em>$1</em>");

/**
 * Renders the Markdown subset editors can use in a notice: **bold**,
 * *italic*, [links](url) and line breaks. Everything else stays text,
 * because the message is escaped before any markup is added.
 */
function renderMessage(markdown: string): string {
	const links: string[] = [];
	const escaped = markdown.replace(/\0/g, "").replace(/[&<>"']/g, (c) => HTML_ESCAPES[c] ?? c);
	// Links become placeholders first, so emphasis never rewrites characters inside an href.
	const withLinks = escaped.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_match, text: string, url: string) => {
		links.push(`<a href="${sanitizeHref(url)}">${emphasis(text)}</a>`);
		return `\0${links.length - 1}\0`;
	});
	return emphasis(withLinks)
		.replace(/\0(\d+)\0/g, (_match, index: string) => links[Number(index)] ?? "")
		.replace(/\r?\n/g, "<br>");
}

// Colors and sizes fall back to plain values on themes without these tokens.
const BANNER_CSS = `<style>
.site-notice{background:var(--site-notice-bg,var(--color-brand,#111));color:var(--site-notice-fg,var(--color-on-brand,#fff));font-size:var(--font-size-sm,.875rem);line-height:1.5}
.site-notice__inner{max-width:var(--wide-width,1200px);margin:0 auto;padding:10px var(--gutter,16px);text-align:center}
.site-notice strong{font-weight:600}
.site-notice a{color:inherit;text-decoration:underline;text-underline-offset:2px}
.site-notice--sticky{position:sticky;top:0;z-index:51}
</style>`;

// Exposes the sticky banner's height, which grows when the text wraps, so themes can offset their own sticky elements.
const STICKY_SCRIPT = `(()=>{const n=document.querySelector(".site-notice--sticky");if(!n)return;new ResizeObserver(()=>document.documentElement.style.setProperty("--site-notice-height",n.offsetHeight+"px")).observe(n)})();`;

function bannerFragments(notice: Notice): PageFragmentContribution[] {
	const className = notice.sticky ? "site-notice site-notice--sticky" : "site-notice";
	const fragments: PageFragmentContribution[] = [
		{ kind: "html", placement: "head", key: "site-notice-css", html: BANNER_CSS },
		{
			kind: "html",
			placement: "body:start",
			key: "site-notice",
			html: `<div class="${className}" role="status"><p class="site-notice__inner">${renderMessage(notice.message)}</p></div>`,
		},
	];
	if (notice.sticky) {
		fragments.push({ kind: "inline-script", placement: "body:end", key: "site-notice-sticky", code: STICKY_SCRIPT });
	}
	return fragments;
}

// ── Plugin ──

export function createPlugin(options: SiteNoticeOptions = {}) {
	const timeZone = options.timeZone ?? DEFAULT_TIME_ZONE;
	assertTimeZone(timeZone);

	return definePlugin({
		id: ID,
		version: VERSION,
		capabilities: ["hooks.page-fragments:register"],

		hooks: {
			"page:fragments": async (event, ctx) => {
				if (event.page.path.startsWith("/_emdash/")) return null;
				const notice = await readNotice(ctx);
				return isActive(notice) ? bannerFragments(notice) : null;
			},
		},

		routes: {
			get_notice: {
				permission: "settings:read",
				input: getNoticeInput,
				handler: async (ctx) => {
					const notice = await readNotice(ctx);
					return { notice, active: isActive(notice), time_zone: timeZone };
				},
			},

			set_notice: {
				permission: "plugins:manage",
				input: setNoticeInput,
				// The host validates the input against the schema; parsing again types it here.
				handler: async (ctx) => saveNotice(ctx, setNoticeInput.parse(ctx.input), timeZone),
			},
		},

		mcp: {
			tools: {
				get_notice: {
					description:
						"Read the site notice: its Markdown message, display window, whether it is enabled " +
						"and sticky, whether the banner is currently showing on the site, and the site time zone.",
					route: "get_notice",
					input: getNoticeInput,
					output: getNoticeOutput,
				},
				set_notice: {
					description:
						"Show an announcement banner at the top of every page, such as a store closure, a " +
						"holiday schedule or a sale. Optionally schedule it between starts_at and ends_at; it " +
						"appears and disappears on its own. Replaces any existing notice, so pass every field " +
						`you want to keep. Dates without an offset are read in the ${timeZone} time zone. To hide the ` +
						"banner, call it again with the current message and enabled set to false.",
					route: "set_notice",
					input: setNoticeInput,
					output: setNoticeOutput,
				},
			},
		},

		admin: {
			entry: ADMIN_ENTRY,
			pages: ADMIN_PAGES,
		},
	});
}

export default createPlugin;
