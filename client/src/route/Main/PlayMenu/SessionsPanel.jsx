import React from 'react';
import { withRouter } from 'react-router';

import { Trans } from '@lingui/macro';

import Accordion from '@material-ui/core/Accordion';
import AccordionDetails from '@material-ui/core/AccordionDetails';
import AccordionSummary from '@material-ui/core/AccordionSummary';
import Box from '@material-ui/core/Box';
import Button from '@material-ui/core/Button';
import Grid from '@material-ui/core/Grid';
import Typography from '@material-ui/core/Typography';

import ExpandMoreIcon from '@material-ui/icons/ExpandMore';

import SessionCard from 'components/SessionCard';

import EmitterContext from 'utils/EmitterContext';
import * as sessions from 'network/sessions';
import * as online from 'network/online';

const agoText = (ts) => {
  const mins = Math.round((Date.now() - ts) / 60000);
  if(mins < 1) { return 'just now'; }
  if(mins < 60) { return `${mins} min ago`; }
  return `${Math.round(mins / 60)} h ago`;
};

class SessionsPanel extends React.Component {
  static contextType = EmitterContext;
  state = {
    sessionRequests: [],
    currentSessions: [],
    pastSessions: [],
    onlineGames: []
  };
  async refresh() {
    let sessionData = await sessions.getSessions();
    sessionData.onlineGames = online.listGames();
    this.setState(sessionData);
  }
  componentDidMount() {
    this.refresh();
    //Update state if session store is changed
    this.sessionListener = this.context.on('sessionsUpdate', () => {
      this.refresh();
    });
    //Update state if interval triggered
    this.sessionRefreshInterval = window.setInterval(this.refresh.bind(this), 2500);
  }
  componentWillUnmount() {
    //Stop listening to session store changes
    if(typeof this.sessionListener === 'function') { this.sessionListener(); }
    window.clearInterval(this.sessionRefreshInterval);
  }
  open(game) {
    const i = game.myLink.indexOf('#');
    if(i >= 0) { this.props.history.push(game.myLink.slice(i + 1)); }
  }
  onlineLabel(game) {
    const variant = (game.variant || 'standard').replace(/_/g, ' ');
    const seat = game.seat && game.seat !== 'spectator' ? ` as ${game.seat}` : (game.seat === 'spectator' ? ' (spectating)' : '');
    return `${variant}${seat}`;
  }
  render() {
    return (
      <>
        <Accordion defaultExpanded>
          <AccordionSummary
            expandIcon={<ExpandMoreIcon />}
          >
            <Typography>
              <Trans>Online Games</Trans>
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            {this.state.onlineGames.length > 0 ?
              <Grid container spacing={1}>
                {this.state.onlineGames.map((game) => (
                  <Grid key={game.gameId} item xs={12}>
                    <Button fullWidth variant='outlined' style={{ textTransform: 'none', justifyContent: 'space-between' }} onClick={() => this.open(game)}>
                      <span>{this.onlineLabel(game)}</span>
                      <Typography variant='caption' color='textSecondary' component='span'>
                        {game.endedAt ? <Trans>ended</Trans> : agoText(game.lastSeen)}
                      </Typography>
                    </Button>
                  </Grid>
                ))}
              </Grid>
            :
              <Box>
                <Typography>
                  <Trans>No online games...</Trans>
                </Typography>
                <Typography variant='caption' color='textSecondary'>
                  <Trans>Games you open on this device show up here while the server keeps them.</Trans>
                </Typography>
              </Box>
            }
          </AccordionDetails>
        </Accordion>
        <Accordion defaultExpanded>
          <AccordionSummary
            expandIcon={<ExpandMoreIcon />}
          >
            <Typography>
              <Trans>Local Games</Trans>
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            {this.state.currentSessions.length > 0 ?
              <Grid container spacing={2}>
                {this.state.currentSessions.map((session, i) => (
                  <Grid key={i} item xs={12}>
                    <SessionCard flat session={session} />
                  </Grid>
                ))}
              </Grid>
            :
              <Typography>
                <Trans>No ongoing games...</Trans>
              </Typography>
            }
          </AccordionDetails>
        </Accordion>
        <Accordion defaultExpanded>
          <AccordionSummary
            expandIcon={<ExpandMoreIcon />}
          >
            <Typography>
              <Trans>Past Local Games</Trans>
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            {this.state.pastSessions.length > 0 ?
              <Grid container spacing={2}>
                {this.state.pastSessions.map((session, i) => (
                  <Grid key={i} item xs={12}>
                    <SessionCard flat session={session} />
                  </Grid>
                ))}
              </Grid>
            :
              <Typography>
                <Trans>No past games...</Trans>
              </Typography>
            }
          </AccordionDetails>
        </Accordion>
      </>
    );
  }
}

export default withRouter(SessionsPanel);
