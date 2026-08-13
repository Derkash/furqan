'use client';

// Outil de calibration DÉVELOPPEUR : jamais accessible dans l'app publiée
// (App Store 2.1 — pas de contenu de développement dans une app soumise).

import { useRouter } from 'next/navigation';
import { isNativeApp } from '@/utils/audioStore';
import { useEffect, useState } from 'react';
import MushafPage, { DEFAULT_FRAME, type FrameConfig } from '@/components/MushafPage';

const PAGE_PRESETS = [
  { right: 1, left: 2, label: 'Fatiha+Baqarah début' },
  { right: 77, left: 78, label: 'An-Nisa début (77-78)' },
  { right: 91, left: 92, label: 'An-Nisa (91-92)' },
  { right: 105, left: 106, label: 'Nisa→Maida transition' },
  { right: 603, left: 604, label: 'Fin Coran (603-604)' },
];

type Step =
  | { type: 'frame'; key: 'outerInsetH' | 'outerInsetV' | 'bandWidth'; step: number; min: number; max: number; unit: string }
  | { type: 'text'; key: 'textInsetH' | 'textInsetTop' | 'textInsetBottom' | 'textFontSize'; step: number; min: number; max: number; unit: string }
  | { type: 'pageNumber'; key: 'pageNumberSize' | 'pageNumberBottom'; step: number; min: number; max: number; unit: string };

interface NudgeProps {
  label: string;
  value: number;
  step: number;
  min: number;
  max: number;
  unit: string;
  arrows: 'h' | 'v' | 'pm' | 'gap';
  onChange: (v: number) => void;
}

function Nudge({ label, value, step, min, max, unit, arrows, onChange }: NudgeProps) {
  const dec = () => onChange(Math.max(min, +(value - step).toFixed(2)));
  const inc = () => onChange(Math.min(max, +(value + step).toFixed(2)));
  const [leftLabel, rightLabel] =
    arrows === 'h' ? ['←', '→'] :
    arrows === 'v' ? ['↑', '↓'] :
    arrows === 'gap' ? ['→←', '←→'] :
    ['−', '+'];
  return (
    <div className="nudge-row">
      <span className="nudge-label">{label}</span>
      <button className="nudge-btn" onClick={dec}>{leftLabel}</button>
      <span className="nudge-value">{value}{unit}</span>
      <button className="nudge-btn" onClick={inc}>{rightLabel}</button>
    </div>
  );
}

