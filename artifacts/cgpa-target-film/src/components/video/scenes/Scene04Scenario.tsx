import { motion } from 'framer-motion';
import { useState } from 'react';
import { useSceneTimer } from '@/lib/video';

const EASE = [0.2, 0.75, 0.25, 1] as const;

export function Scene04Scenario() {
  const [forecast, setForecast] = useState(0);
  useSceneTimer([
    { time: 2150, callback: () => setForecast(1) },
    { time: 2570, callback: () => setForecast(2) },
  ]);

  return (
    <motion.section
      className="film-scene scene-scenario"
      initial={{ opacity: 0, scale: 1.04 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.1 }}
      transition={{ duration: 0.42, ease: EASE }}
    >
      <div className="scenario-orbit orbit-one" />
      <div className="scenario-orbit orbit-two" />
      <div className="scenario-label"><span className="micro-label">WHAT-IF SIMULATION</span><b>NOT PART OF YOUR RECORD</b></div>
      <motion.h2 initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.12, duration: 0.4, ease: EASE }}>
        What if next<br /><em>term goes well?</em>
      </motion.h2>
      <div className="scenario-ledger">
        <div className="scenario-ledger-heading"><span>UPCOMING COURSES</span><span>PROJECTED GRADE</span></div>
        <motion.div className="scenario-course" initial={{ opacity: 0, x: -26 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.52, duration: 0.35 }}>
          <span><i>01</i>Cell Biology</span><strong className="grade-chip grade-chip-a">A</strong>
        </motion.div>
        <motion.div className="scenario-course" initial={{ opacity: 0, x: -26 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.78, duration: 0.35 }}>
          <span><i>02</i>Data Analysis</span><strong className="grade-chip grade-chip-b">B+</strong>
        </motion.div>
        <div className="scenario-boundary"><span>SCENARIO ONLY</span><i /></div>
      </div>
      <motion.div className="grade-token token-a" layoutId="studyline-grade" initial={{ opacity: 0, y: -70, rotate: -16, scale: 0.7 }} animate={{ opacity: 1, y: 0, rotate: -7, scale: 1 }} transition={{ delay: 0.44, duration: 0.46, type: 'spring', stiffness: 240, damping: 17 }}>A</motion.div>
      <motion.div className="grade-token token-b" initial={{ opacity: 0, y: -66, rotate: 18, scale: 0.7 }} animate={{ opacity: 1, y: 0, rotate: 9, scale: 1 }} transition={{ delay: 0.72, duration: 0.48, type: 'spring', stiffness: 250, damping: 18 }}>B+</motion.div>
      <div className="forecast-panel">
        <span className="forecast-kicker">PREDICTED CGPA</span>
        <motion.strong key={forecast} layoutId="studyline-number" initial={{ opacity: 0, scale: 0.72 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.25, type: 'spring', stiffness: 260, damping: 19 }}>
          {forecast === 0 ? '3.63' : forecast === 1 ? '3.68' : '3.71'}
        </motion.strong>
        <svg viewBox="0 0 260 85" aria-hidden="true">
          <path d="M0 70 C43 64 48 48 90 54 S142 48 173 31 S222 37 260 10" className="forecast-grid" />
          <motion.path d="M0 70 C43 64 48 48 90 54 S142 48 173 31 S222 37 260 10" className="forecast-line" initial={{ pathLength: 0 }} animate={{ pathLength: forecast ? 1 : 0.2 }} transition={{ duration: 0.7, ease: EASE }} />
        </svg>
      </div>
      <motion.p className="scenario-footnote" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 3.32, duration: 0.32 }}>Completed record stays unchanged.</motion.p>
      <div className="scene-index"><span>04</span><i />05</div>
    </motion.section>
  );
}
