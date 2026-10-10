import { i18n } from '@lingui/core';
import { messages as enMessages } from 'locales/en/messages.mjs';
import { messages as frMessages } from 'locales/fr/messages.mjs';
import { en, fr } from 'make-plural/plurals';


import moment from 'moment';

import * as settings from 'state/settings';

const i18nInit = (emitter) => {
  i18n.load('en', enMessages);
  i18n.load('fr', frMessages);
  i18n.loadLocaleData('en', { plurals: en });
  i18n.loadLocaleData('fr', { plurals: fr });    
  i18n.activate(settings.get().locale);
  moment.locale(settings.get().locale);
  emitter.on('settingsUpdate', () => {
    i18n.activate(settings.get().locale);
    moment.locale(settings.get().locale);
  });
}

export default i18nInit;