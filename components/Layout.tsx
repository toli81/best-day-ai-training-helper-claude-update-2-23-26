
import React, { useState } from 'react';
import { ViewState } from '../types';
import { useAuth } from '../hooks/useAuth';
import { logOut } from '../services/authService';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: ViewState;
  onNavigate: (view: ViewState) => void;
  isRecording?: boolean;
}

const Layout: React.FC<LayoutProps> = ({ children, activeTab, onNavigate, isRecording = false }) => {
  const { user } = useAuth();
  const [showMenu, setShowMenu] = useState(false);

  const handleSignOut = async () => {
    setShowMenu(false);
    await logOut();
  };

  const initials = user?.displayName
    ? user.displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : 'BD';

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-2 cursor-pointer" onClick={() => onNavigate('dashboard')}>
            <div className="bg-brand-500 p-1.5 rounded-lg">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h1 className="text-xl font-extrabold tracking-tight text-slate-900">
              Best Day <span className="text-brand-500">Training AI</span>
            </h1>
          </div>

          <nav className="hidden md:flex space-x-8">
            <button
              onClick={() => onNavigate('dashboard')}
              className={`text-sm font-semibold transition-colors ${activeTab === 'dashboard' ? 'text-brand-500' : 'text-slate-500 hover:text-slate-900'}`}
            >
              Sessions
            </button>
            <button
              onClick={() => onNavigate('library')}
              className={`text-sm font-semibold transition-colors ${activeTab === 'library' ? 'text-brand-500' : 'text-slate-500 hover:text-slate-900'}`}
            >
              Exercise Library
            </button>
            <button
              onClick={() => onNavigate('recorder')}
              className={`text-sm font-semibold transition-colors ${activeTab === 'recorder' ? 'text-brand-500' : 'text-slate-500 hover:text-slate-900'}`}
            >
              Record
            </button>
          </nav>

          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 text-[9px] font-black uppercase tracking-widest text-slate-400">
              <div className="w-2 h-2 rounded-full bg-green-500"></div>
              <span>Cloud Sync Active</span>
            </div>

            <div className="relative">
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="flex items-center space-x-2 focus:outline-none"
              >
                {user?.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || 'Trainer'}
                    className="w-8 h-8 rounded-full border border-slate-200"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-white text-[10px] font-black uppercase tracking-tighter shadow-lg shadow-slate-200">
                    {initials}
                  </div>
                )}
              </button>

              {showMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-slate-200 py-2 z-50">
                    <div className="px-4 py-2 border-b border-slate-100">
                      <p className="text-sm font-semibold text-slate-900 truncate">{user?.displayName || 'Trainer'}</p>
                      <p className="text-xs text-slate-500 truncate">{user?.email}</p>
                    </div>
                    <button
                      onClick={handleSignOut}
                      className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                    >
                      Sign Out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-grow max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 pb-24 md:pb-8">
        {children}
      </main>

      <footer className="hidden md:block bg-white border-t border-slate-200 py-6">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">
            Best Day Training &mdash; Powered by <span className="text-brand-500">Cloud AI</span>
          </p>
        </div>
      </footer>

      {/* Mobile Bottom Navigation */}
      {!isRecording && (
        <nav
          className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 md:hidden z-40"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          <div className="flex items-center justify-around h-16">
            <button
              onClick={() => onNavigate('dashboard')}
              className={`flex flex-col items-center justify-center min-w-[64px] min-h-[44px] px-3 py-1 rounded-lg transition-colors ${
                activeTab === 'dashboard' || activeTab === 'details'
                  ? 'text-brand-500'
                  : 'text-slate-400 active:text-slate-600'
              }`}
            >
              <svg className="w-6 h-6 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <span className="text-[9px] font-black uppercase tracking-widest">Sessions</span>
            </button>

            <button
              onClick={() => onNavigate('library')}
              className={`flex flex-col items-center justify-center min-w-[64px] min-h-[44px] px-3 py-1 rounded-lg transition-colors ${
                activeTab === 'library'
                  ? 'text-brand-500'
                  : 'text-slate-400 active:text-slate-600'
              }`}
            >
              <svg className="w-6 h-6 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                      d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              <span className="text-[9px] font-black uppercase tracking-widest">Library</span>
            </button>

            <button
              onClick={() => onNavigate('recorder')}
              className={`flex flex-col items-center justify-center min-w-[64px] min-h-[44px] px-3 py-1 rounded-lg transition-colors ${
                activeTab === 'recorder'
                  ? 'text-brand-500'
                  : 'text-slate-400 active:text-slate-600'
              }`}
            >
              <svg className="w-6 h-6 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                      d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <span className="text-[9px] font-black uppercase tracking-widest">Record</span>
            </button>
          </div>
        </nav>
      )}
    </div>
  );
};

export default Layout;
