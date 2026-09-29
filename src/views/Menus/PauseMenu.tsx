import React from 'react';
import { useNavigate } from 'react-router-dom';

import ButtonSfx from '../../components/ButtonSfx/ButtonSfx';

import { sfxUrl } from './MainMenu';

type Props = {
  onCloseMenu: () => void;
};

function PauseMenu(props: Props) {
  const { onCloseMenu } = props;
  const navigate = useNavigate();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-80">
      <div className="grid p-8">
        <ButtonSfx sfxUrl={sfxUrl} buttonLabel="Resume" onClick={onCloseMenu} />
        <ButtonSfx sfxUrl={sfxUrl} buttonLabel="Settings" />
        <ButtonSfx sfxUrl={sfxUrl} buttonLabel="Info" />
        <ButtonSfx sfxUrl={sfxUrl} buttonLabel="QUIT" onClick={() => navigate('/main-menu')} />
      </div>
    </div>
  );
}

export default PauseMenu;