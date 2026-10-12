import React from 'react';

import { Trans } from '@lingui/macro';

import FormControl from '@material-ui/core/FormControl';
import Grid from '@material-ui/core/Grid';
import InputLabel from '@material-ui/core/InputLabel';
import MenuItem from '@material-ui/core/MenuItem';
import Select from '@material-ui/core/Select';
import Typography from '@material-ui/core/Typography';

import Chess from '5d-chess-js';
import ChessClock from '5d-chess-clock';

import EmitterContext from 'utils/EmitterContext';
import * as settings from 'state/settings';

//What Local Play starts: one variant, one clock. Stored as one-element
//arrays (quickPlay.variants/formats) for compatibility with old settings,
//which came from a multi-select; only the first entry was ever used.
export default class QuickPlayOptions extends React.Component {
  static contextType = EmitterContext;
  chess = new Chess();
  chessClock = new ChessClock();
  variants = this.chess.variants.filter(e => e.shortName !== 'custom');
  formats = this.chessClock.formats;
  selected() {
    const q = settings.get().quickPlay;
    let variant = q.variants[0];
    if(!this.variants.some(v => v.shortName === variant)) { variant = 'standard'; }
    let format = q.formats[0] || 'none';
    if(format !== 'none' && !this.formats.some(f => f.shortName === format)) { format = 'none'; }
    return { variant, format };
  }
  state = this.selected();
  componentDidMount() {
    //Update state if settings is changed
    this.settingsListener = this.context.on('settingsUpdate', () => {
      this.setState(this.selected());
    });
  }
  componentWillUnmount() {
    //Stop listening to settings changes
    if(typeof this.settingsListener === 'function') { this.settingsListener(); }
  }
  render() {
    return (
      <Grid container spacing={2}>
        <Grid item xs={12}>
          <Typography variant='caption' color='textSecondary'>
            <Trans>Used when starting a local game. Online games pick their own settings.</Trans>
          </Typography>
        </Grid>
        <Grid item xs={12}>
          <FormControl fullWidth variant='outlined'>
            <InputLabel><Trans>Variant</Trans></InputLabel>
            <Select
              value={this.state.variant}
              onChange={(event) => {
                settings.set({
                  quickPlay: { variants: [event.target.value] }
                }, this.context);
              }}
              label={<Trans>Variant</Trans>}
            >
              {this.variants.map((variant) => (
                <MenuItem key={variant.shortName} value={variant.shortName}>
                  {variant.shortName === 'standard' ? variant.name : variant.name.replace('Standard - ', '')}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12}>
          <FormControl fullWidth variant='outlined'>
            <InputLabel><Trans>Clock</Trans></InputLabel>
            <Select
              value={this.state.format}
              onChange={(event) => {
                settings.set({
                  quickPlay: { formats: [event.target.value] }
                }, this.context);
              }}
              label={<Trans>Clock</Trans>}
            >
              <MenuItem value='none'><Trans>No clock</Trans></MenuItem>
              {this.formats.map((format) => (
                <MenuItem key={format.shortName} value={format.shortName}>
                  {format.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
      </Grid>
    );
  }
}
