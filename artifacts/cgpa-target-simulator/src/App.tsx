import { useEffect, useRef } from 'react';
import { mountSimulator } from './simulator.js';

function App() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mountRef.current) return;
    return mountSimulator(mountRef.current);
  }, []);

  return <div ref={mountRef} />;
}

export default App;
