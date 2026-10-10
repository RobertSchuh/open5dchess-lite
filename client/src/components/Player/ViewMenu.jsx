import React from 'react';

import { Trans } from '@lingui/macro';

import Box from '@material-ui/core/Box';
import Button from '@material-ui/core/Button';
import ButtonGroup from '@material-ui/core/ButtonGroup';

import SwapVertIcon from '@material-ui/icons/SwapVert';
import SelectAllIcon from '@material-ui/icons/SelectAll';
import ZoomOutMapIcon from '@material-ui/icons/ZoomOutMap';
import EmojiObjectsIcon from '@material-ui/icons/EmojiObjects';

import EmitterContext from 'utils/EmitterContext';
import * as hints from 'state/hints';

import * as PIXI from 'pixi.js';

const widthThreshold = 400;
const heightThreshold = 50;
export default class ViewMenu extends React.Component {
  static contextType = EmitterContext;
  rootRef = React.createRef();
  state = {
    showText: true
  };
  resize() {
    if(this.rootRef.current) {
      var width = this.rootRef.current.getBoundingClientRect().width;
      var height = this.rootRef.current.getBoundingClientRect().height;
      this.setState({
        showText: width > widthThreshold && height > heightThreshold
      });
    }
  }
  componentDidMount() {
    this.resize();
    this.resizeListener = this.resize.bind(this);
    window.addEventListener('resize', this.resizeListener);
    //Listen to layout resize updates
    this.layoutListener = this.context.on('layoutResizeUpdate', this.resizeListener);
    //Re-render when the hint toggle changes (possibly from another component)
    this.configListener = this.context.on('configUpdate', () => { this.forceUpdate(); });
  }
  componentWillUnmount() {
    window.removeEventListener('resize', this.resizeListener);
    //Stop listening to layout resize updates
    if(typeof this.layoutListener === 'function') { this.layoutListener(); }
    if(typeof this.configListener === 'function') { this.configListener(); }
  }
  render() {
    return (
      <Box p={1} ref={this.rootRef} style={{ height: '100%' }}>
        <ButtonGroup className={PIXI.utils.isMobile.any ? 'RGL-Drag-Cancel' : ''} fullWidth style={{ height: '100%' }}>
          {this.props.hintsFor ?
            <Button
              //Legal move hints, only for the player given by hintsFor
              //(side to move in local games, your own seat online)
              color={hints.isOn(this.props.hintsFor) ? 'primary' : 'default'}
              variant={hints.isOn(this.props.hintsFor) ? 'contained' : undefined}
              startIcon={this.state.showText ? <EmojiObjectsIcon /> : null}
              onClick={() => { hints.toggle(this.props.hintsFor, this.context); }}
            >
              {this.state.showText ?
                <Trans>Hints</Trans>
              :
                <EmojiObjectsIcon />
              }
            </Button>
          : null}
          <Button
            startIcon={this.state.showText ? <SwapVertIcon /> : null}
            onClick={() => {
              if(typeof this.props.onFlip === 'function') {
                this.props.onFlip();
              }
            }}
          >
            {this.state.showText ?
              <Trans>Flip View</Trans>
            :
              <SwapVertIcon />
            }
          </Button>
          <Button
            startIcon={this.state.showText ? <SelectAllIcon /> : null}
            onClick={() => {
              if(typeof this.props.onPresentZoom === 'function') {
                this.props.onPresentZoom();
              }
            }}
          >
            {this.state.showText ?
              <Trans>Present</Trans>
            :
              <SelectAllIcon />
            }
          </Button>
          <Button
            startIcon={this.state.showText ? <ZoomOutMapIcon /> : null}
            onClick={() => {
              if(typeof this.props.onFullboardZoom === 'function') {
                this.props.onFullboardZoom();
              }
            }}
          >
            {this.state.showText ?
              <Trans>Full</Trans>
            :
              <ZoomOutMapIcon />
            }
          </Button>
        </ButtonGroup>
      </Box>
    );
  }
}
