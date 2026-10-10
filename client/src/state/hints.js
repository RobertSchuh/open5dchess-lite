//Per-player legal move hint state, as a quick in-game toggle.
//Stored in config.extra.legalMoveHints; older saves may hold a boolean or a
//mode string from earlier versions, so normalize everything to
//{ white: bool, black: bool }.
import * as crConfig from 'state/config';

export const normalize = (mode) => {
  if(mode === true || mode === 'both') { return { white: true, black: true }; }
  if(mode === 'white') { return { white: true, black: false }; }
  if(mode === 'black') { return { white: false, black: true }; }
  if(typeof mode === 'object' && mode !== null) { return { white: mode.white === true, black: mode.black === true }; }
  return { white: false, black: false };
};

export const isOn = (color) => {
  return normalize(crConfig.get().extra.legalMoveHints)[color] === true;
};

//Flip hints for one player only (the side to move locally, your seat online)
export const toggle = (color, emitter = null) => {
  const next = normalize(crConfig.get().extra.legalMoveHints);
  next[color] = !next[color];
  crConfig.set({ extra: { legalMoveHints: next } }, emitter);
};
