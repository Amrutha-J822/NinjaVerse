import React from 'react';
import { useNavigate } from 'react-router-dom';

import ButtonSfx, { menuSfx } from '../../components/ButtonSfx/ButtonSfx';

type Props = {
  onCloseMenu: () => void;
};

function PauseMenu(props: Props) {
  const { onCloseMenu } = props;
  const navigate = useNavigate();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-80">
      <div className="grid p-8">
        <ButtonSfx sfxUrl={menuSfx} buttonLabel="Resume" onClick={onCloseMenu} />
        <ButtonSfx sfxUrl={menuSfx} buttonLabel="Quit" onClick={() => navigate('/')} />
      </div>
    </div>
  );
}

export default PauseMenu;
