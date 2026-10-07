import React from 'react';
import { Route, Routes } from 'react-router-dom';

import GameScene from './views/Scenes/GameScene';
import TitleScreen from './views/TitleScreen';
import NemotronTest from './pages/NemotronTest';
import NemotronChat from './pages/NemotronChat';

function App() {
  return (
    <Routes>
      <Route path="/" element={<TitleScreen />} />
      <Route path="/play" element={<GameScene />} />
      <Route path="/nemotron-test" element={<NemotronTest />} />
      <Route path="/nemotron-chat" element={<NemotronChat />} />
    </Routes>
  );
}

export default App;
