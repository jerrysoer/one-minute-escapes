import { lazy } from 'react';

export interface EscapeConfig {
  id: string;
  title: string;
  subtitle: string;
  palette: {
    accent: string;
    particles: string[];
  };
  component: React.LazyExoticComponent<any> | React.ComponentType<any>;
}

export const escapes: EscapeConfig[] = [
  {
    id: 'murmuration',
    title: 'Murmuration',
    subtitle: 'move your cursor · watch them follow',
    palette: {
      accent: 'hsla(38, 30%, 85%, 0.9)',
      particles: ['hsla(38, 30%, 95%, 0.8)', 'hsla(38, 30%, 85%, 0.6)', 'hsla(38, 25%, 75%, 0.5)'],
    },
    component: lazy(() => import('../escapes/Murmuration')),
  },
  {
    id: 'rain',
    title: 'Rain',
    subtitle: 'watch the glass · feel the warmth',
    palette: {
      accent: 'hsla(210, 20%, 70%, 0.8)',
      particles: ['hsla(210, 15%, 80%, 0.6)', 'hsla(210, 10%, 90%, 0.4)'],
    },
    component: lazy(() => import('../escapes/Rain')),
  },
  {
    id: 'letters',
    title: 'Letters',
    subtitle: 'click to scatter · words will find themselves',
    palette: {
      accent: 'hsla(38, 40%, 80%, 0.9)',
      particles: ['hsla(38, 25%, 90%, 0.7)', 'hsla(38, 30%, 80%, 0.5)'],
    },
    component: lazy(() => import('../escapes/Letters')),
  },
  {
    id: 'gravity',
    title: 'Gravity',
    subtitle: 'click to create · watch them orbit',
    palette: {
      accent: 'hsla(260, 50%, 70%, 0.8)',
      particles: ['hsla(340, 60%, 65%, 0.8)', 'hsla(200, 60%, 65%, 0.8)', 'hsla(40, 60%, 65%, 0.8)'],
    },
    component: lazy(() => import('../escapes/Gravity')),
  },
  {
    id: 'erosion',
    title: 'Erosion',
    subtitle: 'guide the wind · carve the stone',
    palette: {
      accent: 'hsla(28, 50%, 65%, 0.9)',
      particles: ['hsla(28, 45%, 60%, 0.7)', 'hsla(15, 40%, 50%, 0.6)'],
    },
    component: lazy(() => import('../escapes/Erosion')),
  },
  {
    id: 'migration',
    title: 'Migration',
    subtitle: 'winter fades · spring arrives',
    palette: {
      accent: 'hsla(160, 30%, 60%, 0.8)',
      particles: ['hsla(38, 40%, 70%, 0.7)', 'hsla(120, 30%, 55%, 0.6)'],
    },
    component: lazy(() => import('../escapes/Migration')),
  },
  {
    id: 'unfold',
    title: 'Unfold',
    subtitle: 'move to orbit · watch it breathe',
    palette: {
      accent: 'hsla(38, 25%, 85%, 0.8)',
      particles: ['hsla(38, 20%, 90%, 0.6)'],
    },
    component: lazy(() => import('../escapes/Unfold')),
  },
];
