import React from 'react';

import { Trans } from '@lingui/macro';

import FormControl from '@material-ui/core/FormControl';
import Grid from '@material-ui/core/Grid';
import InputLabel from '@material-ui/core/InputLabel';
import MenuItem from '@material-ui/core/MenuItem';
import Select from '@material-ui/core/Select';

import Chess from '5d-chess-js';
import ChessClock from '5d-chess-clock';

import EmitterContext from 'utils/EmitterContext';
import * as settings from 'state/settings';

/*
Props
 - variants - Default to ['standard']
 - formats - Default to ['blitz', 'rapid']
*/
export default class QuickPlayOptions extends React.Component {
  static contextType = EmitterContext;
  chess = new Chess();
  chessClock = new ChessClock();
  state = {
    variants: this.chess.variants.filter(e => e.shortName !== 'custom'),
    formats: this.chessClock.formats,
    selectedVariants: settings.get().quickPlay.variants,
    selectedFormats: settings.get().quickPlay.formats
  }
  refresh() {
    this.setState({
      variants: this.chess.variants.filter(e => e.shortName !== 'custom'),
      formats: this.chessClock.formats,
      selectedVariants: settings.get().quickPlay.variants,
      selectedFormats: settings.get().quickPlay.formats
    });
  }
  componentDidMount() {
    //Update state if settings is changed
    this.settingsListener = this.context.on('settingsUpdate', () => {
      this.refresh();
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
          <FormControl fullWidth variant='outlined'>
            <InputLabel><Trans>Variants</Trans></InputLabel>
            <Select
              multiple
              value={this.state.selectedVariants}
              onChange={(event) => {
                if(event.target.value.length > 0) {
                  settings.set({
                    quickPlay: { variants: event.target.value }
                  }, this.context);
                }
              }}
              label={<Trans>Variants</Trans>}
            >
              {this.state.variants.map((variant) => (
                <MenuItem key={variant.shortName} value={variant.shortName}>
                  {variant.name.replace('Standard - ','')}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12}>
          <FormControl fullWidth variant='outlined'>
            <InputLabel><Trans>Formats</Trans></InputLabel>
            <Select
              multiple
              value={this.state.selectedFormats}
              onChange={(event) => {
                if(event.target.value.length > 0) {
                  settings.set({
                    quickPlay: { formats: event.target.value }
                  }, this.context);
                }
              }}
              label={<Trans>Formats</Trans>}
            >
              {this.state.formats.map((format) => (
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