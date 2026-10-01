import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import SplashOpeningSFX from '../assets/Sounds/Sfx/splashOpening.mp3';

function SplashScreen() {
  const navigate = useNavigate();

  const playSound = () => {
    const audio = new Audio(SplashOpeningSFX);
    audio.play();
    const fadeOutInterval = setInterval(() => {
      if (audio.volume > 0.1) {
        audio.volume -= 0.1;
      } else {
        clearInterval(fadeOutInterval);
        audio.pause();
        audio.currentTime = 0;
      }
    }, 450);
  };

  useEffect(() => {
    playSound();
    const timer = setTimeout(() => {
      navigate('/main-menu');
    }, 4500);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="grid h-screen place-items-center bg-gradient-to-r from-slate-950 from-10% via-teal-950 via-50% to-slate-900 to-90%">
      {/* Pixel-font title */}
      <h1 className="animate-pulse font-pixel text-4xl text-red-600 [text-shadow:4px_4px_0_#000]">SPIDEYVERSE</h1>
    </div>
  );
}

export default SplashScreen;
