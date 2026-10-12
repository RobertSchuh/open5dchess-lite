import React from 'react';

import { Trans } from '@lingui/macro';

import Box from '@material-ui/core/Box';
import FormControl from '@material-ui/core/FormControl';
import InputLabel from '@material-ui/core/InputLabel';
import MenuItem from '@material-ui/core/MenuItem';
import Select from '@material-ui/core/Select';

import EmitterContext from 'utils/EmitterContext';
import * as crTexture from 'state/texture';

import defaultBB from 'assets/piece/default/black_bishop.png';
import defaultBW from 'assets/piece/default/black_brawn.png';
import defaultBC from 'assets/piece/default/black_common_king.png';
import defaultBD from 'assets/piece/default/black_dragon.png';
import defaultBK from 'assets/piece/default/black_king.png';
import defaultBN from 'assets/piece/default/black_knight.png';
import defaultBP from 'assets/piece/default/black_pawn.png';
import defaultBS from 'assets/piece/default/black_princess.png';
import defaultBQ from 'assets/piece/default/black_queen.png';
import defaultBR from 'assets/piece/default/black_rook.png';
import defaultBY from 'assets/piece/default/black_royal_queen.png';
import defaultBU from 'assets/piece/default/black_unicorn.png';
import defaultWB from 'assets/piece/default/white_bishop.png';
import defaultWW from 'assets/piece/default/white_brawn.png';
import defaultWC from 'assets/piece/default/white_common_king.png';
import defaultWD from 'assets/piece/default/white_dragon.png';
import defaultWK from 'assets/piece/default/white_king.png';
import defaultWN from 'assets/piece/default/white_knight.png';
import defaultWP from 'assets/piece/default/white_pawn.png';
import defaultWS from 'assets/piece/default/white_princess.png';
import defaultWQ from 'assets/piece/default/white_queen.png';
import defaultWR from 'assets/piece/default/white_rook.png';
import defaultWY from 'assets/piece/default/white_royal_queen.png';
import defaultWU from 'assets/piece/default/white_unicorn.png';























const keylist = [
  'blackP',
  'blackW',
  'blackB',
  'blackN',
  'blackR',
  'blackS',
  'blackQ',
  'blackK',
  'blackC',
  'blackY',
  'blackU',
  'blackD',
  'whiteP',
  'whiteW',
  'whiteB',
  'whiteN',
  'whiteR',
  'whiteS',
  'whiteQ',
  'whiteK',
  'whiteC',
  'whiteY',
  'whiteU',
  'whiteD'
];

