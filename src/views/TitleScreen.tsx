import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

import background from '../assets/game/background.png';
import ButtonSfx, { menuSfx } from '../components/ButtonSfx/ButtonSfx';
import { controlsHelp } from '../config/controls';
import { music } from '../game/sound';

const BUTTON_DELAY_MS = 2500; // the name shows on its own first

/** Title screen: the game's name fades in, then Start Game and Help appear. Help lists the controls. */
function TitleScreen() {
  const navigate = useNavigate();
  const [showButton, setShowButton] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    // The title music fades in and loops until the game starts (browsers may hold it back
    // until the first key press or click)
    music.fadeTo(0.5, 2);
    const timer = setTimeout(() => setShowButton(true), BUTTON_DELAY_MS);
    return () => {
      clearTimeout(timer);
      music.fadeTo(0, 0.8);
    };
  }, []);

  return (
    <div
      className="flex h-screen flex-col items-center justify-center gap-16 bg-cover bg-center"
      style={{
        // The game's night city, darkened so the title stands out
        backgroundImage: `linear-gradient(rgba(5, 8, 25, 0.55), rgba(5, 8, 25, 0.55)), url(${background})`,
        imageRendering: 'pixelated'
      }}
    >
      <motion.h1
        className="font-pixel text-4xl text-teal-300 [text-shadow:4px_4px_0_#000]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.5 }}
      >
        NINJAVERSE
      </motion.h1>

      {/* Keeps its space while hidden so the name doesn't jump when the buttons appear */}
      <motion.div
        className="flex h-28 flex-col items-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: showButton ? 1 : 0 }}
        transition={{ duration: 0.8 }}
      >
        {showButton && (
          <>
            <ButtonSfx sfxUrl={menuSfx} buttonLabel="Start Game" onClick={() => navigate('/play')} />
            <ButtonSfx sfxUrl={menuSfx} buttonLabel="Help" onClick={() => setShowHelp(true)} />
          </>
        )}
      </motion.div>

      {showHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="border-4 border-white bg-slate-950 p-8 font-pixel text-white">
            <h2 className="mb-6 text-center text-lg text-teal-300">Controls</h2>
            <table className="text-xs leading-8">
              <tbody>
                {controlsHelp.map(({ action, keys }) => (
                  <tr key={action}>
                    <td className="pr-10 text-amber-300">{keys}</td>
                    <td>{action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-6 text-center text-[8px] leading-4 text-white/60">
              Music: Title Screen Loop by GboxMikeFozzy (CC0)
              <br />
              Sounds: Listener, Kenney and rubberduck on OpenGameArt.org (CC0)
            </p>
            <div className="mt-6 flex justify-center">
              <ButtonSfx sfxUrl={menuSfx} buttonLabel="Close" onClick={() => setShowHelp(false)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TitleScreen;
