'use client';

import { useState, useMemo } from 'react';
import type { HelpTopic } from '@/lib/help-content';

/**
 * Shared help reading layout used by the admin Help page and the portal
 * Help tab. Left column is a sticky TOC + search; right column is the
 * selected article body. The TOC auto-filters as the reader types in the
 * search box so long knowledge bases stay navigable.
 */
export default function HelpView({
  topics,
  title,
  subtitle,
}: {
  topics: HelpTopic[];
  title: string;
  subtitle?: string;
}) {
  const [selected, setSelected] = useState<{ topic: string; article: string }>(
    { topic: topics[0].id, article: topics[0].articles[0].id },
  );
  const [search, setSearch] = useState('');

  // Client-side search: matches article title OR topic title. We could pull
  // the body text too via a renderToString, but that pulls in ReactDOMServer
  // server-side which isn't available in client components. Title-only
  // search is good enough for a ~50-article KB.
  const filteredTopics = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return topics;
    return topics
      .map((topic) => ({
        ...topic,
        articles: topic.articles.filter(
          (a) =>
            a.title.toLowerCase().includes(q) ||
            topic.title.toLowerCase().includes(q),
        ),
      }))
      .filter((t) => t.articles.length > 0);
  }, [topics, search]);

  const currentTopic = topics.find((t) => t.id === selected.topic);
  const currentArticle = currentTopic?.articles.find((a) => a.id === selected.article);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-8">
      {/* TOC */}
      <aside className="lg:sticky lg:top-4 lg:self-start">
        <div className="mb-4">
          <span className="section-label mb-1 block">Help</span>
          <h2
            className="font-display mb-1"
            style={{ fontSize: '1.875rem', color: 'var(--ink)', fontWeight: 500 }}
          >
            {title}
          </h2>
          {subtitle && (
            <p className="text-sm italic" style={{ color: 'var(--muted)' }}>
              {subtitle}
            </p>
          )}
        </div>

        <input
          type="search"
          placeholder="Search help…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input text-sm mb-4"
        />

        {filteredTopics.length === 0 ? (
          <p className="text-sm italic" style={{ color: 'var(--muted)' }}>
            No articles match &ldquo;{search}&rdquo;.
          </p>
        ) : (
          <nav className="space-y-4">
            {filteredTopics.map((topic) => (
              <div key={topic.id}>
                <div
                  className="section-label mb-2 pb-1"
                  style={{
                    borderBottom: '1px solid var(--divider)',
                    color: 'var(--muted)',
                    textTransform: 'uppercase',
                  }}
                >
                  {topic.title}
                </div>
                <ul className="space-y-1">
                  {topic.articles.map((article) => {
                    const isActive =
                      selected.topic === topic.id && selected.article === article.id;
                    return (
                      <li key={article.id}>
                        <button
                          onClick={() =>
                            setSelected({ topic: topic.id, article: article.id })
                          }
                          className="text-left w-full text-sm py-1 px-2 transition-colors"
                          style={{
                            color: isActive ? 'var(--ink)' : 'var(--muted)',
                            fontWeight: isActive ? 600 : 400,
                            background: isActive
                              ? 'color-mix(in srgb, var(--brass) 10%, transparent)'
                              : 'transparent',
                            borderLeft: isActive
                              ? '2px solid var(--brass)'
                              : '2px solid transparent',
                            borderRadius: '2px',
                          }}
                        >
                          {article.title}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        )}
      </aside>

      {/* Article */}
      <article className="max-w-3xl">
        {currentArticle ? (
          <>
            <div className="mb-4 pb-3" style={{ borderBottom: '1px solid var(--divider)' }}>
              <span className="section-label" style={{ color: 'var(--muted)' }}>
                {currentTopic?.title}
              </span>
              <h1
                className="font-display mt-1"
                style={{ fontSize: '2rem', color: 'var(--ink)', fontWeight: 500, lineHeight: 1.2 }}
              >
                {currentArticle.title}
              </h1>
            </div>
            <div className="prose-like" style={{ color: 'var(--ink)' }}>
              {currentArticle.body}
            </div>
            <ArticleFooter
              topics={topics}
              current={selected}
              onJump={setSelected}
            />
          </>
        ) : (
          <p className="italic" style={{ color: 'var(--muted)' }}>
            Pick an article from the left.
          </p>
        )}
      </article>
    </div>
  );
}

// Prev / Next navigation at the bottom of each article. Walks the flat list
// of all articles across all topics so readers can step through the entire
// KB linearly if they want.
function ArticleFooter({
  topics,
  current,
  onJump,
}: {
  topics: HelpTopic[];
  current: { topic: string; article: string };
  onJump: (s: { topic: string; article: string }) => void;
}) {
  const flat = topics.flatMap((t) => t.articles.map((a) => ({ topic: t.id, article: a.id, title: a.title })));
  const idx = flat.findIndex((x) => x.topic === current.topic && x.article === current.article);
  if (idx < 0) return null;
  const prev = idx > 0 ? flat[idx - 1] : null;
  const next = idx < flat.length - 1 ? flat[idx + 1] : null;
  return (
    <div
      className="mt-10 pt-6 flex items-center justify-between gap-4"
      style={{ borderTop: '1px solid var(--divider)' }}
    >
      {prev ? (
        <button
          onClick={() => onJump({ topic: prev.topic, article: prev.article })}
          className="text-sm text-left max-w-[45%]"
          style={{ color: 'var(--muted)' }}
        >
          <span className="section-label block mb-0.5">← Previous</span>
          <span style={{ color: 'var(--ink)' }}>{prev.title}</span>
        </button>
      ) : (
        <span />
      )}
      {next ? (
        <button
          onClick={() => onJump({ topic: next.topic, article: next.article })}
          className="text-sm text-right max-w-[45%]"
          style={{ color: 'var(--muted)' }}
        >
          <span className="section-label block mb-0.5">Next →</span>
          <span style={{ color: 'var(--ink)' }}>{next.title}</span>
        </button>
      ) : (
        <span />
      )}
    </div>
  );
}
