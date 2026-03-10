import { useRef, useCallback } from 'react';

const CYCLE_DURATION = 60; // seconds
const INTRO_END = 2.5;
const ENDING_START = 50;
const RESET_DURATION = 1.5;

/**
 * 60-second cycle state machine.
 * State lives in refs to avoid re-renders — escapes read imperatively via tick().
 */
export function useTimer() {
  const elapsedRef = useRef(0);
  const cycleRef = useRef(0);
  const phaseRef = useRef('intro');
  const resetTimerRef = useRef(0);
  const firstCycleRef = useRef(true);

  const tick = useCallback((dt) => {
    const phase = phaseRef.current;

    if (phase === 'resetting') {
      resetTimerRef.current += dt;
      if (resetTimerRef.current >= RESET_DURATION) {
        resetTimerRef.current = 0;
        elapsedRef.current = 0;
        cycleRef.current += 1;
        firstCycleRef.current = false;
        phaseRef.current = 'running'; // no intro after first cycle
      }
      return {
        progress: 0,
        elapsed: 0,
        cycle: cycleRef.current,
        phase: 'resetting',
        resetProgress: resetTimerRef.current / RESET_DURATION,
      };
    }

    elapsedRef.current += dt;
    const elapsed = elapsedRef.current;

    if (elapsed >= CYCLE_DURATION) {
      phaseRef.current = 'resetting';
      resetTimerRef.current = 0;
      return {
        progress: 1,
        elapsed: CYCLE_DURATION,
        cycle: cycleRef.current,
        phase: 'resetting',
        resetProgress: 0,
      };
    }

    let newPhase;
    if (firstCycleRef.current && elapsed < INTRO_END) {
      newPhase = 'intro';
    } else if (elapsed >= ENDING_START) {
      newPhase = 'ending';
    } else {
      newPhase = 'running';
    }
    phaseRef.current = newPhase;

    return {
      progress: elapsed / CYCLE_DURATION,
      elapsed,
      cycle: cycleRef.current,
      phase: newPhase,
      resetProgress: 0,
    };
  }, []);

  const restart = useCallback(() => {
    elapsedRef.current = 0;
    cycleRef.current = 0;
    phaseRef.current = 'intro';
    resetTimerRef.current = 0;
    firstCycleRef.current = true;
  }, []);

  const getState = useCallback(() => ({
    progress: elapsedRef.current / CYCLE_DURATION,
    elapsed: elapsedRef.current,
    cycle: cycleRef.current,
    phase: phaseRef.current,
    resetProgress: resetTimerRef.current / RESET_DURATION,
  }), []);

  return { tick, restart, getState };
}
