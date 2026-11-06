import { motion } from 'framer-motion';

const EASE = [0.2, 0.75, 0.25, 1] as const;

export function Scene05Path() {
  return (
    <motion.section
      className="film-scene scene-path"
      initial={{ opacity: 0, scale: 1.045 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.42, ease: EASE }}
    >
      <div className="path-background-mark">s.</div>
      <div className="final-kicker"><i /> GRADUATION OUTLOOK</div>
      <div className="final-main">
        <motion.div className="final-score" initial={{ opacity: 0, scale: 1.18 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.58, type: 'spring', stiffness: 190, damping: 22 }}>
          <span>REQUIRED GPA<br />FROM HERE</span>
          <motion.strong layoutId="studyline-number">3.42</motion.strong>
          <small>OUT OF 4.0</small>
        </motion.div>
        <div className="final-graphic">
          <svg viewBox="0 0 580 300" aria-hidden="true">
            <path d="M12 266 C95 252 120 219 186 214 S278 165 331 156 S409 91 475 71 S531 48 564 21" className="final-grid-line" />
            <motion.path d="M12 266 C95 252 120 219 186 214 S278 165 331 156 S409 91 475 71 S531 48 564 21" className="final-path-line" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.2, duration: 1.4, ease: EASE }} />
            <motion.circle cx="564" cy="21" r="9" className="final-point" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 1.48, type: 'spring', stiffness: 280, damping: 18 }} />
          </svg>
          <div className="credit-pill">60 CREDITS <span>REMAINING</span></div>
          <div className="within-pill"><i /> WITHIN REACH</div>
        </div>
      </div>
      <motion.div className="final-lockup" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.54, duration: 0.42, ease: EASE }}>
        <div className="final-logo">s.</div><span>studyline</span>
        <p>A clear path to graduation.</p>
      </motion.div>
      <motion.div className="loop-aperture" initial={{ scale: 0, opacity: 0 }} animate={{ scale: [0, 1, 1.1], opacity: [0, 1, 0] }} transition={{ delay: 3.8, duration: 0.9, ease: EASE }} />
      <motion.div className="loop-band" layoutId="studyline-band" />
      <div className="scene-index"><span>05</span><i />05</div>
    </motion.section>
  );
}
