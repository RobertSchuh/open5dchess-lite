import deepmerge from 'deepmerge';
import store from 'store';
const defaultSettings = {
  locale: 'en',
  eruda: false,
  quickPlay: {
    variants: ['standard'],
    formats: ['none'],
    color: 'white',
    nickname: null
  }
};

const overwriteMerge = (destinationArray, sourceArray, options) => sourceArray;

export const set = (settings, emitter = null) => {
  store.set('settings', deepmerge(store.get('settings'), settings, { arrayMerge: overwriteMerge }));
  if(emitter !== null) {
    emitter.emit('settingsUpdate');
  }
}

export const get = () => {
  var storedSettings = store.get('settings');
  if(typeof storedSettings === 'object' && storedSettings !== null) {
    return deepmerge(defaultSettings, storedSettings, { arrayMerge: overwriteMerge });
  }
  return defaultSettings;
}

export const reset = (emitter = null) => {
  store.remove('settings');
  if(emitter !== null) {
    emitter.emit('settingsUpdate');
  }
}