import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/layout/Layout';
import LyricsPage from './pages/LyricsPage';
import YouTubePage from './pages/YouTubePage';
import OcrPage from './pages/OcrPage';
import SongsLibraryPage from './pages/SongsLibraryPage';
import TemplatesPage from './pages/TemplatesPage';
import TermsPage from './pages/TermsPage';
import PrivacyPage from './pages/PrivacyPage';
import AboutPage from './pages/AboutPage';
import WorshipVideoPage from './pages/WorshipVideoPage';
import './index.css';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<LyricsPage />} />
          <Route path="youtube" element={<YouTubePage />} />
          <Route path="ocr" element={<OcrPage />} />
          <Route path="worship-video" element={<WorshipVideoPage />} />
          <Route path="songs" element={<SongsLibraryPage />} />
          <Route path="templates" element={<TemplatesPage />} />
          <Route path="about" element={<AboutPage />} />
          <Route path="terms" element={<TermsPage />} />
          <Route path="privacy" element={<PrivacyPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