export default function PrototypeDoublePage() {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const protoRouter = useRouter();
  useEffect(() => {
    if (isNativeApp()) protoRouter.replace('/exercises');
  }, [protoRouter]);

  const [preset, setPreset] = useState(PAGE_PRESETS[1]);
  const [gap, setGap] = useState(16);
  const [pageWidth, setPageWidth] = useState(42);
  const [config, setConfig] = useState<FrameConfig>(DEFAULT_FRAME);
  const [blurred, setBlurred] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const set = <K extends keyof FrameConfig>(key: K, value: FrameConfig[K]) =>
    setConfig((c) => ({ ...c, [key]: value }));

  const reset = () => {
    setConfig(DEFAULT_FRAME);
    setGap(16);
    setPageWidth(42);
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#fdfaf3',
        position: 'relative',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <style>{`
        .ctrl {
          position: fixed;
          top: 12px;
          left: 12px;
          background: rgba(20, 20, 20, 0.92);
          color: #eee;
          padding: 10px 12px;
          border-radius: 10px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.4);
          z-index: 100;
          font-size: 12px;
          backdrop-filter: blur(8px);
          max-width: 320px;
        }
        .ctrl-section { margin-bottom: 8px; }
        .ctrl-section-title { color: #888; font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 4px; font-weight: 600; }
        .ctrl-row { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 4px; }
        .ctrl-pill {
          background: #3a3a3a;
          color: #eee;
          border: 1px solid #444;
          padding: 4px 10px;
          border-radius: 14px;
          cursor: pointer;
          font-size: 11px;
        }
        .ctrl-pill:hover { background: #4a4a4a; }
        .ctrl-pill.active { background: #2d5016; border-color: #4a7c23; color: #fff; }
        .nudge-row {
          display: grid;
          grid-template-columns: 100px 28px 1fr 28px;
          align-items: center;
          gap: 4px;
          margin-bottom: 3px;
        }
        .nudge-label { color: #aaa; font-size: 11px; }
        .nudge-btn {
          background: #2d5016;
          color: #c9a959;
          border: none;
          width: 26px;
          height: 22px;
          border-radius: 5px;
          cursor: pointer;
          font-weight: 700;
          font-size: 13px;
          font-family: monospace;
          line-height: 1;
        }
        .nudge-btn:hover { background: #4a7c23; color: #fff; }
        .nudge-btn:active { transform: scale(0.94); }
        .nudge-value {
          text-align: center;
          color: #c9a959;
          font-variant-numeric: tabular-nums;
          font-weight: 600;
          font-size: 11px;
        }
        .toggle-collapse {
          position: absolute;
          top: 8px;
          right: 8px;
          background: transparent;
          color: #888;
          border: 1px solid #555;
          width: 22px;
          height: 22px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 11px;
          line-height: 1;
        }
        .header-strip {
          height: 56px;
          background: #2d5016;
          color: #fdfaf3;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          gap: 12px;
        }
        .header-strip .accent { color: #c9a959; }
      `}</style>

      <div className="ctrl">
        <button
          className="toggle-collapse"
          onClick={() => setCollapsed((v) => !v)}
          aria-label="Toggle panel"
        >
          {collapsed ? '▸' : '▾'}
        </button>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>
          🎛️ Calibration
        </div>

        {!collapsed && (
          <>
            <div className="ctrl-section">
              <div className="ctrl-section-title">Pages</div>
              <div className="ctrl-row">
                {PAGE_PRESETS.map((p) => (
                  <button
                    key={`${p.right}-${p.left}`}
                    className={`ctrl-pill ${preset.right === p.right ? 'active' : ''}`}
                    onClick={() => setPreset(p)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="ctrl-row">
                <button
                  className={`ctrl-pill ${blurred ? 'active' : ''}`}
                  onClick={() => setBlurred((v) => !v)}
                >
                  {blurred ? '☁️ Flou ON' : '👁 Flou OFF'}
                </button>
                <button className="ctrl-pill" onClick={reset}>
                  ⟲ Reset
                </button>
              </div>
            </div>

            <div className="ctrl-section">
              <div className="ctrl-section-title">Layout</div>
              <Nudge label="Largeur page" value={pageWidth} step={0.5} min={28} max={50} unit="vw" arrows="pm" onChange={setPageWidth} />
              <Nudge label="Espacement" value={gap} step={2} min={0} max={120} unit="px" arrows="gap" onChange={setGap} />
              <Nudge label="Gap haut" value={config.topGap} step={2} min={0} max={200} unit="px" arrows="v" onChange={(v) => set('topGap', v)} />
            </div>

            <div className="ctrl-section">
              <div className="ctrl-section-title">Cadre</div>
              <Nudge label="Inset horizontal" value={config.outerInsetH} step={0.2} min={0} max={12} unit="%" arrows="h" onChange={(v) => set('outerInsetH', v)} />
              <Nudge label="Inset vertical" value={config.outerInsetV} step={0.2} min={0} max={12} unit="%" arrows="v" onChange={(v) => set('outerInsetV', v)} />
              <Nudge label="Épaisseur bande" value={config.bandWidth} step={0.2} min={1} max={8} unit="%" arrows="pm" onChange={(v) => set('bandWidth', v)} />
              <div className="ctrl-row">
                <button
                  className={`ctrl-pill ${config.showPattern ? 'active' : ''}`}
                  onClick={() => set('showPattern', !config.showPattern)}
                >
                  {config.showPattern ? '◆ Motif losanges' : '▭ Cadre uni'}
                </button>
              </div>
            </div>

            <div className="ctrl-section">
              <div className="ctrl-section-title">Texte</div>
              <Nudge label="Padding H" value={config.textInsetH} step={0.2} min={5} max={20} unit="%" arrows="h" onChange={(v) => set('textInsetH', v)} />
              <Nudge label="Padding haut" value={config.textInsetTop} step={0.2} min={3} max={15} unit="%" arrows="v" onChange={(v) => set('textInsetTop', v)} />
              <Nudge label="Padding bas" value={config.textInsetBottom} step={0.2} min={3} max={15} unit="%" arrows="v" onChange={(v) => set('textInsetBottom', v)} />
              <Nudge label="Taille texte" value={config.textFontSize} step={0.1} min={4} max={9} unit="cqi" arrows="pm" onChange={(v) => set('textFontSize', v)} />
            </div>

            <div className="ctrl-section">
              <div className="ctrl-section-title">Numéro de page</div>
              <Nudge label="Taille" value={config.pageNumberSize} step={0.1} min={1.5} max={5} unit="cqi" arrows="pm" onChange={(v) => set('pageNumberSize', v)} />
              <Nudge label="Position bas" value={config.pageNumberBottom} step={0.1} min={0} max={3} unit="%" arrows="v" onChange={(v) => set('pageNumberBottom', v)} />
            </div>

            <details style={{ marginTop: 6 }}>
              <summary style={{ cursor: 'pointer', color: '#c9a959', fontSize: 11 }}>
                📋 Export config
              </summary>
              <pre style={{
                background: '#0c0c0c',
                padding: 8,
                borderRadius: 6,
                fontSize: 10,
                marginTop: 4,
                color: '#c9a959',
                maxHeight: 180,
                overflow: 'auto',
              }}>
{JSON.stringify({ ...config, _gap: gap, _pageWidth: pageWidth }, null, 2)}
              </pre>
            </details>
          </>
        )}
      </div>

      {/* Bandeau d'en-tête semblable à l'app */}
      <div className="header-strip">
        <span>Calibration double page</span>
        <span className="accent">·</span>
        <span>{preset.label}</span>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          direction: 'ltr',
          justifyContent: 'center',
          alignItems: 'center',
          gap: `${gap}px`,
          width: '100%',
          marginTop: 12,
        }}
      >
        {/* GAUCHE de l'écran = page PAIRE */}
        <div style={{ width: `${pageWidth}vw`, aspectRatio: '759 / 1100' }}>
          <MushafPage pageNumber={preset.left} frameConfig={config} isBlurred={blurred} />
        </div>

        {/* DROITE de l'écran = page IMPAIRE */}
        <div style={{ width: `${pageWidth}vw`, aspectRatio: '759 / 1100' }}>
          <MushafPage pageNumber={preset.right} frameConfig={config} isBlurred={blurred} />
        </div>
      </div>
    </div>
  );
}
