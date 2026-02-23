
import React, { useState } from 'react';
import { ViewState } from '../types';
import { useAuth } from '../hooks/useAuth';
import { logOut } from '../services/authService';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: ViewState;
  onNavigate: (view: ViewState) => void;
}

const Layout: React.FC<LayoutProps> = ({ children, activeTab, onNavigate }) => {
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

      <main className="flex-grow max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>

      <footer className="bg-white border-t border-slate-200 py-6">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">
            Best Day Training &mdash; Powered by <span className="text-brand-500">Cloud AI</span>
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Layout;
