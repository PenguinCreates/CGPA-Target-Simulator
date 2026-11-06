import { motion } from 'framer-motion';
import { useState } from 'react';
import { useSceneTimer } from '@/lib/video';

const EASE = [0.2, 0.75, 0.25, 1] as const;

export function Scene03Target() {
  const [target, setTarget] = useState(0);
  const [reachable, setReachable] = useState(false);
  useSceneTimer([
    { time: 1450, callback: () => setTarget(1) },
    { time: 1950, callback: () => setTarget(2) },
    { time: 2460, callback: () => setTarget(3) },
    { time: 3180, callback: () => setReachable(true) },
  ]);

  return (
    <motion.section
      className="film-scene scene-target"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.08 }}
      transition={{ duration: 0.42, ease: EASE }}
    >
      <div className="target-topline"><span className="micro-label">DEGREE ASSUMPTIONS</span><span className="target-number">04.00 SCALE</span></div>
      <div className="target-dial">
        <svg className="dial-svg" viewBox="0 0 500 500" aria-hidden="true">
          <circle cx="250" cy="250" r="206" className="dial-track" />
          <circle cx="250" cy="250" r="178" className="dial-inner" />
          {Array.from({ length: 40 }, (_, i) => {
            const angle = (i * 9 - 135) * Math.PI / 180;
            const x1 = 250 + Math.cos(angle) * (i % 5 === 0 ? 188 : 194);
            const y1 = 250 + Math.sin(angle) * (i % 5 === 0 ? 188 : 194);
            const x2 = 250 + Math.cos(angle) * 205;
            const y2 = 250 + Math.sin(angle) * 205;
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className={i % 5 === 0 ? 'dial-major' : 'dial-tick'} />;
          })}
          <motion.circle cx="250" cy="250" r="206" className="dial-progress" initial={{ pathLength: 0 }} animate={{ pathLength: target ? 0.68 : 0.45 }} transition={{ duration: 1.05, ease: EASE }} />
          <motion.circle cx="250" cy="250" r="10" className="dial-marker" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.46, type: 'spring', stiffness: 270, damping: 18 }} />
        </svg>
        <div className="dial-center">
          <span className="eyebrow">YOUR TARGET</span>
          <strong>{target < 2 ? '3.18' : target === 2 ? '3.44' : '3.60'}</strong>
          <small>/ 4.00</small>
        </div>
        <motion.div className="dial-handoff-node" layoutId="studyline-node" />
        <span className="dial-current">CURRENT<br /><b>3.18</b></span>
        <span className="dial-goal">GOAL<br /><b>3.60</b></span>
      </div>
      <motion.div className="scenario-seed" layoutId="studyline-grade" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.55, type: 'spring', stiffness: 280, damping: 18 }} />
      <div className="target-details">
        <div className="credit-total"><span>TOTAL DEGREE CREDITS</span><strong>120</strong><small>credit hours</small></div>
        <motion.div className={`reachability ${reachable ? 'is-reachable' : ''}`} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.8, duration: 0.38 }}>
          <i /> <span>{reachable ? 'WITHIN REACH' : 'CALCULATING'}</span>
        </motion.div>
      </div>
      <motion.p className="target-caption" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 2.8, duration: 0.35 }}>A goal you can plan toward.</motion.p>
      <div className="scene-index"><span>03</span><i />05</div>
    </motion.section>
  );
}
