import config from './config.js';
export const toWorldBorders = (global) => {
  var boardObj = global.boardObject;
  var minTimeline = Number.POSITIVE_INFINITY;
  var maxTimeline = Number.NEGATIVE_INFINITY;
  var minTurn = Number.POSITIVE_INFINITY;
  var minTurnPlayer = 'black';
  var maxTurn = Number.NEGATIVE_INFINITY;
  var maxTurnPlayer = 'white';

  //Find min and max
  for(var i = 0;i < boardObj.timelines.length;i++) {
    var currTimeline = boardObj.timelines[i];
    if(minTimeline > currTimeline.timeline) { minTimeline = currTimeline.timeline; }
    if(maxTimeline < currTimeline.timeline) { maxTimeline = currTimeline.timeline; }
    for(var j = 0;j < currTimeline.turns.length;j++) {
      var currTurn = currTimeline.turns[j];
      //Skip ghost boards
      if(!currTurn.ghost || (currTurn.ghost && global.configStore.get('board').showGhost)) {
        if(minTurn > currTurn.turn) { 
          minTurn = currTurn.turn;
          minTurnPlayer = currTurn.player;
        }
        else if(minTurn === currTurn.turn && minTurnPlayer === 'black' && currTurn.player === 'white') {
          minTurnPlayer = currTurn.player;
        }
        if(maxTurn < currTurn.turn) {
          maxTurn = currTurn.turn;
          maxTurnPlayer = currTurn.player;
        }
        else if(maxTurn === currTurn.turn && maxTurnPlayer === 'white' && currTurn.player === 'black') {
          maxTurnPlayer = currTurn.player;
        }
      }
    }
  }

  var res = {
    x: Number.POSITIVE_INFINITY,
    y: Number.POSITIVE_INFINITY,
    width: Number.NEGATIVE_INFINITY,
    height: Number.NEGATIVE_INFINITY,
    center: {
      x: 0,
      y: 0
    }
  };
  var minCoords = toCoordinates({
    timeline: minTimeline,
    turn: minTurn,
    player: minTurnPlayer,
    coordinate: 'a1',
    rank: 1,
    file: 1
  }, global);
  var maxCoords = toCoordinates({
    timeline: maxTimeline,
    turn: maxTurn,
    player: maxTurnPlayer,
    coordinate: 'a1',
    rank: 1,
    file: 1
  }, global);

  //Figure out which coords are the real world border
  res.x = Math.min(res.x, minCoords.boardWithMargins.x);
  res.x = Math.min(res.x, minCoords.boardWithMargins.x + minCoords.boardWithMargins.width);
  res.x = Math.min(res.x, maxCoords.boardWithMargins.x);
  res.x = Math.min(res.x, maxCoords.boardWithMargins.x + maxCoords.boardWithMargins.width);
  res.y = Math.min(res.y, minCoords.boardWithMargins.y);
  res.y = Math.min(res.y, minCoords.boardWithMargins.y + minCoords.boardWithMargins.height);
  res.y = Math.min(res.y, maxCoords.boardWithMargins.y);
  res.y = Math.min(res.y, maxCoords.boardWithMargins.y + maxCoords.boardWithMargins.height);
  res.width = Math.max(res.width, minCoords.boardWithMargins.x);
  res.width = Math.max(res.width, minCoords.boardWithMargins.x + minCoords.boardWithMargins.width);
  res.width = Math.max(res.width, maxCoords.boardWithMargins.x);
  res.width = Math.max(res.width, maxCoords.boardWithMargins.x + maxCoords.boardWithMargins.width);
  res.height = Math.max(res.height, minCoords.boardWithMargins.y);
  res.height = Math.max(res.height, minCoords.boardWithMargins.y + minCoords.boardWithMargins.height);
  res.height = Math.max(res.height, maxCoords.boardWithMargins.y);
  res.height = Math.max(res.height, maxCoords.boardWithMargins.y + maxCoords.boardWithMargins.height);

  //Turn coords into actual width or height
  res.width = res.width - res.x;
  res.height = res.height - res.y;

  //Calculate center coordinates
  res.center.x = res.x + (res.width / 2);
  res.center.y = res.y + (res.height / 2);
  return res;
}

