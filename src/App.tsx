import React from 'react';
import { Route, Routes } from 'react-router-dom';

import SplashScreen from './components/SplashScreen';
import MainMenu from './views/Menus/MainMenu';
import PlayDemo from './views/PlayDemo';

function App() {
  return (
    <Routes>
      <Route path="/" element={<SplashScreen />} />
      <Route path="/main-menu" element={<MainMenu />} />
      <Route path="/play-demo" element={<PlayDemo />} />
    </Routes>
  );
}

export default App;
