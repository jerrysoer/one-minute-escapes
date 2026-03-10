import { useState, useRef, useCallback, useEffect, Suspense } from 'react';
import { escapes } from './data/escapes.ts';
import { useVisibility } from './hooks/useVisibility';
import TimerArc from './components/TimerArc';
import Placeholder from './escapes/Placeholder';

function EscapeSection({ config, index, activeIndex, onBecomeVisible, onTimerUpdate, scrollContainerRef }) {
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
    >
      <Suspense
        fallback={
          <Placeholder isVisible={isVisible} title={config.title} subtitle={config.subtitle} />
        }
      >
        <Component
          isVisible={isVisible}
          title={config.title}
          subtitle={config.subtitle}
          palette={config.palette}
          onTimerUpdate={onTimerUpdate}
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
  const scrollRef = useRef(null);
  const timerRef = useRef({ progress: 0, elapsed: 0 });

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

  const handleBecomeVisible = useCallback((index) => {
    setActiveIndex(index);
    setViewedEscapes((prev) => {
      const next = new Set(prev);
      next.add(index);
      return next;
    });
  }, []);

  const handleScroll = useCallback(() => {
    if (!hasScrolled) setHasScrolled(true);
  }, [hasScrolled]);

  // Deep link: parse #escape-id on mount
  useEffect(() => {
    const hash = window.location.hash.replace('#', '');
    if (hash) {
      const idx = escapes.findIndex((e) => e.id === hash);
      if (idx > 0) {
        const el = document.getElementById(`escape-${hash}`);
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

  return (
    <div className="scroll-container" ref={scrollRef} onScroll={handleScroll}>
      {escapes.map((config, i) => (
        <EscapeSection
          key={config.id}
          config={config}
          index={i}
          activeIndex={activeIndex}
          onBecomeVisible={handleBecomeVisible}
          onTimerUpdate={handleTimerUpdate}
          scrollContainerRef={scrollRef}
        />
      ))}

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
            aria-label={`Go to ${e.title}`}
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

      {/* Scroll hint — first escape only, disappears after first scroll */}
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
            gap: 8,
            zIndex: 100,
            opacity: 0.5,
            animation: 'pulse 2s ease-in-out infinite',
          }}
        >
          <span
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontStyle: 'italic',
              fontWeight: 300,
              fontSize: 11,
              letterSpacing: '0.08em',
              color: 'hsla(38, 20%, 65%, 0.5)',
            }}
          >
            scroll to explore
          </span>
          <svg width="12" height="8" viewBox="0 0 12 8" style={{ opacity: 0.4 }}>
            <path d="M1 1L6 6L11 1" stroke="hsla(38, 20%, 65%, 0.5)" strokeWidth="1.5" fill="none" />
          </svg>
        </div>
      )}

      {/* Timer arc */}
      <TimerArc progress={timerDisplay.progress} elapsed={timerDisplay.elapsed} />

      {/* Share button — appears after 2+ escapes viewed */}
      {viewedEscapes.size >= 2 && (
        <ShareButton activeEscape={escapes[activeIndex]} />
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.5; transform: translateX(-50%) translateY(0); }
          50% { opacity: 0.3; transform: translateX(-50%) translateY(4px); }
        }
      `}</style>
    </div>
  );
}

function ShareButton({ activeEscape }) {
  const [copied, setCopied] = useState(false);

  const handleShare = () => {
    const text = `I've been scrolling through One Minute Escapes. "${activeEscape.title}" has me stuck.\n→ https://jerrysoer.github.io/one-minute-escapes/#${activeEscape.id}`;
    navigator.clipboard.writeText(text).then(() => {
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
