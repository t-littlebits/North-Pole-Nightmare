import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AppProvider } from './lib/AppContext.jsx';
import Layout from './components/Layout.jsx';
import HomePage from './pages/HomePage.jsx';
import AdventPage from './pages/AdventPage.jsx';
import LeaderboardPage from './pages/LeaderboardPage.jsx';
import CollectionPage from './pages/CollectionPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import PlayersPage from './pages/PlayersPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import NotFound from './pages/NotFound.jsx';

// Phaser is large, so the game page loads on demand.
const GamePage = lazy(() => import('./pages/GamePage.jsx'));

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path="play" element={<Suspense fallback={<div className="page"><p className="muted">Loading the arena…</p></div>}><GamePage /></Suspense>} />
            <Route path="advent" element={<AdventPage />} />
            <Route path="leaderboard" element={<LeaderboardPage />} />
            <Route path="collection" element={<CollectionPage />} />
            <Route path="players" element={<PlayersPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="profile/:username" element={<ProfilePage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AppProvider>
  );
}
