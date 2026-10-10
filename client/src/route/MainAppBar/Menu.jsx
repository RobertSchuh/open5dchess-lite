import React from 'react';

import { withRouter } from "react-router";

import { Trans } from '@lingui/macro';

import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemIcon from '@material-ui/core/ListItemIcon';
import ListItemText from '@material-ui/core/ListItemText';

import { GiPawn } from 'react-icons/gi';
import TimelineIcon from '@material-ui/icons/Timeline';
import SettingsIcon from '@material-ui/icons/Settings';

class Menu extends React.Component {
  render() {
    return (
      <List>
        <ListItem
          button
          onClick={() => {
            this.props.history.push('/');
            this.props.onClose();
          }}
        >
          <ListItemIcon>
            <GiPawn size={24} />
          </ListItemIcon>
          <ListItemText>
            <Trans>Play</Trans>
          </ListItemText>
        </ListItem>
        <ListItem
          button
          onClick={() => {
            this.props.history.push('/analyze-menu');
            this.props.onClose();
          }}
        >
          <ListItemIcon>
            <TimelineIcon />
          </ListItemIcon>
          <ListItemText>
            <Trans>Analyze</Trans>
          </ListItemText>
        </ListItem>
        <ListItem
          button
          onClick={() => {
            this.props.history.push('/settings');
            this.props.onClose();
          }}
        >
          <ListItemIcon>
            <SettingsIcon />
          </ListItemIcon>
          <ListItemText>
            <Trans>Settings</Trans>
          </ListItemText>
        </ListItem>
      </List>
    );
  }
}

export default withRouter(Menu);
