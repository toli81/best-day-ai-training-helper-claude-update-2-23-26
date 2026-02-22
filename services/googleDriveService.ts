
// Service to handle Google Drive synchronization

// NOTE: In a production environment, this should be in an environment variable.
// You must create a Client ID in Google Cloud Console for "Web Application"
// and add your domain (e.g., localhost:3000) to "Authorized JavaScript origins".
const CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID'; // <--- REPLACE THIS WITH YOUR ACTUAL CLIENT ID
const API_KEY = process.env.API_KEY; // Using the existing GenAI key if it has Drive scope, otherwise create a separate one.
const SCOPES = 'https://www.googleapis.com/auth/drive.file';

let tokenClient: any;
let gapiInited = false;
let gisInited = false;

export async function initDrive() {
  return new Promise<void>((resolve, reject) => {
    let attempts = 0;
    const checkScripts = setInterval(() => {
      attempts++;
      if ((window as any).gapi && (window as any).google) {
        clearInterval(checkScripts);
        
        (window as any).gapi.load('client', async () => {
          try {
            await (window as any).gapi.client.init({
              apiKey: API_KEY,
              discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
            });
            gapiInited = true;
            if (gisInited) resolve();
          } catch (err: any) {
            reject(new Error(err?.message || err?.error || 'Failed to initialize Google API client'));
          }
        });

        try {
          tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: SCOPES,
            callback: '', // defined at request time
          });
          gisInited = true;
          if (gapiInited) resolve();
        } catch (err: any) {
          reject(new Error(err?.message || 'Failed to initialize Google Identity Services'));
        }
      } else if (attempts > 100) { // 10 seconds timeout
        clearInterval(checkScripts);
        reject(new Error('Google API scripts failed to load. Please check your internet connection and disable ad-blockers.'));
      }
    }, 100);
  });
}

export async function authenticateDrive(): Promise<boolean> {
  return new Promise((resolve, reject) => {
    tokenClient.callback = async (resp: any) => {
      if (resp.error !== undefined) {
        reject(new Error(resp.error_description || resp.error || 'Authentication failed'));
      }
      resolve(true);
    };

    if ((window as any).gapi.client.getToken() === null) {
      // Prompt the user to select a Google Account and ask for consent to share their data
      tokenClient.requestAccessToken({ prompt: 'consent' });
    } else {
      // Skip display of account chooser and consent dialog for an existing session
      tokenClient.requestAccessToken({ prompt: '' });
    }
  });
}

async function findOrCreateFolder(name: string, parentId: string = 'root'): Promise<string> {
  const query = `mimeType='application/vnd.google-apps.folder' and name='${name}' and '${parentId}' in parents and trashed=false`;
  const response = await (window as any).gapi.client.drive.files.list({
    q: query,
    fields: 'files(id, name)',
    spaces: 'drive',
  });

  if (response.result.files && response.result.files.length > 0) {
    return response.result.files[0].id;
  }

  // Create folder
  const fileMetadata = {
    name: name,
    mimeType: 'application/vnd.google-apps.folder',
    parents: [parentId],
  };
  
  const createResponse = await (window as any).gapi.client.drive.files.create({
    resource: fileMetadata,
    fields: 'id',
  });
  
  return createResponse.result.id;
}

export async function uploadSessionToDrive(
  blob: Blob, 
  analysis: any, 
  clientName: string, 
  date: string
): Promise<string> {
  try {
    // 1. Ensure Root Folder "Best Day App Data" exists
    const rootId = await findOrCreateFolder('Best Day App Data');

    // 2. Ensure Client Folder exists
    const clientId = await findOrCreateFolder(clientName, rootId);

    // 3. Create Session Folder
    const sessionFolderName = `${new Date(date).toLocaleDateString().replace(/\//g, '-')} - Session`;
    const sessionId = await findOrCreateFolder(sessionFolderName, clientId);

    // 4. Upload Video
    const videoMetadata = {
      name: 'Session_Recording.webm',
      parents: [sessionId],
    };

    const accessToken = (window as any).gapi.client.getToken().access_token;
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(videoMetadata)], { type: 'application/json' }));
    form.append('file', blob);

    await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: new Headers({ 'Authorization': 'Bearer ' + accessToken }),
      body: form,
    });

    // 5. Upload Analysis JSON
    if (analysis) {
        const analysisMetadata = {
            name: 'AI_Analysis_Report.json',
            parents: [sessionId]
        };
        const analysisBlob = new Blob([JSON.stringify(analysis, null, 2)], {type: 'application/json'});
        const analysisForm = new FormData();
        analysisForm.append('metadata', new Blob([JSON.stringify(analysisMetadata)], { type: 'application/json' }));
        analysisForm.append('file', analysisBlob);

        await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: new Headers({ 'Authorization': 'Bearer ' + accessToken }),
            body: analysisForm,
        });
    }

    return sessionId; // Return ID of the folder
  } catch (error) {
    console.error("Drive Upload Error:", error);
    throw error;
  }
}
