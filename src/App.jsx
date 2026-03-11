import { useState, useRef, useCallback, useEffect, Suspense } from 'react';
import { escapes } from './data/escapes.ts';
import { useVisibility } from './hooks/useVisibility';
import TimerArc from './components/TimerArc';
import Placeholder from './escapes/Placeholder';

function EscapeSection({ config, index, activeIndex, onBecomeVisible, onTimerUpdate, onCycleChange, scrollContainerRef }) {
  const [sectionRef, isVisible] = useVisibility(0.5);

  useEffect(() => {
    if (isVisible) {
      onBecomeVisible(index);
    }
  }, [isVisible, index, onBecomeVisible]);

  const Component = config.component;

  return (
    <section
      ref={sectionRef}
      className="escape-section"
      id={`escape-${config.id}`}
      data-escape={config.id}
      style={{ background: config.voidTint }}
    >
      <Suspense
        fallback={
          <Placeholder isVisible={isVisible} title={config.title} />
        }
      >
        <Component
          isVisible={isVisible}
          title={config.title}
          palette={config.palette}
          onTimerUpdate={onTimerUpdate}
          onCycleChange={onCycleChange}
        />
      </Suspense>
    </section>
  );
}

export default function App() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [viewedEscapes, setViewedEscapes] = useState(new Set([0]));
  const [hasScrolled, setHasScrolled] = useState(false);
  const [timerDisplay, setTimerDisplay] = useState({ progress: 0, elapsed: 0 });
  const [cycleCounts, setCycleCounts] = useState({});
  const [showDelayedTitle, setShowDelayedTitle] = useState(false);
  const titleShownForRef = useRef(new Set());
  const scrollRef = useRef(null);
  const timerRef = useRef({ progress: 0, elapsed: 0 });
  const titleTimeoutRef = useRef(null);

  // Low-frequency timer UI update (4Hz)
  useEffect(() => {
    const id = setInterval(() => {
      const { progress, elapsed } = timerRef.current;
      setTimerDisplay({ progress, elapsed });
    }, 250);
    return () => clearInterval(id);
  }, []);

  const handleTimerUpdate = useCallback((progress, elapsed) => {
    timerRef.current = { progress, elapsed };
  }, []);

  const handleCycleChange = useCallback((cycle, escapeIndex) => {
    // First cycle just completed — show delayed title
    if (cycle === 1) {
      const escapeId = escapes[escapeIndex]?.id;
      if (escapeId && !titleShownForRef.current.has(escapeId)) {
        titleShownForRef.current.add(escapeId);
        setShowDelayedTitle(true);
        if (titleTimeoutRef.current) clearTimeout(titleTimeoutRef.current);
        titleTimeoutRef.current = setTimeout(() => {
          setShowDelayedTitle(false);
        }, 3000);
      }
    }
    setCycleCounts(prev => ({
      ...prev,
      [escapeIndex]: cycle,
    }));
  }, []);

  const handleBecomeVisible = useCallback((index) => {
    setActiveIndex(index);
    setShowDelayedTitle(false);
    if (titleTimeoutRef.current) clearTimeout(titleTimeoutRef.current);
    // Reset title tracking when revisiting an escape
    titleShownForRef.current.delete(escapes[index]?.id);
    setViewedEscapes((prev) => {
      const next = new Set(prev);
      next.add(index);
      return next;
    });
  }, []);

  const handleScroll = useCallback(() => {
    if (!hasScrolled) setHasScrolled(true);
  }, [hasScrolled]);

  // Deep link: parse ?escape=id or #id on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const escapeId = params.get('escape') || window.location.hash.replace('#', '');
    if (escapeId) {
      const idx = escapes.findIndex((e) => e.id === escapeId);
      if (idx > 0) {
        const el = document.getElementById(`escape-${escapeId}`);
        if (el) {
          setTimeout(() => el.scrollIntoView({ behavior: 'instant' }), 100);
        }
      }
    }
  }, []);

  const scrollToEscape = useCallback((index) => {
    const escape = escapes[index];
    const el = document.getElementById(`escape-${escape.id}`);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const activeConfig = escapes[activeIndex];
  const currentCycle = cycleCounts[activeIndex] || 0;

  return (
    <div
      className="scroll-container"
      ref={scrollRef}
      onScroll={handleScroll}
      style={{ cursor: activeConfig?.cursor || 'default' }}
    >
      {escapes.map((config, i) => (
        <EscapeSection
          key={config.id}
          config={config}
          index={i}
          activeIndex={activeIndex}
          onBecomeVisible={handleBecomeVisible}
          onTimerUpdate={handleTimerUpdate}
          onCycleChange={(cycle) => handleCycleChange(cycle, i)}
          scrollContainerRef={scrollRef}
        />
      ))}

      {/* Attribution section */}
      <section
        className="escape-section"
        style={{
          background: '#07070E',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 24,
        }}
      >
        <span
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontStyle: 'italic',
            fontWeight: 300,
            fontSize: 'clamp(20px, 3vw, 32px)',
            letterSpacing: '0.08em',
            color: 'hsla(38, 15%, 55%, 0.3)',
          }}
        >
          One Minute Escapes
        </span>
        <span
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontStyle: 'italic',
            fontWeight: 300,
            fontSize: 14,
            letterSpacing: '0.06em',
            color: 'hsla(38, 15%, 55%, 0.2)',
          }}
        >
          by jerrysoer &times; Claude
        </span>
        <a
          href="https://github.com/jerrysoer/one-minute-escapes"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontStyle: 'italic',
            fontWeight: 300,
            fontSize: 13,
            color: 'hsla(38, 15%, 55%, 0.15)',
            textDecoration: 'none',
            marginTop: 20,
          }}
        >
          &darr;
        </a>
      </section>

      {/* Delayed title overlay — appears after first cycle completes */}
      {showDelayedTitle && activeConfig && (
        <div
          key={`title-${activeConfig.id}-${currentCycle}`}
          style={{
            position: 'fixed',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            zIndex: 200,
            animation: 'titleReveal 3s ease forwards',
          }}
        >
          <span
            style={{
              fontFamily: `'${activeConfig.font.family}', ${activeConfig.font.fallback}`,
              fontWeight: activeConfig.font.weight,
              fontStyle: activeConfig.font.style,
              fontSize: 'clamp(28px, 5vw, 44px)',
              letterSpacing: '0.08em',
              color: activeConfig.palette.accent,
              textShadow: '0 0 60px rgba(0,0,0,0.9)',
            }}
          >
            {activeConfig.title}
          </span>
        </div>
      )}

      {/* Position dots */}
      <div
        style={{
          position: 'fixed',
          right: 20,
          top: '50%',
          transform: 'translateY(-50%)',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          zIndex: 100,
          opacity: 0.3,
        }}
      >
        {escapes.map((e, i) => (
          <button
            key={e.id}
            onClick={() => scrollToEscape(i)}
            aria-label={`Go to escape ${i + 1}`}
            style={{
              width: i === activeIndex ? 8 : 6,
              height: i === activeIndex ? 8 : 6,
              borderRadius: '50%',
              background: i === activeIndex ? 'hsla(38, 30%, 85%, 0.9)' : 'hsla(38, 20%, 65%, 0.4)',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              transform: i === activeIndex ? 'scale(1.3)' : 'scale(1)',
              transition: 'all 0.3s ease',
            }}
          />
        ))}
      </div>

      {/* Cryptic scroll hint — minimal animated gesture, no text */}
      {!hasScrolled && (
        <div
          style={{
            position: 'fixed',
            bottom: 36,
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            zIndex: 100,
            opacity: 0.35,
            animation: 'scrollGesture 2.5s ease-in-out infinite',
          }}
        >
          <svg width="20" height="32" viewBox="0 0 20 32" fill="none">
            <rect x="1" y="1" width="18" height="30" rx="9" stroke="hsla(38, 20%, 65%, 0.5)" strokeWidth="1.2" fill="none" />
            <circle cx="10" cy="10" r="2" fill="hsla(38, 20%, 65%, 0.4)">
              <animate attributeName="cy" values="10;20;10" dur="2.5s" repeatCount="indefinite" />
            </circle>
          </svg>
        </div>
      )}

      {/* Timer arc with per-escape color */}
      <TimerArc
        progress={timerDisplay.progress}
        elapsed={timerDisplay.elapsed}
        color={activeConfig?.timerColor}
      />

      {/* Cycle counter */}
      {currentCycle >= 2 && (
        <div
          style={{
            position: 'fixed',
            bottom: 28,
            right: 116,
            zIndex: 100,
            fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
            fontSize: 10,
            color: 'hsla(38, 15%, 55%, 0.25)',
            letterSpacing: '0.02em',
            pointerEvents: 'none',
          }}
        >
          &times;{currentCycle + 1}
        </div>
      )}

      {/* Share button */}
      {viewedEscapes.size >= 2 && (
        <ShareButton activeEscape={activeConfig} />
      )}

      <style>{`
        @keyframes scrollGesture {
          0%, 100% { opacity: 0.35; transform: translateX(-50%) translateY(0); }
          50% { opacity: 0.2; transform: translateX(-50%) translateY(6px); }
        }
        @keyframes titleReveal {
          0% { opacity: 0; }
          15% { opacity: 1; }
          75% { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}

function ShareButton({ activeEscape }) {
  const [copied, setCopied] = useState(false);

  const handleShare = () => {
    const url = `https://jerrysoer.github.io/one-minute-escapes/?escape=${activeEscape.id}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <button
      onClick={handleShare}
      style={{
        position: 'fixed',
        bottom: 28,
        left: 28,
        zIndex: 100,
        background: 'none',
        border: '1px solid hsla(38, 20%, 65%, 0.2)',
        borderRadius: 20,
        padding: '6px 14px',
        color: 'hsla(38, 20%, 65%, 0.4)',
        fontFamily: "'Cormorant Garamond', serif",
        fontStyle: 'italic',
        fontWeight: 300,
        fontSize: 12,
        letterSpacing: '0.06em',
        cursor: 'pointer',
        transition: 'all 0.3s ease',
      }}
      onMouseEnter={(e) => (e.target.style.color = 'hsla(38, 30%, 85%, 0.7)')}
      onMouseLeave={(e) => (e.target.style.color = 'hsla(38, 20%, 65%, 0.4)')}
    >
      {copied ? 'copied' : 'share'}
    </button>
  );
}
