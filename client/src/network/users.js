//User lookups. The original synced profiles from the old account server;
//in the lite fork only the local database remains (normally empty), so
//callers fall back to plain usernames.
import { init as initDb } from 'state/db';
const collections = initDb();

export const get = async (query = {}) => {
  return collections.users.find(query);
};

export const getOne = async (username) => {
  let user = (await collections.users.findOne({ username: username }));
  return user;
};
