import { i18n } from '@lingui/core';
import { messages as enMessages } from 'locales/en/messages.mjs';
import { en } from 'make-plural/plurals';

const i18nInit = (emitter) => {
  i18n.load('en', enMessages);
  i18n.loadLocaleData('en', { plurals: en });
  i18n.activate('en');
}

export default i18nInit;
