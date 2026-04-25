import React from 'react';
import { InstallPrompt } from '@/components/InstallPrompt';
import { HomeChatShell } from '@/components/home-chat-shell';

const Home = () => {
  return (
    <React.Fragment>
      <HomeChatShell />
      <InstallPrompt />
    </React.Fragment>
  );
};

export default Home;