export const toCoordinates = (positionObj, global) => {
  var coordinateOptions = {
    boardWidth: global.boardObject ? global.boardObject.width : 8,
    boardHeight: global.boardObject ? global.boardObject.height : 8,
    twoTimeline: false,
  };
  var res = {
    board: {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      center: {
        x: 0,
        y: 0
      }
    },
    boardWithMargins: {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      center: {
        x: 0,
        y: 0
      }
    },
    square: {
      x: 0,
      y: 0,
      width: global.configStore.get('square').width,
      height: global.configStore.get('square').height,
      center: {
        x: 0,
        y: 0
      }
    }
  };

  //Adjust y coordinate from timeline (allow two timeline)
  //Flip if necessary
  var newTimeline = 0;
  if(global.configStore.get('board').flipTimeline) {
    newTimeline = -positionObj.timeline;
    if(coordinateOptions.twoTimeline && positionObj.timeline < 0) {
      newTimeline = positionObj.timeline + 1;
    }
  }
  else {
    newTimeline = positionObj.timeline;
    if(coordinateOptions.twoTimeline && positionObj.timeline > 0) {
      newTimeline = positionObj.timeline - 1;
    }
  }

  //Get y coordinate from timeline
  res.board.height = coordinateOptions.boardHeight * global.configStore.get('square').height;
  res.boardWithMargins.height = res.board.height + (global.configStore.get('board').marginHeight * 2);
  res.boardWithMargins.y = newTimeline * res.boardWithMargins.height;
  res.board.y = res.boardWithMargins.y + global.configStore.get('board').marginHeight;
  res.board.center.y = (res.board.y - res.board.height) / 2;
  res.boardWithMargins.center.y = res.boardWithMargins.y + (res.boardWithMargins.height / 2);
  
  //Adjust x coordinate from turn
  //Flip if necessary
  var newTurn = 0;
  if(global.configStore.get('board').showWhite && global.configStore.get('board').showBlack) {
    if(global.configStore.get('board').flipTurn) {
      newTurn = -2 * (positionObj.turn - 1);
      if(positionObj.player === 'black') {
        newTurn -= 1;
      }
    }
    else {
      newTurn = 2 * (positionObj.turn - 1);
      if(positionObj.player === 'black') {
        newTurn += 1;
      }
    }
  }
  else {
    if(global.configStore.get('board').flipTurn) {
      newTurn = -1 * (positionObj.turn - 1);
    }
    else {
      newTurn = positionObj.turn - 1;
    }
  }

  //Get x coordinate from turn
  res.board.width = coordinateOptions.boardWidth * global.configStore.get('square').width;
  res.boardWithMargins.width = res.board.width + (global.configStore.get('board').marginWidth * 2);
  res.boardWithMargins.x = newTurn * res.boardWithMargins.width;
  res.board.x = res.boardWithMargins.x + global.configStore.get('board').marginWidth;
  res.board.center.x = (res.board.x + res.board.width) / 2;
  res.boardWithMargins.center.x = res.boardWithMargins.x + (res.boardWithMargins.width / 2);
  
  //Adjust y coordinate from rank
  //Flip if necessary
  var newRank = 0;
  if(global.configStore.get('board').flipRank) {
    newRank = positionObj.rank - 1;
  }
  else {
    newRank = coordinateOptions.boardHeight - positionObj.rank;
  }

  //Get y coordinate from rank
  res.square.y = res.board.y + (newRank * global.configStore.get('square').height);
  res.square.center.y = res.square.y + (res.square.height / 2);
  
  //Adjust x coordinate from file
  //Flip if necessary
  var newFile = 0;
  if(global.configStore.get('board').flipFile) {
    newFile = coordinateOptions.boardWidth - positionObj.file;
  }
  else {
    newFile = positionObj.file - 1;
  }

  //Get x coordinate from file
  res.square.x = res.board.x + (newFile * global.configStore.get('square').width);
  res.square.center.x = res.square.x + (res.square.width / 2);

  return res;
}

export const copy = (coordinates) => {
  return {
    board: {
      x: coordinates.board.x,
      y: coordinates.board.y,
      width: coordinates.board.width,
      height: coordinates.board.height,
      center: {
        x: coordinates.board.center.x,
        y: coordinates.board.center.y
      }
    },
    boardWithMargins: {
      x: coordinates.boardWithMargins.x,
      y: coordinates.boardWithMargins.y,
      width: coordinates.boardWithMargins.width,
      height: coordinates.boardWithMargins.height,
      center: {
        x: coordinates.boardWithMargins.center.x,
        y: coordinates.boardWithMargins.center.y
      }
    },
    square: {
      x: coordinates.square.x,
      y: coordinates.square.y,
      width: coordinates.square.width,
      height: coordinates.square.height,
      center: {
        x: coordinates.square.center.x,
        y: coordinates.square.center.y
      }
    }
  };
}

