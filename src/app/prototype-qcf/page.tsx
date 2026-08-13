'use client';

// Outil de calibration DÉVELOPPEUR : jamais accessible dans l'app publiée
// (App Store 2.1 — pas de contenu de développement dans une app soumise).

import { useRouter } from 'next/navigation';
import { isNativeApp } from '@/utils/audioStore';
import { useEffect, useMemo, useState } from 'react';

interface Word {
  verseKey: string;
  code: string;
  position: number;
}

interface Line {
  line: number;
  words: Word[];
}

interface PageData {
  page: number;
  font: string;
  lines: Line[];
}

const AVAILABLE_PAGES = [86, 91];

export default function PrototypeQcfPage() {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const protoRouter = useRouter();
  useEffect(() => {
    if (isNativeApp()) protoRouter.replace('/exercises');
  }, [protoRouter]);

  const [pageNumber, setPageNumber] = useState(86);
  const [data, setData] = useState<PageData | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  useEffect(() => {
    setData(null);
    setHidden(new Set());
    fetch(`/qcf-data/page-${String(pageNumber).padStart(3, '0')}.json`)
      .then((r) => r.json())
      .then(setData);
  }, [pageNumber]);

  const fontFamily = `QCF_P${String(pageNumber).padStart(3, '0')}`;
  const fontUrl = `/fonts/qcf-v2/${fontFamily}.woff2`;

  const verses = useMemo(() => {
    if (!data) return [];
    const seen: string[] = [];
    for (const line of data.lines) {
      for (const w of line.words) {
        if (!seen.includes(w.verseKey)) seen.push(w.verseKey);
      }
    }
    return seen;
  }, [data]);

  const toggleVerse = (verseKey: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(verseKey)) next.delete(verseKey);
      else next.add(verseKey);
      return next;
    });
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#1a1a1a',
        color: '#eee',
        padding: '24px',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <style>{`
        @font-face {
          font-family: '${fontFamily}';
          src: url('${fontUrl}') format('woff2');
          font-display: block;
        }
        .mushaf-page {
          background: #fdfaf3;
          color: #1a1a1a;
          aspect-ratio: 759 / 1100;
          width: 100%;
          max-width: 600px;
          margin: 0 auto;
          padding: 8% 7% 6% 7%;
          box-sizing: border-box;
          box-shadow: 0 8px 40px rgba(0,0,0,0.5);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          position: relative;
        }
        .mushaf-line {
          font-family: '${fontFamily}', serif;
          font-size: clamp(22px, 4.2vw, 30px);
          line-height: 1;
          direction: rtl;
          text-align: justify;
          text-align-last: justify;
          white-space: nowrap;
          color: #1a1a1a;
        }
        .mushaf-line::after {
          content: '';
          display: inline-block;
          width: 100%;
        }
        .verse-word {
          transition: opacity 0.25s ease, color 0.25s ease;
        }
        .verse-word.hidden {
          color: transparent;
        }
        .verse-word.ayah-marker {
          color: #2d5016 !important;
        }
        .panel {
          max-width: 600px;
          margin: 24px auto 0;
          background: #2a2a2a;
          padding: 16px;
          border-radius: 12px;
        }
        .panel h3 { margin: 0 0 12px; font-size: 14px; color: #aaa; font-weight: 500; text-transform: uppercase; letter-spacing: 0.05em; }
        .verse-btn {
          background: #3a3a3a;
          color: #eee;
          border: 1px solid #444;
          padding: 8px 14px;
          border-radius: 8px;
          margin: 4px;
          cursor: pointer;
          font-family: inherit;
          font-size: 13px;
          transition: all 0.15s;
        }
        .verse-btn:hover { background: #4a4a4a; }
        .verse-btn.hidden { background: #5a2020; border-color: #8a3030; }
        .toggle-png {
          background: #4a4a4a;
          color: #eee;
          border: none;
          padding: 8px 14px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 13px;
          margin-bottom: 16px;
        }
        .compare {
          max-width: 600px;
          margin: 24px auto 0;
        }
        .compare img {
          width: 100%;
          display: block;
          box-shadow: 0 8px 40px rgba(0,0,0,0.5);
        }
      `}</style>

      <div style={{ maxWidth: 600, margin: '0 auto 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Prototype QCF — Page {pageNumber}</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          {AVAILABLE_PAGES.map((p) => (
            <button
              key={p}
              className="toggle-png"
              onClick={() => setPageNumber(p)}
              style={{
                background: pageNumber === p ? '#2d5016' : '#4a4a4a',
                fontWeight: pageNumber === p ? 600 : 400,
              }}
            >
              Page {p}
            </button>
          ))}
        </div>
      </div>

      {(
        <div className="mushaf-page">
          {data ? (
            data.lines.map((line) => (
              <div key={line.line} className="mushaf-line">
                {line.words.map((w, i) => {
                  const isLastInVerse =
                    i === line.words.length - 1 || line.words[i + 1].verseKey !== w.verseKey;
                  const isAyahMarker = isLastInVerse && line.words.filter((x) => x.verseKey === w.verseKey).length > 1;
                  return (
                    <span
                      key={`${line.line}-${i}`}
                      className={`verse-word ${hidden.has(w.verseKey) && !isAyahMarker ? 'hidden' : ''} ${isAyahMarker ? 'ayah-marker' : ''}`}
                      data-verse={w.verseKey}
                    >
                      {w.code}
                      {i < line.words.length - 1 ? ' ' : ''}
                    </span>
                  );
                })}
              </div>
            ))
          ) : (
            <div style={{ color: '#888', textAlign: 'center', paddingTop: '40%' }}>Chargement…</div>
          )}
        </div>
      )}

      <div className="panel">
        <h3>Masquer / Afficher les versets (comme Tarteel)</h3>
        <div>
          {verses.map((v) => (
            <button
              key={v}
              className={`verse-btn ${hidden.has(v) ? 'hidden' : ''}`}
              onClick={() => toggleVerse(v)}
            >
              {v} {hidden.has(v) ? '(caché)' : ''}
            </button>
          ))}
          <button
            className="verse-btn"
            onClick={() => setHidden(new Set(verses))}
          >
            Tout cacher
          </button>
          <button
            className="verse-btn"
            onClick={() => setHidden(new Set())}
          >
            Tout afficher
          </button>
        </div>
      </div>
    </div>
  );
}
