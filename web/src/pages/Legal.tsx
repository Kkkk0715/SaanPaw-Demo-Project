import { Fragment, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { legalInline, type LegalDocument } from '@saanpaw/shared';

/** One line of legal text, with its **bold** labels and links. */
function Inline({ text }: { text: string }) {
  return (
    <>
      {legalInline(text).map((part, i) =>
        part.href ? (
          <a key={i} href={part.href} target="_blank" rel="noreferrer">
            {part.text}
          </a>
        ) : part.bold ? (
          <strong key={i}>{part.text}</strong>
        ) : (
          <Fragment key={i}>{part.text}</Fragment>
        ),
      )}
    </>
  );
}

/**
 * Terms of Use / Privacy Policy, readable before signing in (linked from the landing page footer).
 * The wording lives in @saanpaw/shared so the console and the mobile app show the same text.
 */
export function LegalPage({ doc, other }: { doc: LegalDocument; other: { to: string; label: string } }) {
  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = `${doc.title} · SaanPaw`;
  }, [doc]);

  return (
    <div className="legal-page">
      <nav className="legal-nav">
        <Link to="/" className="legal-back">
          &larr; Back to SaanPaw
        </Link>
        <Link to={other.to}>{other.label}</Link>
      </nav>
      <article className="legal-doc">
        <h1>{doc.title}</h1>
        <p className="legal-effective">Effective date: {doc.effective}</p>
        {doc.sections.map((s) => (
          <section key={s.title}>
            <h2>{s.title}</h2>
            {s.blocks.map((b, i) =>
              b.type === 'p' ? (
                <p key={i}>
                  <Inline text={b.text} />
                </p>
              ) : b.type === 'ul' ? (
                <ul key={i}>
                  {b.items.map((item, j) => (
                    <li key={j}>
                      <Inline text={item} />
                    </li>
                  ))}
                </ul>
              ) : (
                <div key={i} className="legal-table-wrap">
                  <table className="legal-table">
                    <thead>
                      <tr>
                        {b.head.map((h) => (
                          <th key={h}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {b.rows.map((row, r) => (
                        <tr key={r}>
                          {row.map((cell, c) => (
                            <td key={c}>
                              <Inline text={cell} />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ),
            )}
          </section>
        ))}
      </article>
    </div>
  );
}
