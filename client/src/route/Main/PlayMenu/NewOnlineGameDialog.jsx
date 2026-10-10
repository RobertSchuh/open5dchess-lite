import React from 'react';
import { withRouter } from 'react-router';

import { Trans } from '@lingui/macro';

import Box from '@material-ui/core/Box';
import Button from '@material-ui/core/Button';
import Dialog from '@material-ui/core/Dialog';
import DialogActions from '@material-ui/core/DialogActions';
import DialogContent from '@material-ui/core/DialogContent';
import DialogTitle from '@material-ui/core/DialogTitle';
import FormControl from '@material-ui/core/FormControl';
import InputLabel from '@material-ui/core/InputLabel';
import MenuItem from '@material-ui/core/MenuItem';
import Select from '@material-ui/core/Select';
import TextField from '@material-ui/core/TextField';
import Typography from '@material-ui/core/Typography';
import withMobileDialog from '@material-ui/core/withMobileDialog';

import Chess from '5d-chess-js';
import ChessClock from '5d-chess-clock';
import store from 'store';

import InviteLinks from 'components/InviteLinks';
import * as online from 'network/online';

/*
New online game: pick variant, time control and colour, get invite links.
Props: open, onClose
*/
class NewOnlineGameDialog extends React.Component {
  variants = new Chess().variants.filter((v) => v.shortName !== 'custom');
  //'daily' has no starting time, which the server's clock doesn't support
  formats = new ChessClock().formats.filter((f) => f.shortName !== 'daily');
  state = {
    variant: 'standard',
    timeControl: 'none',
    color: 'white',
    nickname: store.get('onlineNickname') || '',
    creating: false,
    error: null,
    created: null,
  };
  async create() {
    this.setState({ creating: true, error: null });
    try {
      store.set('onlineNickname', this.state.nickname);
      const res = await online.createGame({
        variant: this.state.variant,
        timeControl: this.state.timeControl === 'none' ? null : this.state.timeControl,
        creatorColor: this.state.color,
        nickname: this.state.nickname || null,
      });
      this.setState({ created: res, creating: false });
    }
    catch(err) {
      this.setState({ error: err.message, creating: false });
    }
  }
  openGame() {
    const created = this.state.created;
    const link = created.links[created.seat];
    //Link is "<origin>/#/g/<id>?seat=<token>"; navigate inside the app
    this.props.history.push(link.slice(link.indexOf('#') + 1));
  }
  close() {
    this.setState({ created: null, error: null });
    this.props.onClose();
  }
  render() {
    const created = this.state.created;
    return (
      <Dialog open={this.props.open} onClose={() => this.close()} fullScreen={this.props.fullScreen} fullWidth maxWidth='sm'>
        <DialogTitle><Trans>New online game</Trans></DialogTitle>
        <DialogContent>
          {created === null ?
            <>
              <Box mb={2}>
                <FormControl variant='outlined' fullWidth>
                  <InputLabel><Trans>Variant</Trans></InputLabel>
                  <Select label='Variant' value={this.state.variant} onChange={(e) => this.setState({ variant: e.target.value })}>
                    {this.variants.map((v) => <MenuItem key={v.shortName} value={v.shortName}>{v.name}</MenuItem>)}
                  </Select>
                </FormControl>
              </Box>
              <Box mb={2}>
                <FormControl variant='outlined' fullWidth>
                  <InputLabel><Trans>Time control</Trans></InputLabel>
                  <Select label='Time control' value={this.state.timeControl} onChange={(e) => this.setState({ timeControl: e.target.value })}>
                    <MenuItem value='none'><Trans>No clock</Trans></MenuItem>
                    {this.formats.map((f) => <MenuItem key={f.shortName} value={f.format}>{f.name} ({f.format})</MenuItem>)}
                  </Select>
                </FormControl>
              </Box>
              <Box mb={2}>
                <FormControl variant='outlined' fullWidth>
                  <InputLabel><Trans>You play</Trans></InputLabel>
                  <Select label='You play' value={this.state.color} onChange={(e) => this.setState({ color: e.target.value })}>
                    <MenuItem value='white'><Trans>White</Trans></MenuItem>
                    <MenuItem value='black'><Trans>Black</Trans></MenuItem>
                    <MenuItem value='random'><Trans>Random</Trans></MenuItem>
                  </Select>
                </FormControl>
              </Box>
              <TextField
                fullWidth
                variant='outlined'
                label={<Trans>Your name (optional)</Trans>}
                value={this.state.nickname}
                inputProps={{ maxLength: 24 }}
                onChange={(e) => this.setState({ nickname: e.target.value })}
              />
              <Box mt={1}>
                <Typography variant='caption' color='textSecondary'>
                  <Trans>No account needed. Games are kept in memory only and are deleted an hour after they end.</Trans>
                </Typography>
              </Box>
              {this.state.error ?
                <Box mt={2}><Typography color='error'>{this.state.error}</Typography></Box>
              : null}
            </>
          :
            <InviteLinks links={created.links} seat={created.seat} />
          }
        </DialogContent>
        <DialogActions>
          <Button onClick={() => this.close()}><Trans>Cancel</Trans></Button>
          {created === null ?
            <Button color='primary' variant='contained' disabled={this.state.creating} onClick={() => this.create()}>
              <Trans>Create game</Trans>
            </Button>
          :
            <Button color='primary' variant='contained' onClick={() => this.openGame()}>
              <Trans>Go to game</Trans>
            </Button>
          }
        </DialogActions>
      </Dialog>
    );
  }
}

export default withMobileDialog()(withRouter(NewOnlineGameDialog));
