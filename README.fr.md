# emdash-plugin-site-notice

[English](README.md)

Un bandeau d'annonce sur tout le site pour [EmDash](https://github.com/emdash-cms/emdash) : fermeture de la boutique, horaires de fêtes, soldes. Les éditeurs écrivent le message en Markdown, le programment entre deux dates, et le gèrent depuis l'admin ou via le serveur MCP d'EmDash.

- Sous-ensemble de Markdown : `**gras**`, `*italique*`, `[lien](https://…)` et retours à la ligne. Tout le reste est échappé, et les schémas de lien dangereux deviennent `#`.
- Dates de début et de fin facultatives : le bandeau apparaît et disparaît tout seul.
- Interrupteur **Show the banner**, et option **sticky** qui garde le bandeau visible pendant le défilement.
- Deux outils MCP, `get_notice` et `set_notice`, pour les agents IA.

Nécessite EmDash 1.4.0 ou plus récent.

## Installation

```bash
pnpm add emdash-plugin-site-notice
```

Déclarez le plugin dans `astro.config.mjs` :

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

| Option     | Défaut           | Description                                                                           |
| ---------- | ---------------- | ------------------------------------------------------------------------------------- |
| `timeZone` | `"Europe/Paris"` | Fuseau IANA des dates saisies sans décalage, dans l'admin et via MCP.                |

Le bandeau est ajouté aux pages publiques via les page fragments d'EmDash : le layout du site doit donc afficher les deux points d'insertion avec le même contexte de page :

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

Le bandeau s'affiche à l'emplacement de `<EmDashBodyStart>`, et ses styles vont dans `<EmDashHead>`. Placez `<EmDashBodyStart>` après un éventuel lien d'évitement, pour que celui-ci reste le premier élément focusable.

## Confiance et capabilities

C'est un plugin **natif** : il s'exécute dans le process du site, sans sandbox, comme le reste du code du site. Il est natif parce que seuls les plugins natifs peuvent ajouter du HTML aux pages publiques (`page:fragments`) et fournir une page d'admin React. Il ne peut pas être installé depuis le registre de plugins EmDash.

Il déclare une seule capability, `hooks.page-fragments:register`, pour ajouter le bandeau. Il ne fait aucune requête réseau et stocke une notice dans son propre stockage key-value.

## Dans l'admin

1. Ouvrez **Site notice** dans la section plugins de la barre latérale (`/_emdash/admin/plugins/site-notice/notice`).
2. Écrivez le message. Il n'est obligatoire que lorsque **Show the banner** est activé.
3. Si besoin, renseignez **Show from** et **Show until**, chacun avec une heure facultative (vide = minuit). Sans début, le bandeau s'affiche tout de suite ; sans fin, il reste jusqu'à ce que vous le masquiez.
4. Activez **Keep the banner visible while scrolling** pour un bandeau sticky, puis enregistrez.

La ligne sous le titre indique si le bandeau est affiché, programmé ou masqué. Un changement apparaît au chargement de page suivant.

## Outils MCP

Un administrateur doit d'abord les autoriser : ouvrez **Plugins** (`/_emdash/admin/plugins-manager`), dépliez **site-notice** et activez l'accès des agents. Les appels exigent aussi la permission de la route et la portée de jeton `mcp:tools` ou `mcp:tools:site-notice`.

| Outil                     | Permission                          | Rôle                                                                              |
| ------------------------- | ----------------------------------- | --------------------------------------------------------------------------------- |
| `site-notice__get_notice` | `settings:read` (Editor et au-dessus) | Lit la notice, indique si elle est affichée, et donne le fuseau du site          |
| `site-notice__set_notice` | `plugins:manage` (Admin)            | Enregistre la notice, éventuellement entre deux dates ; remplace toute notice existante |

| Vous demandez à l'agent                                     | Appel d'outil                                                                                                 |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| « Ferme la boutique jusqu'au 15 novembre 2026 »             | `set_notice { "message": "Our store is **closed until 15 November**.", "ends_at": "2026-11-15" }`             |
| « Annonce le Black Friday du 27 au 30 novembre, sticky »    | `set_notice { "message": "**Black Friday:** 20% off. [Shop now](/pricing)", "starts_at": "2026-11-27", "ends_at": "2026-12-01", "sticky": true }` |
| « Une notice est-elle affichée en ce moment ? »             | `get_notice {}`                                                                                               |
| « Masque la notice »                                        | `set_notice { "enabled": false }`, ou les champs actuels avec `"enabled": false` pour garder le message      |

`starts_at` et `ends_at` acceptent une date locale (`2026-11-15`), une date et heure locales (`2026-11-15T09:00`) ou une date ISO 8601 avec décalage (`2026-11-15T09:00:00+01:00`). `ends_at` doit être dans le futur et après `starts_at`. Le bandeau n'affiche pas sa programmation : écrivez dans le message les dates que les visiteurs doivent lire.

## Styles

Le bandeau est un `div.site-notice` (plus `.site-notice--sticky` quand il est sticky) contenant un `p.site-notice__inner`. Il utilise ces propriétés CSS, avec des valeurs de repli pour les thèmes qui ne les définissent pas :

| Propriété                                | Usage                           | Repli                                    |
| ---------------------------------------- | ------------------------------- | ---------------------------------------- |
| `--site-notice-bg`, `--site-notice-fg`   | Couleurs de fond et de texte    | `--color-brand`, `--color-on-brand`, puis `#111` / `#fff` |
| `--font-size-sm`                         | Taille du texte                 | `.875rem`                                |
| `--wide-width`, `--gutter`               | Largeur du contenu et marges    | `1200px`, `16px`                         |

Un bandeau sticky publie sa hauteur dans `--site-notice-height` sur `:root`, mise à jour quand le texte passe à la ligne. Si le thème a son propre header sticky, placez-le sous le bandeau :

```css
body:has(.site-notice--sticky) .site-header {
	top: var(--site-notice-height, 0px);
}
```

## Développement

```bash
pnpm install
pnpm typecheck
pnpm build
```

`pnpm build` compile l'entrée serveur dans `dist/`. La page d'admin est livrée en source TypeScript (`src/admin`), que le site hôte compile avec son propre React et Kumo. Pour tester des changements dans un site, ajoutez le paquet avec une dépendance `link:` ou workspace, reconstruisez, puis redémarrez le serveur de dev du site.

## Licence

[MIT](LICENSE)
