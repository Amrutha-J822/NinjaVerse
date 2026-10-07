import React from 'react';
import { Route, Routes } from 'react-router-dom';

import GameScene from './views/Scenes/GameScene';
import TitleScreen from './views/TitleScreen';

function App() {
  return (
    <Routes>
      <Route path="/" element={<TitleScreen />} />
      <Route path="/play" element={<GameScene />} />
    </Routes>
  );
}

export default App;
