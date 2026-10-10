import React from 'react';

import { Trans } from '@lingui/macro';

import Box from '@material-ui/core/Box';
import Button from '@material-ui/core/Button';
import TextField from '@material-ui/core/TextField';
import Typography from '@material-ui/core/Typography';

import copy from 'copy-to-clipboard';
import { withSnackbar } from 'notistack';

/*
Shows invite links with Copy and (on phones) Share buttons.
Props:
 - links: { white, black, spectate }
 - seat: the creator's colour; the other colour's link is the invite
*/
class InviteLinks extends React.Component {
  copyLink(link) {
    copy(link);
    this.props.enqueueSnackbar('Link copied', { variant: 'success', autoHideDuration: 1500 });
  }
  async shareLink(link, title) {
    try {
      await navigator.share({ title: title, text: 'Play 5D chess with me:', url: link });
    }
    catch(err) {
      //User cancelled the share sheet; nothing to do
    }
  }
  row(label, link, description) {
    const canShare = typeof navigator.share === 'function';
    return (
      <Box mb={2}>
        <Typography variant='subtitle2'>{label}</Typography>
        <Typography variant='caption' color='textSecondary'>{description}</Typography>
        <TextField
          fullWidth
          variant='outlined'
          size='small'
          value={link}
          InputProps={{ readOnly: true }}
          onFocus={(e) => e.target.select()}
        />
        <Box mt={1} display='flex' style={{ gap: 8 }}>
          <Button variant='contained' color='primary' onClick={() => this.copyLink(link)}>
            <Trans>Copy</Trans>
          </Button>
          {canShare ?
            <Button variant='outlined' onClick={() => this.shareLink(link, '5D chess invite')}>
              <Trans>Share</Trans>
            </Button>
          : null}
        </Box>
      </Box>
    );
  }
  render() {
    const links = this.props.links;
    if(!links) { return null; }
    const opponent = this.props.seat === 'white' ? 'black' : 'white';
    //Same seat as the invite link, as a plain-text page (rules + state + HTTP API) for AI agents
    const m = links[opponent].match(/^(.*)\/#\/g\/([\w-]+)\?seat=([\w-]+)$/);
    const aiLink = m ? `${m[1]}/api/games/${m[2]}/llm?seat=${m[3]}` : null;
    return (
      <Box>
        {this.row(
          opponent === 'white' ? <Trans>Invite link (opponent plays White)</Trans> : <Trans>Invite link (opponent plays Black)</Trans>,
          links[opponent],
          <Trans>Send this to your opponent. Anyone with it takes that seat, so only share it with them.</Trans>
        )}
        {aiLink ? this.row(
          <Trans>For an AI opponent</Trans>,
          aiLink,
          <Trans>Same seat as the invite link, as a text page with the rules, the boards and how to move over HTTP. With the open5dchess MCP tools, the normal invite link works too.</Trans>
        ) : null}
        {this.row(
          <Trans>Spectator link</Trans>,
          links.spectate,
          <Trans>Watch only.</Trans>
        )}
        {this.row(
          <Trans>Your own link</Trans>,
          links[this.props.seat],
          <Trans>Keep this to rejoin from another device.</Trans>
        )}
      </Box>
    );
  }
}

export default withSnackbar(InviteLinks);
