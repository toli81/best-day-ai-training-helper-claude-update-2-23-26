const { Storage } = require('./functions/node_modules/@google-cloud/storage');

const storage = new Storage({ projectId: 'best-day-training-app' });

async function setCors() {
  await storage.bucket('bestday-training-videos').setCorsConfiguration([
    {
      origin: ['*'],
      method: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      responseHeader: ['Content-Type', 'Authorization', 'Content-Length', 'X-Requested-With'],
      maxAgeSeconds: 3600,
    },
  ]);
  console.log('CORS configured successfully!');
}

setCors().catch(console.error);
