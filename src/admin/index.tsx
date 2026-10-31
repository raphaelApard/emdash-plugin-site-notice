import { Button, Input, InputArea, Switch } from "@cloudflare/kumo";
import type { PluginAdminExports } from "emdash";
import { apiFetch, parseApiResponse } from "emdash/plugin-utils";
import * as React from "react";

import { DEFAULT_TIME_ZONE, type Notice, statusText, toLocal } from "../notice.js";

const API_BASE = "/_emdash/api/plugins/site-notice";

interface FormState {
	message: string;
	startDate: string;
	startTime: string;
	endDate: string;
	endTime: string;
	enabled: boolean;
	sticky: boolean;
}

function toForm(notice: Notice | null, timeZone: string): FormState {
	const start = notice?.starts_at ? toLocal(new Date(notice.starts_at), timeZone) : null;
	const end = notice?.ends_at ? toLocal(new Date(notice.ends_at), timeZone) : null;
	return {
		message: notice?.message ?? "",
		startDate: start?.date ?? "",
		startTime: start?.time ?? "",
		endDate: end?.date ?? "",
		endTime: end?.time ?? "",
		enabled: notice?.enabled ?? true,
		sticky: notice?.sticky ?? false,
	};
}

/** Joins a date and optional time into a local value; an empty time means midnight. */
function joinDateTime(date: string, time: string): string | null {
	if (!date) return null;
	return time ? `${date}T${time}` : date;
}

type SaveResponse = { ok: true; notice: Notice } | { ok: false; message: string };

function NoticePage() {
	const [notice, setNotice] = React.useState<Notice | null>(null);
	const [timeZone, setTimeZone] = React.useState(DEFAULT_TIME_ZONE);
	const [form, setForm] = React.useState<FormState>(() => toForm(null, DEFAULT_TIME_ZONE));
	const [loaded, setLoaded] = React.useState(false);
	const [saving, setSaving] = React.useState(false);
	const [feedback, setFeedback] = React.useState<{ error: boolean; text: string } | null>(null);

	React.useEffect(() => {
		void (async () => {
			try {
				const response = await apiFetch(`${API_BASE}/get_notice`);
				const data = await parseApiResponse<{ notice: Notice | null; time_zone: string }>(
					response,
					"Could not load the notice",
				);
				setNotice(data.notice);
				setTimeZone(data.time_zone);
				setForm(toForm(data.notice, data.time_zone));
			} catch (cause) {
				setFeedback({ error: true, text: cause instanceof Error ? cause.message : String(cause) });
			} finally {
				setLoaded(true);
			}
		})();
	}, []);

	const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
		setForm((current) => ({ ...current, [key]: value }));

	async function save(event: React.FormEvent) {
		event.preventDefault();
		if ((form.startTime && !form.startDate) || (form.endTime && !form.endDate)) {
			setFeedback({ error: true, text: "Set a date for each time." });
			return;
		}
		setSaving(true);
		setFeedback(null);
		try {
			const response = await apiFetch(`${API_BASE}/set_notice`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					message: form.message,
					starts_at: joinDateTime(form.startDate, form.startTime),
					ends_at: joinDateTime(form.endDate, form.endTime),
					enabled: form.enabled,
					sticky: form.sticky,
				}),
			});
			const result = await parseApiResponse<SaveResponse>(response, "Could not save the notice");
			if (result.ok) {
				setNotice(result.notice);
				setFeedback({ error: false, text: "Notice saved." });
			} else {
				setFeedback({ error: true, text: result.message });
			}
		} catch (cause) {
			setFeedback({ error: true, text: cause instanceof Error ? cause.message : String(cause) });
		} finally {
			setSaving(false);
		}
	}

	return (
		<section className="flex flex-col gap-4" style={{ maxWidth: 640 }}>
			<h1 className="text-2xl font-semibold">Site notice</h1>
			<p className="text-sm text-kumo-subtle">{loaded ? statusText(notice, timeZone) : "Loading…"}</p>

			<form className="flex flex-col gap-4" onSubmit={save}>
				<InputArea
					label="Message (Markdown: **bold**, *italic*, [link](https://…); required to show the banner)"
					placeholder="Our store is **closed until 15 November**."
					required={form.enabled}
					value={form.message}
					onChange={(e) => update("message", e.target.value)}
				/>
				<div className="grid grid-cols-2 gap-4">
					<Input
						label="Show from (empty means now)"
						type="date"
						value={form.startDate}
						onChange={(e) => update("startDate", e.target.value)}
					/>
					<Input
						label={`Time, ${timeZone} (empty means midnight)`}
						type="time"
						value={form.startTime}
						onChange={(e) => update("startTime", e.target.value)}
					/>
				</div>
				<div className="grid grid-cols-2 gap-4">
					<Input
						label="Show until (empty means no end)"
						type="date"
						value={form.endDate}
						onChange={(e) => update("endDate", e.target.value)}
					/>
					<Input
						label={`Time, ${timeZone} (empty means midnight)`}
						type="time"
						value={form.endTime}
						onChange={(e) => update("endTime", e.target.value)}
					/>
				</div>
				<Switch
					label="Show the banner"
					checked={form.enabled}
					onCheckedChange={(checked: boolean) => update("enabled", checked)}
				/>
				<Switch
					label="Keep the banner visible while scrolling"
					checked={form.sticky}
					onCheckedChange={(checked: boolean) => update("sticky", checked)}
				/>
				<div>
					<Button type="submit" disabled={!loaded || saving}>
						{saving ? "Saving…" : "Save notice"}
					</Button>
				</div>
				{feedback && (
					<p
						role={feedback.error ? "alert" : "status"}
						className={feedback.error ? "text-sm text-kumo-danger" : "text-sm text-kumo-subtle"}
					>
						{feedback.text}
					</p>
				)}
			</form>
		</section>
	);
}

export const pages: PluginAdminExports["pages"] = {
	"/notice": NoticePage,
};