export const compare = (coordinates1, coordinates2) => {
  if(typeof coordinates1 === 'undefined') {
    if(typeof coordinates2 === 'undefined') {
      return 0;
    }
    return 1;
  }
  if(typeof coordinates2 === 'undefined') {
    return -1;
  }
  if(coordinates1.board.x !== coordinates2.board.x) { return coordinates1.board.x - coordinates2.board.x; }
  if(coordinates1.board.y !== coordinates2.board.y) { return coordinates1.board.y - coordinates2.board.y; }
  if(coordinates1.board.width !== coordinates2.board.width) { return coordinates1.board.width - coordinates2.board.width; }
  if(coordinates1.board.height !== coordinates2.board.height) { return coordinates1.board.height - coordinates2.board.height; }
  if(coordinates1.board.center.x !== coordinates2.board.center.x) { return coordinates1.board.center.x - coordinates2.board.center.x; }
  if(coordinates1.board.center.y !== coordinates2.board.center.y) { return coordinates1.board.center.y - coordinates2.board.center.y; }
  if(coordinates1.boardWithMargins.x !== coordinates2.boardWithMargins.x) { return coordinates1.boardWithMargins.x - coordinates2.boardWithMargins.x; }
  if(coordinates1.boardWithMargins.y !== coordinates2.boardWithMargins.y) { return coordinates1.boardWithMargins.y - coordinates2.boardWithMargins.y; }
  if(coordinates1.boardWithMargins.width !== coordinates2.boardWithMargins.width) { return coordinates1.boardWithMargins.width - coordinates2.boardWithMargins.width; }
  if(coordinates1.boardWithMargins.height !== coordinates2.boardWithMargins.height) { return coordinates1.boardWithMargins.height - coordinates2.boardWithMargins.height; }
  if(coordinates1.boardWithMargins.center.x !== coordinates2.boardWithMargins.center.x) { return coordinates1.boardWithMargins.center.x - coordinates2.boardWithMargins.center.x; }
  if(coordinates1.boardWithMargins.center.y !== coordinates2.boardWithMargins.center.y) { return coordinates1.boardWithMargins.center.y - coordinates2.boardWithMargins.center.y; }
  if(coordinates1.square.x !== coordinates2.square.x) { return coordinates1.square.x - coordinates2.square.x; }
  if(coordinates1.square.y !== coordinates2.square.y) { return coordinates1.square.y - coordinates2.square.y; }
  if(coordinates1.square.width !== coordinates2.square.width) { return coordinates1.square.width - coordinates2.square.width; }
  if(coordinates1.square.height !== coordinates2.square.height) { return coordinates1.square.height - coordinates2.square.height; }
  if(coordinates1.square.center.x !== coordinates2.square.center.x) { return coordinates1.square.center.x - coordinates2.square.center.x; }
  if(coordinates1.square.center.y !== coordinates2.square.center.y) { return coordinates1.square.center.y - coordinates2.square.center.y; }
  return 0;
}

export const compareWorldBorders = (coordinates1, coordinates2) => {
  if(typeof coordinates1 === 'undefined') {
    if(typeof coordinates2 === 'undefined') {
      return 0;
    }
    return 1;
  }
  if(typeof coordinates2 === 'undefined') {
    return -1;
  }
  if(coordinates1.x !== coordinates2.x) { return coordinates1.x - coordinates2.x; }
  if(coordinates1.y !== coordinates2.y) { return coordinates1.y - coordinates2.y; }
  if(coordinates1.width !== coordinates2.width) { return coordinates1.width - coordinates2.width; }
  if(coordinates1.height !== coordinates2.height) { return coordinates1.height - coordinates2.height; }
  if(coordinates1.center.x !== coordinates2.center.x) { return coordinates1.center.x - coordinates2.center.x; }
  if(coordinates1.center.y !== coordinates2.center.y) { return coordinates1.center.y - coordinates2.center.y; }
  return 0;
}
