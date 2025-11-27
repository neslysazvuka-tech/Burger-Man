import React from 'react';
import Game from './components/Game';

const App: React.FC = () => {
  return (
    <div className="w-screen h-screen bg-neutral-900 overflow-hidden relative">
      <Game />
    </div>
  );
};

export default App;