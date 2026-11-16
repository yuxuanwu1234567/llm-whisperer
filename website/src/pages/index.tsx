import type {ReactNode} from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';

import styles from './index.module.css';

function HomepageHeader() {
  const {siteConfig} = useDocusaurusContext();
  return (
    <header className={clsx('hero hero--primary', styles.heroBanner)}>
      <div className="container">
        <Heading as="h1" className="hero__title">
          🤫 {siteConfig.title}
        </Heading>
        <p className="hero__subtitle">{siteConfig.tagline}</p>
        <div className={styles.buttons}>
          <Link
            className="button button--secondary button--lg"
            to="/docs/quickstart">
            Quickstart
          </Link>
          <Link className="button button--secondary button--lg" to="/wiki/">
            Read the book
          </Link>
        </div>
      </div>
    </header>
  );
}

const cards = [
  {
    title: 'Docs',
    to: '/docs/quickstart',
    body: 'Task-oriented reference: install, providers.yaml, request shapes, client setup.',
  },
  {
    title: 'The Book',
    to: '/wiki/',
    body: 'Why the system is shaped this way, page by page — with an honest status marker on every page.',
  },
  {
    title: 'Blog',
    to: '/blog',
    body: 'Notes and write-ups about one local API for every LLM.',
  },
];

export default function Home(): ReactNode {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout
      title={siteConfig.title}
      description="Documentation for llm-whisperer — one local, OpenAI-compatible API in front of API-key and browser LLM providers.">
      <HomepageHeader />
      <main className={styles.main}>
        <div className={clsx('container', styles.cards)}>
          {cards.map((card) => (
            <Link key={card.title} className={styles.card} to={card.to}>
              <Heading as="h2">{card.title}</Heading>
              <p>{card.body}</p>
            </Link>
          ))}
        </div>
      </main>
    </Layout>
  );
}
