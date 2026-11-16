# llm-whisperer docs site

The Docusaurus site published at
<https://aananda-giri.github.io/llm-whisperer/>.

The content is **not** stored here. The site reads the repo-root markdown in
place:

| Section | Source | Route |
|---|---|---|
| Docs | `../docs/` | `/docs/…` |
| Book | `../wiki/` | `/wiki/…` |
| Blog | `../blog/` | `/blog/…` |

`docs/` and `wiki/` are two separate docs plugin instances; the blog is the
standard Docusaurus blog plugin. `src/remark/crossTreeLinks.ts` rewrites the
relative links that cross between those trees (plus the repo-root README and
LICENSE) into site routes, because the built-in resolver only sees links inside
one instance. Keep it in sync with `baseUrl`/`repoUrl` in
`docusaurus.config.ts`.

## Local development

```bash
npm install
npm run start
```

## Build

```bash
npm run build
npm run serve   # preview the production build
```

## Deployment

`.github/workflows/docs.yml` builds and deploys to GitHub Pages on every push
to `master` that touches `docs/`, `wiki/`, `blog/`, or `website/`. The repo's
Pages setting must be **Source: GitHub Actions**.
