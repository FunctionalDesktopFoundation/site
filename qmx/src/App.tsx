import { useState } from 'react'
import QMX from './assets/qmX Wordmark.png';
import './App.css'
import { Banner } from './components/Banner';

function App() {
  return (
    <>
      <img src={QMX} />
      <h1>A project by the <i>Functional Desktop Foundation</i>, qmX + bridge brings the best of unintrusive, UI-focused Qt Quick to all of your devices.</h1>
      <h2>It provides React-like states, IPC and shared storage, and remains easy to deploy across all platforms, given you have the proper hardware to do so.</h2>
      <p>qmX requires Nix for the time being. Other platforms are coming soon.</p>
      <a href="https://github.com/FunctionalDesktopFoundation" target="_blank" style={{
        color: 'gray',
        fontSize: '40px'
      }}>GitHub</a>

      <iframe frameBorder={0} style={{ border: 0, outline: 0 }} src="https://donate.hellings.cc/" height="1080" width="750"></iframe>
    </>
  )
}

export default App