/*
Props
 - emitter
 - onReset
*/
export class PieceSetList extends React.Component {
  static contextType = EmitterContext;
  state = {
    pieceSet: 'default'
  };
  async extractPieceSet() {
    let checkName = '';
    let isDifferent = false;
    for(let i = 0;!isDifferent && i < keylist.length;i++) {
      let currName = 'default';
      let currentTexture = await crTexture.get(keylist[i]);
      if(currentTexture !== null) {
        currName = currentTexture.name;
      }
      //Check if name is different (indicating different set)
      if(checkName.length <= 0) {
        checkName = currName;
      }
      if(checkName !== currName) {
        isDifferent = true;
      }
    }
    if(isDifferent) {
      this.setState({ pieceSet: 'custom' });
    }
    else {
      this.setState({ pieceSet: checkName });
    }
  }
  async updatePieceSet() {
    if(this.state.pieceSet === 'default') {
      let needsUpdate = false;
      for(let i = 0;!needsUpdate && i < keylist.length;i++) {
        if((await crTexture.get(keylist[i])) !== null) {
          needsUpdate = true;
        }
      }
      if(needsUpdate) {
        await crTexture.set('blackP', 'default', defaultBP);
        await crTexture.set('blackW', 'default', defaultBW);
        await crTexture.set('blackB', 'default', defaultBB);
        await crTexture.set('blackN', 'default', defaultBN);
        await crTexture.set('blackR', 'default', defaultBR);
        await crTexture.set('blackS', 'default', defaultBS);
        await crTexture.set('blackQ', 'default', defaultBQ);
        await crTexture.set('blackK', 'default', defaultBK);
        await crTexture.set('blackC', 'default', defaultBC);
        await crTexture.set('blackY', 'default', defaultBY);
        await crTexture.set('blackU', 'default', defaultBU);
        await crTexture.set('blackD', 'default', defaultBD);
        await crTexture.set('whiteP', 'default', defaultWP);
        await crTexture.set('whiteW', 'default', defaultWW);
        await crTexture.set('whiteB', 'default', defaultWB);
        await crTexture.set('whiteN', 'default', defaultWN);
        await crTexture.set('whiteR', 'default', defaultWR);
        await crTexture.set('whiteS', 'default', defaultWS);
        await crTexture.set('whiteQ', 'default', defaultWQ);
        await crTexture.set('whiteK', 'default', defaultWK);
        await crTexture.set('whiteC', 'default', defaultWC);
        await crTexture.set('whiteY', 'default', defaultWY);
        await crTexture.set('whiteU', 'default', defaultWU);
        await crTexture.set('whiteD', 'default', defaultWD);
        if(this.props.emitter !== null) {
          this.props.emitter.emit('textureUpdate');
        }
      }
    }
    else if(this.state.pieceSet !== 'custom') {
      if(this.state.pieceSet === 'california') {
        await crTexture.set('blackP', 'california', californiaBP);
        await crTexture.set('blackW', 'california', californiaBP);
        await crTexture.set('blackB', 'california', californiaBB);
        await crTexture.set('blackN', 'california', californiaBN);
        await crTexture.set('blackR', 'california', californiaBR);
        await crTexture.set('blackS', 'california', californiaBQ);
        await crTexture.set('blackQ', 'california', californiaBQ);
        await crTexture.set('blackK', 'california', californiaBK);
        await crTexture.set('blackC', 'california', californiaBK);
        await crTexture.set('blackY', 'california', californiaBQ);
        await crTexture.set('blackU', 'california', californiaBN);
        await crTexture.set('blackD', 'california', californiaBN);
        await crTexture.set('whiteP', 'california', californiaWP);
        await crTexture.set('whiteW', 'california', californiaWP);
        await crTexture.set('whiteB', 'california', californiaWB);
        await crTexture.set('whiteN', 'california', californiaWN);
        await crTexture.set('whiteR', 'california', californiaWR);
        await crTexture.set('whiteS', 'california', californiaWQ);
        await crTexture.set('whiteQ', 'california', californiaWQ);
        await crTexture.set('whiteK', 'california', californiaWK);
        await crTexture.set('whiteC', 'california', californiaWK);
        await crTexture.set('whiteY', 'california', californiaWQ);
        await crTexture.set('whiteU', 'california', californiaWN);
        await crTexture.set('whiteD', 'california', californiaWN);
      }
     
      else if(this.state.pieceSet === 'default_v2'){
        await crTexture.set('blackP', 'default_v2', default2BP);
        await crTexture.set('blackW', 'default_v2', default2BW);
        await crTexture.set('blackB', 'default_v2', default2BB);
        await crTexture.set('blackN', 'default_v2', default2BN);
        await crTexture.set('blackR', 'default_v2', default2BR);
        await crTexture.set('blackS', 'default_v2', default2BS);
        await crTexture.set('blackQ', 'default_v2', default2BQ);
        await crTexture.set('blackK', 'default_v2', default2BK);
        await crTexture.set('blackC', 'default_v2', default2BC);
        await crTexture.set('blackY', 'default_v2', default2BY);
        await crTexture.set('blackU', 'default_v2', default2BU);
        await crTexture.set('blackD', 'default_v2', default2BD);
        await crTexture.set('whiteP', 'default_v2', default2WP);
        await crTexture.set('whiteW', 'default_v2', default2WW);
        await crTexture.set('whiteB', 'default_v2', default2WB);
        await crTexture.set('whiteN', 'default_v2', default2WN);
        await crTexture.set('whiteR', 'default_v2', default2WR);
        await crTexture.set('whiteS', 'default_v2', default2WS);
        await crTexture.set('whiteQ', 'default_v2', default2WQ);
        await crTexture.set('whiteK', 'default_v2', default2WK);
        await crTexture.set('whiteC', 'default_v2', default2WC);
        await crTexture.set('whiteY', 'default_v2', default2WY);
        await crTexture.set('whiteU', 'default_v2', default2WU);
        await crTexture.set('whiteD', 'default_v2', default2WD);
      }
      if(this.props.emitter !== null) {
        this.props.emitter.emit('textureUpdate');
      }
    }
  }
  componentDidMount() {
    this.extractPieceSet();
    this.textureListener = this.context.on('textureUpdate', () => {
      this.extractPieceSet();
    });
  }
  async componentDidUpdate(prevProps, prevState) {
    if(prevState.pieceSet !== this.state.pieceSet) {
      await this.updatePieceSet();
    }
  }
  componentWillUnmount() {
    //Stop listening to texture changes
    if(typeof this.textureListener === 'function') { this.textureListener(); }
  }
  render(){
    return (
      <FormControl variant='outlined' fullWidth>
        <InputLabel><Trans>Piece Set</Trans></InputLabel>
        <Select
          value={this.state.pieceSet}
          onChange={(event) => {
            this.setState({ pieceSet: event.target.value });
          }}
          label={<Trans>Piece Set</Trans>}
        >
          <MenuItem value='default'>
            <Box display='flex'>
              <img alt='White Knight Piece' src={defaultWN} style={{ height: 40 }} />
              <img alt='Black Knight Piece' src={defaultBR} style={{ height: 40 }} />
              <Box ml={1} mt='auto' mb='auto' alignItems='center'>
                <i><Trans>Default</Trans></i>
              </Box>
            </Box>
          </MenuItem>
          {/* TODO Add piece palette option to allow tinting pieces
          */}
          <MenuItem disabled value='custom'>
            <i><Trans>Custom</Trans></i>
          </MenuItem>
        </Select>
      </FormControl>
    );
  }
}

