import React from 'react';

import { Trans } from '@lingui/macro';

import FormControl from '@material-ui/core/FormControl';
import Grid from '@material-ui/core/Grid';
import InputLabel from '@material-ui/core/InputLabel';
import MenuItem from '@material-ui/core/MenuItem';
import Select from '@material-ui/core/Select';
import TextField from '@material-ui/core/TextField';

import Chess from '5d-chess-js';
import ChessClock from '5d-chess-clock';
import store from 'store';

import EmitterContext from 'utils/EmitterContext';
import * as settings from 'state/settings';

//The game settings on the start page. Variant and clock apply to online and
//local games alike; colour and name only matter for online invites. Stored
//as quickPlay (variants/formats stay one-element arrays for compatibility
//with the old multi-select settings shape).
export default class QuickPlayOptions extends React.Component {
  static contextType = EmitterContext;
  chess = new Chess();
  chessClock = new ChessClock();
  variants = this.chess.variants.filter(e => e.shortName !== 'custom');
  //'daily' has no starting time, which the server's clock doesn't support
  formats = this.chessClock.formats.filter(f => f.shortName !== 'daily');
  selected() {
    const q = settings.get().quickPlay;
    let variant = q.variants[0];
    if(!this.variants.some(v => v.shortName === variant)) { variant = 'standard'; }
    let format = q.formats[0] || 'none';
    if(format !== 'none' && !this.formats.some(f => f.shortName === format)) { format = 'none'; }
    let color = ['white', 'black', 'random'].includes(q.color) ? q.color : 'white';
    //The nickname used to live under its own store key (the online dialog)
    let nickname = typeof q.nickname === 'string' ? q.nickname : (store.get('onlineNickname') || '');
    return { variant, format, color, nickname };
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
  set(patch) {
    settings.set({ quickPlay: patch }, this.context);
  }
  render() {
    return (
      <Grid container spacing={2}>
        <Grid item xs={12} sm={6} md={3}>
          <FormControl fullWidth variant='outlined'>
            <InputLabel><Trans>Variant</Trans></InputLabel>
            <Select
              value={this.state.variant}
              onChange={(event) => this.set({ variants: [event.target.value] })}
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
        <Grid item xs={12} sm={6} md={3}>
          <FormControl fullWidth variant='outlined'>
            <InputLabel><Trans>Clock</Trans></InputLabel>
            <Select
              value={this.state.format}
              onChange={(event) => this.set({ formats: [event.target.value] })}
              label={<Trans>Clock</Trans>}
            >
              <MenuItem value='none'><Trans>No clock</Trans></MenuItem>
              {this.formats.map((format) => (
                <MenuItem key={format.shortName} value={format.shortName}>
                  {format.name} ({format.format})
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <FormControl fullWidth variant='outlined'>
            <InputLabel><Trans>You play</Trans></InputLabel>
            <Select
              value={this.state.color}
              onChange={(event) => this.set({ color: event.target.value })}
              label={<Trans>You play</Trans>}
            >
              <MenuItem value='white'><Trans>White</Trans></MenuItem>
              <MenuItem value='black'><Trans>Black</Trans></MenuItem>
              <MenuItem value='random'><Trans>Random</Trans></MenuItem>
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <TextField
            fullWidth
            variant='outlined'
            label={<Trans>Your name (optional)</Trans>}
            value={this.state.nickname}
            inputProps={{ maxLength: 24 }}
            onChange={(event) => this.set({ nickname: event.target.value })}
          />
        </Grid>
      </Grid>
    );
  }
}
