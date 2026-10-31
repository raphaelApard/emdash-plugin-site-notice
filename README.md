# emdash-plugin-site-notice

[Français](README.fr.md)

A site-wide announcement banner for [EmDash](https://github.com/emdash-cms/emdash): a store closure, a holiday schedule, a sale. Editors write the message in Markdown, schedule it between two dates, and manage it from the admin or through EmDash's MCP server.

- Markdown subset: `**bold**`, `*italic*`, `[link](https://…)` and line breaks. Everything else is escaped, and unsafe link schemes become `#`.
- Optional start and end dates: the banner appears and disappears on its own.
- **Show the banner** switch, and a **sticky** option that keeps the banner visible while visitors scroll.
- Two MCP tools, `get_notice` and `set_notice`, for AI agents.

Requires EmDash 1.4.0 or later.

## Install

```bash
pnpm add emdash-plugin-site-notice
```

Register the plugin in `astro.config.mjs`:

```js
import { defineConfig } from "astro/config";
import emdash from "emdash/astro";
import { siteNotice } from "emdash-plugin-site-notice";

export default defineConfig({
	integrations: [
		emdash({
			plugins: [siteNotice({ timeZone: "Europe/Paris" })],
		}),
	],
});
```

| Option     | Default          | Description                                                                        |
| ---------- | ---------------- | ---------------------------------------------------------------------------------- |
| `timeZone` | `"Europe/Paris"` | IANA time zone for dates entered without an offset, in the admin and through MCP. |

The banner is added to public pages through EmDash's page fragments, so the site layout must render both insertion points with the same page context:

```astro
<head>
	<EmDashHead page={page} />
</head>
<body>
	<a href="#main" class="skip-link">Skip to content</a>
	<EmDashBodyStart page={page} />
	…
</body>
```

The banner renders right where `<EmDashBodyStart>` sits, and its styles go into `<EmDashHead>`. Place `<EmDashBodyStart>` after any skip link so that link stays the first focusable element.

## Trust and capabilities

This is a **native** plugin: it runs in the site's process, without a sandbox, like the rest of the site's code. It is native because only native plugins can add HTML to public pages (`page:fragments`) and ship a React admin page. It cannot be installed from the EmDash plugin registry.

It declares one capability, `hooks.page-fragments:register`, to add the banner. It makes no network requests and stores one notice in its own key-value storage.

## Using the admin

1. Open **Site notice** in the sidebar's plugin section (`/_emdash/admin/plugins/site-notice/notice`).
2. Write the message. It is required only while **Show the banner** is on.
3. Optionally set **Show from** and **Show until**, each with an optional time (empty means midnight). An empty start shows the banner right away; an empty end keeps it until you hide it.
4. Turn on **Keep the banner visible while scrolling** for a sticky banner, then save.

The line under the title says whether the banner is showing, scheduled or hidden. A change shows on the next page load.

## MCP tools

An administrator must first allow them: open **Plugins** (`/_emdash/admin/plugins-manager`), expand **site-notice**, and turn on agent access. Calls also need the route permission and the `mcp:tools` or `mcp:tools:site-notice` token scope.

| Tool                      | Permission                        | What it does                                                                            |
| ------------------------- | --------------------------------- | --------------------------------------------------------------------------------------- |
| `site-notice__get_notice` | `settings:read` (Editor and above) | Reads the notice, whether it is showing, and the site time zone                         |
| `site-notice__set_notice` | `plugins:manage` (Admin)          | Saves the notice, optionally between two dates; replaces any existing notice            |

| You ask the agent                                        | Tool call                                                                                                     |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| "Close the store until 15 November 2026"                 | `set_notice { "message": "Our store is **closed until 15 November**.", "ends_at": "2026-11-15" }`             |
| "Announce Black Friday from 27 to 30 November, sticky"   | `set_notice { "message": "**Black Friday:** 20% off. [Shop now](/pricing)", "starts_at": "2026-11-27", "ends_at": "2026-12-01", "sticky": true }` |
| "Is a notice showing right now?"                         | `get_notice {}`                                                                                               |
| "Hide the notice"                                        | `set_notice { "enabled": false }`, or the current fields with `"enabled": false` to keep the message          |

`starts_at` and `ends_at` accept a local date (`2026-11-15`), a local date and time (`2026-11-15T09:00`), or an ISO 8601 datetime with an offset (`2026-11-15T09:00:00+01:00`). `ends_at` must be in the future and after `starts_at`. The banner doesn't print its schedule: write any date visitors should read into the message.

## Styling

The banner is a `div.site-notice` (plus `.site-notice--sticky` when sticky) containing a `p.site-notice__inner`. It uses these CSS custom properties, with fallbacks for themes that don't define them:

| Property                                 | Used for                        | Falls back to                            |
| ---------------------------------------- | ------------------------------- | ---------------------------------------- |
| `--site-notice-bg`, `--site-notice-fg`   | Background and text colors      | `--color-brand`, `--color-on-brand`, then `#111` / `#fff` |
| `--font-size-sm`                         | Text size                       | `.875rem`                                |
| `--wide-width`, `--gutter`               | Content width and side padding  | `1200px`, `16px`                         |

A sticky banner publishes its height as `--site-notice-height` on `:root`, updated when the text wraps. If the theme has its own sticky header, move it below the banner:

```css
body:has(.site-notice--sticky) .site-header {
	top: var(--site-notice-height, 0px);
}
```

## Development

```bash
pnpm install
pnpm typecheck
pnpm build
```

`pnpm build` compiles the server entry to `dist/`. The admin page ships as TypeScript source (`src/admin`), which the host site compiles with its own React and Kumo. To try changes in a site, add the package with a `link:` or workspace dependency, rebuild, and restart the site's dev server.

## License

[MIT](LICENSE)
