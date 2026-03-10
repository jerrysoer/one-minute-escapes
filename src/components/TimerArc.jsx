import { useRef, useEffect, useState } from 'react';

const SIZE = 80;
const STROKE = 2;
const RADIUS = (SIZE - STROKE * 2) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function TimerArc({ progress, elapsed }) {
  const offset = CIRCUMFERENCE * (1 - progress);

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 28,
        right: 28,
        width: SIZE,
        height: SIZE,
        zIndex: 100,
        opacity: 0.4,
        pointerEvents: 'none',
      }}
    >
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        {/* Track */}
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="hsla(38, 15%, 50%, 0.12)"
          strokeWidth={STROKE}
        />
        {/* Progress */}
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="hsla(38, 30%, 75%, 0.5)"
          strokeWidth={STROKE}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          style={{ transition: 'stroke-dashoffset 0.1s linear' }}
        />
      </svg>
      {/* Timer number */}
      <span
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
          fontSize: 11,
          color: 'hsla(38, 15%, 55%, 0.3)',
          letterSpacing: '0.02em',
        }}
      >
        {Math.floor(elapsed)}
      </span>
    </div>
  );
}
