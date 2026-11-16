/**
 * Docusaurus remark plugin: rewrite cross-tree links that the per-instance
 * markdown link resolver cannot see.
 *
 * docs/ and wiki/ are separate docs plugin instances, and the repo-root
 * README and LICENSE are not part of the site. The source markdown links
 * between them are ordinary relative file paths — GitHub and npm readers
 * need those — so this plugin rewrites them to site routes before the
 * default resolver runs.
 *
 * Keep baseUrl/repoUrl in sync with docusaurus.config.ts (passed as options).
 */

type Options = {
  baseUrl: string;
  repoUrl: string;
};

type MarkdownNode = {
  type: string;
  url?: string;
  children?: MarkdownNode[];
};

export default function crossTreeLinks(options: Options) {
  const baseUrl = options.baseUrl.endsWith('/')
    ? options.baseUrl
    : `${options.baseUrl}/`;
  const repoUrl = options.repoUrl.replace(/\/+$/, '');

  const routeFor = (tree: 'docs' | 'wiki', file: string, hash = '') =>
    `${baseUrl}${tree}/${file === 'README' ? '' : file}${hash}`;

  const crossTree = /^(?:\.\.\/)+(docs|wiki)\/(.+)\.md(#.*)?$/;
  const repoRootFile = /^(?:\.\.\/)+(README\.md|LICENSE)$/;

  return (tree: MarkdownNode, file: {path: string}) => {
    const fromDocs = /\/docs\//.test(file.path);

    const visit = (node: MarkdownNode) => {
      if (node.type === 'link' && typeof node.url === 'string') {
        const cross = node.url.match(crossTree);
        if (cross) {
          node.url = routeFor(
            cross[1] as 'docs' | 'wiki',
            cross[2]!,
            cross[3] ?? '',
          );
        } else if (fromDocs) {
          const root = node.url.match(repoRootFile);
          if (root) {
            node.url =
              root[1] === 'README.md'
                ? `${repoUrl}#readme`
                : `${repoUrl}/blob/master/LICENSE`;
          }
        }
      }
      for (const child of node.children ?? []) visit(child);
    };

    visit(tree);
  };
}
