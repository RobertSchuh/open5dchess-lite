//Local game sessions (hot-seat play and analysis), stored in the browser's
//local database. The original project also synced sessions with the old
//chessin5d.net account server from here; that is gone - online play now goes
//through invite links (network/online.js + state/OnlineGameManager).
import * as SessionGenerate from 'utils/SessionGenerate';
import { init as initDb } from 'state/db';

const collections = initDb();

export const getCurrentSession = async (id) => {
  let existingSession = (await collections.currentSessions.findOne({ id: id }));
  if(existingSession && existingSession._id) {
    delete existingSession._id;
  }
  return existingSession;
};

export const getSession = async (id) => {
  let existingSession = (await collections.pastSessions.findOne({ id: id }));
  if(existingSession === null) {
    existingSession = (await collections.sessionCache.findOne({ id: id }));
  }
  if(existingSession && existingSession._id) {
    delete existingSession._id;
  }
  return existingSession;
};

export const createSession = async (online = false, variant = 'standard', format = null, player = 'white', ranked = false, emitter = null) => {
  let newSession = SessionGenerate.generate(variant, format);
  await collections.currentSessions.update({ id: newSession.id }, { $set: newSession }, { upsert: true });
  if(emitter !== null) {
    emitter.emit('sessionsUpdate');
  }
  return newSession;
};

export const getSessions = async (emitter = null) => {
  let sessions = {};
  sessions.sessionRequests = (await collections.sessionRequests.find({}));
  sessions.currentSessions = (await collections.currentSessions.find({}).sort({ startDate: -1 }));
  sessions.pastSessions = (await collections.pastSessions.find({}).sort({ endDate: -1 }));
  return sessions;
};

//The functions below only ever ran against the old account server
//(SessionManager calls them when a session has a host, which no longer
//happens). Kept as loud stubs so any forgotten path fails visibly.
const goneWithTheServer = () => {
  throw new Error('Account-server sessions were removed; online play uses invite links');
};
export const moveSession = goneWithTheServer;
export const undoSession = goneWithTheServer;
export const submitSession = goneWithTheServer;
export const forfeitSession = goneWithTheServer;
export const drawSession = goneWithTheServer;
export const requestJoinSession = goneWithTheServer;
export const addUserSession = goneWithTheServer;
export const readySession = goneWithTheServer;
export const unreadySession = goneWithTheServer;
export const startSession = goneWithTheServer;
