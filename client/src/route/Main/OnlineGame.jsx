import React from 'react';
import { withRouter } from 'react-router';

import { Trans } from '@lingui/macro';

import Box from '@material-ui/core/Box';
import Button from '@material-ui/core/Button';
import Chip from '@material-ui/core/Chip';
import CircularProgress from '@material-ui/core/CircularProgress';
import Dialog from '@material-ui/core/Dialog';
import DialogActions from '@material-ui/core/DialogActions';
import DialogContent from '@material-ui/core/DialogContent';
import DialogTitle from '@material-ui/core/DialogTitle';
import Paper from '@material-ui/core/Paper';
import Typography from '@material-ui/core/Typography';

import { withSnackbar } from 'notistack';

import Player from 'components/Player';
import InviteLinks from 'components/InviteLinks';
import OnlineGameManager from 'state/OnlineGameManager';
import EmitterContext from 'utils/EmitterContext';
import * as crConfig from 'state/config';
import * as online from 'network/online';

const RESULT_TEXT = {
  checkmate: 'by checkmate',
  stalemate: 'by stalemate',
  time: 'on time',
  resignation: 'by resignation',
};

//Online game page: /g/<gameId>?seat=<token>
class OnlineGame extends React.Component {
  static contextType = EmitterContext;
  state = {
    loading: true,
    error: null,
    connected: false,
    game: null,
    board: null,
    inviteOpen: false,
    resignOpen: false,
    barExpanded: null, //null = automatic (expanded until the game is underway)
  };
  componentDidMount() {
    const gameId = this.props.match.params.id;
    const seat = new URLSearchParams(this.props.location.search).get('seat');
    this.links = online.storedLinks(gameId);
    if(!seat) {
      this.setState({ loading: false, error: 'This link has no seat token.' });
      return;
    }
    this.manager = new OnlineGameManager(gameId, seat);
    this.listeners = [
      this.manager.on('onBoardUpdate', (board) => {
        this.setState(Object.assign({ board: board.board }, board));
      }),
      this.manager.on('onStateUpdate', (game) => {
        if(this.state.game === null) { this.onFirstState(game); }
        this.setState({ game: game, loading: false });
      }),
      this.manager.on('onClockUpdate', (clock) => {
        if(clock === null) { return; }
        this.setState({
          clockWhiteTimeLeft: clock.whiteDurationLeft,
          clockWhiteDelayLeft: clock.whiteDelayLeft,
          clockBlackTimeLeft: clock.blackDurationLeft,
          clockBlackDelayLeft: clock.blackDelayLeft,
        });
      }),
      this.manager.on('onConnection', (connected) => { this.setState({ connected: connected }); }),
      this.manager.on('onError', (message) => {
        if(this.state.game === null) { this.setState({ loading: false, error: message }); }
        else { this.props.enqueueSnackbar(message, { variant: 'warning', autoHideDuration: 2500, preventDuplicate: true }); }
      }),
    ];
    this.configListener = this.context.on('configUpdate', () => { this.manager.refreshBoard(); });
    this.manager.connect();
  }
  onFirstState(game) {
    //View the board from your own side
    if(game.you === 'white' || game.you === 'black') {
      const flip = game.you === 'black';
      crConfig.set({ board: { flipTimeline: flip, flipRank: flip, flipFile: flip } }, this.context);
    }
    //Creator waiting for the opponent: show the invite right away
    const opponent = game.you === 'white' ? 'black' : 'white';
    if(this.links && game.actionHistory.length === 0 && !game.players[opponent].connected) {
      this.setState({ inviteOpen: true });
    }
  }
  componentWillUnmount() {
    if(this.listeners) { this.listeners.forEach((off) => off()); }
    if(typeof this.configListener === 'function') { this.configListener(); }
    if(this.manager) { this.manager.destroy(); }
  }
  playerName(color) {
    const game = this.state.game;
    const p = game.players[color];
    let name = p.nickname || (color === 'white' ? 'White' : 'Black');
    if(game.you === color) { name += ' (you)'; }
    return name;
  }
  statusBar() {
    const game = this.state.game;
    const you = game.you;
    const isPlayer = you === 'white' || you === 'black';
    const opponent = you === 'white' ? 'black' : 'white';
    let text;
    if(game.result) {
      const r = game.result;
      text = r.winner === 'draw' ? `Draw ${RESULT_TEXT[r.reason] || ''}` : `${r.winner === 'white' ? 'White' : 'Black'} wins ${RESULT_TEXT[r.reason] || ''}`;
    }
    else if(!isPlayer) {
      text = 'Spectating';
    }
    else if(game.player === you) {
      text = 'Your move';
    }
    else {
      text = game.players[opponent].connected ? "Opponent's move" : "Opponent's move (not connected)";
    }
    //The game counts as underway once anything has been played or the
    //opponent has shown up; from then on the bar folds into a small pill
    //so it stops covering the board (tap to expand).
    const underway = game.actionHistory.length > 0 || game.players[opponent].connected;
    const expanded = this.state.barExpanded !== null ? this.state.barExpanded
      : (!underway || game.result !== null);
    //Below the app bar AND the Player view toolbar, so it never covers buttons
    const barStyle = { position: 'fixed', top: 132, left: '50%', transform: 'translateX(-50%)', zIndex: 1200, maxWidth: 'calc(100vw - 16px)' };
    const dot = (
      <span style={{
        display: 'inline-block', width: 10, height: 10, borderRadius: 5, flexShrink: 0,
        backgroundColor: this.state.connected ? '#2e7d32' : '#b26a00',
      }} />
    );
    if(!expanded) {
      return (
        <Paper elevation={4} style={barStyle} onClick={() => this.setState({ barExpanded: true })}>
          <Box px={1} py={0.25} display='flex' alignItems='center' style={{ gap: 6, cursor: 'pointer', opacity: 0.85 }}>
            {dot}
            <Typography variant='caption' style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{text}</Typography>
          </Box>
        </Paper>
      );
    }
    return (
      <Paper elevation={4} style={barStyle}>
        <Box px={1} py={0.5} display='flex' alignItems='center' flexWrap='wrap' style={{ gap: 8 }}>
          <Chip
            size='small'
            label={this.state.connected ? 'Online' : 'Reconnecting...'}
            style={{ backgroundColor: this.state.connected ? '#2e7d32' : '#b26a00', color: 'white' }}
          />
          <Typography variant='body2' style={{ fontWeight: 600 }}>{text}</Typography>
          <Box flexGrow={1} />
          {this.links ?
            <Button size='small' variant='outlined' onClick={() => this.setState({ inviteOpen: true })}>
              <Trans>Invite</Trans>
            </Button>
          : null}
          {isPlayer && !game.result ?
            <Button size='small' color='secondary' variant='outlined' onClick={() => this.setState({ resignOpen: true })}>
              <Trans>Resign</Trans>
            </Button>
          : null}
          {underway && game.result === null ?
            <Button size='small' onClick={() => this.setState({ barExpanded: false })}>
              <Trans>Hide</Trans>
            </Button>
          : null}
        </Box>
      </Paper>
    );
  }
  render() {
    if(this.state.error && this.state.game === null) {
      return (
        <Box display='flex' flexDirection='column' alignItems='center' my={5} mx={2}>
          <Typography>{this.state.error}</Typography>
          <Box mt={2}><Button variant='outlined' onClick={() => this.props.history.push('/')}><Trans>Back</Trans></Button></Box>
        </Box>
      );
    }
    if(this.state.loading || this.state.board === null) {
      return (
        <Box display='flex'>
          <Box mx='auto' my={5}>
            <CircularProgress size={120} thickness={3.3} disableShrink style={{ animationDuration: '2000ms' }} />
          </Box>
        </Box>
      );
    }
    const game = this.state.game;
    const result = game.result;
    return (
      <>
        {this.statusBar()}
        <Dialog open={this.state.inviteOpen} onClose={() => this.setState({ inviteOpen: false })} fullWidth maxWidth='sm'>
          <DialogTitle><Trans>Invite your opponent</Trans></DialogTitle>
          <DialogContent>
            <InviteLinks links={this.links} seat={game.you} />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => this.setState({ inviteOpen: false })}><Trans>Close</Trans></Button>
          </DialogActions>
        </Dialog>
        <Dialog open={this.state.resignOpen} onClose={() => this.setState({ resignOpen: false })}>
          <DialogTitle><Trans>Resign this game?</Trans></DialogTitle>
          <DialogActions>
            <Button onClick={() => this.setState({ resignOpen: false })}><Trans>Cancel</Trans></Button>
            <Button color='secondary' variant='contained' onClick={() => { this.manager.resign(); this.setState({ resignOpen: false }); }}>
              <Trans>Resign</Trans>
            </Button>
          </DialogActions>
        </Dialog>
        <Player
          board={this.state.board}
          actionHistory={this.state.actionHistory}
          moveBuffer={this.state.moveBuffer}
          checks={this.state.checks}
          availableMoves={this.state.availableMoves}
          legalPieces={this.state.legalPieces}
          pastAvailableMoves={this.state.pastAvailableMoves}
          onMove={(move) => { this.manager.move(move); }}
          submitCanUndo={this.state.undoable}
          submitCanSubmit={this.state.submittable}
          submitOnUndo={() => { this.manager.undo(); }}
          submitOnSubmit={() => { this.manager.submit(); }}
          notation={this.state.notation}
          statusWhitePlayerName={this.playerName('white')}
          statusWhitePlayerType='human'
          statusBlackPlayerName={this.playerName('black')}
          statusBlackPlayerType='human'
          hintsFor={game.you === 'white' || game.you === 'black' ? game.you : null}
          statusWhiteActive={this.state.player === 'white'}
          statusIsCheckmate={result !== null && result.reason === 'checkmate'}
          statusIsFlagged={result !== null && result.reason === 'time'}
          statusIsForfeit={result !== null && result.reason === 'resignation'}
          statusIsStalemate={result !== null && result.reason === 'stalemate'}
          statusIsDraw={false}
          statusIsCheck={Array.isArray(this.state.checks) && this.state.checks.length > 0}
          allowClock={game.clock !== null}
          clockActive={game.clock !== null && game.clock.running && result === null}
          clockWhiteTimeLeft={this.state.clockWhiteTimeLeft}
          clockWhiteDelayLeft={this.state.clockWhiteDelayLeft}
          clockBlackTimeLeft={this.state.clockBlackTimeLeft}
          clockBlackDelayLeft={this.state.clockBlackDelayLeft}
        />
      </>
    );
  }
}

export default withSnackbar(withRouter(OnlineGame));
