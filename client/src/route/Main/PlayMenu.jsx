import React from 'react';
import { withRouter } from 'react-router';

import { Trans } from '@lingui/macro';

import Accordion from '@material-ui/core/Accordion';
import AccordionDetails from '@material-ui/core/AccordionDetails';
import AccordionSummary from '@material-ui/core/AccordionSummary';
import Box from '@material-ui/core/Box';
import Button from '@material-ui/core/Button';
import Card from '@material-ui/core/Card';
import Grid from '@material-ui/core/Grid';
import Typography from '@material-ui/core/Typography';

import ExpandMoreIcon from '@material-ui/icons/ExpandMore';

import QuickPlayOptions from 'route/Main/PlayMenu/QuickPlayMenu/QuickPlayOptions';
import NewOnlineGameDialog from 'route/Main/PlayMenu/NewOnlineGameDialog';
import SessionsPanel from 'route/Main/PlayMenu/SessionsPanel';

import EmitterContext from 'utils/EmitterContext';
import * as settings from 'state/settings';
import * as sessions from 'network/sessions';

class PlayMenu extends React.Component {
  static contextType = EmitterContext;
  state = {
    onlineOpen: false
  };
  async onLocal() {
    let quickPlay = settings.get().quickPlay;
    let format = quickPlay.formats[0];
    let newSession = await sessions.createSession(
      false,
      quickPlay.variants[0] || 'standard',
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
                <NewOnlineGameDialog
                  open={this.state.onlineOpen}
                  onClose={() => this.setState({ onlineOpen: false })}
                />
                <Box p={1} display='flex' style={{ gap: 8 }} height={110}>
                  <Button
                    color='primary'
                    variant='contained'
                    style={{ width: '50%', height: '100%' }}
                    onClick={() => { this.setState({ onlineOpen: true }); }}
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
                  <Typography variant='caption' color='textSecondary'>
                    <Trans>Online games need no account: creating one gives you invite links for your opponent and for spectators.</Trans>
                  </Typography>
                </Box>
                <Box p={1}>
                  <Accordion elevation={0}>
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                      <Typography><Trans>Options</Trans></Typography>
                    </AccordionSummary>
                    <AccordionDetails>
                      <QuickPlayOptions />
                    </AccordionDetails>
                  </Accordion>
                </Box>
              </Box>
            </Card>
          </Grid>
          <Grid item xs={12} md={4}>
            <SessionsPanel />
          </Grid>
        </Grid>
      </Box>
    );
  }
}

export default withRouter(PlayMenu);
