import React, { useState } from 'react';
import {
  migrateLocalData,
  clearLocalSessionData,
  getLocalSessionCount,
  type MigrationStatus,
} from '../services/migrationService';

interface MigrationDialogProps {
  trainerId: string;
  onComplete: () => void;
  onSkip: () => void;
}

type Step = 'prompt' | 'migrating' | 'done';

const MigrationDialog: React.FC<MigrationDialogProps> = ({ trainerId, onComplete, onSkip }) => {
  const [step, setStep] = useState<Step>('prompt');
  const [status, setStatus] = useState<MigrationStatus>({ total: 0, done: 0, current: '', failed: [] });
  const sessionCount = getLocalSessionCount();

  const handleMigrate = async () => {
    setStep('migrating');
    const result = await migrateLocalData(trainerId, setStatus);
    setStatus(result);
    setStep('done');
  };

  const handleFinish = (clearLocal: boolean) => {
    if (clearLocal) clearLocalSessionData();
    onComplete();
  };

  const progressPercent = status.total > 0 ? Math.round((status.done / status.total) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-[40px] shadow-2xl p-10 max-w-md w-full space-y-6">
        {step === 'prompt' && (
          <>
            <div className="text-center space-y-3">
              <div className="w-16 h-16 bg-brand-50 rounded-full flex items-center justify-center mx-auto">
                <svg className="w-8 h-8 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"/>
                </svg>
              </div>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">Migrate to Cloud</h2>
              <p className="text-sm text-slate-500 leading-relaxed">
                We found <strong className="text-slate-900">{sessionCount} session{sessionCount !== 1 ? 's' : ''}</strong> stored locally on this device.
                Migrate them to your cloud account so they're accessible on any device.
              </p>
            </div>

            <div className="bg-slate-50 rounded-2xl p-4 space-y-2 text-xs text-slate-600">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-green-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"/>
                </svg>
                Session metadata and AI analysis moved to Firestore
              </div>
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-green-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"/>
                </svg>
                Video files queued for upload to Google Cloud Storage
              </div>
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                Video uploads happen in the background — keep the app open
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={onSkip}
                className="flex-1 px-5 py-3 bg-slate-100 text-slate-600 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-colors">
                Skip for Now
              </button>
              <button onClick={handleMigrate}
                className="flex-1 px-5 py-3 bg-brand-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-brand-600 transition-colors shadow-lg shadow-brand-100">
                Migrate Now
              </button>
            </div>
          </>
        )}

        {step === 'migrating' && (
          <div className="text-center space-y-6">
            <div className="w-16 h-16 mx-auto">
              <div className="w-16 h-16 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-black text-slate-900">Migrating your data...</h2>
              <p className="text-sm text-slate-500">
                {status.current ? `Processing: ${status.current}` : 'Starting migration...'}
              </p>
            </div>
            <div className="space-y-2">
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-brand-500 rounded-full transition-all duration-500"
                  style={{ width: `${progressPercent}%` }} />
              </div>
              <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">
                {status.done} / {status.total} sessions
              </p>
            </div>
          </div>
        )}

        {step === 'done' && (
          <div className="text-center space-y-6">
            <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"/>
              </svg>
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-black text-slate-900">Migration Complete!</h2>
              <p className="text-sm text-slate-500">
                {status.done - status.failed.length} sessions migrated successfully.
                {status.failed.length > 0 && ` ${status.failed.length} failed — they'll stay local.`}
              </p>
              <p className="text-xs text-slate-400">Video uploads will continue in the background.</p>
            </div>

            <div className="space-y-3">
              <button onClick={() => handleFinish(true)}
                className="w-full px-5 py-3 bg-brand-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-brand-600 transition-colors shadow-lg shadow-brand-100">
                Done — Remove Local Copy
              </button>
              <button onClick={() => handleFinish(false)}
                className="w-full px-5 py-3 bg-slate-100 text-slate-600 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-colors">
                Keep Local Copy Too
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MigrationDialog;