export const resetPieceSet = async (emitter = null) => {
  await crTexture.set('blackP', 'default', defaultBP);
  await crTexture.set('blackW', 'default', defaultBW);
  await crTexture.set('blackB', 'default', defaultBB);
  await crTexture.set('blackN', 'default', defaultBN);
  await crTexture.set('blackR', 'default', defaultBR);
  await crTexture.set('blackS', 'default', defaultBS);
  await crTexture.set('blackQ', 'default', defaultBQ);
  await crTexture.set('blackK', 'default', defaultBK);
  await crTexture.set('blackC', 'default', defaultBC);
  await crTexture.set('blackY', 'default', defaultBY);
  await crTexture.set('blackU', 'default', defaultBU);
  await crTexture.set('blackD', 'default', defaultBD);
  await crTexture.set('whiteP', 'default', defaultWP);
  await crTexture.set('whiteW', 'default', defaultWW);
  await crTexture.set('whiteB', 'default', defaultWB);
  await crTexture.set('whiteN', 'default', defaultWN);
  await crTexture.set('whiteR', 'default', defaultWR);
  await crTexture.set('whiteS', 'default', defaultWS);
  await crTexture.set('whiteQ', 'default', defaultWQ);
  await crTexture.set('whiteK', 'default', defaultWK);
  await crTexture.set('whiteC', 'default', defaultWC);
  await crTexture.set('whiteY', 'default', defaultWY);
  await crTexture.set('whiteU', 'default', defaultWU);
  await crTexture.set('whiteD', 'default', defaultWD);
  if(emitter !== null) {
    emitter.emit('textureUpdate');
  }
}
