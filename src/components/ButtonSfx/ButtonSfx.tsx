import React, { useCallback } from 'react';
import useSound from 'use-sound';

import ButtonClickSFX from '../../assets/Sounds/Sfx/buttonClickSfx.mp3';
import ButtonHoverSFX from '../../assets/Sounds/Sfx/buttonHoverSfx.mp3';

export interface SfxActions {
  onHoverSound?: string;
  onClickSound?: string;
}

export const menuSfx = { onClickSound: ButtonClickSFX, onHoverSound: ButtonHoverSFX };

type Props = {
  buttonLabel: string;
  onClick?: () => void;
  sfxUrl: SfxActions;
};

function ButtonSfx(props: Props) {
  const { buttonLabel, onClick, sfxUrl } = props;

  const [playHoverSfx, { stop: stopHoverSfx }] = useSound(sfxUrl.onHoverSound ?? '');
  const [playClickSfx] = useSound(sfxUrl.onClickSound ?? '', {
    volume: 0.4
  });

  const handleOnClick = useCallback(() => {
    playClickSfx();
    if (onClick) {
      onClick();
    }
  }, [onClick, playClickSfx]);

  return (
    <button
      onMouseEnter={() => playHoverSfx()}
      onMouseLeave={() => stopHoverSfx()}
      onClick={handleOnClick}
      className="py-3 text-left font-pixel text-xl text-white/70 hover:text-red-500"
    >
      {buttonLabel}
    </button>
  );
}

export default React.memo(ButtonSfx);
