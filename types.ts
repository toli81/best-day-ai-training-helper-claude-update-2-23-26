
export type SessionMode = 'clip' | 'workout30' | 'workout60';

export interface Exercise {
  id: string;
  name: string;
  startTime: number; 
  endTime: number; 
  reps: number | string;
  weight?: string;
  duration?: string; 
  cues: string[];
  tags: string[];
}

export interface EmphasisPercentages {
  upperBody: number;
  lowerBody: number;
  core: number;
  fullBody: number;
}

export interface SessionAnalysis {
  exercises: Exercise[];
  transcript: string;
  summary: string;
  trainerCues: string[];
  protocolRecommendations: string;
  emphasisPercentages: EmphasisPercentages;
}

export interface TrainingSession {
  id: string;
  clientName: string;
  date: string;
  duration: number; // Duration in seconds
  videoUrl?: string; 
  videoBlob?: Blob; 
  analysis?: SessionAnalysis;
  tags: string[];
  snapshotCount?: number;
  mode: SessionMode;
  status?: 'complete' | 'failed' | 'processing';
  error?: string;
  driveSync?: {
    status: 'synced' | 'pending' | 'failed';
    folderLink?: string;
    lastAttempt?: string;
  };
}

export type ViewState = 'dashboard' | 'recorder' | 'details' | 'library';
