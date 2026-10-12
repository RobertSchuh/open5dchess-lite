import React from 'react';
import { withRouter } from 'react-router';

import { Trans } from '@lingui/macro';

import Box from '@material-ui/core/Box';
import Button from '@material-ui/core/Button';
import Card from '@material-ui/core/Card';
import Grid from '@material-ui/core/Grid';
import MuiLink from '@material-ui/core/Link';
import Typography from '@material-ui/core/Typography';

import ChessClock from '5d-chess-clock';

import QuickPlayOptions from 'route/Main/PlayMenu/QuickPlayMenu/QuickPlayOptions';
import SessionsPanel from 'route/Main/PlayMenu/SessionsPanel';

import EmitterContext from 'utils/EmitterContext';
import * as settings from 'state/settings';
import * as sessions from 'network/sessions';
import * as online from 'network/online';

class PlayMenu extends React.Component {
  static contextType = EmitterContext;
  //'daily' has no starting time, which the server's clock doesn't support
  formats = new ChessClock().formats.filter((f) => f.shortName !== 'daily');
  state = {
    creating: false,
    error: null,
  };
  //Both buttons read the settings shown on this page (persisted in the
  //browser's local storage, like all other settings).
  async onOnline() {
    const q = settings.get().quickPlay;
    const format = this.formats.find((f) => f.shortName === q.formats[0]);
    this.setState({ creating: true, error: null });
    try {
      const res = await online.createGame({
        variant: q.variants[0] || 'standard',
        timeControl: format ? format.format : null,
        creatorColor: q.color || 'white',
        nickname: q.nickname || null,
      });
      //Straight to the game page; it shows the invite links dialog there
      const link = res.links[res.seat];
      this.props.history.push(link.slice(link.indexOf('#') + 1));
    }
    catch(err) {
      this.setState({ error: err.message, creating: false });
    }
  }
  async onLocal() {
    const q = settings.get().quickPlay;
    const format = q.formats[0];
    let newSession = await sessions.createSession(
      false,
      q.variants[0] || 'standard',
      !format || format === 'none' ? null : format,
      'white',
      false,
      this.context
    );
    this.props.history.push('/play?id=' + newSession.id);
  }
  render() {
    return (
      <Box m={2}>
        <Grid container spacing={2}>
          <Grid item xs={12} md={8}>
            <Card>
              <Box p={1}>
                <Box p={1} display='flex' style={{ gap: 8 }} height={110}>
                  <Button
                    color='primary'
                    variant='contained'
                    disabled={this.state.creating}
                    style={{ width: '50%', height: '100%' }}
                    onClick={() => { this.onOnline(); }}
                  >
                    <Trans>Online Play</Trans>
                  </Button>
                  <Button
                    color='default'
                    variant='outlined'
                    style={{ width: '50%', height: '100%' }}
                    onClick={() => { this.onLocal(); }}
                  >
                    <Trans>Local Play</Trans>
                  </Button>
                </Box>
                <Box p={1} pt={0}>
                  <QuickPlayOptions />
                </Box>
                <Box p={1} pt={0}>
                  <Typography variant='caption' color='textSecondary'>
                    <Trans>Online games need no account: creating one gives you invite links for your opponent and for spectators. Games are kept in memory only and are deleted an hour after they end. Colour and name only apply to online games.</Trans>
                  </Typography>
                </Box>
                {this.state.error ?
                  <Box p={1} pt={0}><Typography color='error'>{this.state.error}</Typography></Box>
                : null}
              </Box>
            </Card>
          </Grid>
          <Grid item xs={12} md={4}>
            <SessionsPanel />
          </Grid>
          <Grid item xs={12}>
            <Typography variant='caption' color='textSecondary' component='div' align='center'>
              Chess In 5D Lite is a trimmed fork of{' '}
              <MuiLink color='inherit' underline='always' href='https://gitlab.com/alexbay218/chess-in-5d' target='_blank' rel='noopener'>Chess In 5D</MuiLink>
              {' '}by Shaun Wu (AGPL-3.0) · inspired by{' '}
              <MuiLink color='inherit' underline='always' href='https://www.5dchesswithmultiversetimetravel.com/' target='_blank' rel='noopener'>5D Chess With Multiverse Time Travel</MuiLink>
              {' '}by Thunkspace
            </Typography>
          </Grid>
        </Grid>
      </Box>
    );
  }
}

export default withRouter(PlayMenu);
