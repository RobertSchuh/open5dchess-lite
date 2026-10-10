import React from 'react';
import { Switch, Route, Redirect } from 'react-router-dom';

import Paper from '@material-ui/core/Paper';

import Analyze from 'route/Main/Analyze';
import AnalyzeMenu from 'route/Main/AnalyzeMenu';
import MainAppBar from 'route/MainAppBar';
import Play from 'route/Main/Play';
import OnlineGame from 'route/Main/OnlineGame';
import PlayMenu from 'route/Main/PlayMenu';
import Settings from 'route/Main/Settings';

export default class Main extends React.Component {
  backgroundRef = React.createRef();
  componentDidMount() {
    window.onresize = this.resizeBackground.bind(this);
    this.resizeBackground();
  }
  resizeBackground() {
    if(this.backgroundRef.current !== null) {
      this.backgroundRef.current.style.height = `${window.innerHeight}px`;
      this.backgroundRef.current.style.width = `${window.innerWidth}px`;
    }
  }
  render() {
    return (
      <>
        <Paper
          ref={this.backgroundRef}
          square
          variant='outlined'
          style={{
            position: 'fixed',
            zIndex: -100
          }}
        />
        <MainAppBar />
        <Switch>
          <Route exact path='/'>
            <PlayMenu />
          </Route>
          <Route path='/g/:id'>
            <OnlineGame />
          </Route>
          <Route path='/analyze'>
            <Analyze />
          </Route>
          <Route path='/analyze-menu'>
            <AnalyzeMenu />
          </Route>
          <Route path='/play'>
            <Play />
          </Route>
          <Route path='/play-menu'>
            <PlayMenu />
          </Route>
          <Route path='/settings'>
            <Settings />
          </Route>
          <Route>
            <Redirect to='/' />
          </Route>
        </Switch>
      </>
    );
  }
}
