import React from 'react';

import MenuItem from '@material-ui/core/MenuItem';

//Available non-monospaced fonts (trimmed to the default: every extra family
//shipped ~60-170 KB of woff with the bundle)
import '@fontsource/vollkorn';

//Available monospaced fonts
import '@fontsource/roboto-mono';

export const RegularFont = [
  <MenuItem value='vollkorn' style={{ fontFamily: 'vollkorn' }}>
    Vollkorn
  </MenuItem>,
];

export const MonospaceFont = [
  <MenuItem value='roboto mono' style={{ fontFamily: 'roboto mono' }}>
    Roboto Mono
  </MenuItem>,
];
