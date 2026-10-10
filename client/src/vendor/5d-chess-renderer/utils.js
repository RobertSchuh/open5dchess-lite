import deepcopy from 'deepcopy';

export const pieceObjectKey = (pieceObject) => {
  return `${pieceObject.player}${pieceObject.piece}_${pieceObject.position.timeline}_${pieceObject.position.player}${pieceObject.position.turn}_${pieceObject.position.coordinate}_${pieceObject.hasMoved}`;
}

export const squareObjectKey = (squareObject) => {
  return `${squareObject.timeline}_${squareObject.player}${squareObject.turn}_${squareObject.coordinate}`;
}

export const arrowObjectKey = (arrowObject) => {
  return `${arrowObject.type}_${arrowObject.split}_${squareObjectKey(arrowObject.start)}_${arrowObject.middle === null ? null : squareObjectKey(arrowObject.middle)}_${squareObjectKey(arrowObject.end)}`;
}

export const turnObjectKey = (turnObject) => {
  return `${turnObject.turn}_${turnObject.player}_${turnObject.timeline}`;
}

export const transformBoard = (boardObject, checkObjects) => {
  //Add ghost boards and indicate inactive / present / check status
  var res = deepcopy(boardObject);
  var checkPositions = [];
  if(Array.isArray(checkObjects)){
    for(var i = 0 ;i < checkObjects.length;i++) {
      if(checkObjects[i].start) { checkPositions.push(checkObjects[i].start); }
      if(checkObjects[i].end) { checkPositions.push(checkObjects[i].end); }
      //if(checkObjects[i].realEnd) { checkPositions.push(checkObjects[i].realEnd); }
    }
  }

  for(var l = 0;l < res.timelines.length;l++) {
    var isActive = res.timelines[l].active;
    var isPresent = res.timelines[l].present;
    var maxTurn = Number.NEGATIVE_INFINITY;
    var maxPlayer = 'white';
    var maxIndex = -1;
    for(var t = 0;t < res.timelines[l].turns.length;t++) {
      res.timelines[l].turns[t].active = isActive;
      res.timelines[l].turns[t].present = false;
      res.timelines[l].turns[t].check = checkPositions.filter(c => {
        return (
          c.timeline === res.timelines[l].timeline &&
          c.turn === res.timelines[l].turns[t].turn &&
          c.player === res.timelines[l].turns[t].player
        );
      }).length > 0;
      res.timelines[l].turns[t].ghost = false;
      if(
        maxTurn < res.timelines[l].turns[t].turn ||
        (maxTurn === res.timelines[l].turns[t].turn && maxPlayer === 'white' && res.timelines[l].turns[t].player === 'black')
      ) {
        maxTurn = res.timelines[l].turns[t].turn;
        maxPlayer = res.timelines[l].turns[t].player;
        maxIndex = t;
      }
    }

    //Modify latest board
    if(maxIndex >= 0) {
      res.timelines[l].turns[maxIndex].present = isPresent;

      //Create and add ghost
      var ghostTurn = deepcopy(res.timelines[l].turns[maxIndex]);
      ghostTurn.present = false;
      ghostTurn.ghost = true;
      if(ghostTurn.player === 'white') {
        ghostTurn.player = 'black';
      }
      else {
        ghostTurn.player = 'white';
        ghostTurn.turn++;
      }
      for(var p = 0;p < ghostTurn.pieces.length;p++) {
        ghostTurn.pieces[p].position.player = ghostTurn.player;
        ghostTurn.pieces[p].position.turn = ghostTurn.turn;
      }
      ghostTurn.check = checkPositions.filter(c => {
        return (
          c.timeline === res.timelines[l].timeline &&
          c.turn === ghostTurn.turn &&
          c.player === ghostTurn.player
        );
      }).length > 0;
      //Show only on timelines needing moves (or in check)
      if(res.player === maxPlayer || ghostTurn.check) {
        res.timelines[l].turns.push(ghostTurn);
      }
    }
  }
  return res;
}

export const transformMoves = (movesObjects, merge = true) => {
  //Merge promotion together
  var res = deepcopy(movesObjects);

  for(var i = 0;i < res.length;i++) {
    if(res[i].promotion !== null) {
      if(merge) {
        res[i].promotion = [res[i].promotion];
      }
      for(var j = i + 1;j < res.length;j++) {
        if(
          squareObjectKey(res[i].start) === squareObjectKey(res[j].start) &&
          squareObjectKey(res[i].end) === squareObjectKey(res[j].end) &&
          res[j].promotion !== null
        ) {
          if(merge) {
            res[i].promotion.push(res[j].promotion);
          }
          res.splice(j, 1);
          j--;
        }
      }
    }
  }
  return res;
}

export const isCapturingMove = (boardObject, moveObject) => {
  if(typeof moveObject.enPassant === 'object' && moveObject.enPassant !== null) {
    return true;
  }
  for(var l = 0;l < boardObject.timelines.length;l++) {
    for(var t = 0;boardObject.timelines[l].timeline === moveObject.end.timeline && t < boardObject.timelines[l].turns.length;t++) {
      for(var p = 0;boardObject.timelines[l].turns[t].turn === moveObject.end.turn && boardObject.timelines[l].turns[t].player === moveObject.end.player && p < boardObject.timelines[l].turns[t].pieces.length;p++) {
        if(squareObjectKey(boardObject.timelines[l].turns[t].pieces[p].position) === squareObjectKey(moveObject.end)) {
          return true;
        }
      }
    }
  }
  return false;
}

export const presentTurn = (boardObject) => {
  var minTurn = Number.POSITIVE_INFINITY;
  var minTurnPlayer = 'black';
  //Extract turn coord where the present is located
  for(var l = 0;l < boardObject.timelines.length;l++) {
    var currTimeline = boardObject.timelines[l];
    if(currTimeline.active) {
      var maxTurn = 0;
      var maxTurnPlayer = 'white';
      for(var t = 0;t < currTimeline.turns.length;t++) {
        if(!currTimeline.turns[t].ghost) {
          if(maxTurn < currTimeline.turns[t].turn) {
            maxTurn = currTimeline.turns[t].turn;
            maxTurnPlayer = currTimeline.turns[t].player;
          }
          if(maxTurn === currTimeline.turns[t].turn && maxTurnPlayer === 'white' && currTimeline.turns[t].player === 'black') {
            maxTurnPlayer = currTimeline.turns[t].player;
          }
        }
      }
      if(maxTurn < minTurn) {
        minTurn = maxTurn;
        minTurnPlayer = maxTurnPlayer;
      }
      if(minTurn === maxTurn && maxTurnPlayer === 'white' && minTurnPlayer === 'black') {
        minTurnPlayer = maxTurnPlayer;
      }
    }
  }
  return {
    turn: minTurn,
    player: minTurnPlayer
  };
}