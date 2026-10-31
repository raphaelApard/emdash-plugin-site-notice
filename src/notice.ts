/**
 * Notice model and time zone handling, shared by the server runtime and
 * the admin page. Intl only, so it runs in both.
 */

export const DEFAULT_TIME_ZONE = "Europe/Paris";

export interface Notice {
	/** Markdown subset rendered on the site: **bold**, *italic*, [links](url). */
	message: string;
	/** UTC ISO 8601 instant when the banner starts showing, or null to show it right away. */
	starts_at: string | null;
	/** UTC ISO 8601 instant when the banner stops showing, or null for no end. */
	ends_at: string | null;
	enabled: boolean;
	/** Keeps the banner pinned to the top of the viewport while scrolling. */
	sticky: boolean;
}

/** Throws a RangeError when the runtime doesn't know the IANA time zone. */
export function assertTimeZone(timeZone: string): void {
	new Intl.DateTimeFormat("en-GB", { timeZone });
}

const formats = new Map<string, Intl.DateTimeFormat>();

function wallClockFormat(timeZone: string): Intl.DateTimeFormat {
	let format = formats.get(timeZone);
	if (!format) {
		format = new Intl.DateTimeFormat("en-GB", {
			timeZone,
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			hourCycle: "h23",
		});
		formats.set(timeZone, format);
	}
	return format;
}

/** Splits an instant into its wall-clock date (YYYY-MM-DD) and time (HH:MM) in a time zone. */
export function toLocal(instant: Date, timeZone: string): { date: string; time: string } {
	const parts = wallClockFormat(timeZone).formatToParts(instant);
	const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
	return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

/** Converts a wall-clock date and time in a time zone to an instant, accounting for DST. */
function fromLocal(date: string, time: string, timeZone: string): Date | null {
	const wall = Date.parse(`${date}T${time}:00Z`);
	if (Number.isNaN(wall) || new Date(wall).toISOString().slice(0, 10) !== date) return null;
	const offsetAt = (t: number) => {
		const local = toLocal(new Date(t), timeZone);
		return Date.parse(`${local.date}T${local.time}:00Z`) - t;
	};
	return new Date(wall - offsetAt(wall - offsetAt(wall)));
}

const LOCAL_VALUE = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?$/;
const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;

/**
 * Accepts an ISO 8601 datetime with an offset, or a local date (midnight)
 * or date and time without an offset, read in the given time zone.
 */
export function parseInstant(value: string, timeZone: string): Date | null {
	const trimmed = value.trim();
	const local = LOCAL_VALUE.exec(trimmed);
	if (local) return fromLocal(local[1], local[2] ?? "00:00", timeZone);
	if (!ISO_WITH_OFFSET.test(trimmed)) return null;
	const instant = new Date(trimmed);
	return Number.isNaN(instant.getTime()) ? null : instant;
}

export function isActive(notice: Notice | null, now = Date.now()): notice is Notice {
	return (
		notice !== null &&
		notice.enabled &&
		(notice.starts_at === null || Date.parse(notice.starts_at) <= now) &&
		(notice.ends_at === null || Date.parse(notice.ends_at) > now)
	);
}

/** One-line summary of whether the banner is showing, for the admin. */
export function statusText(notice: Notice | null, timeZone: string): string {
	const format = (iso: string) => {
		const { date, time } = toLocal(new Date(iso), timeZone);
		return `${date} ${time} (${timeZone})`;
	};
	if (!notice) return "No notice saved.";
	if (!notice.enabled) return "Hidden: Show the banner is off.";
	const now = Date.now();
	if (notice.ends_at && Date.parse(notice.ends_at) <= now) return "Hidden: the end date has passed.";
	if (notice.starts_at && Date.parse(notice.starts_at) > now) {
		return `Scheduled: shows from ${format(notice.starts_at)}.`;
	}
	return notice.ends_at
		? `Showing on the site until ${format(notice.ends_at)}.`
		: "Showing on the site, with no end date.";
}
