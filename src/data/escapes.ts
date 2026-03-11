import { lazy } from 'react';

export interface EscapeFont {
  family: string;
  weight: number;
  style: string;
  fallback: string;
}

export interface EscapeConfig {
  id: string;
  title: string;
  palette: {
    accent: string;
    particles: string[];
  };
  font: EscapeFont;
  voidTint: string;
  timerColor: string;
  cursor: string;
  component: React.LazyExoticComponent<any> | React.ComponentType<any>;
}

export const escapes: EscapeConfig[] = [
  {
    id: 'murmuration',
    title: 'Murmuration',
    palette: {
      accent: 'hsla(38, 30%, 85%, 0.9)',
      particles: ['hsla(38, 30%, 95%, 0.8)', 'hsla(38, 30%, 85%, 0.6)', 'hsla(38, 25%, 75%, 0.5)'],
    },
    font: {
      family: 'Cormorant Garamond',
      weight: 300,
      style: 'italic',
      fallback: 'serif',
    },
    voidTint: '#0A0907',
    timerColor: 'hsla(38, 30%, 75%, 0.5)',
    cursor: 'crosshair',
    component: lazy(() => import('../escapes/Murmuration')),
  },
  {
    id: 'rain',
    title: 'Rain',
    palette: {
      accent: 'hsla(210, 20%, 70%, 0.8)',
      particles: ['hsla(210, 15%, 80%, 0.6)', 'hsla(210, 10%, 90%, 0.4)'],
    },
    font: {
      family: 'Newsreader',
      weight: 300,
      style: 'italic',
      fallback: 'serif',
    },
    voidTint: '#070A0E',
    timerColor: 'hsla(210, 20%, 75%, 0.5)',
    cursor: 'default',
    component: lazy(() => import('../escapes/Rain')),
  },
  {
    id: 'letters',
    title: 'Letters',
    palette: {
      accent: 'hsla(38, 40%, 80%, 0.9)',
      particles: ['hsla(38, 25%, 90%, 0.7)', 'hsla(38, 30%, 80%, 0.5)'],
    },
    font: {
      family: 'Space Mono',
      weight: 400,
      style: 'normal',
      fallback: 'monospace',
    },
    voidTint: '#0A0A0A',
    timerColor: 'hsla(38, 40%, 75%, 0.5)',
    cursor: 'text',
    component: lazy(() => import('../escapes/Letters')),
  },
  {
    id: 'gravity',
    title: 'Gravity',
    palette: {
      accent: 'hsla(260, 50%, 70%, 0.8)',
      particles: ['hsla(340, 60%, 65%, 0.8)', 'hsla(200, 60%, 65%, 0.8)', 'hsla(40, 60%, 65%, 0.8)'],
    },
    font: {
      family: 'Syne',
      weight: 400,
      style: 'normal',
      fallback: 'sans-serif',
    },
    voidTint: '#07070E',
    timerColor: 'hsla(200, 50%, 65%, 0.5)',
    cursor: 'grab',
    component: lazy(() => import('../escapes/Gravity')),
  },
  {
    id: 'erosion',
    title: 'Erosion',
    palette: {
      accent: 'hsla(28, 50%, 65%, 0.9)',
      particles: ['hsla(28, 45%, 60%, 0.7)', 'hsla(15, 40%, 50%, 0.6)'],
    },
    font: {
      family: 'Cinzel',
      weight: 400,
      style: 'normal',
      fallback: 'serif',
    },
    voidTint: '#0E0A07',
    timerColor: 'hsla(28, 50%, 65%, 0.5)',
    cursor: 'default',
    component: lazy(() => import('../escapes/Erosion')),
  },
  {
    id: 'migration',
    title: 'Migration',
    palette: {
      accent: 'hsla(160, 30%, 60%, 0.8)',
      particles: ['hsla(38, 40%, 70%, 0.7)', 'hsla(120, 30%, 55%, 0.6)'],
    },
    font: {
      family: 'Fraunces',
      weight: 300,
      style: 'italic',
      fallback: 'serif',
    },
    voidTint: '#070E0A',
    timerColor: 'hsla(160, 30%, 60%, 0.5)',
    cursor: 'default',
    component: lazy(() => import('../escapes/Migration')),
  },
  {
    id: 'unfold',
    title: 'Unfold',
    palette: {
      accent: 'hsla(38, 25%, 85%, 0.8)',
      particles: ['hsla(38, 20%, 90%, 0.6)'],
    },
    font: {
      family: 'DM Serif Display',
      weight: 400,
      style: 'normal',
      fallback: 'serif',
    },
    voidTint: '#0E0D07',
    timerColor: 'hsla(38, 25%, 80%, 0.5)',
    cursor: 'move',
    component: lazy(() => import('../escapes/Unfold')),
  },
];
